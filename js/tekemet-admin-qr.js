(function () {
  const state = {
    root: null,
    sources: [],
    loading: false,
    error: "",
    mounted: false,
    wifi: { payload: "", ssid: "", security: "WPA", hidden: false, createdAt: "" },
    detail: null,
    detailTrigger: null,
    detailFocusSelector: "",
  };

  async function mount(options = {}) {
    state.root = options.root || document.querySelector("[data-qr-root]");
    if (!state.root) return;
    if (!state.mounted) {
      state.root.addEventListener("submit", handleSubmit);
      state.root.addEventListener("click", handleClick);
      state.root.addEventListener("change", handleChange);
      document.addEventListener("keydown", handleKeydown);
      state.mounted = true;
    }
    await load();
  }

  async function load() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const result = await api("getQrSources");
      state.sources = ensureDirectSource(result.sources || []);
    } catch (error) {
      state.error = friendly(error);
    } finally {
      state.sources = ensureDirectSource(state.sources);
      state.loading = false;
      render();
    }
  }

  function render() {
    if (!state.root) return;
    document.body.classList.toggle("qr-detail-modal-open", Boolean(state.detail));
    if (state.loading) {
      state.root.innerHTML = '<div class="analytics-loading">Загружаем QR-коды...</div>';
      return;
    }
    const visibleSources = state.sources
      .filter((source) => source.is_active !== false)
      .sort((left, right) => Number(isDirectSource(right)) - Number(isDirectSource(left)));
    const createdCount = visibleSources.length + (state.wifi.payload ? 1 : 0);
    state.root.innerHTML = `
      <header class="qr-page-header">
        <div><p class="kicker">Источники меню</p><h2>QR-коды</h2><p>Создавайте отдельные ссылки для залов, столов, гостиницы и социальных сетей.</p></div>
      </header>
      ${state.error ? `<div class="analytics-error" role="alert">${escapeHtml(state.error)} <button type="button" data-qr-retry>Повторить</button></div>` : ""}
      <div class="qr-create-grid">
        <form class="qr-create-card qr-source-create-card" data-qr-form>
          <div><p class="kicker">Новый источник</p><h3>Создать QR-код</h3></div>
          <label>Страница меню
            <select name="menuPath"><option value="/menu">Основное меню · tekemetqonaev.com/menu</option></select>
          </label>
          <label>Название источника
            <input name="name" maxlength="100" placeholder="Например, Гостиница" required />
          </label>
          <label>Тип ссылки
            <select name="sourceType"><option value="qr">QR-код</option><option value="social">Социальная сеть</option><option value="link">Обычная ссылка</option></select>
          </label>
          <div class="qr-create-actions">
            <button class="primary-button" type="submit">Создать источник</button>
            <p class="qr-form-status" data-qr-form-status aria-live="polite"></p>
          </div>
        </form>
        <form class="qr-create-card wifi-qr-form" data-wifi-qr-form>
          <div><p class="kicker">Wi-Fi для гостей</p><h3>QR для подключения к сети</h3></div>
          <label>Название сети · SSID
            <input name="ssid" maxlength="64" placeholder="Например, Tekemet Guest WiFi" value="${escapeHtml(state.wifi.ssid)}" autocomplete="off" required />
          </label>
          <div class="wifi-credentials-row">
            <label>Защита
              <select name="security"><option value="WPA" ${state.wifi.security === "WPA" ? "selected" : ""}>WPA / WPA2</option><option value="WEP" ${state.wifi.security === "WEP" ? "selected" : ""}>WEP</option><option value="nopass" ${state.wifi.security === "nopass" ? "selected" : ""}>Без пароля</option></select>
            </label>
            <label data-wifi-password-field>Пароль
              <input name="password" type="password" maxlength="63" autocomplete="new-password" placeholder="Не сохраняется в Tekemet" />
            </label>
          </div>
          <label class="wifi-hidden-line"><input name="hidden" type="checkbox" ${state.wifi.hidden ? "checked" : ""} /> Скрытая сеть</label>
          <div class="qr-create-actions">
            <button class="primary-button" type="submit">Создать Wi-Fi QR</button>
            <p class="qr-local-note">Данные сети обрабатываются только в этом браузере и не отправляются на сервер</p>
          </div>
        </form>
      </div>
      <section class="qr-list-section">
        <div class="qr-list-heading"><div><p class="kicker">Все точки входа</p><h3>Созданные QR-коды</h3></div><span>${createdCount}</span></div>
        ${createdCount ? `<div class="qr-list">${state.wifi.payload ? wifiCard() : ""}${visibleSources.map(sourceCard).join("")}</div>` : '<div class="analytics-empty"><strong>QR-кодов пока нет</strong><p>Создайте первый источник — он сразу появится в этом блоке.</p></div>'}
      </section>
      ${renderDetailModal()}`;
    requestAnimationFrame(renderQrs);
  }

  function sourceCard(source) {
    const isDirect = isDirectSource(source);
    return `<article class="qr-source-card qr-source-card--compact ${isDirect ? "qr-source-card--system" : ""}" data-source-card="${escapeHtml(source.id)}">
      <header class="qr-source-title">
        <h4>${escapeHtml(source.name)}</h4>
        <span class="qr-status ${isDirect ? "is-system" : "is-active"}">${isDirect ? "Системный" : "Активен"}</span>
      </header>
      <div class="qr-compact-bottom">
        <strong>${formatVisits(source.visits)}</strong>
        <button type="button" data-qr-details="${escapeHtml(source.id)}">Подробнее <span aria-hidden="true">→</span></button>
      </div>
    </article>`;
  }

  function wifiCard() {
    return `<article class="qr-source-card qr-source-card--compact qr-source-card--wifi" data-wifi-card>
      <header class="qr-source-title">
        <h4>${escapeHtml(state.wifi.ssid)}</h4>
        <span class="qr-status is-local">Локальный</span>
      </header>
      <div class="qr-compact-bottom">
        <strong>Без аналитики</strong>
        <button type="button" data-wifi-details>Подробнее <span aria-hidden="true">→</span></button>
      </div>
    </article>`;
  }

  function renderDetailModal() {
    if (!state.detail) return "";
    const source = state.detail.kind === "source"
      ? state.sources.find((item) => item.id === state.detail.id)
      : null;
    if (state.detail.kind === "source" && !source) return "";
    const isWifi = state.detail.kind === "wifi";
    const isDirect = !isWifi && isDirectSource(source);
    const title = isWifi ? state.wifi.ssid : source.name;
    const visits = isWifi ? null : Number(source.visits || 0);
    const modalTitleId = "qr-detail-modal-title";

    return `<div class="qr-detail-modal" data-qr-detail-modal role="dialog" aria-modal="true" aria-labelledby="${modalTitleId}">
      <button class="qr-detail-backdrop" type="button" data-close-qr-detail aria-label="Закрыть подробности QR-кода"></button>
      <section class="qr-detail-panel">
        <header class="qr-detail-header">
          <div>
            <p class="kicker">${isWifi ? "Локальный Wi-Fi QR" : isDirect ? "Системный источник" : "Подробности источника"}</p>
            <h2 id="${modalTitleId}">${escapeHtml(title)}</h2>
            <strong>${isWifi ? "Без аналитики" : formatVisits(visits)}</strong>
          </div>
          <span class="qr-status ${isWifi ? "is-local" : isDirect ? "is-system" : "is-active"}">${isWifi ? "Локальный" : isDirect ? "Системный" : "Активен"}</span>
          <button class="qr-detail-close" type="button" data-close-qr-detail aria-label="Закрыть">×</button>
        </header>
        <div class="qr-detail-body">
          ${isDirect ? `<section class="qr-direct-intro">
            <div><span aria-hidden="true">↗</span></div>
            <div><h3>Системный источник</h3><p>Здесь учитываются посещения меню без идентификатора созданного источника: ручной ввод адреса, закладки, обычные ссылки и переходы из поиска.</p></div>
          </section>` : `<section class="qr-detail-overview">
            <div class="qr-detail-code ${isWifi ? "is-wifi" : ""}" ${isWifi ? "data-wifi-modal-preview" : `data-qr-modal-preview="${escapeHtml(source.id)}"`} aria-label="QR-код ${escapeHtml(title)}"></div>
            <div class="qr-detail-info">
              <dl>
                <div><dt>Тип ссылки</dt><dd>${isWifi ? "Wi-Fi QR" : escapeHtml(sourceTypeLabel(source.source_type))}</dd></div>
                <div><dt>Ссылка или назначение</dt><dd>${isWifi ? `Подключение к сети ${escapeHtml(state.wifi.ssid)}` : escapeHtml(source.url || sourceDestination(source))}</dd></div>
                <div><dt>Дата создания</dt><dd>${formatDateTime(isWifi ? state.wifi.createdAt : source.created_at)}</dd></div>
              </dl>
              ${isWifi ? `<dl class="qr-wifi-detail"><div><dt>Защита</dt><dd>${escapeHtml(securityLabel(state.wifi.security))}</dd></div><div><dt>Скрытая сеть</dt><dd>${state.wifi.hidden ? "Да" : "Нет"}</dd></div></dl>` : ""}
            </div>
          </section>`}
          ${isWifi ? '<p class="qr-no-analytics qr-no-analytics--modal">Локальный Wi-Fi QR без аналитики переходов</p>' : `
            <section class="qr-detail-metrics">
              <div><span>Всего переходов</span><strong>${number(source.visits)}</strong></div>
              <div><span>Уникальные гости</span><strong>${number(source.uniqueGuests ?? source.visits)}</strong></div>
              <div><span>Последний переход</span><strong>${source.lastVisitAt ? formatDateTime(source.lastVisitAt) : "—"}</strong></div>
            </section>
            ${renderQrAnalytics(state.detail)}
            ${isDirect ? renderDirectBreakdowns(state.detail.analytics) : ""}
          `}
        </div>
        ${isDirect ? "" : `<footer class="qr-detail-footer">
          <div>
            <button class="primary-button" type="button" ${isWifi ? "data-wifi-download" : `data-qr-download="${escapeHtml(source.id)}"`}>Скачать QR</button>
            ${isWifi ? "" : `<button class="secondary-button" type="button" data-qr-copy="${escapeHtml(source.id)}">Скопировать ссылку</button>`}
          </div>
          <button class="danger-button" type="button" ${isWifi ? "data-wifi-delete" : `data-qr-delete="${escapeHtml(source.id)}"`} ${state.detail.deleting ? "disabled" : ""}>${state.detail.deleting ? "Удаляем…" : "Удалить QR"}</button>
        </footer>`}
      </section>
    </div>`;
  }

  function renderQrAnalytics(detail) {
    const periods = renderQrPeriodSwitch(detail.range || "7d");
    if (detail.loading) return `<section class="qr-detail-analytics"><div class="qr-detail-analytics-heading"><h3>Переходы за выбранный период</h3>${periods}</div><p class="qr-detail-loading">Загружаем аналитику…</p></section>`;
    if (detail.error) return `<section class="qr-detail-analytics"><div class="qr-detail-analytics-heading"><h3>Переходы за выбранный период</h3>${periods}</div><p class="qr-detail-error">${escapeHtml(detail.error)}</p></section>`;
    const rows = detail.analytics?.timeline || [];
    if (!rows.length) return `<section class="qr-detail-analytics"><div class="qr-detail-analytics-heading"><h3>Переходы за выбранный период</h3>${periods}</div><p class="qr-detail-empty">Данных за период пока нет</p></section>`;
    const max = Math.max(...rows.map((row) => Number(row.sessions || 0)), 1);
    return `<section class="qr-detail-analytics">
      <div class="qr-detail-analytics-heading"><div><h3>Переходы за выбранный период</h3><span>${escapeHtml(detail.analytics.period?.label || "")} · ${formatVisits(detail.analytics.summary?.sessions?.value || 0)}</span></div>${periods}</div>
      <div class="qr-detail-chart" style="--qr-columns:${Math.max(rows.length, 1)}">${rows.map((row) => {
        const value = Number(row.sessions || 0);
        const height = Math.max(value ? 8 : 2, Math.round((value / max) * 100));
        return `<div><strong>${number(value)}</strong><i style="--qr-bar-height:${height}%"></i><span>${escapeHtml(row.label)}</span></div>`;
      }).join("")}</div>
    </section>`;
  }

  function renderQrPeriodSwitch(activeRange) {
    return `<div class="qr-detail-periods" aria-label="Период аналитики">${[
      ["today", "Сегодня"], ["7d", "7 дней"], ["30d", "30 дней"], ["all", "Всё время"],
    ].map(([range, label]) => `<button type="button" data-qr-range="${range}" class="${activeRange === range ? "is-active" : ""}">${label}</button>`).join("")}</div>`;
  }

  function renderDirectBreakdowns(analytics) {
    if (!analytics) return "";
    const hourly = analytics.hourly || [];
    const daily = (analytics.activity?.days || []).map((row) => ({ label: row.fullLabel || row.label, sessions: Number(row.sessions?.current || 0) }));
    const devices = analytics.audience?.devices || [];
    const browsers = analytics.audience?.browsers || [];
    const referrers = analytics.audience?.referrers || [];
    return `<section class="qr-direct-breakdowns">
      ${renderSmallChart("Переходы по часам", hourly)}
      ${renderSmallChart("Переходы по дням", daily)}
      <div class="qr-direct-audience-grid">
        ${renderAudienceList("Устройства", devices)}
        ${renderAudienceList("Браузеры и приложения", browsers)}
        ${referrers.length ? renderAudienceList("Referrer", referrers) : ""}
      </div>
    </section>`;
  }

  function renderSmallChart(title, rows) {
    if (!rows.length) return `<article class="qr-direct-chart"><h3>${title}</h3><p class="qr-detail-empty">Данных пока нет</p></article>`;
    const max = Math.max(...rows.map((row) => Number(row.sessions || 0)), 1);
    return `<article class="qr-direct-chart"><h3>${title}</h3><div style="--qr-columns:${rows.length}">${rows.map((row) => {
      const value = Number(row.sessions || 0);
      const height = Math.max(value ? 8 : 2, Math.round((value / max) * 100));
      return `<span><strong>${number(value)}</strong><i style="--qr-bar-height:${height}%"></i><small>${escapeHtml(row.label)}</small></span>`;
    }).join("")}</div></article>`;
  }

  function renderAudienceList(title, rows) {
    return `<article class="qr-direct-audience"><h3>${title}</h3>${rows.length ? `<ul>${rows.map((row) => `<li><span>${escapeHtml(row.label)}</span><strong>${number(row.count)} · ${number(row.percent)}%</strong></li>`).join("")}</ul>` : '<p>Данных пока нет</p>'}</article>`;
  }

  function renderQrs() {
    if (!window.QRCode) return;
    const sourceNode = state.root.querySelector("[data-qr-modal-preview]");
    const sourceId = sourceNode?.dataset.qrModalPreview;
    const source = sourceId ? state.sources.find((item) => item.id === sourceId) : null;
    if (sourceNode && source?.url) {
      sourceNode.innerHTML = "";
      new window.QRCode(sourceNode, { text: source.url, width: 220, height: 220, colorDark: "#13261f", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.H });
    }
    const wifiNode = state.root.querySelector("[data-wifi-modal-preview]");
    if (wifiNode && state.wifi.payload) {
      wifiNode.innerHTML = "";
      new window.QRCode(wifiNode, { text: state.wifi.payload, width: 220, height: 220, colorDark: "#13261f", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.H });
    }
    syncWifiPasswordField();
  }

  async function openSourceDetails(sourceId) {
    if (!state.sources.some((source) => source.id === sourceId)) return;
    state.detail = { kind: "source", id: sourceId, range: "7d", analytics: null, loading: false, error: "", deleting: false };
    state.detailFocusSelector = ".qr-detail-close";
    requestAnimationFrame(() => state.root.querySelector(".qr-detail-close")?.focus());
    await loadSourceAnalytics("7d");
  }

  async function loadSourceAnalytics(range) {
    if (!state.detail || state.detail.kind !== "source") return;
    const sourceId = state.detail.id;
    const requestedRange = ["today", "7d", "30d", "all"].includes(range) ? range : "7d";
    state.detail.range = requestedRange;
    state.detail.loading = true;
    state.detail.error = "";
    render();
    try {
      const result = await api("getAnalytics", { range: requestedRange, sourceId });
      if (!state.detail || state.detail.kind !== "source" || state.detail.id !== sourceId || state.detail.range !== requestedRange) return;
      state.detail.analytics = result.analytics || null;
    } catch (error) {
      if (!state.detail || state.detail.kind !== "source" || state.detail.id !== sourceId || state.detail.range !== requestedRange) return;
      state.detail.error = friendly(error);
    } finally {
      if (state.detail?.kind === "source" && state.detail.id === sourceId && state.detail.range === requestedRange) {
        state.detail.loading = false;
        render();
        const focusSelector = state.detailFocusSelector || ".qr-detail-close";
        state.detailFocusSelector = "";
        requestAnimationFrame(() => state.root.querySelector(focusSelector)?.focus());
      }
    }
  }

  function openWifiDetails() {
    if (!state.wifi.payload) return;
    state.detail = { kind: "wifi", id: "wifi", analytics: null, loading: false, error: "", deleting: false };
    render();
    requestAnimationFrame(() => state.root.querySelector(".qr-detail-close")?.focus());
  }

  function closeDetails() {
    const focusTarget = state.detailTrigger;
    state.detail = null;
    state.detailTrigger = null;
    state.detailFocusSelector = "";
    document.body.classList.remove("qr-detail-modal-open");
    render();
    if (focusTarget) requestAnimationFrame(() => state.root.querySelector(focusTarget)?.focus());
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && state.detail) closeDetails();
  }

  async function deleteSource(sourceId) {
    const source = state.sources.find((item) => item.id === sourceId);
    if (isDirectSource(source)) return;
    if (!source || !window.confirm(`Удалить QR-код “${source.name}”? История переходов также будет удалена. Это действие нельзя отменить.`)) return;
    state.detail.deleting = true;
    render();
    try {
      await api("deleteQrSource", { sourceId });
      state.sources = state.sources.filter((item) => item.id !== sourceId);
      closeDetails();
    } catch (error) {
      if (state.detail) {
        state.detail.deleting = false;
        state.detail.error = friendly(error);
        render();
      }
    }
  }

  function deleteWifi() {
    if (!window.confirm(`Удалить Wi-Fi QR “${state.wifi.ssid}”? Это действие нельзя отменить.`)) return;
    state.wifi = { payload: "", ssid: "", security: "WPA", hidden: false, createdAt: "" };
    closeDetails();
  }

  async function handleSubmit(event) {
    const wifiForm = event.target.closest("[data-wifi-qr-form]");
    if (wifiForm) {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(wifiForm));
      const ssid = String(data.ssid || "").trim();
      const security = ["WPA", "WEP", "nopass"].includes(data.security) ? data.security : "WPA";
      const password = String(data.password || "");
      if (!ssid) return;
      if (security !== "nopass" && !password) {
        wifiForm.querySelector('[name="password"]')?.focus();
        return;
      }
      const hidden = data.hidden === "on";
      state.wifi = {
        ssid,
        security,
        hidden,
        createdAt: new Date().toISOString(),
        payload: `WIFI:T:${security};S:${escapeWifi(ssid)};${security === "nopass" ? "" : `P:${escapeWifi(password)};`}H:${hidden ? "true" : "false"};;`,
      };
      render();
      return;
    }
    const form = event.target.closest("[data-qr-form]");
    if (!form) return;
    event.preventDefault();
    const status = form.querySelector("[data-qr-form-status]");
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    status.textContent = "Создаём безопасную ссылку...";
    try {
      const data = Object.fromEntries(new FormData(form));
      const result = await api("createQrSource", data);
      state.sources = ensureDirectSource([result.source, ...state.sources]);
      form.reset();
      render();
    } catch (error) {
      status.textContent = friendly(error);
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  async function handleClick(event) {
    if (event.target.closest("[data-qr-retry]")) return load();
    if (event.target.closest("[data-close-qr-detail]")) return closeDetails();
    const rangeButton = event.target.closest("[data-qr-range]");
    if (rangeButton) {
      state.detailFocusSelector = `[data-qr-range="${rangeButton.dataset.qrRange}"]`;
      return loadSourceAnalytics(rangeButton.dataset.qrRange);
    }
    if (event.target.closest("[data-wifi-download]")) return downloadWifiPng();
    if (event.target.closest("[data-wifi-details]")) {
      state.detailTrigger = "[data-wifi-details]";
      return openWifiDetails();
    }
    if (event.target.closest("[data-wifi-delete]")) return deleteWifi();
    const action = ["copy", "download", "details", "delete"].find((name) => event.target.closest(`[data-qr-${name}]`));
    if (!action) return;
    const button = event.target.closest(`[data-qr-${action}]`);
    const source = state.sources.find((item) => item.id === button.dataset[`qr${capitalize(action)}`]);
    if (!source) return;
    if (action === "details") {
      state.detailTrigger = `[data-qr-details="${cssEscape(source.id)}"]`;
      return openSourceDetails(source.id);
    }
    if (action === "delete") return deleteSource(source.id);
    if (action === "copy") {
      await navigator.clipboard.writeText(source.url);
      button.textContent = "Скопировано";
      setTimeout(() => { button.textContent = "Скопировать ссылку"; }, 1200);
    }
    if (action === "download") downloadPng(source);
  }

  function handleChange(event) {
    if (event.target.matches('[data-wifi-qr-form] select[name="security"]')) syncWifiPasswordField();
  }

  function syncWifiPasswordField() {
    const field = state.root?.querySelector("[data-wifi-password-field]");
    const select = state.root?.querySelector('[data-wifi-qr-form] select[name="security"]');
    const input = field?.querySelector("input");
    const withoutPassword = select?.value === "nopass";
    if (field) field.hidden = withoutPassword;
    if (input) input.disabled = withoutPassword;
  }

  function downloadPng(source) {
    const preview = state.root.querySelector(`[data-qr-modal-preview="${cssEscape(source.id)}"]`);
    const canvas = preview?.querySelector("canvas");
    const image = preview?.querySelector("img");
    const url = canvas?.toDataURL("image/png") || image?.src;
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `tekemet-${slugify(source.name)}.png`;
    link.click();
  }

  function downloadWifiPng() {
    const preview = state.root?.querySelector("[data-wifi-modal-preview]");
    const canvas = preview?.querySelector("canvas");
    const image = preview?.querySelector("img");
    const url = canvas?.toDataURL("image/png") || image?.src;
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `tekemet-wifi-${slugify(state.wifi.ssid)}.png`;
    link.click();
  }

  function sourceTypeLabel(value) {
    return ({ qr: "QR-код", social: "Социальная сеть", link: "Обычная ссылка", direct: "Системный источник" })[value] || "QR-код";
  }

  function sourceDestination(source) {
    return source.menu_path === "/menu" || !source.menu_path ? "Основное меню" : source.menu_path;
  }

  function securityLabel(value) {
    return ({ WPA: "WPA / WPA2", WEP: "WEP", nopass: "Без пароля" })[value] || value;
  }

  function ensureDirectSource(sources) {
    const current = sources.find(isDirectSource);
    const direct = {
      id: "direct",
      source_key: "direct",
      source_type: "direct",
      name: "Прямой вход",
      is_active: true,
      is_system: true,
      visits: 0,
      uniqueGuests: 0,
      lastVisitAt: null,
      ...(current || {}),
    };
    direct.id = "direct";
    direct.source_key = "direct";
    direct.source_type = "direct";
    direct.name = "Прямой вход";
    direct.is_active = true;
    direct.is_system = true;
    return [direct, ...sources.filter((source) => !isDirectSource(source))];
  }

  function isDirectSource(source) {
    return Boolean(source && (source.id === "direct" || source.source_key === "direct" || source.source_type === "direct"));
  }

  function api(action, payload = {}) {
    if (!window.TekemetAdminBridge?.api) return Promise.reject(new Error("Admin API is not ready."));
    return window.TekemetAdminBridge.api(action, payload);
  }
  function friendly(error) { return error?.message || "Не удалось выполнить действие."; }
  function number(value) { return new Intl.NumberFormat("ru-RU").format(Number(value || 0)); }
  function formatVisits(value) {
    const count = Number(value || 0);
    const mod10 = count % 10;
    const mod100 = count % 100;
    const noun = mod10 === 1 && mod100 !== 11 ? "переход" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "перехода" : "переходов";
    return `${number(count)} ${noun}`;
  }
  function formatDateTime(value) { return value ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
  function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
  function cssEscape(value) { return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, ""); }
  function escapeWifi(value) { return String(value || "").replace(/([\\;,:"])/g, "\\$1"); }
  function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
  function slugify(value) { return String(value || "qr").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "qr"; }

  window.TekemetQr = { mount, reload: load };
})();
