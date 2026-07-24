[CmdletBinding()]
param(
    [string]$ApiUrl = "https://tekemet-qonaev.pages.dev/api/tekemet-admin",
    [string]$RestaurantSlug = "tekemet-qonaev"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$slowThresholdMs = 20000
$largeResponseThresholdBytes = 5MB
$sessionToken = ""
$currentStage = "login"
$scriptFailed = $false
$eventWasTracked = $false
$eventMarker = "CLOUDFLARE_ANALYTICS_TEST_{0}_{1}" -f [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssfffZ"), ([guid]::NewGuid().ToString("N").Substring(0, 8))
$testSessionId = "cf-analytics-{0}" -f ([guid]::NewGuid().ToString("N"))
$timingRows = [System.Collections.Generic.List[object]]::new()
$responseRows = [System.Collections.Generic.List[object]]::new()
$reportOrder = @(
    "login", "analyticsBefore", "trackEvent", "analyticsAfter", "eventVerified",
    "qrSources", "today", "sevenDays", "thirtyDays", "responseSize", "timings", "cleanup"
)
$report = [ordered]@{}
foreach ($name in $reportOrder) {
    $report[$name] = [pscustomobject]@{ Status = "PENDING"; Reason = "not run" }
}

function Set-TestResult {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet("PASS", "FAIL")][string]$Status,
        [Parameter(Mandatory = $true)][string]$Reason
    )

    $safeReason = ($Reason -replace "[\r\n]+", " ").Trim()
    if ($safeReason.Length -gt 300) {
        $safeReason = $safeReason.Substring(0, 300)
    }
    $report[$Name] = [pscustomobject]@{ Status = $Status; Reason = $safeReason }
}

function Invoke-TekemetAction {
    param(
        [Parameter(Mandatory = $true)][string]$Action,
        [Parameter(Mandatory = $true)][string]$TimingLabel,
        [hashtable]$Payload = @{},
        [string]$Token = ""
    )

    $requestBody = @{
        action         = $Action
        restaurantSlug = $RestaurantSlug
        sessionToken   = $Token
    }
    foreach ($entry in $Payload.GetEnumerator()) {
        $requestBody[$entry.Key] = $entry.Value
    }

    $response = $null
    $responseBytes = 0
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri $ApiUrl `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body ($requestBody | ConvertTo-Json -Depth 12 -Compress) `
            -TimeoutSec 60

        $responseBytes = [Text.Encoding]::UTF8.GetByteCount([string]$response.Content)
        $data = $response.Content | ConvertFrom-Json
        if ([int]$response.StatusCode -lt 200 -or [int]$response.StatusCode -ge 300) {
            throw "HTTP $($response.StatusCode)"
        }
        if ($data.error) {
            throw [string]$data.error
        }

        $responseRows.Add([pscustomobject]@{
            Label = $TimingLabel
            Bytes = $responseBytes
        })
        return $data
    }
    catch {
        $message = $_.Exception.Message
        if ($_.ErrorDetails.Message) {
            try {
                $apiError = $_.ErrorDetails.Message | ConvertFrom-Json
                if ($apiError.error) {
                    $message = [string]$apiError.error
                }
            }
            catch {
                # Never print the request body or credentials.
            }
        }
        throw "API action '$Action' failed: $message"
    }
    finally {
        $stopwatch.Stop()
        $timingRows.Add([pscustomobject]@{
            Label = $TimingLabel
            Ms    = [int][Math]::Round($stopwatch.Elapsed.TotalMilliseconds)
            Bytes = $responseBytes
        })
    }
}

function Get-BackendHourlyContract {
    $root = Split-Path $PSScriptRoot -Parent
    $analyticsPath = Join-Path $root "functions\_lib\tekemet-analytics.js"
    $source = Get-Content -LiteralPath $analyticsPath -Raw
    $pattern = 'function\s+hourlyAnalytics\(events\)\s*\{\s*return\s+Array\.from\(\{\s*length:\s*(\d+)\s*\},[\s\S]*?const\s+hour\s*=\s*index\s*\+\s*(\d+)\s*;'
    $match = [regex]::Match($source, $pattern)
    if (-not $match.Success) {
        throw "cannot read hourly range from backend source"
    }

    $count = [int]$match.Groups[1].Value
    $firstHour = [int]$match.Groups[2].Value
    if ($count -lt 1) {
        throw "backend hourly range has no buckets"
    }

    return [pscustomobject]@{
        Count     = $count
        FirstHour = $firstHour
        LastHour  = $firstHour + $count - 1
    }
}

function Assert-AnalyticsResponse {
    param(
        [Parameter(Mandatory = $true)]$Response,
        [Parameter(Mandatory = $true)][string]$ExpectedRange
    )

    if ($Response.ok -ne $true -or $null -eq $Response.analytics) {
        throw "analytics response is missing"
    }
    $analytics = $Response.analytics
    if ([string]$analytics.period.range -ne $ExpectedRange) {
        throw "expected range '$ExpectedRange', got '$($analytics.period.range)'"
    }
    if ($null -eq $analytics.summary.sessions -or
        $null -eq $analytics.summary.engagedRate -or
        $null -eq $analytics.summary.dishOpens -or
        $null -eq $analytics.summary.averageStudyMs) {
        throw "summary contract is incomplete"
    }
    if ($null -eq $analytics.activity -or $null -eq $analytics.activity.days) {
        throw "activity.days is missing"
    }
    if ($null -eq $analytics.timeline -or $null -eq $analytics.hourly -or
        $null -eq $analytics.recentEvents -or $null -eq $analytics.sourceOptions) {
        throw "timeline, hourly, recentEvents or sourceOptions is missing"
    }

    $expectedDays = switch ($ExpectedRange) {
        "today" { 1 }
        "7d" { 7 }
        "30d" { 30 }
        default { [int]$analytics.period.dayCount }
    }
    if (@($analytics.activity.days).Count -ne $expectedDays) {
        throw "activity.days count is $(@($analytics.activity.days).Count), expected $expectedDays"
    }
    $hourlyContract = Get-BackendHourlyContract
    $hourlyBuckets = @($analytics.hourly)
    if ($hourlyBuckets.Count -ne $hourlyContract.Count) {
        throw "hourly count is $($hourlyBuckets.Count), expected $($hourlyContract.Count) from backend range"
    }

    $actualHours = @($hourlyBuckets | ForEach-Object { [int]$_.hour })
    if ($actualHours[0] -ne $hourlyContract.FirstHour) {
        throw "first hourly bucket is $($actualHours[0]), expected $($hourlyContract.FirstHour)"
    }
    if ($actualHours[-1] -ne $hourlyContract.LastHour) {
        throw "last hourly bucket is $($actualHours[-1]), expected $($hourlyContract.LastHour)"
    }
    for ($index = 1; $index -lt $actualHours.Count; $index += 1) {
        if ($actualHours[$index] -ne ($actualHours[$index - 1] + 1)) {
            throw "hourly buckets have a gap between $($actualHours[$index - 1]) and $($actualHours[$index])"
        }
    }
    if (@($analytics.timeline).Count -lt 1) {
        throw "timeline is empty or invalid"
    }
    return $analytics
}

function Assert-NoNodeApis {
    $root = Split-Path $PSScriptRoot -Parent
    $cloudflareFiles = @(
        Join-Path $root "functions\api\tekemet-admin.js"
        Join-Path $root "functions\_lib\tekemet-analytics.js"
    )
    $pattern = 'require\(|module\.exports|exports\.handler|process\.|\bBuffer\b|from\s+["''](?:node:)?crypto["'']'
    foreach ($file in $cloudflareFiles) {
        if ((Get-Content -LiteralPath $file -Raw) -match $pattern) {
            throw "Node.js-only API found in $([IO.Path]::GetFileName($file))"
        }
    }
}

function Write-TestReport {
    foreach ($name in $reportOrder) {
        $entry = $report[$name]
        Write-Host ("{0} {1} - {2}" -f $name, $entry.Status, $entry.Reason)
    }
}

$securePin = Read-Host "Tekemet admin PIN" -AsSecureString
$pinPlain = [System.Net.NetworkCredential]::new("", $securePin).Password

try {
    $loginResponse = Invoke-TekemetAction `
        -Action "login" `
        -TimingLabel "login" `
        -Payload @{ pin = $pinPlain }
    if ([string]::IsNullOrWhiteSpace([string]$loginResponse.sessionToken)) {
        throw "login response has no sessionToken"
    }
    $sessionToken = [string]$loginResponse.sessionToken
    Set-TestResult -Name "login" -Status "PASS" -Reason "authenticated"

    $currentStage = "analyticsBefore"
    Assert-NoNodeApis
    $beforeResponse = Invoke-TekemetAction `
        -Action "getAnalytics" `
        -TimingLabel "analyticsBefore(today)" `
        -Payload @{ range = "today"; heatmapRange = "current_week"; sourceId = "" } `
        -Token $sessionToken
    $beforeAnalytics = Assert-AnalyticsResponse -Response $beforeResponse -ExpectedRange "today"
    $beforeDishOpens = [int]$beforeAnalytics.summary.dishOpens.value
    Set-TestResult -Name "analyticsBefore" -Status "PASS" -Reason "current analytics valid; no Node.js-only APIs"

    $currentStage = "trackEvent"
    $trackResponse = Invoke-TekemetAction `
        -Action "trackAnalyticsEvent" `
        -TimingLabel "trackEvent" `
        -Payload @{
            eventType      = "dish_open"
            menuItemId     = $eventMarker
            contentKey     = $eventMarker
            dishTitleRu    = $eventMarker
            sectionKey     = "cloudflare-analytics-test"
            language       = "ru"
            deviceType     = "desktop"
            sessionId      = $testSessionId
            visitorId      = $eventMarker
            pagePath       = "/cloudflare-analytics-test"
            browser        = "PowerShell"
            os             = "Windows"
            userAgent      = "Cloudflare-PowerShell-Analytics-Test"
            referrer       = "https://tekemet-qonaev.pages.dev/cloudflare-analytics-test"
            durationMs     = 1
            sourcePublicId = ""
        } `
        -Token $sessionToken
    if ($trackResponse.ok -ne $true -or $trackResponse.tracked -ne $true) {
        throw "trackAnalyticsEvent did not confirm tracked=true"
    }
    $eventWasTracked = $true
    Set-TestResult -Name "trackEvent" -Status "PASS" -Reason "one isolated event recorded; marker=$eventMarker"

    $currentStage = "analyticsAfter"
    $afterResponse = Invoke-TekemetAction `
        -Action "getAnalytics" `
        -TimingLabel "analyticsAfter(today)" `
        -Payload @{ range = "today"; heatmapRange = "current_week"; sourceId = "" } `
        -Token $sessionToken
    $afterAnalytics = Assert-AnalyticsResponse -Response $afterResponse -ExpectedRange "today"
    Set-TestResult -Name "analyticsAfter" -Status "PASS" -Reason "analytics refreshed without Workers runtime error"

    $currentStage = "eventVerified"
    $matchingEvents = @($afterAnalytics.recentEvents | Where-Object {
        $_.type -eq "dish_open" -and $_.item -eq $eventMarker
    })
    $afterDishOpens = [int]$afterAnalytics.summary.dishOpens.value
    if ($matchingEvents.Count -lt 1) {
        throw "unique marker is absent from recentEvents"
    }
    if ($afterDishOpens -lt ($beforeDishOpens + 1)) {
        throw "dishOpens did not increase after the isolated event"
    }
    Set-TestResult -Name "eventVerified" -Status "PASS" -Reason "marker found; dishOpens $beforeDishOpens->$afterDishOpens"

    $currentStage = "qrSources"
    $qrResponse = Invoke-TekemetAction `
        -Action "getQrSources" `
        -TimingLabel "qrSources" `
        -Token $sessionToken
    if ($null -eq $qrResponse.sources) {
        throw "getQrSources response has no sources"
    }
    $directSource = @($qrResponse.sources | Where-Object { $_.id -eq "direct" }) | Select-Object -First 1
    if ($null -eq $directSource -or $null -eq $directSource.visits -or $null -eq $directSource.engagedSessions) {
        throw "direct QR analytics source contract is incomplete"
    }
    Set-TestResult -Name "qrSources" -Status "PASS" -Reason "$(@($qrResponse.sources).Count) sources; direct analytics valid"

    $currentStage = "today"
    $null = Assert-AnalyticsResponse -Response $afterResponse -ExpectedRange "today"
    Set-TestResult -Name "today" -Status "PASS" -Reason "range=today; hourly buckets follow backend range 07:00-24:00"

    $currentStage = "sevenDays"
    $sevenResponse = Invoke-TekemetAction `
        -Action "getAnalytics" `
        -TimingLabel "analytics(7d)" `
        -Payload @{ range = "7d"; heatmapRange = "current_week"; sourceId = "" } `
        -Token $sessionToken
    $null = Assert-AnalyticsResponse -Response $sevenResponse -ExpectedRange "7d"
    Set-TestResult -Name "sevenDays" -Status "PASS" -Reason "range=7d; 7 activity days; response valid"

    $currentStage = "thirtyDays"
    $thirtyResponse = Invoke-TekemetAction `
        -Action "getAnalytics" `
        -TimingLabel "analytics(30d)" `
        -Payload @{ range = "30d"; heatmapRange = "current_week"; sourceId = "" } `
        -Token $sessionToken
    $null = Assert-AnalyticsResponse -Response $thirtyResponse -ExpectedRange "30d"
    Set-TestResult -Name "thirtyDays" -Status "PASS" -Reason "range=30d; 30 activity days; response valid"
}
catch {
    $scriptFailed = $true
    if ($report[$currentStage].Status -eq "PENDING") {
        Set-TestResult -Name $currentStage -Status "FAIL" -Reason $_.Exception.Message
    }
}
finally {
    $analyticsResponses = @($responseRows | Where-Object { $_.Label -like "analytics*" })
    if ($analyticsResponses.Count -eq 0) {
        Set-TestResult -Name "responseSize" -Status "FAIL" -Reason "no analytics response was received"
        $scriptFailed = $true
    }
    else {
        $largestResponse = $analyticsResponses | Sort-Object Bytes -Descending | Select-Object -First 1
        $sizeDetails = ($analyticsResponses | ForEach-Object { "$($_.Label)=$($_.Bytes)B" }) -join ", "
        if ([long]$largestResponse.Bytes -gt $largeResponseThresholdBytes) {
            Set-TestResult -Name "responseSize" -Status "FAIL" -Reason $sizeDetails
            $scriptFailed = $true
        }
        else {
            Set-TestResult -Name "responseSize" -Status "PASS" -Reason $sizeDetails
        }
    }

    if ($timingRows.Count -eq 0) {
        Set-TestResult -Name "timings" -Status "FAIL" -Reason "no request timing was recorded"
        $scriptFailed = $true
    }
    else {
        $slowRows = @($timingRows | Where-Object { $_.Ms -gt $slowThresholdMs })
        $timingDetails = ($timingRows | ForEach-Object { "$($_.Label)=$($_.Ms)ms" }) -join ", "
        if ($slowRows.Count -gt 0) {
            Set-TestResult -Name "timings" -Status "FAIL" -Reason $timingDetails
            $scriptFailed = $true
        }
        else {
            Set-TestResult -Name "timings" -Status "PASS" -Reason $timingDetails
        }
    }

    if ($eventWasTracked) {
        Set-TestResult -Name "cleanup" -Status "PASS" -Reason "no event-delete action; record remains marker=$eventMarker"
    }
    else {
        Set-TestResult -Name "cleanup" -Status "PASS" -Reason "no confirmed test event to delete"
    }

    foreach ($name in $reportOrder) {
        if ($report[$name].Status -eq "PENDING") {
            Set-TestResult -Name $name -Status "FAIL" -Reason "not reached after earlier failure"
        }
    }

    $pinPlain = $null
    $sessionToken = $null
    Remove-Variable securePin -ErrorAction SilentlyContinue
    Write-TestReport
}

if ($scriptFailed) {
    exit 1
}
exit 0
