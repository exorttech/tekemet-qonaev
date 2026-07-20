const DEFAULT_TIME_ZONE = "Asia/Almaty";

async function getAnalyticsV2(env, slug, input = {}) {
  const restaurant = await getRestaurant(env, slug);
  const timeZone = restaurant.timezone || DEFAULT_TIME_ZONE;
  const period = resolvePeriod(input, timeZone);
  const heatmapPeriod = resolveHeatmapPeriod(input, timeZone);
  const eventsFrom = period.comparisonStart < heatmapPeriod.start ? period.comparisonStart : heatmapPeriod.start;
  const sourceId = isUuid(input.sourceId) ? input.sourceId : input.sourceId === "direct" ? "direct" : null;
  const [primaryEvents, items, qrSources, fallbackEvents] = await Promise.all([
    fetchEvents(env, restaurant.id, utcDate(eventsFrom).toISOString(), sourceId === "direct" ? null : sourceId, timeZone),
    rest(env, "content_items", { query: { select: "id,content_key,title_ru,title_kk,title_en,is_active", content_type: "eq.menu" } }),
    rest(env, "qr_sources", { query: { select: "id,name,public_id,is_active,source_type", restaurant_id: `eq.${restaurant.id}` } }),
    sourceId && sourceId !== "direct"
      ? Promise.resolve([])
      : fetchFallbackEvents(env, utcDate(eventsFrom).toISOString(), timeZone),
  ]);
  const events = resolveDishEventItems([...primaryEvents, ...fallbackEvents], items);

  const selectedEvents = sourceId === "direct" ? events.filter(isDirectEvent) : events;
  const current = selectedEvents.filter((event) => inRange(event, period.start, period.end));
  const previous = selectedEvents.filter((event) => inRange(event, period.comparisonStart, period.comparisonEnd));
  const heatmapEvents = selectedEvents.filter((event) => inRange(event, heatmapPeriod.start, heatmapPeriod.end));
  const currentMetrics = metrics(current);
  const previousMetrics = metrics(previous);
  const days = comparableDays(current, previous, period);
  const dishes = dishAnalytics(current, previous, items, currentMetrics.sessions);
  const sourceNames = Object.fromEntries(qrSources.map((source) => [source.id, source.name]));

  return response(200, {
    ok: true,
    analytics: {
      period: {
        ...period,
        label: period.range === "all" ? "Всё время" : periodLabel(period.start, shiftDate(period.end, -1), timeZone),
        comparisonLabel: period.range === "all" ? "сравнение недоступно" : periodLabel(period.comparisonStart, shiftDate(period.comparisonEnd, -1), timeZone),
      },
      selectedSourceId: sourceId || "all",
      summary: {
        sessions: metric(currentMetrics.sessions, previousMetrics.sessions, days.map((day) => day.sessions.current)),
        engagedRate: metric(currentMetrics.engagedRate, previousMetrics.engagedRate, days.map((day) => day.engagement.current), "percent"),
        dishOpens: metric(currentMetrics.dishOpens, previousMetrics.dishOpens, days.map((day) => day.dishOpens.current)),
        averageStudyMs: metric(currentMetrics.averageStudyMs, previousMetrics.averageStudyMs, days.map((day) => day.averageStudyMs.current), "duration", "neutral"),
      },
      timeline: timeline(current, period),
      hourly: hourlyAnalytics(current),
      activity: { days },
      heatmap: heatmap(heatmapEvents, heatmapPeriod),
      heatmapPeriod,
      dishes,
      funnel: funnel(current, currentMetrics.sessions),
      insights: insights(currentMetrics, previousMetrics, days, dishes, current),
      audience: {
        languages: audience(current, "language", (value) => String(value || "").toUpperCase()),
        devices: audience(current, "device_type", (value) => ({ mobile: "Телефон", tablet: "Планшет", desktop: "Компьютер" }[value] || "Другое")),
        browsers: browserAudience(current),
        referrers: referrerAudience(current),
      },
      sources: sourceAnalytics(current, previous, sourceNames),
      recentEvents: recentEvents(current.filter((event) => event.localDateKey === shiftDate(period.end, -1)), items),
      sourceOptions: [
        { id: "all", name: "Все источники", isActive: true },
        { id: "direct", name: "Прямой вход", isActive: true, sourceType: "direct", sourceKey: "direct" },
        ...qrSources.map((source) => ({ id: source.id, name: source.name, isActive: source.is_active })),
      ],
      dayDetails: dayDetails(current, period),
      timeZone,
    },
  });
}

async function fetchEvents(env, restaurantId, fromIso, sourceId, timeZone) {
  const rows = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const page = await rest(env, "menu_analytics_events", {
      query: {
        select: "id,event_type,menu_item_id,category_id,language,device_type,session_id,qr_source_id,source_fallback,duration_ms,metadata,user_agent,referrer,created_at",
        restaurant_id: `eq.${restaurantId}`,
        created_at: `gte.${fromIso}`,
        ...(sourceId ? { qr_source_id: `eq.${sourceId}` } : {}),
        order: "created_at.asc",
        limit: "1000",
        offset: String(offset),
      },
    });
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows.map((event) => normalizeAnalyticsEvent(event, timeZone));
}

async function fetchFallbackEvents(env, fromIso, timeZone) {
  try {
    let rows;
    try {
      rows = await fetchFallbackEventRows(env, fromIso, true);
    } catch {
      rows = await fetchFallbackEventRows(env, fromIso, false);
    }

    return rows.map((row) => normalizeAnalyticsEvent({
      id: `fallback-${row.id}`,
      event_type: row.section_key,
      menu_item_id: null,
      language: row.title_en || null,
      device_type: row.title_kk || null,
      session_id: row.description_ru || null,
      user_agent: null,
      referrer: null,
      created_at: row.created_at || new Date(Number(row.sort_order || 0) * 1000).toISOString(),
      source_fallback: "direct",
      duration_ms: normalizeStoredDuration(row.badge_ru),
      metadata: {
        dishId: row.title_ru || "",
        dishTitle: row.description_en || "",
        sectionKey: row.description_kk || "",
      },
    }, timeZone)).filter((event) => new Date(event.created_at).getTime() >= new Date(fromIso).getTime());
  } catch (error) {
    console.warn("[tekemet-analytics] fallback events are unavailable", error?.message || error);
    return [];
  }
}

async function fetchFallbackEventRows(env, fromIso, hasCreatedAt) {
  const rows = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const page = await rest(env, "content_items", {
      query: {
        select: `id,section_key,title_ru,title_en,title_kk,description_ru,description_en,description_kk,badge_ru,sort_order${hasCreatedAt ? ",created_at" : ""}`,
        content_type: "eq.analytics_event",
        ...(hasCreatedAt ? { created_at: `gte.${fromIso}`, order: "created_at.asc" } : { order: "sort_order.asc" }),
        limit: "1000",
        offset: String(offset),
      },
    });
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function normalizeAnalyticsEvent(event, timeZone) {
  const metadata = event?.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
    ? event.metadata
    : {};
  const packed = unpackDishAnalyticsReferrer(event?.referrer);
  const packedReferrer = String(event?.referrer || "").startsWith("dish:");
  const duration = event?.duration_ms ?? metadata.durationMs ?? packed.durationMs ?? null;
  return {
    ...event,
    metadata,
    dish_id: pointKey(event?.menu_item_id || metadata.dishId || metadata.menuItemId || packed.dishId),
    content_key: pointKey(metadata.contentKey || packed.contentKey),
    dish_title: pointKey(metadata.dishTitle || packed.title),
    category_key: pointKey(event?.category_id || metadata.sectionKey || packed.section),
    duration_ms: normalizeStoredDuration(duration),
    referrer: pointKey(metadata.pageReferrer || packed.referrer || (packedReferrer ? "" : event?.referrer)),
    ...localParts(event.created_at, timeZone),
  };
}

function unpackDishAnalyticsReferrer(value) {
  const referrer = String(value || "");
  if (!referrer.startsWith("dish:")) return {};
  try {
    const decoded = Buffer.from(referrer.slice(5), "base64url").toString("utf8");
    const payload = JSON.parse(decoded);
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  } catch {
    return {};
  }
}

function normalizeStoredDuration(value) {
  if (value === null || value === undefined || value === "") return null;
  const duration = Number(value);
  return Number.isFinite(duration) ? Math.max(0, Math.min(86400000, Math.round(duration))) : null;
}

function resolveDishEventItems(events, items) {
  const aliases = new Map();
  const titles = new Map();

  for (const item of items) {
    const id = pointKey(item.id);
    [id, pointKey(item.content_key)].filter(Boolean).forEach((alias) => aliases.set(alias, id));
    const title = normalizeDishTitle(item.name_ru || item.title_ru);
    if (!title) continue;
    if (!titles.has(title)) titles.set(title, id);
    else titles.set(title, null);
  }

  return events.map((event) => {
    const direct = [event.dish_id, event.menu_item_id, event.content_key]
      .map(pointKey)
      .find((candidate) => aliases.has(candidate));
    const title = normalizeDishTitle(event.dish_title);
    return {
      ...event,
      analytics_item_id: direct ? aliases.get(direct) : (title && titles.get(title)) || "",
    };
  });
}

function normalizeDishTitle(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function resolvePeriod(input, timeZone) {
  const range = ["today", "prev_week", "7d", "30d", "all", "custom"].includes(input.range) ? input.range : "7d";
  const today = dateKey(new Date(), timeZone);
  if (range === "all") {
    return {
      range,
      start: "1970-01-01",
      end: shiftDate(today, 1),
      comparisonStart: "1970-01-01",
      comparisonEnd: "1970-01-01",
      activityStart: shiftDate(today, -29),
      dayCount: 30,
    };
  }
  let start = range === "today" ? today : shiftDate(today, range === "30d" ? -29 : -6);
  let end = shiftDate(today, 1);
  if (range === "prev_week") {
    const currentWeekStart = shiftDate(today, -((utcDate(today).getUTCDay() + 6) % 7));
    start = shiftDate(currentWeekStart, -7);
    end = currentWeekStart;
  }
  if (range === "custom" && datePattern(input.startDate) && datePattern(input.endDate)) {
    start = input.startDate;
    const requestedDays = Math.round((utcDate(shiftDate(input.endDate, 1)) - utcDate(start)) / 86400000);
    end = shiftDate(start, Math.max(1, Math.min(90, requestedDays)));
  }
  const dayCount = Math.max(1, Math.round((utcDate(end) - utcDate(start)) / 86400000));
  return { range, start, end, comparisonStart: shiftDate(start, -dayCount), comparisonEnd: start, dayCount };
}

function metrics(events) {
  const sessions = sessionIds(events);
  const engaged = new Set(events.filter((event) => event.event_type === "dish_open" && event.session_id).map((event) => event.session_id));
  const engagedCount = [...engaged].filter((id) => sessions.has(id)).length;
  const exits = events.filter((event) => event.event_type === "menu_exit" && Number.isFinite(Number(event.duration_ms)));
  return {
    sessions: sessions.size,
    engagedSessions: engagedCount,
    engagedRate: sessions.size ? round((engagedCount / sessions.size) * 100) : 0,
    dishOpens: events.filter((event) => event.event_type === "dish_open").length,
    averageStudyMs: exits.length ? Math.round(exits.reduce((sum, event) => sum + Number(event.duration_ms), 0) / exits.length) : null,
  };
}

function timeline(events, period) {
  if (period.range === "today") {
    return Array.from({ length: 17 }, (_, index) => {
      const hour = index + 7;
      return timelineRow(
        `${period.start}T${String(hour).padStart(2, "0")}`,
        `${String(hour).padStart(2, "0")}:00`,
        hour,
        events.filter((event) => event.localDateKey === period.start && event.localHour === hour),
      );
    });
  }

  if (period.range === "all") {
    const monthKeys = [...new Set(events.map((event) => event.localDateKey.slice(0, 7)))].sort();
    return monthKeys.map((monthKey, index) => timelineRow(
      monthKey,
      monthLabel(monthKey),
      index,
      events.filter((event) => event.localDateKey.startsWith(monthKey)),
    ));
  }

  return Array.from({ length: period.dayCount }, (_, index) => {
    const date = shiftDate(period.start, index);
    return timelineRow(date, shortDate(date), index, events.filter((event) => event.localDateKey === date));
  });
}

function timelineRow(key, label, sortValue, events) {
  const values = metrics(events);
  const exits = events.filter((event) => event.event_type === "menu_exit" && Number.isFinite(Number(event.duration_ms)));
  return {
    key,
    label,
    sortValue,
    sessions: values.sessions,
    engagedSessions: values.engagedSessions,
    dishOpens: values.dishOpens,
    engagement: values.engagedRate,
    averageStudyMs: values.averageStudyMs,
    completedSessions: exits.length,
    durationTotalMs: exits.reduce((sum, event) => sum + Number(event.duration_ms), 0),
  };
}

function hourlyAnalytics(events) {
  return Array.from({ length: 17 }, (_, index) => {
    const hour = index + 7;
    const slice = events.filter((event) => event.localHour === hour);
    return { hour, label: `${String(hour).padStart(2, "0")}:00`, sessions: sessionIds(slice).size };
  });
}

function sessionIds(events) {
  const started = events.filter((event) => event.event_type === "session_start" && event.session_id).map((event) => event.session_id);
  const fallback = events.filter((event) => event.event_type === "menu_open" && event.session_id).map((event) => event.session_id);
  return new Set([...started, ...fallback]);
}

function metric(value, previous, sparkline, format = "number", sentiment = "positive") {
  return { value, previous, change: change(value, previous), sparkline, format, sentiment };
}

function change(value, previous) {
  if (value === null || value === undefined || previous === null || previous === undefined) return null;
  if (Number(previous) === 0) return Number(value) === 0 ? 0 : null;
  return round(((Number(value) - Number(previous)) / Math.abs(Number(previous))) * 100);
}

function comparableDays(current, previous, period) {
  return Array.from({ length: period.dayCount }, (_, index) => {
    const date = shiftDate(period.activityStart || period.start, index);
    const oldDate = shiftDate(period.comparisonStart, index);
    const a = metrics(current.filter((event) => event.localDateKey === date));
    const b = metrics(previous.filter((event) => event.localDateKey === oldDate));
    const dayEvents = current.filter((event) => event.localDateKey === date);
    return {
      date,
      label: weekday(date),
      fullLabel: shortDate(date),
      sessions: point(a.sessions, b.sessions),
      dishOpens: point(a.dishOpens, b.dishOpens),
      engagement: point(a.engagedRate, b.engagedRate),
      averageStudyMs: point(a.averageStudyMs || 0, b.averageStudyMs || 0),
      busiestHour: busiestHour(dayEvents),
    };
  });
}

function point(current, previous) { return { current, previous, change: change(current, previous) }; }

function busiestHour(events) {
  const counts = countBy(events.filter((event) => ["session_start", "menu_open"].includes(event.event_type)).map((event) => ({ key: event.localHour })), "key");
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return winner ? `${String(winner[0]).padStart(2, "0")}:00` : "—";
}

function heatmap(events, period) {
  const length = Math.min(7, period.dayCount);
  const start = shiftDate(period.end, -length);
  return Array.from({ length }, (_, dayIndex) => {
    const date = shiftDate(start, dayIndex);
    return {
      date,
      label: weekday(date),
      hours: Array.from({ length: 16 }, (_, index) => {
        const hour = index + 8;
        const slice = events.filter((event) => event.localDateKey === date && event.localHour === hour);
        return { hour, sessions: sessionIds(slice).size, dishOpens: slice.filter((event) => event.event_type === "dish_open").length };
      }),
    };
  });
}

function dishAnalytics(current, previous, items, totalSessions) {
  const currentOpens = current.filter((event) => event.event_type === "dish_open" && event.analytics_item_id);
  const previousOpens = previous.filter((event) => event.event_type === "dish_open" && event.analytics_item_id);
  const a = countBy(currentOpens, "analytics_item_id");
  const b = countBy(previousOpens, "analytics_item_id");
  return items.filter((item) => item.is_active !== false).map((item) => {
    const itemId = pointKey(item.id);
    const opens = a[itemId] || 0;
    const itemEvents = currentOpens.filter((event) => event.analytics_item_id === itemId);
    const sessions = new Set(itemEvents.filter((event) => event.session_id).map((event) => event.session_id)).size;
    const durations = current.filter((event) => event.event_type === "dish_close" && event.analytics_item_id === itemId && Number(event.duration_ms) > 0).map((event) => Number(event.duration_ms));
    return {
      id: itemId,
      title: String(item.name_ru || item.title_ru || "Блюдо").trim(),
      opens,
      previousOpens: b[itemId] || 0,
      sessionShare: totalSessions ? round((sessions / totalSessions) * 100) : 0,
      averageViewMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      change: change(opens, b[itemId] || 0),
    };
  }).sort((left, right) => right.opens - left.opens);
}

function funnel(events, totalSessions) {
  const validSessions = sessionIds(events);
  const bySession = new Map();
  events.filter((event) => event.event_type === "dish_open" && validSessions.has(event.session_id) && event.analytics_item_id).forEach((event) => {
    const set = bySession.get(event.session_id) || new Set(); set.add(event.analytics_item_id); bySession.set(event.session_id, set);
  });
  const comparedDishes = new Set([...bySession.entries()].filter(([, set]) => set.size >= 2).map(([sessionId]) => sessionId));
  const studied = new Set(events.filter((event) => event.event_type === "menu_exit" && comparedDishes.has(event.session_id) && Number(event.duration_ms) >= 60000).map((event) => event.session_id));
  const values = [totalSessions, bySession.size, comparedDishes.size, studied.size];
  const labels = ["Открыли меню", "Открыли хотя бы одно блюдо", "Открыли два или больше блюд", "Изучали меню больше 60 секунд"];
  return labels.map((label, index) => ({ label, value: values[index], rate: index === 0 ? 100 : values[index - 1] ? round((values[index] / values[index - 1]) * 100) : 0 }));
}

function sourceAnalytics(current, previous, names) {
  const ids = new Set([...current, ...previous].map(sourceGroupId));
  const total = metrics(current).sessions;
  return [...ids].map((id) => {
    const a = current.filter((event) => sourceGroupId(event) === id);
    const b = previous.filter((event) => sourceGroupId(event) === id);
    const am = metrics(a); const bm = metrics(b);
    return {
      id,
      name: id === "direct" ? "Прямой вход" : id === "unknown" ? "Источник не определён" : (names[id] || "Архивный источник"),
      sessions: am.sessions,
      share: total ? round((am.sessions / total) * 100) : 0,
      engagement: am.engagedRate,
      change: change(am.sessions, bm.sessions),
    };
  }).sort((left, right) => right.sessions - left.sessions);
}

function sourceGroupId(event) {
  if (event.qr_source_id) return event.qr_source_id;
  return isDirectEvent(event) ? "direct" : "unknown";
}

function isDirectEvent(event) {
  if (event.qr_source_id) return false;
  const fallback = String(event.source_fallback || "").trim().toLowerCase();
  return !fallback || ["direct", "прямой вход", "прямой переход"].includes(fallback);
}

function audience(events, field, formatter) {
  const values = new Map();
  events.filter((event) => event.session_id && event[field]).forEach((event) => { if (!values.has(event.session_id)) values.set(event.session_id, event[field]); });
  const counts = {}; values.forEach((value) => { counts[value] = (counts[value] || 0) + 1; });
  return Object.entries(counts).map(([value, count]) => ({ label: formatter(value), count, percent: values.size ? round((count / values.size) * 100) : 0 })).sort((a, b) => b.count - a.count);
}

function browserAudience(events) {
  return sessionAudience(events, (event) => browserLabel(event.user_agent));
}

function referrerAudience(events) {
  return sessionAudience(events, (event) => referrerLabel(event.referrer), true);
}

function sessionAudience(events, selector, omitEmpty = false) {
  const values = new Map();
  events.filter((event) => event.session_id).forEach((event) => {
    if (values.has(event.session_id)) return;
    const value = selector(event);
    if (omitEmpty && !value) return;
    values.set(event.session_id, value || "Другое");
  });
  const counts = {};
  values.forEach((value) => { counts[value] = (counts[value] || 0) + 1; });
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count, percent: values.size ? round((count / values.size) * 100) : 0 }))
    .sort((left, right) => right.count - left.count);
}

function browserLabel(value) {
  const userAgent = String(value || "");
  if (!userAgent) return "Не определено";
  if (/Instagram/i.test(userAgent)) return "Instagram";
  if (/FBAN|FBAV|\bFB_IAB\b/i.test(userAgent)) return "Facebook";
  if (/Telegram/i.test(userAgent)) return "Telegram";
  if (/WhatsApp/i.test(userAgent)) return "WhatsApp";
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/SamsungBrowser/i.test(userAgent)) return "Samsung Internet";
  if (/Firefox|FxiOS/i.test(userAgent)) return "Firefox";
  if (/CriOS|Chrome/i.test(userAgent)) return "Chrome";
  if (/Safari/i.test(userAgent)) return "Safari";
  return "Другое";
}

function referrerLabel(value) {
  const referrer = String(value || "").trim();
  if (!referrer || referrer.startsWith("dish:")) return "";
  try {
    return friendlyReferrerHost(new URL(referrer).hostname) || "Другой сайт";
  } catch {
    return "Другой сайт";
  }
}

function resolveHeatmapPeriod(input, timeZone) {
  const range = input.heatmapRange === "prev_week" ? "prev_week" : "current_week";
  const today = dateKey(new Date(), timeZone);
  const currentWeekStart = shiftDate(today, -((utcDate(today).getUTCDay() + 6) % 7));
  const start = range === "prev_week" ? shiftDate(currentWeekStart, -7) : currentWeekStart;
  return { range, start, end: shiftDate(start, 7), dayCount: 7 };
}

function friendlyReferrerHost(value) {
  const host = String(value || "").toLowerCase().replace(/^www\./, "");
  if (!host) return "";
  if (/(^|\.)instagram\.com$/.test(host)) return "Instagram";
  if (/(^|\.)facebook\.com$|(^|\.)fb\.com$/.test(host)) return "Facebook";
  if (/(^|\.)google\.|(^|\.)bing\.com$|(^|\.)yandex\./.test(host)) return "Поиск в интернете";
  if (/(^|\.)t\.me$|(^|\.)telegram\./.test(host)) return "Telegram";
  if (/(^|\.)wa\.me$|(^|\.)whatsapp\./.test(host)) return "WhatsApp";
  if (/tekemetqonaev|exort/.test(host)) return "Сайт ресторана";
  return host;
}

function dayDetails(events, period) {
  return Object.fromEntries(Array.from({ length: period.dayCount }, (_, index) => shiftDate(period.activityStart || period.start, index)).map((date) => {
    const day = events.filter((event) => event.localDateKey === date);
    return [date, { label: shortDate(date), hours: Array.from({ length: 24 }, (_, hour) => {
      const slice = day.filter((event) => event.localHour === hour);
      const completedSessions = slice.filter((event) => event.event_type === "menu_exit" && Number.isFinite(Number(event.duration_ms)));
      const averageSessionMs = completedSessions.length
        ? Math.round(completedSessions.reduce((sum, event) => sum + Number(event.duration_ms), 0) / completedSessions.length)
        : null;
      return { hour, sessions: sessionIds(slice).size, dishOpens: slice.filter((event) => event.event_type === "dish_open").length, averageSessionMs };
    }) }];
  }));
}

function recentEvents(events, items) {
  const names = Object.fromEntries(items.map((item) => [pointKey(item.id), String(item.name_ru || item.title_ru || "Позиция").trim()]));
  const labels = {
    session_start: "Начало сессии",
    menu_open: "Открыто меню",
    category_view: "Открыта категория",
    dish_open: "Открыта карточка блюда",
    dish_close: "Закрыта карточка блюда",
    language_change: "Изменён язык",
    search: "Поиск по меню",
    menu_exit: "Завершено изучение меню",
  };
  return [...events]
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .map((event) => ({
      id: event.id,
      type: event.event_type,
      label: labels[event.event_type] || "Событие меню",
      item: event.analytics_item_id
        ? (names[event.analytics_item_id] || event.dish_title || "Удалённая позиция")
        : (event.dish_title || ""),
      language: event.language || "",
      device: event.device_type || "",
      source: event.source_fallback || "",
      createdAt: event.created_at,
    }));
}

function insights(current, previous, days, dishes, events) {
  if (current.sessions < 5) return [];
  const result = [];
  const average = current.sessions / Math.max(days.length, 1);
  const busiest = [...days].sort((a, b) => b.sessions.current - a.sessions.current)[0];
  if (busiest?.sessions.current > average * 1.2) result.push(`${busiest.label}: посещений на ${Math.round(((busiest.sessions.current - average) / average) * 100)}% больше среднего за период.`);
  const growing = dishes.filter((dish) => dish.change !== null && dish.change >= 20).sort((a, b) => b.change - a.change)[0];
  if (growing) result.push(`${growing.title}: интерес вырос на ${growing.change}% относительно предыдущего периода.`);
  const low = dishes.filter((dish) => dish.opens < 5).length;
  if (low) result.push(`${low} ${low === 1 ? "блюдо получило" : "блюд получили"} меньше пяти открытий.`);
  const kz = new Set(events.filter((event) => ["kk", "kz"].includes(event.language) && event.session_id).map((event) => event.session_id)).size;
  if (kz) result.push(`${Math.round((kz / current.sessions) * 100)}% гостей использовали казахскую версию меню.`);
  const delta = change(current.sessions, previous.sessions);
  if (delta) result.push(`Сессии меню ${delta > 0 ? "выросли" : "снизились"} на ${Math.abs(delta)}% относительно предыдущего периода.`);
  return result.slice(0, 5);
}

async function getRestaurant(env, slug) {
  const rows = await rest(env, "restaurants", { query: { select: "*", slug: `eq.${slug}`, is_active: "eq.true", limit: "1" } });
  if (!rows[0]) throw new Error(`Active restaurant "${slug}" was not found.`);
  return rows[0];
}

async function rest(env, table, { query = {} } = {}) {
  const base = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const url = new URL(`${base}/rest/v1/${table}`);
  Object.entries(query).forEach(([name, value]) => url.searchParams.set(name, value));
  const result = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!result.ok) throw new Error(`Supabase analytics request failed: ${await result.text()}`);
  return result.json();
}

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}

function inRange(event, start, end) { return event.localDateKey >= start && event.localDateKey < end; }
function pointKey(value) { return String(value || ""); }
function countBy(rows, key) { return rows.reduce((result, row) => { const value = pointKey(row[key]); if (value) result[value] = (result[value] || 0) + 1; return result; }, {}); }
function round(value) { return Math.round(Number(value) * 10) / 10; }
function datePattern(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }
function utcDate(key) { const [year, month, day] = String(key).split("-").map(Number); return new Date(Date.UTC(year, month - 1, day)); }
function shiftDate(key, days) { const date = utcDate(key); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function localParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { localDateKey: `${map.year}-${map.month}-${map.day}`, localHour: Number(map.hour) };
}
function dateKey(value, timeZone) { return localParts(value, timeZone).localDateKey; }
function weekday(key) { return new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" }).format(utcDate(key)).replace(".", ""); }
function shortDate(key) { return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(utcDate(key)); }
function monthLabel(key) {
  const [year, month] = String(key).split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
function periodLabel(start, end, timeZone) {
  const format = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone });
  return start === end ? format.format(utcDate(start)) : `${format.format(utcDate(start))} — ${format.format(utcDate(end))}`;
}

module.exports = { getAnalyticsV2 };
