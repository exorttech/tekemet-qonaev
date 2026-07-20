const DEFAULT_RESTAURANT_SLUG = "tekemet-qonaev";
const ADMIN_API_URL = getAdminApiUrl();
const sessionKeyPrefix = "tekemet-admin-session:";
const themeStorageKey = "tekemet_admin_theme";
const MAX_HOUR_VISITS = 50;

const state = {
  restaurant: { slug: DEFAULT_RESTAURANT_SLUG, name: "Tekemet Qonaev", city: "Qonaev", brand: "#2563eb" },
  categories: [],
  items: [],
  menuHero: null,
  sessionToken: sessionStorage.getItem(sessionKeyPrefix + getRestaurantSlug()) || "",
  activeView: "overview",
  loading: false,
  dirty: false,
  pendingConfirm: null,
  analyticsRange: "today",
  analyticsDrilldownDate: "",
  analytics: null,
  analyticsLoading: false,
  pendingActions: new Set(),
};

const el = {
  login: document.querySelector("[data-login-screen]"),
  app: document.querySelector("[data-app-shell]"),
  pinForm: document.querySelector("[data-pin-form]"),
  pinInput: document.querySelector("[data-pin-input]"),
  pinVisibility: document.querySelector("[data-pin-visibility]"),
  loginError: document.querySelector("[data-login-error]"),
  loginLabel: document.querySelector("[data-login-label]"),
  restaurantNames: document.querySelectorAll("[data-restaurant-name]"),
  restaurantInitials: document.querySelectorAll("[data-restaurant-initial]"),
  viewTitle: document.querySelector("[data-view-title]"),
  viewKicker: document.querySelector("[data-view-kicker]"),
  metrics: document.querySelector("[data-metrics]"),
  attentionList: document.querySelector("[data-attention-list]"),
  attentionCount: document.querySelector("[data-attention-count]"),
  overviewGrid: document.querySelector(".overview-grid"),
  dishGrid: document.querySelector("[data-dish-grid]"),
  categoryList: document.querySelector("[data-category-list]"),
  stopList: document.querySelector("[data-stop-list]"),
  photoGrid: document.querySelector("[data-photo-grid]"),
  analyticsRoot: document.querySelector("[data-analytics-root]"),
  categoryFilter: document.querySelector("[data-category-filter]"),
  statusFilter: document.querySelector("[data-status-filter]"),
  menuSearch: document.querySelector("[data-menu-search]"),
  drawer: document.querySelector("[data-drawer]"),
  itemForm: document.querySelector("[data-item-form]"),
  drawerTitle: document.querySelector("[data-drawer-title]"),
  deleteItem: document.querySelector("[data-delete-item]"),
  editorImage: document.querySelector("[data-editor-image]"),
  editorFile: document.querySelector("[data-editor-file]"),
  editorFileLabel: document.querySelector("[data-editor-file-label]"),
  editorStatusBadge: document.querySelector("[data-editor-status-badge]"),
  dishPreview: document.querySelector("[data-dish-preview]"),
  uploadZone: document.querySelector("[data-upload-zone]"),
  photoInput: document.querySelector("[data-photo-input]"),
  confirmDialog: document.querySelector("[data-confirm-dialog]"),
  confirmTitle: document.querySelector("[data-confirm-title]"),
  confirmText: document.querySelector("[data-confirm-text]"),
  categoryDialog: document.querySelector("[data-category-dialog]"),
  categoryForm: document.querySelector("[data-category-form]"),
  categoryDialogTitle: document.querySelector("[data-category-dialog-title]"),
  categorySplitDialog: document.querySelector("[data-category-split-dialog]"),
  categorySplitForm: document.querySelector("[data-category-split-form]"),
  categorySplitItems: document.querySelector("[data-category-split-items]"),
  categoryDetailDialog: document.querySelector("[data-category-detail-dialog]"),
  categoryDetailRoot: document.querySelector("[data-category-detail-root]"),
  categoryDeleteDialog: document.querySelector("[data-category-delete-dialog]"),
  categoryDeleteForm: document.querySelector("[data-category-delete-form]"),
  categoryDeleteTitle: document.querySelector("[data-category-delete-title]"),
  categoryDeleteCopy: document.querySelector("[data-category-delete-copy]"),
  categoryDeleteTarget: document.querySelector("[data-category-delete-target]"),
  toasts: document.querySelector("[data-toast-stack]"),
};

const viewMeta = {
  overview: ["Обзор", "Рабочее пространство"],
  menu: ["Меню", "Управление блюдами"],
  categories: ["Категории", "Структура меню"],
  stoplist: ["Стоп-лист", "Быстрая доступность"],
  analytics: ["Аналитика", "Поведение гостей и эффективность меню"],
  qr: ["QR-коды", "Меню и Wi-Fi для гостей"],
  settings: ["Настройки", "Конфигурация Tekemet"],
  integrations: ["Интеграции", "Подключённые сервисы"],
};


const CATEGORY_LABELS_RU = {
  "hotel-breakfasts": "\u0417\u0430\u0432\u0442\u0440\u0430\u043a\u0438 \u043e\u0442\u0435\u043b\u044f",
  "hotel-breakfast": "\u0417\u0430\u0432\u0442\u0440\u0430\u043a\u0438 \u043e\u0442\u0435\u043b\u044f",
  breakfast: "\u0417\u0430\u0432\u0442\u0440\u0430\u043a\u0438",
  salads: "\u0421\u0430\u043b\u0430\u0442\u044b",
  appetizers: "\u0417\u0430\u043a\u0443\u0441\u043a\u0438",
  starters: "\u0417\u0430\u043a\u0443\u0441\u043a\u0438",
  mains: "\u041e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u0431\u043b\u044e\u0434\u0430",
  main: "\u041e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u0431\u043b\u044e\u0434\u0430",
  "main-courses": "\u041e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u0431\u043b\u044e\u0434\u0430",
  sides: "\u0413\u0430\u0440\u043d\u0438\u0440\u044b",
  drinks: "\u041d\u0430\u043f\u0438\u0442\u043a\u0438",
  bakery: "\u0412\u044b\u043f\u0435\u0447\u043a\u0430",
  desserts: "\u0414\u0435\u0441\u0435\u0440\u0442\u044b",
  dishware: "\u041f\u043e\u0441\u0443\u0434\u0430",
  hero: "\u0413\u043b\u0430\u0432\u043d\u044b\u0439 \u0431\u043b\u043e\u043a",
  kids: "\u0414\u0435\u0442\u0441\u043a\u043e\u0435 \u043c\u0435\u043d\u044e",
  sharing: "\u0414\u043b\u044f \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
  soups: "\u0421\u0443\u043f\u044b",
};

function isHotelBreakfastSectionKey(value) {
  const key = normalizeCategoryLookupKey(value);
  return key === "hotel-breakfasts" || key === "hotel-breakfast";
}

function isHotelBreakfastItem(item) {
  return isHotelBreakfastSectionKey(item?.category_id || item?.section_key || item?.sectionKey || "");
}

function shouldShowItemPrice(item) {
  return !isHotelBreakfastItem(item) && Number(item?.price || 0) > 0;
}

init();

function getRestaurantSlug() {
  const querySlug = new URLSearchParams(window.location.search).get("restaurant");
  if (querySlug) return sanitizeSlug(querySlug);

  const adminMatch = window.location.pathname.match(/admin-([a-z0-9-]+)/i);
  if (adminMatch) return sanitizeSlug(adminMatch[1]);

  return DEFAULT_RESTAURANT_SLUG;
}


function getSpiceLevelLabel(value) {
  return {
    mild: "Легкая острота",
    medium: "Средняя острота",
    hot: "Острая",
  }[String(value || "").trim()] || "";
}





function sanitizeSlug(value) {
  return String(value || DEFAULT_RESTAURANT_SLUG).toLowerCase().replace(/[^a-z0-9-]/g, "") || DEFAULT_RESTAURANT_SLUG;
}

function getAdminApiUrl() {
  const configured = window.EXORT_ADMIN_API_CONFIG?.endpoint || window.TEKEMET_ADMIN_API || "";
  if (configured) return configured;
  return isLocalAdminHost() ? "" : "/.netlify/functions/tekemet-admin";
}

function isLocalAdminHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function getAdminApiConfigError() {
  const explicitError = window.EXORT_ADMIN_API_CONFIG?.configError || "";
  if (explicitError) return explicitError;
  if (ADMIN_API_URL) return "";
  if (isLocalAdminHost()) {
    return "Для локального входа через Live Server укажите полный URL Netlify Function в window.EXORT_ADMIN_API_URL или localStorage key exort.admin.apiUrl.";
  }
  return "Адрес сервиса Exort Admin не настроен.";
}

function getPublicMenuUrl() {
  return new URL("/menu", window.location.origin).toString();
}


async function init() {
  ensureAdminEnhancements();
  applyTheme(localStorage.getItem(themeStorageKey) || document.documentElement.dataset.theme || "light");
  bindEvents();
  syncRestaurantIdentity();
  showLoginScreen();
  const requestedView = getRequestedViewFromHash();

  if (state.sessionToken) {
    try {
      await loadAdminData();
      openApp(false);
      navigate(requestedView || "overview");
      return;
    } catch (error) {
      console.warn("[exort-admin] Stored session is invalid or expired.", error);
      sessionStorage.removeItem(sessionKeyPrefix + getRestaurantSlug());
      state.sessionToken = "";
      clearAdminHash("Unauthorized admin hash was cleared because there is no valid session.");
      showLoginError(error.message || "Сессия устарела. Введите PIN еще раз.");
      showLoginScreen();
      return;
    }
  }

  if (requestedView) {
    clearAdminHash("Login is required before opening admin views.");
  }
}



async function handleLogin(event) {
  event.preventDefault();
  el.loginError.textContent = "";
  el.loginLabel.textContent = "Проверяем...";

  try {
    const result = await adminApi("login", { pin: el.pinInput.value.trim() });
    state.sessionToken = result.sessionToken;
    sessionStorage.setItem(sessionKeyPrefix + getRestaurantSlug(), state.sessionToken);
    applyAdminData(result);
    openApp(false);
    navigate("overview");
    toast("Доступ открыт", "success");
  } catch (error) {
    showLoginError(error.message || "Не удалось проверить PIN.");
  } finally {
    el.loginLabel.textContent = "Войти";
  }
}


async function loadAdminData() {
  const result = await adminApi("getData");
  applyAdminData(result);
}

function applyAdminData(result) {
  if (result.restaurant) {
    state.restaurant = { ...state.restaurant, ...normalizeRestaurant(result.restaurant) };
  }
  state.categories = (result.categories || []).map(normalizeCategory).sort((a, b) => a.sort - b.sort);
  state.items = (result.items || [])
    .filter((item) => !isMenuHeroItem(item))
    .map(normalizeItem)
    .sort((a, b) => a.sort_order - b.sort_order);
  state.menuHero = result.menuHero ? normalizeItem(result.menuHero) : null;
  syncRestaurantIdentity();
  renderAll();
}

function normalizeRestaurant(restaurant) {
  return {
    id: restaurant.id,
    slug: restaurant.slug || getRestaurantSlug(),
    name: restaurant.name || "Tekemet Qonaev",
    city: restaurant.city || "Almaty",
    brand: restaurant.brand_color || restaurant.brand || "#2563eb",
    hero_image_url: restaurant.hero_image_url || restaurant.menu_cover_url || "",
  };
}

function normalizeCategory(category) {
  const displayName = getCategoryDisplayName(category);
  return {
    id: category.id,
    section_key: category.section_key || category.id,
    name_ru: category.name_ru || category.title_ru || displayName,
    name_kz: category.name_kz || category.title_kk || "",
    name_en: category.name_en || category.title_en || "",
    name: displayName,
    active: category.is_active !== false,
    sort: Number(category.sort_order || 0),
  };
}

function normalizeItem(item) {
  const displayName = getItemDisplayName(item);
  const displayDescription = getItemDisplayDescription(item);
  return {
    id: item.id,
    restaurant_id: item.restaurant_id,
    category_id: item.category_id,
    content_key: item.content_key || item.id,
    name_ru: item.name_ru || item.title_ru || "",
    name_kz: item.name_kz || item.title_kk || "",
    name_en: item.name_en || item.title_en || "",
    description_ru: item.description_ru || "",
    description_kz: item.description_kz || item.description_kk || "",
    description_en: item.description_en || "",
    name: displayName,
    description: displayDescription,
    price: Number(item.price || 0),
    currency: item.currency || "KZT",
    image: item.image_url || "",
    image_path: item.image_path || "",
    is_active: item.is_active !== false,
    is_stoplisted: item.is_stoplisted === true || item.in_stock === false,
    inactive_until: item.inactive_until || "",
    sort_order: Number(item.sort_order || 0),
    version: Number(item.version || 1),
  };
}

function openApp(render = true) {
  el.login.hidden = true;
  el.app.hidden = false;
  syncRestaurantIdentity();
  if (render) renderAll();
}

function showLoginScreen() {
  el.app.hidden = true;
  el.login.hidden = false;
}

function logout() {
  const run = () => {
    sessionStorage.removeItem(sessionKeyPrefix + getRestaurantSlug());
    state.sessionToken = "";
    clearAdminHash();
    showLoginScreen();
    el.pinInput.value = "";
  };
  state.dirty ? confirmAction("Выйти без сохранения?", "Несохраненные изменения будут потеряны.", run) : run();
}

function syncRestaurantIdentity() {
  const initial = state.restaurant.name?.charAt(0)?.toUpperCase() || "E";
  el.restaurantNames.forEach((node) => { node.textContent = state.restaurant.name; });
  el.restaurantInitials.forEach((node) => { node.textContent = initial; });
  document.documentElement.style.setProperty("--brand", state.restaurant.brand || "#2563eb");
  document.querySelectorAll("[data-menu-link]").forEach((link) => {
    link.href = getPublicMenuUrl();
  });
}

function navigate(view) {
  if (!viewMeta[view]) return;
  state.activeView = view;
  document.querySelectorAll("[data-view]").forEach((node) => node.classList.toggle("is-active", node.dataset.view === view));
  document.querySelectorAll("[data-nav]").forEach((node) => {
    const isActive = node.dataset.nav === view;
    node.classList.toggle("is-active", isActive);
    if (isActive) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  });
  el.viewTitle.textContent = viewMeta[view][0];
  el.viewKicker.textContent = viewMeta[view][1];
  history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "analytics") loadAnalytics();
  if (view === "qr") renderQrWorkspace();
}

function renderQrWorkspace() {
  const root = document.querySelector("[data-qr-root]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";
  const menuUrl = getPublicMenuUrl();
  root.innerHTML = `
    <header class="qr-page-header"><div><p class="kicker">Гостевые ссылки</p><h2>QR-коды Tekemet</h2><p>Создавайте готовые к печати коды меню и Wi-Fi. Данные Wi-Fi остаются только в браузере.</p></div></header>
    <div class="qr-layout">
      <article class="qr-create-card"><div><p class="kicker">Публичное меню</p><h3>QR меню</h3></div><div class="qr-static-preview" data-menu-qr></div><div class="qr-source-url"><input readonly value="${escapeHtml(menuUrl)}"><button type="button" data-copy-menu-url>Копировать</button></div><button class="secondary-button compact" type="button" data-download-menu-qr>Скачать PNG</button></article>
      <form class="qr-create-card" data-wifi-form><div><p class="kicker">Wi-Fi для гостей</p><h3>QR подключения</h3></div><label>Название сети<input name="ssid" maxlength="64" required></label><label>Защита<select name="security"><option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option><option value="nopass">Без пароля</option></select></label><label data-wifi-password>Пароль<input name="password" type="password" maxlength="63"></label><label class="wifi-hidden-line"><input name="hidden" type="checkbox"> Скрытая сеть</label><button class="primary-button" type="submit">Создать Wi-Fi QR</button><div class="qr-static-preview" data-wifi-qr></div><button class="secondary-button compact" type="button" data-download-wifi-qr hidden>Скачать PNG</button></form>
    </div>`;
  const menuNode = root.querySelector("[data-menu-qr]");
  if (window.QRCode) new window.QRCode(menuNode, { text: menuUrl, width: 196, height: 196, correctLevel: window.QRCode.CorrectLevel.H });
  root.addEventListener("change", (event) => {
    if (event.target.name !== "security") return;
    const field = root.querySelector("[data-wifi-password]");
    field.hidden = event.target.value === "nopass";
    field.querySelector("input").disabled = field.hidden;
  });
  root.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-wifi-form]")) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const escapeWifi = (value) => String(value || "").replace(/([\\;,:\"])/g, "\\$1");
    const payload = `WIFI:T:${data.security};S:${escapeWifi(data.ssid)};${data.security === "nopass" ? "" : `P:${escapeWifi(data.password)};`}H:${data.hidden === "on" ? "true" : "false"};;`;
    const node = root.querySelector("[data-wifi-qr]");
    node.innerHTML = "";
    if (window.QRCode) new window.QRCode(node, { text: payload, width: 196, height: 196, correctLevel: window.QRCode.CorrectLevel.H });
    root.querySelector("[data-download-wifi-qr]").hidden = false;
  });
  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-copy-menu-url]")) { await navigator.clipboard.writeText(menuUrl); toast("Ссылка скопирована", "success"); }
    const selector = event.target.closest("[data-download-menu-qr]") ? "[data-menu-qr]" : event.target.closest("[data-download-wifi-qr]") ? "[data-wifi-qr]" : "";
    if (!selector) return;
    const preview = root.querySelector(selector); const canvas = preview.querySelector("canvas"); const image = preview.querySelector("img"); const url = canvas?.toDataURL("image/png") || image?.src;
    if (url) { const link = document.createElement("a"); link.href = url; link.download = selector.includes("wifi") ? "tekemet-wifi.png" : "tekemet-menu.png"; link.click(); }
  });
}

function getRequestedViewFromHash() {
  const rawHash = window.location.hash.replace(/^#/, "");
  return viewMeta[rawHash] ? rawHash : "";
}

function clearAdminHash(reason = "") {
  if (!window.location.hash) return;
  if (reason) {
    console.warn("[exort-admin]", reason, window.location.hash);
  }
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function renderAll() {
  syncRestaurantIdentity();
  renderMetrics();
  renderMenuHeroPanel();
  renderAttention();
  renderFilters();
  renderDishes();
  renderCategories();
  renderStopList();
  renderAnalytics();
}



function getAttentionStatus(count, type) {
  if (count === 0) return { className: "success", label: "Успешно", description: type === "neutral" ? "Все в норме" : "Проблем не найдено" };
  if (type === "neutral") {
    return count <= 5
      ? { className: "neutral", label: "Нейтрально", description: "Не ошибка, но стоит контролировать" }
      : { className: "neutral-strong", label: "Много позиций", description: "Стоит проверить состояние меню" };
  }
  return count <= 5
    ? { className: "warning", label: "Требует внимания", description: "Есть несколько незаполненных позиций" }
    : { className: "critical", label: "Критично", description: "Требуется системное заполнение" };
}

function renderFilters() {
  const selected = el.categoryFilter.value || "all";
  el.categoryFilter.innerHTML = `<option value="all">Все категории</option>${state.categories.map((category) => `<option value="${category.id}">${escapeHtml(getCategoryDisplayName(category))}</option>`).join("")}`;
  el.categoryFilter.value = [...el.categoryFilter.options].some((option) => option.value === selected) ? selected : "all";
  el.itemForm.elements.category_id.innerHTML = `<option value="">Выберите раздел</option>${state.categories.map((category) => `<option value="${category.id}">${escapeHtml(getCategoryDisplayName(category))}</option>`).join("")}`;
}

function filteredItems() {
  const query = el.menuSearch.value.trim().toLowerCase();
  const category = el.categoryFilter.value || "all";
  const status = el.statusFilter.value || "all";
  const photo = el.photoFilter?.value || "all";
  const translation = el.translationFilter?.value || "all";

  return state.items.filter((item) => {
    const matchesQuery = !query || [getItemDisplayName(item), getItemDisplayDescription(item), item.content_key].join(" ").toLowerCase().includes(query);
    const matchesCategory = category === "all" || item.category_id === category;
    const matchesStatus =
      status === "all" ||
      (status === "active" && item.is_active && !item.is_stoplisted && !isTemporarilyUnavailable(item)) ||
      (status === "stop" && (item.is_stoplisted || isTemporarilyUnavailable(item))) ||
      (status === "inactive" && !item.is_active) ||
      (status === "temporary" && isTemporarilyUnavailable(item));
    const matchesPhoto = photo === "all" || (photo === "with" && item.image) || (photo === "missing" && !item.image);
    const matchesTranslation = translation === "all" || (translation === "complete" && !hasMissingTranslation(item)) || (translation === "missing" && hasMissingTranslation(item));
    return matchesQuery && matchesCategory && matchesStatus && matchesPhoto && matchesTranslation;
  });
}


function renderCategories() {
  el.categoryList.innerHTML = [...state.categories].sort((a, b) => a.sort - b.sort).map((category) => {
    const count = state.items.filter((item) => item.category_id === category.id).length;
    return `<article class="category-row category-row--clickable" role="button" tabindex="0" data-open-category="${category.id}">
      <span class="drag-handle">⋮⋮</span>
      <div><strong>${escapeHtml(getCategoryDisplayName(category))}</strong><small>${count} блюд</small></div>
      <button class="stop-switch ${category.active ? "is-on" : ""}" type="button" data-toggle-category="${category.id}" data-stop-row-click aria-label="Активность категории"></button>
      <div class="row-actions">
        <button type="button" data-move-category="${category.id}" data-direction="-1" data-stop-row-click>↑</button>
        <button type="button" data-move-category="${category.id}" data-direction="1" data-stop-row-click>↓</button>
        <button type="button" data-edit-category="${category.id}" data-stop-row-click>Изменить</button>
        <button type="button" data-split-category="${category.id}" data-stop-row-click>Разделить</button>
        <button type="button" data-delete-category="${category.id}" data-stop-row-click>Удалить</button>
      </div>
    </article>`;
  }).join("");
}

function renderStopList() {
  const stoppedItems = state.items.filter((item) => item.is_stoplisted || isTemporarilyUnavailable(item));
  el.stopList.innerHTML = stoppedItems.length ? stoppedItems.map((item) => {
    const meta = [categoryName(item.category_id), shouldShowItemPrice(item) ? formatPrice(item.price, item.currency) : ""].filter(Boolean).join(" · ");
    return `<article class="stop-row">
      <div class="dish-placeholder">${escapeHtml((getItemDisplayName(item).charAt(0) || "?"))}</div>
      <div><strong>${escapeHtml(getItemDisplayName(item))}</strong><small>${escapeHtml(meta)}</small></div>
      <span class="stop-state">На стопе</span>
      <button class="large-switch" type="button" data-toggle-stock="${item.id}" aria-label="Вернуть блюдо в продажу"></button>
    </article>`;
  }).join("") : `<div class="empty-state stop-empty-state">
    <h2>В стоп-листе пока нет блюд</h2>
    <p>Добавьте блюдо в стоп-лист из раздела меню.</p>
    <button class="primary-button compact" type="button" data-action="open-stop-filter">Добавить в стоп-лист</button>
  </div>`;
}

function renderAnalytics() {
  if (!el.analyticsRoot) return;
  const analytics = state.analytics;
  const range = state.analyticsRange || "today";
  const rangeLabel = getAnalyticsRangeLabel(range);
  const menuVisits = analytics ? getAnalyticsRangeValue(analytics.menuVisits, range) : 0;
  const uniqueGuests = analytics ? getAnalyticsRangeValue(analytics.uniqueGuests, range) : 0;
  const dishOpens = analytics ? getAnalyticsRangeValue(analytics.dishOpens, range) : 0;

  el.analyticsRoot.innerHTML = `
    <div class="analytics-toolbar">
      <div>
        <p class="kicker">Реальные данные</p>
        <h2>Статистика меню</h2>
      </div>
      <div class="analytics-range" role="group" aria-label="Период аналитики">
        ${[
          ["today", "Сегодня"],
          ["7d", "7 дней"],
          ["30d", "30 дней"],
          ["all", "Всё время"],
        ].map(([value, label]) => `<button class="${range === value ? "is-active" : ""}" type="button" data-analytics-range="${value}">${label}</button>`).join("")}
      </div>
    </div>
    ${state.analyticsLoading ? `<div class="analytics-loading">Загружаем аналитику...</div>` : ""}
    <div class="analytics-summary-grid">
      ${renderAnalyticsMetric("Посещения меню", menuVisits, rangeLabel, "menu_open")}
      ${renderAnalyticsMetric("Сессии", uniqueGuests, rangeLabel, "session_id")}
      ${renderAnalyticsMetric("Открытия блюд", dishOpens, rangeLabel, "dish_open")}
      ${renderAnalyticsMetric("Среднее время просмотра", analytics?.averageViewTime || null, "", "view_time")}
    </div>

    <div class="analytics-insights-grid">
      ${renderPopularDishes(analytics?.popularDishes || [])}
      ${renderAnalyticsBreakdown("Языки", "Языки гостей", analytics?.languages || [], "language", "Пока нет данных")}
      ${renderAnalyticsBreakdown("Устройства", "Устройства гостей", analytics?.devices || [], "device", "Пока нет данных")}
    </div>

    <div class="analytics-main-grid">
      ${renderAnalyticsActivity(analytics, range)}
    </div>

    <div class="analytics-secondary-grid">
      ${renderRecentEvents(analytics?.recentEvents || [])}
    </div>
  `;
}

async function loadAnalytics(force = false) {
  if (!el.analyticsRoot || state.analyticsLoading) return;
  if (state.analytics && !force) {
    renderAnalytics();
    return;
  }

  state.analyticsLoading = true;
  renderAnalytics();
  try {
    const result = await adminApi("getAnalytics", { range: state.analyticsRange });
    state.analytics = result.analytics || null;
  } catch (error) {
    console.warn("[exort-admin] analytics load failed", error);
    toast(toFriendlyError(error.message) || "Не удалось загрузить аналитику", "danger");
    state.analytics = null;
  } finally {
    state.analyticsLoading = false;
    renderAnalytics();
  }
}

function getAnalyticsRangeValue(group = {}, range = "7d") {
  if (range === "today") return group.today || 0;
  if (range === "30d") return group.last30Days || 0;
  if (range === "year") return group.year || 0;
  if (range === "all") return group.allTime || group.total || group.year || group.last30Days || 0;
  return group.last7Days || 0;
}


function renderAnalyticsMetric(label, value, hint, code) {
  const empty = value === null || value === undefined;
  return `<article class="analytics-metric-card" data-analytics-code="${code}">
    <span>${label}</span>
    <strong>${empty ? "Нет данных" : formatAnalyticsNumber(value)}</strong>
    ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
  </article>`;
}

function renderPopularDishes(items) {
  const maxOpens = Math.max(...items.map((item) => item.opens || 0), 0);
  return `<article class="analytics-card popular-dishes-card">
    <div class="analytics-card-head"><div><p class="kicker">Интерес гостей</p><h2>Популярные блюда</h2></div></div>
    ${items.length ? `<div class="analytics-ranked-list">
      ${items.map((item, index) => `<div class="analytics-ranked-row">
        <span>${index + 1}</span>
        <strong>${escapeHtml(getAnalyticsDishDisplayName(item))}</strong>
        <em>${formatAnalyticsNumber(item.opens || 0)} ${pluralizeOpen(item.opens || 0)}</em>
        <i style="--value:${getChartFillPercent(item.opens || 0, maxOpens)}%"></i>
      </div>`).join("")}
    </div>` : `<div class="analytics-empty"><strong>События появятся после первых открытий карточек</strong><p>Здесь будет рейтинг блюд по количеству просмотров.</p></div>`}
  </article>`;
}

function renderAnalyticsActivity(analytics, range) {
  const activeRange = range || "today";
  const drilldown = state.analyticsDrilldownDate && activeRange !== "today"
    ? analytics?.dayDetails?.[state.analyticsDrilldownDate]
    : null;

  if (drilldown) return renderDayDetail(drilldown, activeRange);
  if (activeRange === "today") return renderVisitsByHour(analytics?.visitsByHour || []);
  if (activeRange === "30d") return renderVisitsByWeek(analytics?.visitsByWeek || []);
  if (activeRange === "year") {
    return renderVisitsByMonth(analytics?.visitsByMonth || [], {
      totalVisits: getAnalyticsRangeValue(analytics?.menuVisits, "year"),
      totalUniqueGuests: getAnalyticsRangeValue(analytics?.uniqueGuests, "year"),
      totalDishOpens: getAnalyticsRangeValue(analytics?.dishOpens, "year"),
      busiestMonth: analytics?.allTimeSummary?.busiestMonth || "Нет данных",
    }, activeRange);
  }
  if (activeRange === "all") return renderVisitsByMonth(analytics?.visitsByMonth || [], analytics?.allTimeSummary || {}, activeRange);
  return renderVisitsByDay(analytics?.visitsByDay || []);
}

function renderDayDetail(detail, range) {
  return `<article class="analytics-card analytics-card--wide">
    <div class="analytics-card-head">
      <div><p class="kicker">Детализация</p><h2>Статистика за ${escapeHtml(detail.label || detail.date || "день")}</h2></div>
      <button class="secondary-button compact analytics-back-button" type="button" data-analytics-back="${range}">Назад к ${range === "30d" ? "месяцу" : "неделе"}</button>
    </div>
    ${renderHourChart(detail.hours || [])}
  </article>`;
}

function renderHourChart(hours) {
  const normalized = normalizeWorkingHours(hours);
  const total = normalized.reduce((sum, entry) => sum + Number(entry.visits || 0), 0);
  const max = Math.max(...normalized.map((entry) => entry.visits), 0);
  const peak = normalized.reduce((best, entry) => (entry.visits > (best?.visits || -1) ? entry : best), null);
  const scale = [50, 40, 30, 20, 10, 0];

  return `<div class="analytics-activity-shell">
    <div class="analytics-activity-summary">
      <span class="analytics-activity-note">\u0420\u0430\u0431\u043e\u0447\u0438\u0439 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d: 07:00 - 24:00</span>
      <strong class="analytics-activity-peak">${max ? `\u041f\u0438\u043a: ${escapeHtml(formatHourRange(peak.hour))} - ${formatVisitCount(peak.visits)}` : "\u041f\u0438\u043a: \u043d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445"}</strong>
    </div>
    <div class="analytics-activity-stage">
      <div class="analytics-activity-scale" aria-hidden="true">
        ${scale.map((value) => `<span>${value}</span>`).join("")}
      </div>
      <div class="analytics-activity-chart">
        <div class="analytics-activity-plot">
          <div class="analytics-activity-grid" aria-hidden="true">
            ${scale.map(() => "<span></span>").join("")}
          </div>
          <div class="analytics-activity-bars" style="grid-template-columns:repeat(${normalized.length},minmax(0,1fr));" aria-label="\u041f\u043e\u0441\u0435\u0449\u0435\u043d\u0438\u044f \u043f\u043e \u0447\u0430\u0441\u0430\u043c">
            ${normalized.map((entry, index) => {
              const visits = Number(entry.visits || 0);
              const percent = getWorkingHourShare(visits, total);
              const isPeak = visits === max && max > 0;
              const height = getWorkingHourBarHeight(visits);
              return `<div class="analytics-activity-column">
                <button
                class="analytics-activity-bar ${isPeak ? "is-peak" : visits > 0 ? "is-active" : ""}"
                type="button"
                style="--bar-height:${height}%;"
                aria-label="${escapeHtml(formatHourRange(entry.hour))}. ${formatVisitCount(visits)}. ${percent}% \u043e\u0442 \u043e\u0431\u0449\u0435\u0433\u043e \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u0430 \u043f\u043e\u0441\u0435\u0449\u0435\u043d\u0438\u0439 \u0437\u0430 \u0434\u0435\u043d\u044c.">
                <span class="analytics-activity-count" aria-hidden="true">${formatAnalyticsNumber(visits)}</span>
                <span class="analytics-activity-bar-rail" aria-hidden="true">
                  <span class="analytics-activity-bar-fill"></span>
                </span>
                <span class="analytics-activity-tooltip" role="presentation">
                  <strong>${escapeHtml(formatHourRange(entry.hour))}</strong>
                  <em>${formatVisitCount(visits)}</em>
                  <b>${percent}% \u043e\u0442 \u0442\u0440\u0430\u0444\u0438\u043a\u0430 \u0434\u043d\u044f</b>
                </span>
                </button>
                <span class="analytics-activity-hour" aria-hidden="true">${formatHourStart(entry.hour)}</span>
              </div>`;
            }).join("")}
          </div>
        </div>
      </div>
    </div>
    ${max ? "" : `<p class="analytics-period-note">\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043f\u043e\u0441\u0435\u0449\u0435\u043d\u0438\u0439 \u0437\u0430 \u0440\u0430\u0431\u043e\u0447\u0438\u0435 \u0447\u0430\u0441\u044b.</p>`}
  </div>`;
}

function renderVisitsByHour(hours) {
  return `<article class="analytics-card analytics-card--wide analytics-card--activity">
    <div class="analytics-card-head analytics-card-head--activity">
      <div>
        <p class="kicker">\u0421\u0435\u0433\u043e\u0434\u043d\u044f</p>
        <h2>\u041f\u043e\u0441\u0435\u0449\u0435\u043d\u0438\u044f \u043f\u043e \u0432\u0440\u0435\u043c\u0435\u043d\u0438</h2>
        <p class="analytics-card-description">\u0420\u0430\u0441\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u0438\u0435 \u043f\u043e\u0441\u0435\u0449\u0435\u043d\u0438\u0439 \u043f\u043e \u0440\u0430\u0431\u043e\u0447\u0438\u043c \u0447\u0430\u0441\u0430\u043c \u0440\u0435\u0441\u0442\u043e\u0440\u0430\u043d\u0430. \u041f\u0438\u043a \u0438 \u0441\u043f\u0430\u0434 \u0432\u0438\u0434\u043d\u044b \u0441\u0440\u0430\u0437\u0443, \u0431\u0435\u0437 \u043f\u0435\u0440\u0435\u0433\u0440\u0443\u0436\u0435\u043d\u043d\u043e\u0439 \u043d\u043e\u0447\u043d\u043e\u0439 \u0437\u043e\u043d\u044b.</p>
      </div>
    </div>
    ${renderHourChart(hours)}
  </article>`;
}

function renderVisitsByDay(days) {
  const normalized = normalizeLastDays(days, 7);
  const max = Math.max(...normalized.map((entry) => entry.visits), 0);
  return `<article class="analytics-card analytics-card--wide">
    <div class="analytics-card-head"><div><p class="kicker">Неделя</p><h2>Посещения по дням недели</h2></div></div>
    <div class="analytics-chart-shell analytics-chart-shell--days">
      <div class="analytics-day-bars" style="--columns:${Math.max(1, normalized.length)}">
        ${normalized.map((entry) => `<button class="analytics-day-bar" type="button" data-analytics-day="${escapeHtml(entry.date)}" title="${escapeHtml(formatDateTooltip(entry))}&#10;${formatVisitCount(entry.visits)}" aria-label="${escapeHtml(formatDateTooltip(entry))}. ${formatVisitCount(entry.visits)}" style="--height:${getChartFillPercent(entry.visits, max)}%">
          <span></span><strong>${formatAnalyticsNumber(entry.visits)}</strong><em>${escapeHtml(formatShortDate(entry.date))}</em>
        </button>`).join("")}
      </div>
      ${max ? "" : `<p class="analytics-period-note">Пока нет посещений за этот период.</p>`}
    </div>
  </article>`;
}

function renderMenuHeroPanel() {
  const panel = document.querySelector("[data-menu-hero-panel]");
  if (!panel) return;

  const image = state.menuHero?.image || "";
  panel.innerHTML = `
    <div class="menu-hero-admin__copy">
      <p class="kicker">Обзор</p>
      <h2>Главное фото меню</h2>
      <p>Это изображение показывается в верхнем блоке клиентского меню Tekemet.</p>
    </div>
    <div class="menu-hero-admin__preview ${image ? "has-image" : ""}">
      ${image ? `<img src="${escapeHtml(image)}" alt="Главное фото меню" />` : `<div><span>Фото меню</span><small>Изображение пока не загружено</small></div>`}
    </div>
    <div class="menu-hero-admin__actions">
      <label class="secondary-button compact">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" data-menu-hero-file />
        <span>${image ? "Заменить фото" : "Загрузить фото"}</span>
      </label>
      <small>Используется существующая запись Menu hero в Supabase.</small>
    </div>
  `;
}

async function handleMenuHeroFile(file) {
  if (!file) return;
  const label = document.querySelector("[data-menu-hero-file]")?.closest("label");
  await runOnce("menu-hero-photo", label, "Загружаем...", async () => {
    try {
      const imageData = await prepareImage(file);
      const result = await adminApi("uploadMenuHeroPhoto", { imageData });
      state.menuHero = result.menuHero ? normalizeItem(result.menuHero) : state.menuHero;
      renderMenuHeroPanel();
      toast("Главное фото меню обновлено", "success");
    } catch (error) {
      toast(toFriendlyError(error.message) || "Не удалось заменить главное фото меню", "danger");
    }
  });
}
function renderVisitsByWeek(weeks) {
  const normalizedWeeks = normalizeWeeks(weeks);
  const allDays = normalizedWeeks.flatMap((week) => week.days || []);
  const max = Math.max(...allDays.map((entry) => entry.visits), 0);
  return `<article class="analytics-card analytics-card--wide">
    <div class="analytics-card-head"><div><p class="kicker">Месяц</p><h2>Посещения по дням месяца</h2></div></div>
    <div class="analytics-weeks">
      ${normalizedWeeks.map((week) => `<section class="analytics-week">
        <h3>${escapeHtml(week.weekLabel)}</h3>
        <div class="analytics-week-days">
          ${(week.days || []).map((entry) => `<button class="analytics-week-day" type="button" data-analytics-day="${escapeHtml(entry.date)}" title="${escapeHtml(week.weekLabel)} / ${escapeHtml(formatDateTooltip(entry))}&#10;${formatVisitCount(entry.visits)}" aria-label="${escapeHtml(week.weekLabel)}. ${escapeHtml(formatDateTooltip(entry))}. ${formatVisitCount(entry.visits)}">
            <i style="--value:${getChartFillPercent(entry.visits, max)}%"></i>
            <span>${escapeHtml(formatShortDate(entry.date))}</span>
            <strong>${formatAnalyticsNumber(entry.visits)}</strong>
          </button>`).join("")}
        </div>
      </section>`).join("")}
    </div>
    ${max ? "" : `<p class="analytics-period-note">Пока нет посещений за этот период.</p>`}
  </article>`;
}

function renderVisitsByMonth(months, summary, range = "year") {
  const normalized = normalizeMonths(months);
  const max = Math.max(...normalized.map((entry) => entry.visits), 0);
  const title = range === "year" ? "Посещения за год" : "Посещения по месяцам";
  const kicker = range === "year" ? "Год" : "Все время";
  return `<article class="analytics-card analytics-card--wide">
    <div class="analytics-card-head"><div><p class="kicker">${kicker}</p><h2>${title}</h2></div></div>
    <div class="analytics-month-layout">
      <div class="analytics-chart-shell analytics-chart-shell--months">
        <div class="analytics-day-bars analytics-day-bars--months" style="--columns:${Math.max(1, normalized.length)}">
          ${normalized.map((entry) => `<div class="analytics-day-bar analytics-day-bar--static" title="${escapeHtml(entry.fullLabel || entry.label)}&#10;${formatVisitCount(entry.visits)}" style="--height:${getChartFillPercent(entry.visits, max)}%">
            <span></span><strong>${formatAnalyticsNumber(entry.visits)}</strong><em>${escapeHtml(entry.label)}</em>
          </div>`).join("")}
        </div>
        ${max ? "" : `<p class="analytics-period-note">Пока нет посещений за этот период.</p>`}
      </div>
      <div class="analytics-all-summary">
        <div><span>Всего посещений</span><strong>${formatAnalyticsNumber(summary.totalVisits || 0)}</strong></div>
        <div><span>Сессии</span><strong>${formatAnalyticsNumber(summary.totalUniqueGuests || 0)}</strong></div>
        <div><span>Открытия блюд</span><strong>${formatAnalyticsNumber(summary.totalDishOpens || 0)}</strong></div>
        <div><span>Самый активный месяц</span><strong>${escapeHtml(summary.busiestMonth || "Нет данных")}</strong></div>
      </div>
    </div>
  </article>`;
}

function renderAnalyticsBreakdown(kicker, title, rows, key, emptyText) {
  if (key === "device") return renderDeviceBreakdown(rows);

  return `<article class="analytics-card guest-languages-card">
    <div class="analytics-card-head"><div><p class="kicker">${kicker}</p><h2>${title}</h2></div></div>
    ${rows.length ? `<div class="analytics-breakdown-list">
      ${rows.map((row) => `<div class="analytics-breakdown-row">
        <span>${escapeHtml(String(row[key] || "").toUpperCase())}</span>
        <div class="analytics-breakdown-value">
          <strong>${row.percent || 0}%</strong>
          <em>${formatAnalyticsNumber(row.count || 0)}</em>
        </div>
        <i style="--value:${row.percent || 0}%"></i>
      </div>`).join("")}
    </div>` : `<p class="analytics-muted">${emptyText}</p>`}
  </article>`;
}

function renderDeviceBreakdown(rows) {
  const byDevice = Object.fromEntries((rows || []).map((row) => [String(row.device || "").toLowerCase(), row]));
  const devices = [
    ["desktop", "Desktop"],
    ["mobile", "Mobile"],
    ["tablet", "Tablet"],
  ].map(([key, label]) => ({
    device: label,
    count: byDevice[key]?.count || 0,
    percent: byDevice[key]?.percent || 0,
  }));

  return `<article class="analytics-card analytics-card--compact guest-devices-card">
    <div class="analytics-card-head"><div><p class="kicker">Устройства</p><h2>Устройства гостей</h2></div></div>
    <div class="analytics-breakdown-list analytics-breakdown-list--compact">
      ${devices.map((row) => `<div class="analytics-breakdown-row">
        <span>${escapeHtml(row.device)}</span>
        <div class="analytics-breakdown-value">
          <strong>${row.percent}%</strong>
          <em>${formatAnalyticsNumber(row.count)}</em>
        </div>
        <i style="--value:${row.percent}%"></i>
      </div>`).join("")}
    </div>
  </article>`;
}

function renderRecentEvents(events) {
  return `<article class="analytics-card analytics-card--span">
    <div class="analytics-card-head"><div><p class="kicker">Лента</p><h2>Последние действия</h2></div></div>
    ${events.length ? `<div class="analytics-event-list">
      ${events.slice(0, 10).map((event) => `<div class="analytics-event-row"><span>${escapeHtml(event.displayTime || formatEventTime(event.createdAt))}</span><strong>${escapeHtml(normalizeEventLabel(event.label || "Событие меню"))}</strong></div>`).join("")}
    </div>` : `<div class="analytics-empty analytics-empty--compact"><strong>Действий пока нет</strong><p>Список появится после подключения событий меню.</p></div>`}
  </article>`;
}

function renderPopularDishesToday(items) {
  const maxOpens = Math.max(...items.map((item) => item.opens || 0), 0);
  return `<article class="analytics-card analytics-card--span">
    <div class="analytics-card-head"><div><p class="kicker">Сегодня</p><h2>Самые популярные блюда сегодня</h2></div></div>
    ${items.length ? `<div class="analytics-ranked-list analytics-ranked-list--compact">
      ${items.slice(0, 5).map((item, index) => `<div class="analytics-ranked-row">
        <span>${index + 1}</span>
        <strong>${escapeHtml(getAnalyticsDishDisplayName(item))}</strong>
        <em>${formatAnalyticsNumber(item.opens || 0)} ${pluralizeOpen(item.opens || 0)}</em>
        <i style="--value:${getChartFillPercent(item.opens || 0, maxOpens)}%"></i>
      </div>`).join("")}
    </div>` : `<div class="analytics-empty analytics-empty--compact"><strong>Сегодня ещё нет данных</strong><p>Топ появится после открытий карточек блюд за сегодняшний день.</p></div>`}
  </article>`;
}

function normalizeEventLabel(label = "") {
  return String(label || "")
    .replace("Открыли меню", "Открыли меню")
    .replace("Открыли карточку", "Открыли карточку")
    .replace("Сменили язык на", "Сменили язык на")
    .replace("блюда", "блюда")
    .replace("другой", "другой");
}

function getAnalyticsRangeLabel(range = "7d") {
  if (range === "today") return "сегодня";
  if (range === "30d") return "за месяц";
  if (range === "year") return "за год";
  if (range === "all") return "за все время";
  return "за неделю";
}

function formatAnalyticsNumber(value) {
  if (value === null || value === undefined) return "0";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return escapeHtml(String(value || ""));
  return new Intl.NumberFormat("ru-RU").format(numeric);
}

function normalizeHours(hours) {
  const byHour = Object.fromEntries((hours || []).map((entry) => [Number(entry.hour), Number(entry.visits || 0)]));
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    visits: byHour[hour] || 0,
  }));
}

function normalizeWorkingHours(hours) {
  return normalizeHours(hours).filter((entry) => entry.hour >= 7);
}

function getWorkingHourBarHeight(value) {
  const numericValue = Number(value || 0);
  if (!numericValue) return 0;
  return Math.round(Math.min(numericValue / MAX_HOUR_VISITS, 1) * 100);
}

function getWorkingHourShare(value, total) {
  const numericTotal = Number(total || 0);
  if (!numericTotal) return 0;
  return Math.round((Number(value || 0) / numericTotal) * 100);
}

function normalizeLastDays(days, count) {
  const byDate = Object.fromEntries(
    (days || [])
      .filter((entry) => entry?.date)
      .map((entry) => [entry.date, entry]),
  );
  const endKey = getAlmatyDateKey();
  const startKey = shiftDateKeyClient(endKey, -(count - 1));
  return Array.from({ length: count }, (_, index) => {
    const date = shiftDateKeyClient(startKey, index);
    const existing = byDate[date] || {};
    return {
      date,
      label: existing.label || getWeekdayLabel(date),
      fullLabel: existing.fullLabel || formatDateLabelClient(date),
      shortLabel: existing.shortLabel || date.slice(8, 10),
      visits: Number(existing.visits || 0),
      isToday: date === endKey,
    };
  });
}

function normalizeWeeks(weeks) {
  const sourceDays = (weeks || []).flatMap((week) => week.days || []);
  const days = normalizeLastDays(sourceDays, 30);
  const normalizedWeeks = [];
  for (let index = 0; index < days.length; index += 7) {
    normalizedWeeks.push({
      weekLabel: index + 7 >= days.length ? "Остаток" : `Неделя ${normalizedWeeks.length + 1}`,
      days: days.slice(index, index + 7),
    });
  }
  return normalizedWeeks;
}

function normalizeMonths(months) {
  const labels = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  const fullLabels = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const byMonth = Object.fromEntries((months || []).map((entry) => [Number(entry.month), entry]));
  return labels.map((label, index) => {
    const month = index + 1;
    const existing = byMonth[month] || {};
    return {
      month,
      label: existing.label || label,
      fullLabel: existing.fullLabel || fullLabels[index],
      visits: Number(existing.visits || 0),
    };
  });
}

function getChartFillPercent(value, max) {
  const numericValue = Number(value || 0);
  const numericMax = Number(max || 0);
  if (!numericValue || !numericMax) return 0;
  const scale = numericMax <= 2 ? 0.42 : numericMax <= 5 ? 0.64 : 1;
  return Math.max(6, Math.round((numericValue / numericMax) * 100 * scale));
}

function pluralizeOpen(value) {
  const number = Math.abs(Number(value || 0));
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return "открытие";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "открытия";
  return "открытий";
}

function formatEventTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("ru-RU", { timeZone: "Asia/Almaty", hour: "2-digit", minute: "2-digit" });
}

function getAlmatyDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shiftDateKeyClient(dateKey, offsetDays) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return date.toISOString().slice(0, 10);
}

function getWeekdayLabel(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][date.getUTCDay()];
}

function formatDateLabelClient(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatHourRange(hour) {
  const currentHour = Number(hour || 0);
  const current = String(currentHour).padStart(2, "0");
  const nextHour = currentHour + 1;
  const next = String(nextHour === 24 ? 24 : nextHour % 24).padStart(2, "0");
  return `${current}:00 - ${next}:00`;
}

function formatDateTooltip(entry = {}) {
  const shortDate = formatShortDate(entry.date);
  const weekday = entry.label || getWeekdayLabel(entry.date);
  return weekday ? `${shortDate}, ${weekday}` : shortDate;
}

function formatShortDate(dateKey = "") {
  const [, month, day] = String(dateKey).split("-");
  if (!month || !day) return String(dateKey || "");
  return `${day}.${month}`;
}

function formatVisitCount(count) {
  const value = Number(count || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${formatAnalyticsNumber(value)} посещение`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${formatAnalyticsNumber(value)} посещения`;
  return `${formatAnalyticsNumber(value)} посещений`;
}

function visual(item) {
  return item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : `<div class="dish-placeholder">${escapeHtml((getItemDisplayName(item) || "?").charAt(0))}</div>`;
}


function isTemporarilyUnavailable(item) {
  return Boolean(item.inactive_until && new Date(item.inactive_until).getTime() > Date.now());
}

function hasMissingTranslation(item) {
  return !String(item.name_kz || "").trim() || !String(item.name_en || "").trim() || !String(item.description_kz || "").trim() || !String(item.description_en || "").trim();
}

function categoryName(id) {
  const category = state.categories.find((entry) => entry.id === id);
  return category ? getCategoryDisplayName(category) : (getKnownCategoryRuLabel(id) || String(id || ""));
}


function renderEditorImage(image = "") {
  if (!el.editorImage) return;
  const hasImage = Boolean(image);
  el.editorImage.innerHTML = hasImage
    ? `<img src="${escapeHtml(image)}" alt="" />`
    : `<div class="editor-photo-placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 15-4.5-4.5L6 19"/></svg>
        <span>Фото</span>
      </div>`;
  if (el.editorFileLabel) el.editorFileLabel.textContent = hasImage ? "Заменить фото" : "Загрузить фото";
  document.querySelector("[data-remove-editor-image]")?.toggleAttribute("hidden", !hasImage);
  renderDishPreview();
}

function setEditorStatus(isStoplisted = false) {
  const value = isStoplisted ? "true" : "false";
  const radio = el.itemForm?.querySelector(`input[name="is_stoplisted"][value="${value}"]`);
  if (radio) radio.checked = true;
  el.itemForm?.querySelectorAll("[data-status-choice]").forEach((choice) => {
    const input = choice.querySelector("input");
    choice.classList.toggle("is-active", input?.checked === true);
  });
  if (!el.editorStatusBadge) return;
  el.editorStatusBadge.textContent = isStoplisted ? "Временно недоступно" : "В продаже";
  el.editorStatusBadge.className = `editor-status-badge ${isStoplisted ? "is-stop" : "is-sale"}`;
  renderDishPreview();
}

function updateEditorStatusFromForm() {
  const value = el.itemForm?.querySelector('input[name="is_stoplisted"]:checked')?.value;
  setEditorStatus(value === "true");
}

function getActiveEditorLanguage() {
  return document.querySelector("[data-lang-tab].is-active")?.dataset.langTab || "ru";
}


function getNextSortOrder(categoryId) {
  const used = state.items
    .filter((item) => item.category_id === categoryId && item.id !== el.itemForm?.elements.id.value)
    .map((item) => Number(item.sort_order || 0));
  return used.length ? Math.max(...used) + 1 : 1;
}

function syncSortOrderForSelectedCategory(force = false) {
  if (!el.itemForm || el.itemForm.elements.id.value) return;
  if (!force && el.itemForm.dataset.sortMode === "manual") return;
  const categoryId = el.itemForm.elements.category_id.value || "";
  if (!categoryId) {
    el.itemForm.elements.sort_order.value = "";
    return;
  }
  el.itemForm.elements.sort_order.value = getNextSortOrder(categoryId);
  el.itemForm.dataset.sortMode = "auto";
}

function updateItemPriceFieldsForCategory() {
  if (!el.itemForm) return;
  const isHotelBreakfast = isHotelBreakfastSectionKey(el.itemForm.elements.category_id.value);
  const priceInput = el.itemForm.elements.price;
  const oldPriceInput = el.itemForm.elements.old_price;
  const priceField = el.itemForm.querySelector("[data-price-field]");
  const oldPriceField = el.itemForm.querySelector("[data-old-price-field]");

  [priceField, oldPriceField].filter(Boolean).forEach((field) => {
    field.hidden = isHotelBreakfast;
    field.classList.toggle("is-hidden", isHotelBreakfast);
  });

  if (priceInput) {
    priceInput.required = !isHotelBreakfast;
    priceInput.disabled = isHotelBreakfast;
    if (isHotelBreakfast) priceInput.value = "";
  }

  if (oldPriceInput) {
    oldPriceInput.disabled = isHotelBreakfast;
    if (isHotelBreakfast) oldPriceInput.value = "";
  }
}





function closeDrawer(force = false) {
  if (state.dirty && !force) return confirmAction("Закрыть без сохранения?", "Изменения в карточке блюда будут потеряны.", () => closeDrawer(true));
  el.drawer.setAttribute("aria-hidden", "true");
  state.dirty = false;
}




function addCategory() {
  el.categoryForm.reset();
  el.categoryForm.elements.id.value = "";
  el.categoryDialogTitle.textContent = "Новая категория";
  el.categoryDialog.showModal();
  el.categoryForm.elements.name_ru.focus();
}

function editCategory(id) {
  const category = state.categories.find((entry) => entry.id === id);
  if (!category) return;
  el.categoryForm.elements.id.value = category.id;
  el.categoryForm.elements.name_ru.value = category.name_ru || category.name || "";
  el.categoryForm.elements.name_kz.value = category.name_kz || "";
  el.categoryForm.elements.name_en.value = category.name_en || "";
  el.categoryDialogTitle.textContent = "Редактирование категории";
  el.categoryDialog.showModal();
  el.categoryForm.elements.name_ru.focus();
}

async function handleCategorySubmit(event) {
  event.preventDefault();
  await runOnce("save-category", event.submitter, "Сохраняем...", async () => {
    const data = Object.fromEntries(new FormData(el.categoryForm));
    const existing = state.categories.find((entry) => entry.id === data.id);
    const payload = {
      id: existing?.id || "",
      name_ru: data.name_ru.trim(),
      name_kz: data.name_kz.trim(),
      name_en: data.name_en.trim(),
      sort_order: existing?.sort || (state.categories.length + 1) * 10,
      is_active: existing?.active ?? true,
    };
    if (!payload.name_ru) return;

    try {
      const result = await adminApi("saveCategory", { category: payload });
      upsertLocalCategory(result.category);
      el.categoryDialog.close();
      toast(existing ? "Категория обновлена" : "Категория добавлена", "success");
      navigate("categories");
      renderAll();
    } catch (error) {
      toast(error.message || "Не удалось сохранить категорию", "danger");
    }
  });
}

async function toggleCategory(id, button = null) {
  const category = state.categories.find((entry) => entry.id === id);
  if (!category) return;
  await runOnce(`toggle-category:${id}`, button, "Обновляем...", async () => {
    try {
      const result = await adminApi("saveCategory", { category: { ...category, is_active: !category.active, sort_order: category.sort } });
      upsertLocalCategory(result.category);
      toast("Статус категории обновлен", "success");
      renderAll();
    } catch (error) {
      toast(error.message || "Не удалось обновить категорию", "danger");
    }
  });
}

async function moveCategory(id, direction, button = null) {
  const sorted = [...state.categories].sort((a, b) => a.sort - b.sort);
  const index = sorted.findIndex((category) => category.id === id);
  const target = sorted[index + direction];
  if (!target) return;
  [sorted[index].sort, target.sort] = [target.sort, sorted[index].sort];

  await runOnce(`move-category:${id}:${direction}`, button, "Двигаем...", async () => {
    try {
      await adminApi("sortCategories", { categories: sorted.map((category) => ({ id: category.id, sort_order: category.sort })) });
      state.categories = sorted;
      toast("Порядок категорий обновлен", "success");
      renderAll();
    } catch (error) {
      toast(error.message || "Не удалось изменить порядок", "danger");
    }
  });
}

function getCategoryItems(categoryId) {
  return state.items.filter((item) => item.category_id === categoryId && !isMenuHeroItem(item));
}

function renderCategorySplitItems() {
  if (!el.categorySplitForm || !el.categorySplitItems) return;
  const sourceId = el.categorySplitForm.elements.source_category_id.value;
  const items = getCategoryItems(sourceId);
  const firstName = el.categorySplitForm.elements.target_one_name_ru.value.trim() || "Первый раздел";
  const secondName = el.categorySplitForm.elements.target_two_name_ru.value.trim() || "Второй раздел";

  if (!items.length) {
    el.categorySplitItems.innerHTML = `<div class="empty-state category-split-empty"><h2>В разделе нет блюд</h2><p>Выберите раздел, в котором есть блюда для переноса.</p></div>`;
    return;
  }

  el.categorySplitItems.innerHTML = `
    <div class="category-split-heading">
      <strong>Распределите блюда</strong>
      <span>${items.length} позиций</span>
    </div>
    <div class="category-split-list">
      ${items.map((item) => `
        <article class="category-split-item">
          <div>
            <strong>${escapeHtml(getItemDisplayName(item))}</strong>
            <small>${escapeHtml([categoryName(item.category_id), shouldShowItemPrice(item) ? formatPrice(item.price, item.currency) : ""].filter(Boolean).join(" · "))}</small>
          </div>
          <div class="category-split-choice" role="radiogroup" aria-label="Новый раздел для ${escapeHtml(getItemDisplayName(item))}">
            <label><input type="radio" name="split_item_${escapeHtml(item.id)}" value="one" required /><span>${escapeHtml(firstName)}</span></label>
            <label><input type="radio" name="split_item_${escapeHtml(item.id)}" value="two" required /><span>${escapeHtml(secondName)}</span></label>
          </div>
        </article>
      `).join("")}
    </div>`;
}

function openCategorySplitDialog(categoryId) {
  if (!el.categorySplitDialog || !el.categorySplitForm) return;
  el.categorySplitForm.reset();
  const selectedId = state.categories.some((category) => category.id === categoryId) ? categoryId : state.categories[0]?.id || "";
  el.categorySplitForm.elements.source_category_id.innerHTML = state.categories
    .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(getCategoryDisplayName(category))}</option>`)
    .join("");
  el.categorySplitForm.elements.source_category_id.value = selectedId;
  renderCategorySplitItems();
  el.categorySplitDialog.showModal();
  el.categorySplitForm.elements.target_one_name_ru.focus();
}

function renderCategoryDetail(categoryId) {
  if (!el.categoryDetailRoot) return;
  const category = state.categories.find((entry) => entry.id === categoryId);
  if (!category) return;
  const items = getCategoryItems(categoryId).sort((a, b) => a.sort_order - b.sort_order);
  el.categoryDetailRoot.innerHTML = `
    <div class="category-detail-header">
      <div>
        <p class="kicker">Категория</p>
        <h2>${escapeHtml(getCategoryDisplayName(category))}</h2>
        <p>${formatPositionCount(items.length)}</p>
      </div>
      <button class="icon-button" type="button" data-close-category-detail aria-label="Закрыть">×</button>
    </div>
    <div class="category-detail-actions">
      <button class="secondary-button compact" type="button" data-edit-category="${escapeHtml(category.id)}">Изменить</button>
      <button class="secondary-button compact" type="button" data-split-category="${escapeHtml(category.id)}">Разделить</button>
      <button class="danger-button compact" type="button" data-delete-category="${escapeHtml(category.id)}">Удалить</button>
    </div>
    <div class="category-detail-items">
      ${items.length ? items.map(renderCategoryDishCard).join("") : `<div class="empty-state category-detail-empty"><h2>В категории нет блюд</h2><p>Можно удалить категорию или добавить в неё новую карточку.</p></div>`}
    </div>`;
}

function renderCategoryDishCard(item) {
  const [statusClass, statusText] = status(item);
  const isSale = !item.is_stoplisted && !isTemporarilyUnavailable(item) && item.is_active;
  const meta = [shouldShowItemPrice(item) ? formatPrice(item.price, item.currency) : "", statusText].filter(Boolean).join(" · ");
  return `<article class="category-dish-card ${statusClass !== "active" ? "is-muted" : ""}">
    <div class="category-dish-thumb">${visual(item)}</div>
    <div>
      <strong>${escapeHtml(getItemDisplayName(item))}</strong>
      <small>${escapeHtml(meta)}</small>
    </div>
    <div class="category-dish-actions">
      <button type="button" class="secondary-button compact" data-edit-item="${escapeHtml(item.id)}">Изменить</button>
      <button type="button" class="stock-control ${isSale ? "is-on" : ""}" data-toggle-stock="${escapeHtml(item.id)}" aria-label="${isSale ? "Перевести блюдо в стоп-лист" : "Вернуть блюдо в продажу"}">
        <span>${isSale ? "В продаже" : "На стопе"}</span>
        <i aria-hidden="true"></i>
      </button>
    </div>
  </article>`;
}

function openCategoryDetail(categoryId) {
  renderCategoryDetail(categoryId);
  el.categoryDetailDialog?.showModal();
}

function closeCategoryDetail() {
  el.categoryDetailDialog?.close();
}

async function handleCategorySplitSubmit(event) {
  event.preventDefault();
  if (!el.categorySplitForm) return;
  await runOnce("split-category", event.submitter, "Разделяем...", async () => {
    const form = el.categorySplitForm;
    const sourceCategoryId = form.elements.source_category_id.value;
    const oneName = form.elements.target_one_name_ru.value.trim();
    const twoName = form.elements.target_two_name_ru.value.trim();
    const items = getCategoryItems(sourceCategoryId);

    if (!sourceCategoryId) return toast("Выберите исходный раздел", "danger");
    if (!oneName || !twoName) return toast("Укажите названия двух новых разделов", "danger");
    if (oneName.toLowerCase() === twoName.toLowerCase()) return toast("Названия новых разделов должны отличаться", "danger");
    if (!items.length) return toast("В исходном разделе нет блюд для переноса", "danger");

    const assignments = [];
    for (const item of items) {
      const selected = form.querySelector(`input[name="split_item_${escapeCssIdentifier(item.id)}"]:checked`);
      if (!selected) {
        toast("Распределите все блюда по новым разделам", "danger");
        return;
      }
      assignments.push({ itemId: item.id, targetClientId: selected.value });
    }

    if (!assignments.some((entry) => entry.targetClientId === "one") || !assignments.some((entry) => entry.targetClientId === "two")) {
      toast("В каждом новом разделе должно быть хотя бы одно блюдо", "danger");
      return;
    }

    try {
      const result = await adminApi("splitCategory", {
        split: {
          sourceCategoryId,
          targets: [
            { clientId: "one", name_ru: oneName },
            { clientId: "two", name_ru: twoName },
          ],
          assignments,
        },
      });
      applyAdminData(result);
      el.categorySplitDialog.close();
      closeCategoryDetail();
      toast("Раздел успешно разделен", "success");
      navigate("categories");
    } catch (error) {
      toast(error.message || "Не удалось разделить раздел", "danger");
    }
  });
}

function openCategoryDeleteDialog(categoryId) {
  if (!el.categoryDeleteDialog || !el.categoryDeleteForm) return;
  const category = state.categories.find((entry) => entry.id === categoryId);
  if (!category) return;
  const items = getCategoryItems(categoryId);
  const alternatives = state.categories.filter((entry) => entry.id !== categoryId);
  el.categoryDeleteForm.reset();
  el.categoryDeleteForm.elements.category_id.value = categoryId;
  el.categoryDeleteTitle.textContent = `Удалить категорию «${getCategoryDisplayName(category)}»`;
  const targetField = el.categoryDeleteForm.querySelector("[data-category-delete-target-field]");

  if (items.length) {
    el.categoryDeleteCopy.textContent = `В категории ${formatPositionCount(items.length)}. Перед удалением выберите раздел, куда перенести блюда.`;
    targetField.hidden = false;
    el.categoryDeleteTarget.required = true;
    el.categoryDeleteTarget.innerHTML = `<option value="">Выберите раздел</option>${alternatives.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(getCategoryDisplayName(entry))}</option>`).join("")}`;
  } else {
    el.categoryDeleteCopy.textContent = "Категория пустая. После удаления она больше не будет отображаться в админке.";
    targetField.hidden = true;
    el.categoryDeleteTarget.required = false;
    el.categoryDeleteTarget.innerHTML = "";
  }

  el.categoryDeleteDialog.showModal();
}

async function handleCategoryDeleteSubmit(event) {
  event.preventDefault();
  const submitter = event.submitter;
  await runOnce("delete-category", submitter, "Удаляем...", async () => {
    const categoryId = el.categoryDeleteForm.elements.category_id.value;
    const targetCategoryId = el.categoryDeleteForm.elements.target_category_id?.value || "";
    const items = getCategoryItems(categoryId);
    if (items.length && !targetCategoryId) {
      toast("Выберите раздел для переноса блюд", "danger");
      el.categoryDeleteTarget.focus();
      return;
    }

    try {
      const result = await adminApi("deleteCategory", { categoryId, targetCategoryId });
      applyAdminData(result);
      el.categoryDeleteDialog.close();
      closeCategoryDetail();
      toast(items.length ? "Категория удалена, блюда перенесены" : "Категория удалена", "success");
      navigate("categories");
    } catch (error) {
      toast(toFriendlyError(error.message) || "Не удалось удалить категорию", "danger");
    }
  });
}

async function handleBulkUploads(files) {
  if (state.pendingActions.has("bulk-upload")) return;
  const targets = state.items.filter((item) => !item.image).slice(0, files.length);
  if (!targets.length) {
    toast("Нет блюд без фото", "success");
    return;
  }

  state.pendingActions.add("bulk-upload");
  try {
    for (const [index, file] of [...files].slice(0, targets.length).entries()) {
      try {
        const imageData = await prepareImage(file);
        const result = await adminApi("uploadItemPhoto", { itemId: targets[index].id, imageData });
        upsertLocalItem(result.item);
        toast(`\u0424\u043e\u0442\u043e \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e: ${getItemDisplayName(result.item || targets[index])}`, "success");
      } catch (error) {
        toast(error.message || "Не удалось загрузить фото", "danger");
      }
    }
    renderAll();
  } finally {
    state.pendingActions.delete("bulk-upload");
  }
}

async function handleEditorFile() {
  await runOnce("editor-photo", el.editorFileLabel, "Готовим фото...", async () => {
    try {
      const imageData = await prepareImage(el.editorFile.files[0]);
      el.itemForm.dataset.pendingImage = imageData;
      el.itemForm.dataset.image = imageData;
      renderEditorImage(imageData);
      state.dirty = true;
    } catch (error) {
      toast(error.message || "Не удалось подготовить фото", "danger");
    }
  });
}

function removeEditorImage(button = null) {
  runOnce("remove-editor-photo", button, "Удаляем...", async () => {
    el.itemForm.dataset.image = "";
    el.itemForm.dataset.pendingImage = "";
    renderEditorImage("");
    state.dirty = true;
  });
}



function handleDocumentClick(event) {
  const nav = event.target.closest("[data-nav]");
  const action = event.target.closest("[data-action]")?.dataset.action;
  const stockButton = event.target.closest("[data-toggle-stock]");
  const stock = stockButton?.dataset.toggleStock;
  const edit = event.target.closest("[data-edit-item]")?.dataset.editItem;
  const attention = event.target.closest("[data-attention-view]")?.dataset.attentionView;
  const toggleCatButton = event.target.closest("[data-toggle-category]");
  const toggleCat = toggleCatButton?.dataset.toggleCategory;
  const editCat = event.target.closest("[data-edit-category]")?.dataset.editCategory;
  const splitCat = event.target.closest("[data-split-category]")?.dataset.splitCategory;
  const deleteCat = event.target.closest("[data-delete-category]")?.dataset.deleteCategory;
  const move = event.target.closest("[data-move-category]");
  const openCategory = event.target.closest("[data-open-category]")?.dataset.openCategory;
  const analyticsRange = event.target.closest("[data-analytics-range]")?.dataset.analyticsRange;
  const analyticsDay = event.target.closest("[data-analytics-day]")?.dataset.analyticsDay;
  const analyticsBack = event.target.closest("[data-analytics-back]")?.dataset.analyticsBack;

  if (nav) navigate(nav.dataset.nav);
  if (event.target.closest("[data-close-category-detail]")) closeCategoryDetail();
  if (analyticsRange) {
    state.analyticsRange = analyticsRange;
    state.analyticsDrilldownDate = "";
    state.analytics = null;
    loadAnalytics(true);
  }
  if (analyticsDay) {
    state.analyticsDrilldownDate = analyticsDay;
    renderAnalytics();
  }
  if (analyticsBack) {
    state.analyticsDrilldownDate = "";
    renderAnalytics();
  }
  if (action === "add-item") openItemDrawer();
  if (action === "add-category") addCategory();
  if (action === "open-stop-filter") openStopFilter();
  if (stock) toggleStock(stock, stockButton);
  if (edit) {
    closeCategoryDetail();
    openItemDrawer(edit);
  }
  if (attention) navigate(attention);
  if (event.target.closest("[data-logout]")) logout();
  if (event.target.closest("[data-close-drawer]")) closeDrawer();
  if (toggleCat) toggleCategory(toggleCat, toggleCatButton);
  if (editCat) editCategory(editCat);
  if (splitCat) openCategorySplitDialog(splitCat);
  if (deleteCat) openCategoryDeleteDialog(deleteCat);
  if (move) moveCategory(move.dataset.moveCategory, Number(move.dataset.direction), move);
  if (event.target.closest("[data-remove-editor-image]")) removeEditorImage(event.target.closest("[data-remove-editor-image]"));
  if (event.target.closest("[data-translate-current-item]")) translateCurrentItem();
  if (event.target.closest("[data-translate-missing]")) translateMissingItems();
  if (event.target.closest("[data-toggle-preview]")) toggleMobilePreview();
  if (openCategory && !isInteractiveCategoryClick(event)) openCategoryDetail(openCategory);
}

function openStopFilter() {
  navigate("menu");
  if (el.statusFilter) {
    el.statusFilter.value = "stop";
    renderDishes();
  }
  toast("Выберите блюдо и выключите продажу.", "success");
}

function upsertLocalItem(rawItem) {
  const item = normalizeItem(rawItem);
  const index = state.items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) state.items[index] = item;
  else state.items.push(item);
}

function upsertLocalCategory(rawCategory) {
  const category = normalizeCategory(rawCategory);
  const index = state.categories.findIndex((entry) => entry.id === category.id);
  if (index >= 0) state.categories[index] = category;
  else state.categories.push(category);
  state.categories.sort((a, b) => a.sort - b.sort);
}


function confirmAction(title, text, action) {
  state.pendingConfirm = action;
  el.confirmTitle.textContent = title;
  el.confirmText.textContent = text;
  el.confirmDialog.showModal();
}

async function runPendingConfirm() {
  const action = state.pendingConfirm;
  if (!action) return;
  const button = el.confirmDialog.querySelector('button[value="confirm"]');
  await runOnce("confirm-action", button, "Выполняем...", async () => {
    await action();
  });
}

function setControlBusy(control, isBusy, busyText = "") {
  if (!control) return;
  const target = control.matches?.("button") ? control : control.querySelector?.("button, span") || control;
  if (isBusy) {
    if (!target.dataset.idleHtml) target.dataset.idleHtml = target.innerHTML;
    if (busyText) target.textContent = busyText;
    control.disabled = true;
    control.setAttribute("aria-busy", "true");
    control.classList?.add("is-loading");
  } else {
    if (target.dataset.idleHtml) {
      target.innerHTML = target.dataset.idleHtml;
      delete target.dataset.idleHtml;
    }
    control.disabled = false;
    control.removeAttribute("aria-busy");
    control.classList?.remove("is-loading");
  }
}

async function runOnce(key, control, busyText, task) {
  if (state.pendingActions.has(key)) return null;
  state.pendingActions.add(key);
  setControlBusy(control, true, busyText);
  try {
    return await task();
  } finally {
    state.pendingActions.delete(key);
    setControlBusy(control, false);
  }
}

function isInteractiveCategoryClick(event) {
  return Boolean(event.target.closest("button,a,input,select,textarea,label,[data-stop-row-click]"));
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeCssIdentifier(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(String(value));
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function firstFilledValue(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function normalizeCategoryLookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getKnownCategoryRuLabel(...values) {
  for (const value of values) {
    const key = normalizeCategoryLookupKey(value);
    if (key && CATEGORY_LABELS_RU[key]) return CATEGORY_LABELS_RU[key];
  }
  return "";
}

function isMenuHeroItem(item) {
  const contentKey = normalizeCategoryLookupKey(item?.content_key || item?.contentKey || "");
  const sectionKey = normalizeCategoryLookupKey(item?.section_key || item?.category_id || "");
  const titleKey = normalizeCategoryLookupKey(
    item?.title_ru || item?.name_ru || item?.title_en || item?.name_en || item?.name || item?.title || "",
  );
  return contentKey === "menu-hero"
    || contentKey === "hero"
    || sectionKey === "hero"
    || titleKey === "menu-hero";
}

function formatHourStart(hour) {
  return `${String(Number(hour || 0)).padStart(2, "0")}:00`;
}

function getItemDisplayName(item) {
  return firstFilledValue(
    item?.name_ru,
    item?.title_ru,
    item?.name_kz,
    item?.title_kk,
    item?.name_en,
    item?.title_en,
    item?.content_key,
    item?.id,
  ) || "Без названия";
}

function getItemDisplayDescription(item) {
  return firstFilledValue(
    item?.description_ru,
    item?.description_kz,
    item?.description_kk,
    item?.description_en,
  );
}

function getCategoryDisplayName(category) {
  const ruDisplay = firstFilledValue(
    category?.name_ru,
    category?.title_ru,
    category?.label_ru,
    category?.section_title_ru,
    category?.category_title_ru,
    category?.category_name_ru,
  );
  const normalizedRuDisplay = getKnownCategoryRuLabel(ruDisplay) || ruDisplay;
  const knownRuLabel = getKnownCategoryRuLabel(
    category?.section_key,
    category?.category_key,
    category?.id,
    category?.name,
    category?.title,
    category?.label,
    category?.name_en,
    category?.title_en,
    category?.label_en,
  );

  return firstFilledValue(
    normalizedRuDisplay,
    knownRuLabel,
    category?.name_kz,
    category?.title_kk,
    category?.label_kk,
    category?.name_kk,
    category?.section_title_kk,
    category?.category_title_kk,
    category?.category_name_kk,
    category?.name_en,
    category?.title_en,
    category?.label_en,
    category?.section_title_en,
    category?.category_title_en,
    category?.category_name_en,
    category?.name,
    category?.section_key,
    category?.category_key,
    category?.id,
  ) || "\u0411\u0435\u0437 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438";
}
function getAnalyticsDishDisplayName(item) {
  return firstFilledValue(
    item?.title_ru,
    item?.name_ru,
    item?.title_kk,
    item?.name_kz,
    item?.title_en,
    item?.name_en,
    item?.title,
    item?.name,
    item?.content_key,
    item?.id,
  ) || "Блюдо";
}

function getNextMidnightIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function toDatetimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextTheme === "dark" ? "#0b1120" : "#f7f8fb");
  localStorage.setItem(themeStorageKey, nextTheme);
}

function prepareImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("Файл не выбран"));
    if (file.size > 10 * 1024 * 1024) return reject(new Error("Файл больше 10 МБ"));
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) return reject(new Error("Поддерживаются JPG, PNG, WebP и AVIF"));

    const image = new Image();
    image.onload = () => {
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/webp", 0.84));
      URL.revokeObjectURL(image.src);
    };
    image.onerror = () => reject(new Error("Не удалось прочитать изображение"));
    image.src = URL.createObjectURL(file);
  });
}

function ensureAdminEnhancements() {
  if (el.overviewGrid && !document.querySelector("[data-menu-hero-panel]")) {
    const heroPanel = document.createElement("article");
    heroPanel.className = "panel menu-hero-admin";
    heroPanel.dataset.menuHeroPanel = "";
    el.overviewGrid.append(heroPanel);
  }

  if (document.querySelector("[data-photo-filter]")) return;

  const photoFilter = document.createElement("select");
  photoFilter.dataset.photoFilter = "";
  photoFilter.setAttribute("aria-label", "Фильтр фото");
  photoFilter.innerHTML = `
    <option value="all">Все фото</option>
    <option value="with">С фото</option>
    <option value="missing">Без фото</option>
  `;
  el.statusFilter?.insertAdjacentElement("afterend", photoFilter);
  el.photoFilter = photoFilter;

  const translationFilter = document.createElement("select");
  translationFilter.dataset.translationFilter = "";
  translationFilter.setAttribute("aria-label", "Фильтр переводов");
  translationFilter.innerHTML = `
    <option value="all">Все переводы</option>
    <option value="complete">Перевод полный</option>
    <option value="missing">Нет перевода</option>
  `;
  photoFilter.insertAdjacentElement("afterend", translationFilter);
  el.translationFilter = translationFilter;

  const translateMissing = document.createElement("button");
  translateMissing.type = "button";
  translateMissing.className = "secondary-button compact toolbar-action";
  translateMissing.dataset.translateMissing = "";
  translateMissing.textContent = "Заполнить переводы";
  document.querySelector(".menu-toolbar")?.append(translateMissing);

  const langTabs = document.querySelector(".language-tabs");
  if (langTabs && !document.querySelector("[data-translate-current-item]")) {
    const tools = document.createElement("div");
    tools.className = "drawer-tools";
    tools.innerHTML = `
      <button class="secondary-button compact" type="button" data-translate-current-item>Перевести с RU</button>
      <small>Перевод будет заполнен автоматически.</small>
    `;
    langTabs.insertAdjacentElement("afterend", tools);
  }

  const imageEditor = document.querySelector(".image-editor");
  if (imageEditor && !document.querySelector("[data-remove-editor-image]")) {
    imageEditor.insertAdjacentHTML("beforeend", `
      <div class="media-actions">
        <button class="secondary-button compact" type="button" data-remove-editor-image>Удалить фото</button>
        <small>Фото будет оптимизировано перед загрузкой.</small>
      </div>
    `);
  }

  const categoryForm = el.categoryForm;
  if (categoryForm && !categoryForm.elements.name_kz) {
    const nameInput = categoryForm.elements.name;
    if (nameInput) {
      nameInput.name = "name_ru";
      nameInput.closest("label").childNodes[0].textContent = "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 (\u0440\u0443\u0441.)";
      nameInput.insertAdjacentHTML("afterend", `<span class="field-hint">\u0420\u0443\u0441\u0441\u043a\u043e\u0435 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e, \u043f\u0435\u0440\u0435\u0432\u043e\u0434\u044b \u043c\u043e\u0436\u043d\u043e \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u0437\u0436\u0435.</span>`);
      categoryForm.querySelector(".field-hint")?.closest("label")?.insertAdjacentHTML("afterend", `
        <label>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 (\u043a\u0430\u0437.)<input name="name_kz" maxlength="80" autocomplete="off" /></label>
        <label>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 (\u0430\u043d\u0433\u043b.)<input name="name_en" maxlength="80" autocomplete="off" /></label>
      `);
    }
  }
}


function renderMetrics() {
  const active = state.items.filter((item) => item.is_active && !item.is_stoplisted && !isTemporarilyUnavailable(item)).length;
  const stopped = state.items.filter((item) => item.is_stoplisted || isTemporarilyUnavailable(item)).length;
  const needsAttention = state.items.filter((item) => !item.image || hasMissingTranslation(item) || item.is_stoplisted || isTemporarilyUnavailable(item)).length;
  const values = [
    ["Всего блюд", state.items.length],
    ["В продаже", active],
    ["Стоп-лист", stopped],
    ["Требует внимания", needsAttention],
  ];
  el.metrics.innerHTML = values.map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join("");
}

function renderAttention() {
  const issues = [
    { name: "Нет фото", count: state.items.filter((item) => !item.image).length, view: "menu", type: "issue" },
    { name: "Нет перевода", count: state.items.filter((item) => hasMissingTranslation(item)).length, view: "menu", type: "issue" },
    { name: "Стоп-лист", count: state.items.filter((item) => item.is_stoplisted || isTemporarilyUnavailable(item)).length, view: "stoplist", type: "neutral" },
  ];
  const total = issues.reduce((sum, issue) => sum + issue.count, 0);
  el.attentionCount.textContent = total ? `${formatPositionCount(total)}` : "Все хорошо";
  el.attentionList.innerHTML = issues.map((issue) => {
    const status = getAttentionStatus(issue.count, issue.type);
    return `<button class="attention-item attention-item--${status.className}" type="button" data-attention-view="${issue.view}">
      <i></i>
      <span class="attention-copy"><strong>${issue.name}</strong><small>${status.description}</small></span>
      <span class="attention-result"><b>${formatPositionCount(issue.count)}</b><em>${status.label}</em></span>
    </button>`;
  }).join("");
}

function renderDishes() {
  const items = filteredItems();
  el.dishGrid.innerHTML = items.length ? items.map((item) => {
    const [statusClass] = status(item);
    const badges = getDishBadges(item);
    const isSale = !item.is_stoplisted && !isTemporarilyUnavailable(item) && item.is_active;
    return `<article class="dish-card ${statusClass !== "active" ? "is-muted" : ""}">
      <div class="dish-visual">${visual(item)}</div>
      <div class="dish-body">
        <div class="dish-title-row"><h3>${escapeHtml(getItemDisplayName(item))}</h3><button type="button" data-edit-item="${item.id}">Изменить</button></div>
        <div class="dish-meta">
          <span>${escapeHtml(categoryName(item.category_id))}</span>
          <button class="stock-control ${isSale ? "is-on" : ""}" type="button" data-toggle-stock="${item.id}" aria-label="${isSale ? "Перевести блюдо в стоп-лист" : "Вернуть блюдо в продажу"}">
            <span>${isSale ? "В продаже" : "На стопе"}</span>
            <i aria-hidden="true"></i>
          </button>
        </div>
        <div class="dish-badge-row">${badges.map((badge) => `<span class="exort-badge exort-badge--${badge.type}">${badge.label}</span>`).join("")}</div>
        ${shouldShowItemPrice(item) ? `<div class="dish-price">${formatPrice(item.price, item.currency)}</div>` : ""}
      </div>
    </article>`;
  }).join("") : `<div class="empty-state"><h2>Ничего не найдено</h2><p>Измените фильтр или добавьте новое блюдо.</p></div>`;
}

function getDishBadges(item) {
  const badges = [];
  const [, statusText] = status(item);
  const statusType = item.is_stoplisted || isTemporarilyUnavailable(item) ? "danger" : (!item.is_active ? "neutral" : "success");
  badges.push({ label: statusText, type: statusType });
  if (!item.image) badges.push({ label: "Нет фото", type: "warning" });
  if (hasMissingTranslation(item)) badges.push({ label: "Нет перевода", type: "attention" });
  return badges;
}

function formatPrice(value, currency = "KZT") {
  const symbol = currency === "KZT" ? "₸" : currency;
  return `${new Intl.NumberFormat("ru-KZ").format(Number(value) || 0)} ${symbol}`;
}

function status(item) {
  if (!item.is_active) return ["inactive", "Неактивно"];
  if (isTemporarilyUnavailable(item)) return ["temp", "Временно недоступно"];
  if (item.is_stoplisted) return ["stop", "Стоп-лист"];
  return ["active", "В продаже"];
}

function formatPositionCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} позиция`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} позиции`;
  return `${count} позиций`;
}



async function adminApi(action, payload = {}) {
  const configError = getAdminApiConfigError();
  if (configError) {
    console.warn("[exort-admin] API config error.", {
      action,
      endpoint: ADMIN_API_URL || "(empty)",
      configError,
    });
    throw new Error(configError);
  }

  const requestPayload = {
    action,
    restaurantSlug: getRestaurantSlug(),
    sessionToken: state.sessionToken,
    ...payload,
  };

  let response;
  try {
    response = await fetch(ADMIN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
  } catch (error) {
    console.error("[exort-admin] API request failed.", {
      action,
      url: ADMIN_API_URL,
      method: "POST",
      error: error?.message || String(error),
      payload: requestPayload,
    });
    throw new Error("Сервис временно недоступен. Попробуйте обновить страницу или обратитесь в поддержку Exort.");
  }

  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { error: rawText };
  }

  if (!response.ok || data?.error) {
    const message = data?.error || `Admin API error ${response.status}`;
    console.error("[exort-admin] API rejected request.", {
      action,
      url: ADMIN_API_URL,
      method: "POST",
      status: response.status,
      statusText: response.statusText,
      responseText: rawText,
      data,
    });

    if ([404, 405, 500, 502, 503].includes(response.status)) {
      console.error("[exort-admin] API endpoint is unavailable.", {
        action,
        url: ADMIN_API_URL,
        method: "POST",
        status: response.status,
        statusText: response.statusText,
        responseText: rawText,
        data,
      });
      if (response.status === 405 && isLocalAdminHost()) {
        throw new Error("Live Server не обрабатывает POST-запросы к API. Для локального входа укажите полный URL Netlify Function.");
      }
      throw new Error("Сервис временно недоступен. Попробуйте обновить страницу или обратитесь в поддержку Exort.");
    }

    throw new Error(response.status === 502
      ? "Сервис временно недоступен. Попробуйте обновить страницу или обратитесь в поддержку Exort."
      : message);
  }

  return data;
}

async function toggleStock(id, button = null) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  await runOnce(`toggle-stock:${id}`, button, item.is_stoplisted ? "Возвращаем..." : "Ставим...", async () => {
    try {
      const result = await adminApi("toggleStock", { itemId: id, is_stoplisted: !item.is_stoplisted });
      upsertLocalItem(result.item);
      toast(result.item.is_stoplisted ? "Блюдо добавлено в стоп-лист" : "Блюдо возвращено в продажу", "success");
      renderAll();
      if (el.categoryDetailDialog?.open) renderCategoryDetail(result.item.category_id || item.category_id);
    } catch (error) {
      toast(toFriendlyError(error.message) || "Не удалось изменить стоп-лист", "danger");
    }
  });
}

function handleDeleteItem() {
  const id = el.itemForm.elements.id.value;
  if (!id) return;
  confirmAction("Удалить блюдо?", "Это действие нельзя отменить.", async () => {
    try {
      const result = await adminApi("deleteItem", { itemId: id });
      if (!result?.ok || String(result.deletedItemId || "") !== String(id)) {
        throw new Error("Блюдо не было удалено из базы данных.");
      }
      state.items = state.items.filter((item) => item.id !== id);
      state.dirty = false;
      toast("Блюдо удалено", "success");
      closeDrawer(true);
      renderAll();
    } catch (error) {
      toast(toFriendlyError(error.message) || "Не удалось удалить блюдо", "danger");
    }
  });
}


async function translateMissingItems() {
  const ids = state.items.filter(hasMissingTranslation).map((item) => item.id);
  if (!ids.length) {
    toast("Все переводы заполнены", "success");
    return;
  }

  try {
    const result = await adminApi("translateMissing", { itemIds: ids });
    state.items = (result.items || state.items).map(normalizeItem);
    toast("Отсутствующие переводы заполнены", "success");
    renderAll();
  } catch {
    toast("Автоперевод пока недоступен. Заполните перевод вручную.", "danger");
  }
}


function toast(message, type = "") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = toFriendlyError(message);
  el.toasts.append(node);
  setTimeout(() => {
    node.classList.add("is-hiding");
    setTimeout(() => node.remove(), 180);
  }, 3200);
}


function bindEvents() {
  el.pinForm.addEventListener("submit", handleLogin);
  el.pinVisibility.addEventListener("click", togglePinVisibility);

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("change", (event) => {
    const heroFileInput = event.target.closest("[data-menu-hero-file]");
    if (heroFileInput) {
      handleMenuHeroFile(heroFileInput.files?.[0]);
      heroFileInput.value = "";
    }
  });
  [el.menuSearch, el.categoryFilter, el.statusFilter, el.photoFilter, el.translationFilter]
    .filter(Boolean)
    .forEach((control) => control.addEventListener("input", renderDishes));

  el.itemForm.addEventListener("input", (event) => {
    if (event.target?.name === "sort_order") el.itemForm.dataset.sortMode = "manual";
    handleItemFormInput(event);
    renderDishPreview();
    state.dirty = true;
  });

  el.itemForm.addEventListener("change", (event) => {
    if (event.target?.matches("[data-auto-translate-toggle]")) {
      renderDishPreview();
      return;
    }
    if (event.target?.name === "category_id") {
      syncSortOrderForSelectedCategory();
      updateItemPriceFieldsForCategory();
    }
    updateEditorStatusFromForm();
    renderDishPreview();
    state.dirty = true;
  });

  document.querySelector("[data-auto-translate-toggle]")?.addEventListener("change", (event) => {
    setAutoTranslateEnabled(event.target.checked);
  });

  el.dishPreview?.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-preview-lang-tab]");
    if (!tab) return;
    setPreviewLanguage(tab.dataset.previewLangTab);
  });

  el.itemForm.addEventListener("submit", handleItemSubmit);
  el.deleteItem.addEventListener("click", handleDeleteItem);
  el.editorFile.addEventListener("change", handleEditorFile);
  el.photoInput?.addEventListener("change", () => handleBulkUploads(el.photoInput.files));

  ["dragenter", "dragover"].forEach((type) => {
    el.uploadZone?.addEventListener(type, (event) => {
      event.preventDefault();
      el.uploadZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    el.uploadZone?.addEventListener(type, (event) => {
      event.preventDefault();
      el.uploadZone.classList.remove("is-dragging");
    });
  });

  el.uploadZone?.addEventListener("drop", (event) => handleBulkUploads(event.dataTransfer.files));

  el.confirmDialog.addEventListener("close", () => {
    if (el.confirmDialog.returnValue !== "confirm") state.pendingConfirm = null;
  });
  el.confirmDialog.querySelector("form")?.addEventListener("submit", async (event) => {
    if (event.submitter?.value !== "confirm") return;
    event.preventDefault();
    await runPendingConfirm();
    state.pendingConfirm = null;
    el.confirmDialog.close("done");
  });

  el.categoryForm.addEventListener("submit", handleCategorySubmit);
  document.querySelector("[data-close-category]").addEventListener("click", () => el.categoryDialog.close());
  el.categorySplitForm?.addEventListener("submit", handleCategorySplitSubmit);
  el.categorySplitForm?.addEventListener("input", (event) => {
    if (event.target.matches("[name='target_one_name_ru'], [name='target_two_name_ru']")) renderCategorySplitItems();
  });
  el.categorySplitForm?.elements.source_category_id?.addEventListener("change", renderCategorySplitItems);
  document.querySelector("[data-close-category-split]")?.addEventListener("click", () => el.categorySplitDialog?.close());
  el.categoryDeleteForm?.addEventListener("submit", handleCategoryDeleteSubmit);
  document.querySelector("[data-close-category-delete]")?.addEventListener("click", () => el.categoryDeleteDialog?.close());
  document.addEventListener("keydown", (event) => {
    const row = event.target.closest?.("[data-open-category]");
    if (!row || !["Enter", " "].includes(event.key)) return;
    if (isInteractiveCategoryClick(event)) return;
    event.preventDefault();
    openCategoryDetail(row.dataset.openCategory);
  });

  document.querySelectorAll("[data-lang-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      setEditorLanguage(tab.dataset.langTab);
      renderDishPreview();
    });
  });

  syncAutoTranslateControl();
  setTranslateStatus(getAutoTranslateEnabled() ? "idle" : "off");

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function getEditorTranslationMeta() {
  if (!state.editorTranslationMeta) {
    state.editorTranslationMeta = {
      manual: {
        name_en: false,
        name_kz: false,
        description_en: false,
        description_kz: false,
      },
      previewLang: "ru",
      debounceTimer: 0,
      statusTimer: 0,
      requestId: 0,
      activePromise: null,
    };
  }
  return state.editorTranslationMeta;
}

function resetEditorTranslationMeta() {
  const meta = getEditorTranslationMeta();
  clearTimeout(meta.debounceTimer);
  clearTimeout(meta.statusTimer);
  meta.manual = {
    name_en: false,
    name_kz: false,
    description_en: false,
    description_kz: false,
  };
  meta.previewLang = "ru";
  meta.requestId = 0;
  meta.activePromise = null;
  syncAutoTranslateControl();
  setTranslateStatus(getAutoTranslateEnabled() ? "idle" : "off");
}

function getAutoTranslateEnabled() {
  return sessionStorage.getItem("exort.admin.autoTranslate") !== "false";
}

function setAutoTranslateEnabled(enabled) {
  sessionStorage.setItem("exort.admin.autoTranslate", enabled ? "true" : "false");
  syncAutoTranslateControl();
  if (!enabled) clearPendingAutoTranslate();
  setTranslateStatus(enabled ? "idle" : "off");
}

function syncAutoTranslateControl() {
  const toggle = document.querySelector("[data-auto-translate-toggle]");
  if (toggle) toggle.checked = getAutoTranslateEnabled();
}

function setTranslateStatus(mode = "idle") {
  const node = document.querySelector("[data-translate-status]");
  if (!node) return;

  const meta = getEditorTranslationMeta();
  clearTimeout(meta.statusTimer);

  const textByMode = {
    idle: "Автоперевод включен",
    off: "Автоперевод выключен",
    loading: "Переводим...",
    success: "Перевод выполнен",
    error: "Ошибка перевода",
  };

  node.textContent = textByMode[mode] || textByMode.idle;
  node.className = `translate-status${mode === "idle" ? "" : ` is-${mode}`}`;

  if (mode === "success" || mode === "error") {
    meta.statusTimer = setTimeout(() => {
      setTranslateStatus(getAutoTranslateEnabled() ? "idle" : "off");
    }, 1800);
  }
}

function clearPendingAutoTranslate() {
  const meta = getEditorTranslationMeta();
  clearTimeout(meta.debounceTimer);
  meta.debounceTimer = 0;
}

function setEditorLanguage(language = "ru") {
  const normalizedLanguage = ["ru", "kz", "en"].includes(language) ? language : "ru";
  if (el.itemForm) el.itemForm.dataset.editorLanguage = normalizedLanguage;
  document.querySelectorAll("[data-lang-tab]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.langTab === normalizedLanguage);
  });
  document.querySelectorAll("[data-lang-pane]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.langPane === normalizedLanguage);
  });
}

function getPreviewLanguage() {
  return getEditorTranslationMeta().previewLang || "ru";
}

function setPreviewLanguage(language = "ru") {
  getEditorTranslationMeta().previewLang = ["ru", "en", "kz"].includes(language) ? language : "ru";
  renderDishPreview();
}

function toggleMobilePreview() {
  if (!el.itemForm) return;
  const isOpen = el.itemForm.classList.toggle("is-preview-open");
  const button = document.querySelector("[data-toggle-preview]");
  if (button) button.textContent = isOpen ? "Скрыть превью" : "Показать превью";
}

function handleItemFormInput(event) {
  const field = event.target?.name;
  if (!field) return;

  const meta = getEditorTranslationMeta();
  const translatableFields = ["name_en", "name_kz", "description_en", "description_kz"];

  if (translatableFields.includes(field)) {
    meta.manual[field] = true;
    return;
  }

  if (field === "name_ru" || field === "description_ru") {
    if (!getAutoTranslateEnabled()) {
      setTranslateStatus("off");
      return;
    }
    scheduleAutoTranslateFromRu();
  }
}

function scheduleAutoTranslateFromRu() {
  clearPendingAutoTranslate();

  const hasRuSource = Boolean(
    el.itemForm?.elements.name_ru.value.trim() ||
    el.itemForm?.elements.description_ru.value.trim()
  );

  if (!hasRuSource) {
    setTranslateStatus(getAutoTranslateEnabled() ? "idle" : "off");
    return;
  }

  const meta = getEditorTranslationMeta();
  meta.debounceTimer = setTimeout(() => {
    translateCurrentItem({ showToast: false, quietOnEmpty: true });
  }, 900);
}

function getLocalizedEditorValue(field, language = getPreviewLanguage()) {
  return firstFilledValue(
    el.itemForm?.elements[`${field}_ru`]?.value?.trim(),
    el.itemForm?.elements[`${field}_kz`]?.value?.trim(),
    el.itemForm?.elements[`${field}_en`]?.value?.trim()
  );
}

function getEditorPreviewItem() {
  const isStoplisted = el.itemForm?.querySelector('input[name="is_stoplisted"]:checked')?.value === "true";
  const oldPriceValue = String(el.itemForm?.elements.old_price?.value || "").trim();
  const caloriesValue = String(el.itemForm?.elements.calories?.value || "").trim();
  const categoryId = el.itemForm?.elements.category_id.value || "";
  const isHotelBreakfast = isHotelBreakfastSectionKey(categoryId);
  return {
    previewLang: getPreviewLanguage(),
    image: el.itemForm?.dataset.image || "",
    name: getLocalizedEditorValue("name") || "Название блюда",
    description: getLocalizedEditorValue("description") || "Описание появится здесь",
    price: isHotelBreakfast ? null : Number(el.itemForm?.elements.price.value || 0),
    old_price: !isHotelBreakfast && oldPriceValue ? Number(oldPriceValue) : null,
    weight: String(el.itemForm?.elements.weight?.value || "").trim(),
    calories: caloriesValue ? Number(caloriesValue) : null,
    spice_level: String(el.itemForm?.elements.spice_level?.value || "").trim(),
    currency: "KZT",
    category_id: categoryId,
    is_active: true,
    is_stoplisted: isStoplisted,
    inactive_until: null,
    missingPhoto: !el.itemForm?.dataset.image,
    missingTranslation: ["name_kz", "name_en", "description_kz", "description_en"]
      .some((name) => !String(el.itemForm?.elements[name]?.value || "").trim()),
  };
}



async function requestGoogleTranslation(text, targetLanguage) {
  if (!text) return "";

  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "ru");
  url.searchParams.set("tl", targetLanguage);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Translate request failed: ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload?.[0])) return "";
  return payload[0]
    .map((part) => Array.isArray(part) ? (part[0] || "") : "")
    .join("")
    .trim();
}

async function translateRuSource(source) {
  const tasks = [];

  if (source.name_ru) {
    tasks.push(requestGoogleTranslation(source.name_ru, "en").then((value) => ["name_en", value]));
    tasks.push(requestGoogleTranslation(source.name_ru, "kk").then((value) => ["name_kz", value]));
  }

  if (source.description_ru) {
    tasks.push(requestGoogleTranslation(source.description_ru, "en").then((value) => ["description_en", value]));
    tasks.push(requestGoogleTranslation(source.description_ru, "kk").then((value) => ["description_kz", value]));
  }

  const translatedEntries = await Promise.all(tasks);
  return Object.fromEntries(translatedEntries.filter(([, value]) => value));
}

function applyTranslatedFields(translations) {
  const meta = getEditorTranslationMeta();
  let applied = false;

  ["name_en", "name_kz", "description_en", "description_kz"].forEach((field) => {
    if (!translations[field]) return;
    if (meta.manual[field]) return;
    if (!el.itemForm?.elements[field]) return;
    el.itemForm.elements[field].value = translations[field];
    applied = true;
  });

  return applied;
}

async function translateCurrentItem(options = {}) {
  const ruTitle = el.itemForm.elements.name_ru.value.trim();
  const ruDescription = el.itemForm.elements.description_ru.value.trim();
  const showToast = options.showToast !== false;

  clearPendingAutoTranslate();

  if (!ruTitle && !ruDescription) {
    if (!options.quietOnEmpty) toast("Заполните RU название или описание", "danger");
    setTranslateStatus(getAutoTranslateEnabled() ? "idle" : "off");
    return null;
  }

  const meta = getEditorTranslationMeta();
  meta.requestId += 1;
  const requestId = meta.requestId;
  setTranslateStatus("loading");

  const translationPromise = (async () => {
    try {
      const translations = await translateRuSource({
        name_ru: ruTitle,
        description_ru: ruDescription,
      });

      if (requestId !== getEditorTranslationMeta().requestId) return null;

      const changed = applyTranslatedFields(translations);
      if (changed) state.dirty = true;
      renderDishPreview();
      setTranslateStatus("success");
      if (showToast) toast("Перевод выполнен", "success");
      return translations;
    } catch (error) {
      console.warn("[exort-admin] auto-translate failed", error);
      if (requestId !== getEditorTranslationMeta().requestId) return null;
      setTranslateStatus("error");
      if (showToast) toast("Автоперевод пока недоступен. Заполните перевод вручную.", "danger");
      return null;
    }
  })();

  meta.activePromise = translationPromise.finally(() => {
    if (getEditorTranslationMeta().activePromise === translationPromise) {
      getEditorTranslationMeta().activePromise = null;
    }
  });

  return meta.activePromise;
}

async function flushPendingAutoTranslateBeforeSave() {
  const meta = getEditorTranslationMeta();

  if (meta.debounceTimer && getAutoTranslateEnabled()) {
    clearPendingAutoTranslate();
    await translateCurrentItem({ showToast: false, quietOnEmpty: true });
    return;
  }

  if (meta.activePromise) {
    try {
      await meta.activePromise;
    } catch {
      // Saving should still continue even if translation failed.
    }
  }
}

async function handleItemSubmit(event) {
  event.preventDefault();
  if (state.pendingActions.has("save-item")) return;
  const submitter = event.submitter || el.itemForm.querySelector('button[type="submit"]');
  state.pendingActions.add("save-item");
  setControlBusy(submitter, true, "Сохраняем...");

  try {
    await flushPendingAutoTranslateBeforeSave();

    const data = Object.fromEntries(new FormData(el.itemForm));
    if (!String(data.name_ru || "").trim()) {
      toast("Укажите название карточки", "danger");
      el.itemForm.elements.name_ru.focus();
      return;
    }

    const categoryId = String(data.category_id || "").trim();
    if (!categoryId) {
      toast("Выберите раздел для карточки", "danger");
      el.itemForm.elements.category_id.focus();
      return;
    }

    const existing = state.items.find((entry) => entry.id === data.id);
    const isHotelBreakfast = isHotelBreakfastSectionKey(categoryId);
    if (!isHotelBreakfast && !String(data.price || "").trim()) {
      toast("Укажите цену для карточки", "danger");
      el.itemForm.elements.price.focus();
      return;
    }

    const payload = {
      id: existing?.id || "",
      category_id: categoryId,
      name_ru: data.name_ru.trim(),
      name_kz: data.name_kz.trim(),
      name_en: data.name_en.trim(),
      description_ru: data.description_ru.trim(),
      description_kz: data.description_kz.trim(),
      description_en: data.description_en.trim(),
      price: isHotelBreakfast ? null : Number(data.price || 0),
      old_price: !isHotelBreakfast && String(data.old_price || "").trim() ? Number(data.old_price) : null,
      weight: String(data.weight || "").trim(),
      calories: String(data.calories || "").trim() ? Number(data.calories) : null,
      spice_level: String(data.spice_level || "").trim(),
      sort_order: Number(data.sort_order) || 0,
      is_active: existing ? existing.is_active : true,
      is_stoplisted: data.is_stoplisted === "true",
      inactive_until: existing?.inactive_until || null,
      image_url: el.itemForm.dataset.image || "",
      imageData: el.itemForm.dataset.pendingImage || "",
    };

    try {
      const result = await adminApi("saveItem", { item: payload });
      upsertLocalItem(result.item);
      state.dirty = false;
      toast(existing ? "Блюдо обновлено" : "Блюдо добавлено", "success");
      closeDrawer(true);
      renderAll();
      if (el.categoryDetailDialog?.open) renderCategoryDetail(result.item.category_id || categoryId);
    } catch (error) {
      toast(toFriendlyError(error.message) || "Не удалось сохранить блюдо", "danger");
    }
  } finally {
    state.pendingActions.delete("save-item");
    setControlBusy(submitter, false);
  }
}

if (el.viewTitle && viewMeta[state.activeView]) {
  el.viewTitle.textContent = viewMeta[state.activeView][0];
  el.viewKicker.textContent = viewMeta[state.activeView][1];
}

function showLoginError(message) {
  el.loginError.textContent = String(message || "").includes("Failed to fetch")
    ? "Сервис временно недоступен. Попробуйте обновить страницу или обратитесь в поддержку Exort."
    : message;
}

function togglePinVisibility() {
  el.pinInput.type = el.pinInput.type === "password" ? "text" : "password";
  el.pinVisibility.textContent = el.pinInput.type === "password" ? "Показать" : "Скрыть";
}

function toFriendlyError(message = "") {
  const text = String(message || "");
  if (/Translation backend|EXORT_TRANSLATE_API_URL|translate/i.test(text)) {
    return "Автоперевод пока недоступен. Заполните перевод вручную.";
  }
  if (/Admin API|Netlify Function|backend|Supabase|configured|env|SERVICE_ROLE|SUPABASE|API/i.test(text)) {
    return "Сервис временно недоступен. Попробуйте обновить страницу или обратитесь в поддержку Exort.";
  }
  return text;
}
function renderDishPreview() {
  if (!el.dishPreview || !el.itemForm) return;

  const item = getEditorPreviewItem();
  const previewLang = item.previewLang || "ru";
  const badges = [
    { label: item.is_stoplisted ? "Временно недоступно" : "В продаже", type: item.is_stoplisted ? "danger" : "success" },
    ...(item.missingPhoto ? [{ label: "Нет фото", type: "warning" }] : []),
    ...(item.missingTranslation ? [{ label: "Нет перевода", type: "attention" }] : []),
  ];
  const traits = [
    item.weight ? `<span class="preview-trait">${escapeHtml(item.weight)}</span>` : "",
    item.calories ? `<span class="preview-trait">${escapeHtml(`${item.calories} ккал`)}</span>` : "",
    item.spice_level ? `<span class="preview-trait preview-trait--spice">${escapeHtml(getSpiceLevelLabel(item.spice_level))}</span>` : "",
  ].filter(Boolean).join("");
  const hasOldPrice = Number(item.old_price) > 0;
  const priceBlock = shouldShowItemPrice(item) || hasOldPrice
    ? `<div class="preview-price-stack">
        ${hasOldPrice ? `<span class="preview-old-price">${escapeHtml(formatPrice(item.old_price, item.currency))}</span>` : ""}
        ${shouldShowItemPrice(item) ? `<strong>${escapeHtml(formatPrice(item.price, item.currency))}</strong>` : ""}
      </div>`
    : "";

  el.dishPreview.innerHTML = `
    <div class="preview-header">
      <div class="preview-kicker">Живое превью</div>
      <div class="preview-lang-switch" aria-label="Язык превью">
        ${["ru", "kz", "en"].map((lang) => `
          <button
            type="button"
            class="${previewLang === lang ? "is-active" : ""}"
            data-preview-lang-tab="${lang}"
          >${lang.toUpperCase()}</button>
        `).join("")}
      </div>
    </div>
    <article class="preview-dish-card ${item.is_stoplisted ? "is-muted" : ""}">
      <div class="preview-dish-visual">${visual({ image: item.image, name_ru: item.name })}</div>
      <div class="preview-dish-body">
        <span class="preview-category">${escapeHtml(categoryName(item.category_id))}</span>
        <h3>${escapeHtml(item.name)}</h3>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
        ${traits ? `<div class="preview-traits">${traits}</div>` : ""}
        <div class="dish-badge-row">${badges.map((badge) => `<span class="exort-badge exort-badge--${badge.type}">${badge.label}</span>`).join("")}</div>
        ${priceBlock}
      </div>
    </article>
  `;
}

function openItemDrawer(id = "") {
  const item = state.items.find((entry) => entry.id === id);
  el.itemForm.reset();
  el.itemForm.classList.remove("is-preview-open");
  el.itemForm.dataset.editorLanguage = "ru";
  el.itemForm.dataset.sortMode = item ? "manual" : "auto";
  el.itemForm.elements.id.value = item?.id || "";
  el.itemForm.elements.name_ru.value = item?.name_ru || "";
  el.itemForm.elements.name_kz.value = item?.name_kz || "";
  el.itemForm.elements.name_en.value = item?.name_en || "";
  el.itemForm.elements.description_ru.value = item?.description_ru || "";
  el.itemForm.elements.description_kz.value = item?.description_kz || "";
  el.itemForm.elements.description_en.value = item?.description_en || "";
  el.itemForm.elements.price.value = isHotelBreakfastItem(item) ? "" : item?.price || "";
  if (el.itemForm.elements.old_price) el.itemForm.elements.old_price.value = isHotelBreakfastItem(item) ? "" : item?.old_price || "";
  if (el.itemForm.elements.weight) el.itemForm.elements.weight.value = item?.weight || "";
  if (el.itemForm.elements.calories) el.itemForm.elements.calories.value = item?.calories || "";
  if (el.itemForm.elements.spice_level) el.itemForm.elements.spice_level.value = item?.spice_level || "";
  el.itemForm.elements.category_id.value = item?.category_id || "";
  el.itemForm.elements.sort_order.value = item ? item.sort_order || 0 : "";
  syncSortOrderForSelectedCategory(true);
  updateItemPriceFieldsForCategory();
  el.itemForm.dataset.image = item?.image || "";
  delete el.itemForm.dataset.pendingImage;
  renderEditorImage(item?.image || "");
  setEditorStatus(item?.is_stoplisted === true);
  setEditorLanguage("ru");
  resetEditorTranslationMeta();
  const extraDetails = document.querySelector("[data-extra-details]");
  if (extraDetails) extraDetails.open = false;
  const previewButton = document.querySelector("[data-toggle-preview]");
  if (previewButton) previewButton.textContent = "Показать превью";
  el.drawerTitle.textContent = item ? "Редактирование блюда" : "Новое блюдо";
  el.deleteItem.hidden = !item;
  el.drawer.setAttribute("aria-hidden", "false");
  state.dirty = false;
  renderDishPreview();
}

