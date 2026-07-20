(function () {
  const state = { root: null, data: null, range: "today", sourceId: "all", dishTab: "leaders", loading: false, error: "", mounted: false, requestId: 0, detailOpen: false, dishDetailOpen: false, eventsDetailOpen: false, timelineSort: { key: "sortValue", direction: "asc" }, dishSort: { key: "default", direction: "asc" } };

  async function mount(options = {}) {
    state.root = options.root || document.querySelector("[data-analytics-root]");
    if (!state.root) return;
    if (!state.mounted) {
      state.root.addEventListener("click", onClick);
      state.root.addEventListener("change", onChange);
      document.addEventListener("keydown", onKeyDown);
      state.mounted = true;
    }
    if (!state.data) await load(); else render();
  }

  async function load() {
    const requestId = ++state.requestId;
    state.loading = true;
    state.error = "";
    const watchdogId = window.setTimeout(() => {
      if (state.loading && requestId === state.requestId) {
        state.loading = false;
        state.data = null;
        state.error = "Аналитика не ответила за 22 секунды. Проверьте Netlify Function и повторите запрос.";
        render();
      }
    }, 22000);
    render();
    try {
      const payload = { range: state.range, sourceId: state.sourceId === "all" ? "" : state.sourceId };
      const result = await withTimeout(api("getAnalytics", payload), 20000);
      if (requestId !== state.requestId) return;
      if (!result?.analytics?.period || !result.analytics.summary || !Array.isArray(result.analytics.activity?.days)) {
        throw new Error("Сервер аналитики ещё не обновлён до новой версии. Сначала примените SQL-миграцию и опубликуйте Netlify Function.");
      }
      state.data = result.analytics;
      if (!Array.isArray(state.data.timeline)) state.data.timeline = legacyTimeline(state.data);
    } catch (error) {
      if (requestId !== state.requestId) return;
      state.error = error?.message || "Не удалось загрузить аналитику.";
    } finally {
      if (requestId === state.requestId) {
        window.clearTimeout(watchdogId);
        state.loading = false;
        try {
          render();
        } catch (error) {
          state.data = null;
          state.error = error?.message || "Не удалось отобразить аналитику.";
          render();
        }
      }
    }
  }

  function render() {
    if (!state.root) return;
    if (state.loading && !state.data) {
      state.root.innerHTML = '<div class="analytics-loading"><span></span><strong>Собираем аналитику меню...</strong><small>Показываем только реальные агрегированные данные</small></div>';
      return;
    }
    if (state.error && !state.data) {
      state.root.innerHTML = `<div class="analytics-error" role="alert"><strong>Аналитика временно недоступна</strong><p>${escapeHtml(state.error)}</p><button class="secondary-button" type="button" data-analytics-retry>Повторить</button></div>`;
      return;
    }
    const data = state.data;
    if (!data) return;
    state.root.innerHTML = `
      <header class="analytics-v2-header">
        <div><p class="kicker">Результаты меню</p><h2>Аналитика меню</h2><p>${state.range === "all" ? `${escapeHtml(data.period.label)} · без сравнения` : `${escapeHtml(data.period.label)} · сравнение с ${escapeHtml(data.period.comparisonLabel)}`}</p></div>
        <div class="analytics-v2-actions">
          <div class="analytics-period-switch" role="group" aria-label="Период аналитики">
            ${periodButton("today", "Сегодня")}${periodButton("7d", "7 дней")}${periodButton("30d", "30 дней")}${periodButton("all", "Всё время")}
          </div>
          <button class="secondary-button compact" type="button" data-analytics-export>Экспорт</button>
        </div>
      </header>
      <div class="analytics-filter-row">
        <label>Источник<select data-analytics-source>${(data.sourceOptions || []).map((item) => `<option value="${escapeHtml(item.id)}" ${state.sourceId === item.id ? "selected" : ""}>${escapeHtml(item.name)}${item.isActive ? "" : " · архив"}</option>`).join("")}</select></label>
        ${state.error ? `<span class="analytics-inline-error">${escapeHtml(state.error)}</span>` : ""}
      </div>
      <div class="analytics-v2-metrics">
        ${metricCard("Сессии меню", data.summary.sessions, "Полноценные открытия меню")}
        ${metricCard("Вовлечённые гости", data.summary.engagedRate, "Открыли хотя бы одно блюдо")}
        ${metricCard("Открытия блюд", data.summary.dishOpens, "Все открытия карточек")}
        ${metricCard("Среднее время изучения", data.summary.averageStudyMs, "По событию выхода из меню")}
      </div>
      ${timelineCard(data.timeline || [])}
      <div class="analytics-v2-two-column">
        ${heatmapCard(data.heatmap || [])}
        ${insightsCard(data.insights || [])}
      </div>
      ${dishCard(data.dishes || [])}
      <div class="analytics-v2-two-column analytics-v2-two-column--bottom">
        ${funnelCard(data.funnel || [])}
        ${audienceCard(data.audience || {})}
      </div>
      ${recentEventsCard(data.recentEvents || [], data.timeZone)}
      ${sourceCard(data.sources || [])}
      ${state.detailOpen ? timelineModal(data.timeline || [], data.period) : ""}
      ${state.dishDetailOpen ? dishModal(data.dishes || [], data.period) : ""}
      ${state.eventsDetailOpen ? recentEventsModal(data.recentEvents || [], data.timeZone) : ""}`;
    document.body.classList.toggle("analytics-modal-open", state.detailOpen || state.dishDetailOpen || state.eventsDetailOpen);
  }

  function periodButton(value, label) { return `<button class="${state.range === value ? "is-active" : ""}" type="button" data-analytics-period="${value}">${label}</button>`; }

  function metricCard(label, item, hint) {
    const hasValue = item?.value !== null && item?.value !== undefined;
    const changeValue = item?.change;
    const comparisonUnavailable = state.range === "all";
    const direction = comparisonUnavailable || item?.sentiment === "neutral" || changeValue === null || changeValue === 0 ? "neutral" : changeValue > 0 ? "positive" : "negative";
    const changeText = comparisonUnavailable ? "За весь период" : changeValue === null ? "Новый показатель" : changeValue === 0 ? "Без изменений" : `${changeValue > 0 ? "+" : ""}${changeValue}%`;
    const changeHint = comparisonUnavailable ? "без сравнения" : "к предыдущему периоду";
    const max = Math.max(...(item?.sparkline || []).map(Number), 1);
    return `<article class="analytics-v2-metric">
      <span>${label}</span><strong>${hasValue ? formatMetric(item.value, item.format) : "Нет данных"}</strong>
      <div class="metric-change is-${direction}"><b>${changeText}</b><small>${changeHint}</small></div>
      <div class="metric-sparkline" aria-hidden="true">${(item?.sparkline || []).slice(-14).map((value) => `<i style="height:${Math.max(8, Math.round((Number(value || 0) / max) * 100))}%"></i>`).join("")}</div>
      <p>${hint}</p>
    </article>`;
  }

  function timelineCard(rows) {
    const compactRows = [...rows].sort((a, b) => Number(a.sortValue) - Number(b.sortValue)).slice(-5);
    return `<section class="analytics-v2-card analytics-timeline-card">
      <div class="analytics-v2-card-head"><div><p class="kicker">Динамика периода</p><h3>${state.range === "today" ? "Активность по часам" : state.range === "all" ? "Активность по месяцам" : "Активность по дням"}</h3></div></div>
      <div class="analytics-timeline-table-wrap analytics-timeline-table-wrap--compact">${timelineTable(compactRows, rows, false)}</div>
      <div class="analytics-timeline-more"><button type="button" data-analytics-detail-open>Подробнее <span aria-hidden="true">→</span></button></div>
    </section>`;
  }

  function timelineModal(rows, period) {
    const sortedRows = sortedTimelineRows(rows);
    return `<div class="analytics-detail-modal" data-analytics-modal role="dialog" aria-modal="true" aria-labelledby="analytics-detail-title">
      <button class="analytics-detail-backdrop" type="button" data-analytics-detail-close aria-label="Закрыть подробную аналитику"></button>
      <section class="analytics-detail-panel">
        <header class="analytics-detail-header">
          <div class="analytics-detail-heading"><p class="kicker">${escapeHtml(period?.label || activePeriodLabel())}</p><h2 id="analytics-detail-title">Подробная аналитика</h2></div>
          <div class="analytics-detail-periods" role="group" aria-label="Период подробной аналитики">
            ${periodButton("today", "Сегодня")}${periodButton("7d", "7 дней")}${periodButton("30d", "30 дней")}${periodButton("all", "Всё время")}
          </div>
          <button class="analytics-detail-close" type="button" data-analytics-detail-close aria-label="Закрыть">×</button>
        </header>
        <div class="analytics-detail-table-wrap">${timelineTable(sortedRows, rows, true)}</div>
      </section>
    </div>`;
  }

  function timelineTable(rows, allRows, sortable) {
    const peakKey = peakTimelineKey(allRows);
    const totals = timelineTotals(allRows);
    const firstColumn = state.range === "today" ? "Время" : state.range === "all" ? "Месяц" : "Дата";
    const body = rows.length ? rows.map((row) => `<tr>
      <th scope="row"><span>${escapeHtml(row.label)}</span>${row.key === peakKey ? '<em class="analytics-peak-badge">Пик</em>' : ""}</th>
      <td>${number(row.sessions)}</td>
      <td>${number(row.dishOpens)}</td>
      <td>${number(row.engagement)}%</td>
      <td>${row.averageStudyMs === null || row.averageStudyMs === undefined ? "—" : duration(row.averageStudyMs)}</td>
    </tr>`).join("") : '<tr><td colspan="5" class="analytics-timeline-empty">За выбранный период данных пока нет.</td></tr>';
    return `<table class="analytics-timeline-table">
      <thead><tr><th>${firstColumn}</th>${timelineHeader("sessions", "Сессии", sortable)}${timelineHeader("dishOpens", "Открытия блюд", sortable)}${timelineHeader("engagement", "Вовлечённость", sortable)}${timelineHeader("averageStudyMs", "Среднее время", sortable)}</tr></thead>
      <tbody>${body}</tbody>
      ${sortable ? `<tfoot><tr><th>Итого</th><td>${number(totals.sessions)}</td><td>${number(totals.dishOpens)}</td><td>${number(totals.engagement)}%</td><td>${totals.averageStudyMs === null ? "—" : duration(totals.averageStudyMs)}</td></tr></tfoot>` : ""}
    </table>`;
  }

  function timelineHeader(key, label, sortable) {
    if (!sortable) return `<th>${label}</th>`;
    const active = state.timelineSort.key === key;
    const arrow = active ? (state.timelineSort.direction === "asc" ? "↑" : "↓") : "↕";
    return `<th aria-sort="${active ? (state.timelineSort.direction === "asc" ? "ascending" : "descending") : "none"}"><button type="button" data-timeline-sort="${key}">${label}<span aria-hidden="true">${arrow}</span></button></th>`;
  }

  function sortedTimelineRows(rows) {
    const { key, direction } = state.timelineSort;
    const multiplier = direction === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = left[key]; const b = right[key];
      if (a === null || a === undefined) return b === null || b === undefined ? Number(left.sortValue) - Number(right.sortValue) : 1;
      if (b === null || b === undefined) return -1;
      const difference = Number(a) - Number(b);
      return difference ? difference * multiplier : Number(left.sortValue) - Number(right.sortValue);
    });
  }

  function timelineTotals(rows) {
    const totals = rows.reduce((result, row) => ({
      sessions: result.sessions + Number(row.sessions || 0),
      engagedSessions: result.engagedSessions + Number(row.engagedSessions || 0),
      dishOpens: result.dishOpens + Number(row.dishOpens || 0),
      completedSessions: result.completedSessions + Number(row.completedSessions || 0),
      durationTotalMs: result.durationTotalMs + Number(row.durationTotalMs || 0),
    }), { sessions: 0, engagedSessions: 0, dishOpens: 0, completedSessions: 0, durationTotalMs: 0 });
    return {
      ...totals,
      engagement: totals.sessions ? Math.round((totals.engagedSessions / totals.sessions) * 1000) / 10 : 0,
      averageStudyMs: totals.completedSessions ? Math.round(totals.durationTotalMs / totals.completedSessions) : null,
    };
  }

  function peakTimelineKey(rows) {
    const max = Math.max(...rows.map((row) => Number(row.sessions || 0)), 0);
    return max > 0 ? rows.find((row) => Number(row.sessions || 0) === max)?.key : "";
  }

  function activePeriodLabel() { return ({ today: "Сегодня", "7d": "7 дней", "30d": "30 дней", all: "Всё время" }[state.range] || "Период"); }

  function legacyTimeline(data) {
    if (state.range === "today") {
      const detail = Object.values(data.dayDetails || {})[0];
      return (detail?.hours || []).filter((row) => row.hour >= 7 && row.hour <= 23).map((row) => ({
        key: `${data.period.start}T${String(row.hour).padStart(2, "0")}`,
        label: `${String(row.hour).padStart(2, "0")}:00`,
        sortValue: row.hour,
        sessions: Number(row.sessions || 0),
        engagedSessions: null,
        dishOpens: Number(row.dishOpens || 0),
        engagement: 0,
        averageStudyMs: row.averageSessionMs,
        completedSessions: 0,
        durationTotalMs: 0,
      }));
    }
    if (state.range === "all") return [];
    return (data.activity?.days || []).map((day, index) => ({
      key: day.date,
      label: day.fullLabel,
      sortValue: index,
      sessions: Number(day.sessions?.current || 0),
      engagedSessions: null,
      dishOpens: Number(day.dishOpens?.current || 0),
      engagement: Number(day.engagement?.current || 0),
      averageStudyMs: day.averageStudyMs?.current ?? null,
      completedSessions: 0,
      durationTotalMs: 0,
    }));
  }



  function heatmapCard(rows) {
    const max = Math.max(...rows.flatMap((row) => row.hours.map((hour) => hour.sessions)), 1);
    return `<section class="analytics-v2-card heatmap-card"><div class="analytics-v2-card-head"><div><p class="kicker">Дни и часы</p><h3>Когда гости изучают меню</h3></div></div>
      <div class="heatmap-scroll"><div class="heatmap-grid"><div></div>${Array.from({ length: 16 }, (_, index) => `<span>${String(index + 8).padStart(2, "0")}</span>`).join("")}${rows.map((row) => `<strong>${row.label}</strong>${row.hours.map((hour) => `<i style="--intensity:${Math.max(0.04, hour.sessions / max)}" title="${escapeHtml(`${row.label}, ${String(hour.hour).padStart(2, "0")}:00 · ${hour.sessions} сессий · ${hour.dishOpens} открытий блюд`)}"></i>`).join("")}`).join("")}</div></div>
      <p class="analytics-note">Интенсивность цвета показывает количество сессий с 08:00 до 23:00.</p></section>`;
  }

  function insightsCard(items) {
    return `<section class="analytics-v2-card insights-card"><div class="analytics-v2-card-head"><div><p class="kicker">Автоматический анализ</p><h3>Что изменилось за период</h3></div></div>${items.length ? `<ol>${items.map((item) => `<li><span>↗</span><p>${escapeHtml(item)}</p></li>`).join("")}</ol>` : '<div class="analytics-empty analytics-empty--compact"><strong>Пока недостаточно данных</strong><p>Подробные выводы появятся после накопления как минимум пяти сессий.</p></div>'}</section>`;
  }

  function dishCard(items) {
    const filtered = dishRows(items);
    return `<section class="analytics-v2-card dish-analytics-card"><div class="analytics-v2-card-head"><div><p class="kicker">Интерес гостей</p><h3>Аналитика блюд</h3></div><div class="dish-tabs">${dishTab("leaders", "Лидеры")}${dishTab("growing", "Растущие")}${dishTab("falling", "Теряют интерес")}${dishTab("unopened", "Не открывают")}</div></div>
      <div class="analytics-table-scroll analytics-dish-table-scroll--compact">${dishTable(filtered.slice(0, 5), filtered, false)}</div>
      <div class="analytics-timeline-more"><button type="button" data-dish-detail-open>Подробнее <span aria-hidden="true">→</span></button></div>
    </section>`;
  }
  function dishTab(value, label) { return `<button class="${state.dishTab === value ? "is-active" : ""}" type="button" data-dish-tab="${value}">${label}</button>`; }
  function dishRows(items) {
    if (state.dishTab === "growing") return items.filter((item) => Number(item.change) > 0).sort((a, b) => b.change - a.change);
    if (state.dishTab === "falling") return items.filter((item) => Number(item.change) < 0).sort((a, b) => a.change - b.change);
    if (state.dishTab === "unopened") return items.filter((item) => item.opens < 2).sort((a, b) => a.opens - b.opens);
    return [...items].sort((a, b) => b.opens - a.opens);
  }

  function dishModal(items, period) {
    const filtered = dishRows(items);
    const sorted = sortedDishRows(filtered);
    return `<div class="analytics-detail-modal" role="dialog" aria-modal="true" aria-labelledby="dish-detail-title">
      <button class="analytics-detail-backdrop" type="button" data-analytics-detail-close aria-label="Закрыть подробную аналитику блюд"></button>
      <section class="analytics-detail-panel">
        <header class="analytics-detail-header">
          <div class="analytics-detail-heading"><p class="kicker">${escapeHtml(period?.label || activePeriodLabel())}</p><h2 id="dish-detail-title">Подробная аналитика блюд</h2></div>
          <div class="analytics-detail-periods" role="group" aria-label="Период подробной аналитики блюд">
            ${periodButton("today", "Сегодня")}${periodButton("7d", "7 дней")}${periodButton("30d", "30 дней")}${periodButton("all", "Всё время")}
          </div>
          <button class="analytics-detail-close" type="button" data-analytics-detail-close aria-label="Закрыть">×</button>
        </header>
        <div class="analytics-dish-detail-toolbar"><div class="dish-tabs">${dishTab("leaders", "Лидеры")}${dishTab("growing", "Растущие")}${dishTab("falling", "Теряют интерес")}${dishTab("unopened", "Не открывают")}</div><span>${number(filtered.length)} позиций</span></div>
        <div class="analytics-detail-table-wrap analytics-dish-detail-table-wrap">${dishTable(sorted, filtered, true)}</div>
      </section>
    </div>`;
  }

  function dishTable(rows, allRows, sortable) {
    const peakId = peakDishId(allRows);
    const body = rows.length ? rows.map((item) => `<tr>
      <th scope="row"><strong>${escapeHtml(item.title)}</strong>${item.id === peakId ? '<em class="analytics-peak-badge">Пик</em>' : ""}</th>
      <td>${number(item.opens)}</td>
      <td>${number(item.sessionShare)}%</td>
      <td>${item.averageViewMs ? duration(item.averageViewMs) : "—"}</td>
      <td>${changeBadge(item.change)}</td>
    </tr>`).join("") : '<tr><td colspan="5" class="analytics-timeline-empty">Для выбранной вкладки пока нет данных.</td></tr>';
    const totalOpens = allRows.reduce((sum, item) => sum + Number(item.opens || 0), 0);
    return `<table class="analytics-dish-table analytics-dish-table--detail">
      <thead><tr><th>Блюдо</th>${dishHeader("opens", "Открытия", sortable)}${dishHeader("sessionShare", "Доля сессий", sortable)}${dishHeader("averageViewMs", "Среднее время", sortable)}${dishHeader("change", "Динамика", sortable)}</tr></thead>
      <tbody>${body}</tbody>
      ${sortable ? `<tfoot><tr><th>Итого</th><td>${number(totalOpens)}</td><td>—</td><td>—</td><td>—</td></tr></tfoot>` : ""}
    </table>`;
  }

  function dishHeader(key, label, sortable) {
    if (!sortable) return `<th>${label}</th>`;
    const active = state.dishSort.key === key;
    const arrow = active ? (state.dishSort.direction === "asc" ? "↑" : "↓") : "↕";
    return `<th aria-sort="${active ? (state.dishSort.direction === "asc" ? "ascending" : "descending") : "none"}"><button type="button" data-dish-sort="${key}">${label}<span aria-hidden="true">${arrow}</span></button></th>`;
  }

  function sortedDishRows(rows) {
    if (state.dishSort.key === "default") return rows;
    const { key, direction } = state.dishSort;
    const multiplier = direction === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = left[key]; const b = right[key];
      if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
      if (b === null || b === undefined) return -1;
      const difference = Number(a) - Number(b);
      return difference ? difference * multiplier : String(left.title).localeCompare(String(right.title), "ru");
    });
  }

  function peakDishId(rows) {
    const max = Math.max(...rows.map((item) => Number(item.opens || 0)), 0);
    return max > 0 ? rows.find((item) => Number(item.opens || 0) === max)?.id : "";
  }

  function funnelCard(items) {
    const max = Number(items[0]?.value || 1);
    return `<section class="analytics-v2-card"><div class="analytics-v2-card-head"><div><p class="kicker">Путь по меню</p><h3>Вовлечение гостей</h3></div></div><div class="engagement-funnel">${items.map((item, index) => `<div><span>${index + 1}</span><p><strong>${escapeHtml(item.label)}</strong><small>${index ? `${item.rate}% от предыдущего этапа` : "Все сессии"}</small></p><b>${number(item.value)}</b><i style="width:${Math.max(4, Math.round((item.value / max) * 100))}%"></i></div>`).join("")}</div></section>`;
  }

  function audienceCard(data) {
    return `<section class="analytics-v2-card audience-card"><div class="analytics-v2-card-head"><div><p class="kicker">Вторичный срез</p><h3>Аудитория</h3></div></div><div class="audience-columns"><div><h4>Языки</h4>${audienceRows(normalizeLanguages(data.languages || []))}</div><div><h4>Устройства</h4>${audienceRows(normalizeDevices(data.devices || []))}</div></div></section>`;
  }
  function audienceRows(items) { return items.length ? items.map((item) => `<div class="audience-row"><span>${escapeHtml(item.label)}</span><i><b style="width:${item.percent}%"></b></i><strong>${item.percent}% <small>${number(item.count)}</small></strong></div>`).join("") : '<p class="analytics-note">Нет данных</p>'; }

  function normalizeLanguages(items) {
    const counts = { RU: 0, KZ: 0, EN: 0, TR: 0 };
    items.forEach((item) => {
      const label = String(item.label || "").toUpperCase();
      const key = ["KK", "KZ", "ҚАЗ", "KAZ"].includes(label) ? "KZ" : label.startsWith("RU") ? "RU" : label.startsWith("EN") ? "EN" : label.startsWith("TR") ? "TR" : "";
      if (key) counts[key] += Number(item.count || 0);
    });
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const labels = counts.TR > 0 ? ["RU", "KZ", "EN", "TR"] : ["RU", "KZ", "EN"];
    return labels.map((label) => ({
      label,
      count: counts[label],
      percent: total ? Math.round((counts[label] / total) * 1000) / 10 : 0,
    }));
  }

  function normalizeDevices(items) {
    const counts = { desktop: 0, mobile: 0, tablet: 0, other: 0 };
    items.forEach((item) => {
      const label = String(item.label || "").trim().toLowerCase();
      const key = ["desktop", "компьютер", "ноутбук"].includes(label)
        ? "desktop"
        : ["mobile", "phone", "телефон", "смартфон"].includes(label)
          ? "mobile"
          : ["tablet", "планшет"].includes(label)
            ? "tablet"
            : "other";
      counts[key] += Number(item.count || 0);
    });
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return [
      ["desktop", "Компьютер"],
      ["mobile", "Телефон"],
      ["tablet", "Планшет"],
      ["other", "Другое"],
    ].map(([key, label]) => ({
      label,
      count: counts[key],
      percent: total ? Math.round((counts[key] / total) * 1000) / 10 : 0,
    }));
  }

  function recentEventsCard(items, timeZone) {
    const compactItems = items.slice(0, 5);
    return `<section class="analytics-v2-card recent-events-card"><div class="analytics-v2-card-head"><div><p class="kicker">Реальные события</p><h3>Последние действия</h3></div></div><ol class="recent-events-card__compact">${recentEventRows(compactItems, timeZone)}</ol><div class="analytics-timeline-more"><button type="button" data-events-detail-open>Подробнее <span aria-hidden="true">→</span></button></div></section>`;
  }

  function recentEventsModal(items, timeZone) {
    return `<div class="analytics-detail-modal" role="dialog" aria-modal="true" aria-labelledby="events-detail-title">
      <button class="analytics-detail-backdrop" type="button" data-analytics-detail-close aria-label="Закрыть список событий"></button>
      <section class="analytics-detail-panel">
        <header class="analytics-detail-header analytics-detail-header--events">
          <div class="analytics-detail-heading"><p class="kicker">Сегодня · ${number(items.length)} событий</p><h2 id="events-detail-title">Все события за день</h2></div>
          <button class="analytics-detail-close" type="button" data-analytics-detail-close aria-label="Закрыть">×</button>
        </header>
        <div class="analytics-events-detail-list"><ol>${recentEventRows(items, timeZone)}</ol></div>
      </section>
    </div>`;
  }

  function recentEventRows(items, timeZone) {
    return items.length ? items.map((item) => `<li><time>${escapeHtml(formatEventTime(item.createdAt, timeZone))}</time><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml([item.item, item.language ? item.language.toUpperCase() : "", item.device, item.source].filter(Boolean).join(" · "))}</small></div></li>`).join("") : '<li class="analytics-empty analytics-empty--compact"><strong>Событий пока нет</strong><p>Здесь появятся только реальные действия гостей.</p></li>';
  }

  function formatEventTime(value, timeZone) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat("ru-RU", { timeZone: timeZone || "Asia/Almaty", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
    catch { return "—"; }
  }

  function sourceCard(items) {
    return `<section class="analytics-v2-card source-analytics-card"><div class="analytics-v2-card-head"><div><p class="kicker">Точки входа</p><h3>Откуда открывают меню</h3></div></div><div class="analytics-table-scroll"><table><thead><tr><th>Источник</th><th>Сессии</th><th>Доля</th><th>Вовлечённость</th><th>Динамика</th></tr></thead><tbody>${items.length ? items.map((item) => `<tr data-source-filter="${escapeHtml(item.id)}"><td><button type="button" data-filter-source="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button></td><td>${number(item.sessions)}</td><td>${item.share}%</td><td>${item.engagement}%</td><td>${changeBadge(item.change)}</td></tr>`).join("") : '<tr><td colspan="5">Источники появятся после первых сессий.</td></tr>'}</tbody></table></div></section>`;
  }


  function onClick(event) {
    if (event.target.closest("[data-analytics-detail-close]")) { closeDetail(); return; }
    if (event.target.closest("[data-analytics-detail-open]")) {
      state.detailOpen = true;
      state.dishDetailOpen = false;
      state.timelineSort = { key: "sortValue", direction: "asc" };
      render();
      requestAnimationFrame(() => state.root?.querySelector(".analytics-detail-close")?.focus());
      return;
    }
    if (event.target.closest("[data-dish-detail-open]")) {
      state.detailOpen = false;
      state.dishDetailOpen = true;
      state.eventsDetailOpen = false;
      state.dishSort = { key: "default", direction: "asc" };
      render();
      requestAnimationFrame(() => state.root?.querySelector(".analytics-detail-close")?.focus());
      return;
    }
    if (event.target.closest("[data-events-detail-open]")) {
      state.detailOpen = false;
      state.dishDetailOpen = false;
      state.eventsDetailOpen = true;
      render();
      requestAnimationFrame(() => state.root?.querySelector(".analytics-detail-close")?.focus());
      return;
    }
    const sortKey = event.target.closest("[data-timeline-sort]")?.dataset.timelineSort;
    if (sortKey) {
      state.timelineSort = state.timelineSort.key === sortKey
        ? { key: sortKey, direction: state.timelineSort.direction === "asc" ? "desc" : "asc" }
        : { key: sortKey, direction: "desc" };
      render();
      return;
    }
    const dishSortKey = event.target.closest("[data-dish-sort]")?.dataset.dishSort;
    if (dishSortKey) {
      state.dishSort = state.dishSort.key === dishSortKey
        ? { key: dishSortKey, direction: state.dishSort.direction === "asc" ? "desc" : "asc" }
        : { key: dishSortKey, direction: "desc" };
      render();
      return;
    }
    const period = event.target.closest("[data-analytics-period]")?.dataset.analyticsPeriod;
    if (period) { state.range = period; state.timelineSort = { key: "sortValue", direction: "asc" }; state.dishSort = { key: "default", direction: "asc" }; load(); return; }
    const dish = event.target.closest("[data-dish-tab]")?.dataset.dishTab;
    if (dish) { state.dishTab = dish; state.dishSort = { key: "default", direction: "asc" }; render(); return; }
    if (event.target.closest("[data-analytics-retry]")) return load();
    if (event.target.closest("[data-analytics-export]")) return exportCsv();
    const source = event.target.closest("[data-filter-source]")?.dataset.filterSource;
    if (source) { state.sourceId = source; load(); }
  }

  function onChange(event) {
    if (event.target.matches("[data-analytics-source]")) { state.sourceId = event.target.value; load(); }
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && (state.detailOpen || state.dishDetailOpen || state.eventsDetailOpen)) closeDetail();
  }

  function closeDetail() {
    if (!state.detailOpen && !state.dishDetailOpen && !state.eventsDetailOpen) return;
    const wasDishDetail = state.dishDetailOpen;
    const wasEventsDetail = state.eventsDetailOpen;
    state.detailOpen = false;
    state.dishDetailOpen = false;
    state.eventsDetailOpen = false;
    document.body.classList.remove("analytics-modal-open");
    render();
    requestAnimationFrame(() => state.root?.querySelector(wasEventsDetail ? "[data-events-detail-open]" : wasDishDetail ? "[data-dish-detail-open]" : "[data-analytics-detail-open]")?.focus());
  }

  function exportCsv() {
    const data = state.data; if (!data) return;
    const rows = [["Период", data.period.label], ["Источник", data.sourceOptions?.find((item) => item.id === state.sourceId)?.name || "Все источники"], [], ["Показатель", "Значение", "Предыдущий период", "Изменение"]];
    [["Сессии меню", data.summary.sessions], ["Вовлечённые гости", data.summary.engagedRate], ["Открытия блюд", data.summary.dishOpens], ["Среднее время изучения", data.summary.averageStudyMs]].forEach(([label, item]) => rows.push([label, formatMetric(item.value, item.format), formatMetric(item.previous, item.format), item.change ?? ""]));
    rows.push([], ["Блюдо", "Открытия", "Доля сессий", "Среднее время", "Динамика"]);
    data.dishes.forEach((item) => rows.push([item.title, item.opens, item.sessionShare, item.averageViewMs || "", item.change ?? ""]));
    rows.push([], ["Источник", "Сессии", "Доля", "Вовлечённость", "Динамика"]);
    data.sources.forEach((item) => rows.push([item.name, item.sessions, item.share, item.engagement, item.change ?? ""]));
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = `tekemet-analytics-${data.period.start}-${data.period.end}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  function api(action, payload) { return window.TekemetAdminBridge?.api ? window.TekemetAdminBridge.api(action, payload) : Promise.reject(new Error("Admin API is not ready.")); }
  function withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error("Сервер аналитики не ответил за 20 секунд. Повторите запрос.")), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
  }
  function formatMetric(value, format) { if (value === null || value === undefined) return "Нет данных"; if (format === "percent") return `${value}%`; if (format === "duration") return duration(value); return number(value); }
  function duration(ms) { const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000)); return seconds < 60 ? `${seconds} сек` : `${Math.floor(seconds / 60)} мин ${seconds % 60 ? `${seconds % 60} сек` : ""}`.trim(); }
  function number(value) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(Number(value || 0)); }
  function changeBadge(value) { return value === null || value === undefined ? '<span class="change-badge is-neutral">Новый</span>' : `<span class="change-badge ${value > 0 ? "is-positive" : value < 0 ? "is-negative" : "is-neutral"}">${value > 0 ? "+" : ""}${value}%</span>`; }
  function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }

  window.TekemetAnalytics = { mount, reload: load, closeDetail };
})();
