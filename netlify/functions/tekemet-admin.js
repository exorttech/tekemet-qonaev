const { webcrypto } = require("crypto");
const webCrypto = globalThis.crypto || webcrypto;
const btoa = globalThis.btoa || ((value) => Buffer.from(value, "binary").toString("base64"));
const atob = globalThis.atob || ((value) => Buffer.from(value, "base64").toString("binary"));

const BUCKET = "site-assets";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const DEFAULT_RESTAURANT_SLUG = "tekemet-qonaev";
const DEFAULT_RESTAURANT_TIME_ZONE = "Asia/Almaty";
const DEFAULT_SECTION_ORDER = ["hotel-breakfasts", "breakfast", "salads", "appetizers", "mains", "sides", "drinks"];
const SECTION_LABELS_RU = {
  "hotel-breakfasts": "Завтраки Отеля",
  breakfast: "Завтраки",
  salads: "Салаты",
  appetizers: "Закуски",
  mains: "Основные блюда",
  sides: "Гарниры",
  drinks: "Напитки",
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

exports.handler = async (event) => {
  const request = new Request("https://tekemet.local/.netlify/functions/tekemet-admin", {
    method: event.httpMethod || "GET",
    headers: event.headers || {},
    body: event.body && event.httpMethod !== "GET" && event.httpMethod !== "HEAD"
      ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body)
      : undefined,
  });
  const response = await handleRequest(request, process.env);
  const body = await response.text();
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  };
};

async function handleRequest(request, env) {
    if (request.method === "OPTIONS") {
      return jsonResponse(204, null);
    }

    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    const configError = getConfigError(env);
    if (action === "health" || action === "check") {
      return jsonResponse(200, {
        ok: !configError,
        configured: !configError,
        service: "exort-admin",
        error: configError || "",
      });
    }

    if (configError) {
      return jsonResponse(500, { error: configError });
    }

    try {
      const restaurantSlug = sanitizeSlug(body.restaurantSlug || DEFAULT_RESTAURANT_SLUG);

      if (action === "login") {
        return await login(env, restaurantSlug, body.pin);
      }

      if (action === "getPublicContent") {
        return await getPublicContent(env, body.contentType || "menu");
      }

      if (action === "trackAnalyticsEvent") {
        return await trackAnalyticsEvent(env, restaurantSlug, body);
      }

      const session = await verifySession(env, body.sessionToken, restaurantSlug);
      if (!session) {
        return jsonResponse(401, { error: "Admin session expired. Sign in again." });
      }

      if (action === "getData") return getData(env, restaurantSlug);
      if (action === "translate" || action === "translateMissing") return translate(env, action, body, restaurantSlug);
      if (action === "saveItem") return saveItem(env, restaurantSlug, body.item);
      if (action === "deleteItem") return deleteItem(env, restaurantSlug, body.itemId);
      if (action === "toggleStock") return toggleStock(env, restaurantSlug, body.itemId, body.is_stoplisted);
      if (action === "uploadItemPhoto") return uploadItemPhoto(env, restaurantSlug, body.itemId, body.imageData);
      if (action === "saveCategory") return saveCategory(env, restaurantSlug, body.category);
      if (action === "sortCategories") return sortCategories(env, restaurantSlug, body.categories || []);
      if (action === "getAnalytics") return getAnalytics(env, restaurantSlug, body.range || "today");
      if (action === "deleteCategory") return deleteCategory(env, restaurantSlug, body.categoryId);
      if (action === "sortItems") return sortItems(env, restaurantSlug, body.items || []);

      return jsonResponse(400, { error: "Unknown Exort admin action." });
    } catch (error) {
      console.error("[tekemet-admin-function]", error);
      return jsonResponse(500, { error: error?.message || "Unexpected admin backend error." });
    }
}

async function login(env, slug, pin) {
  const valid = await verifyPin(env, pin, "");
  if (!valid) return jsonResponse(401, { error: "Invalid PIN." });

  const token = await signSession(env, {
    slug,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });

  const data = await buildAdminData(env, slug);
  return jsonResponse(200, { sessionToken: token, ...data });
}

async function getData(env, slug) {
  return jsonResponse(200, await buildAdminData(env, slug));
}

async function getPublicContent(env, contentType) {
  const normalizedType = clean(contentType) || "menu";
  const items = await supabaseRest(env, "content_items", {
    query: {
      select: "*",
      content_type: `eq.${normalizedType}`,
      is_active: "eq.true",
      order: "sort_order.asc",
    },
  });

  return jsonResponse(200, { items });
}

async function buildAdminData(env, slug) {
  const contentItems = await getMenuContentItems(env);
  const categories = buildContentCategories(contentItems);
  const items = contentItems.map(mapContentItemToAdminItem);

  return { restaurant: getVirtualRestaurant(slug), categories, items };
}

async function saveItem(env, slug, item) {
  if (!item || !String(item.name_ru || "").trim()) throw new Error("RU dish name is required.");

  const current = item.id ? await getContentItem(env, item.id) : null;
  let imageData = {};

  if (item.imageData && String(item.imageData).startsWith("data:image/")) {
    imageData = await uploadImage(
      env,
      slug,
      `menu-items/${slugify(item.name_ru || item.content_key || "dish")}-${Date.now()}.webp`,
      item.imageData,
    );
  } else if (item.image_url === "") {
    imageData = { image_url: "", image_path: "" };
  }

  const sectionKey = sanitizeSectionKey(item.category_id || item.section_key || current?.section_key || "mains");
  const contentKey = current?.content_key || item.content_key || buildContentKey(sectionKey, item.name_ru);
  const payload = {
    content_type: "menu",
    section_key: sectionKey,
    content_key: contentKey,
    title_ru: clean(item.name_ru),
    title_kk: clean(item.name_kz),
    title_en: clean(item.name_en),
    description_ru: clean(item.description_ru),
    description_kk: clean(item.description_kz),
    description_en: clean(item.description_en),
    price: Number(item.price || 0),
    currency: item.currency || "KZT",
    is_active: item.is_stoplisted === true ? false : item.is_active !== false,
    inactive_until: item.inactive_until || null,
    sort_order: Number(item.sort_order || 0),
    ...imageData,
  };

  const rows = await supabaseRest(env, "content_items", {
    method: current ? "PATCH" : "POST",
    query: current
      ? { id: `eq.${item.id}`, content_type: "eq.menu", select: "*" }
      : { select: "*" },
    body: current ? payload : [payload],
    prefer: "return=representation",
  });

  return jsonResponse(200, { item: mapContentItemToAdminItem(Array.isArray(rows) ? rows[0] : rows) });
}

async function deleteItem(env, slug, itemId) {
  await getContentItem(env, itemId);
  await supabaseRest(env, "content_items", {
    method: "PATCH",
    query: { id: `eq.${itemId}`, content_type: "eq.menu" },
    body: { is_active: false, inactive_until: null },
  });
  return jsonResponse(200, { ok: true });
}

async function toggleStock(env, slug, itemId, isStoplisted) {
  await getContentItem(env, itemId);
  const rows = await supabaseRest(env, "content_items", {
    method: "PATCH",
    query: { id: `eq.${itemId}`, content_type: "eq.menu", select: "*" },
    body: {
      is_active: isStoplisted === true ? false : true,
      inactive_until: null,
    },
    prefer: "return=representation",
  });
  return jsonResponse(200, { item: mapContentItemToAdminItem(rows[0]) });
}

async function uploadItemPhoto(env, slug, itemId, imageData) {
  const current = await getContentItem(env, itemId);
  const image = await uploadImage(
    env,
    slug,
    `menu-items/${slugify(current.content_key || current.title_ru || "dish")}-${Date.now()}.webp`,
    imageData,
  );

  const rows = await supabaseRest(env, "content_items", {
    method: "PATCH",
    query: { id: `eq.${itemId}`, content_type: "eq.menu", select: "*" },
    body: image,
    prefer: "return=representation",
  });
  return jsonResponse(200, { item: mapContentItemToAdminItem(rows[0]) });
}

async function saveCategory(env, slug, category) {
  if (!category || !String(category.name_ru || category.name || "").trim()) {
    throw new Error("RU category name is required.");
  }

  return jsonResponse(200, { category: normalizeVirtualCategory(category) });
}

async function deleteCategory(env, slug, categoryId) {
  const sectionKey = sanitizeSectionKey(categoryId);
  await supabaseRest(env, "content_items", {
    method: "PATCH",
    query: { content_type: "eq.menu", section_key: `eq.${sectionKey}` },
    body: { is_active: false, inactive_until: null },
  });
  return getData(env, slug);
}

async function sortItems(env, slug, items) {
  for (const item of items) {
    if (!item.id) continue;
    const sectionKey = item.category_id ? sanitizeSectionKey(item.category_id) : "";
    await supabaseRest(env, "content_items", {
      method: "PATCH",
      query: { id: `eq.${item.id}`, content_type: "eq.menu" },
      body: { sort_order: Number(item.sort_order || 0), ...(sectionKey ? { section_key: sectionKey } : {}) },
    });
  }
  return getData(env, slug);
}

async function sortCategories(env, slug, categories) {
  return getData(env, slug);
}

async function translate(env, action, body, slug) {
  if (action === "translateMissing") {
    const ids = Array.isArray(body.itemIds) ? body.itemIds.map((id) => clean(id)).filter(Boolean) : [];
    if (!ids.length) return jsonResponse(200, { items: [] });

    const updatedItems = [];
    for (const id of ids) {
      const item = await getContentItem(env, id);
      const updates = await buildMissingTranslationUpdates(item);
      if (!Object.keys(updates).length) {
        updatedItems.push(mapContentItemToAdminItem(item));
        continue;
      }

      const rows = await supabaseRest(env, "content_items", {
        method: "PATCH",
        query: { id: `eq.${id}`, content_type: "eq.menu", select: "*" },
        body: updates,
        prefer: "return=representation",
      });
      updatedItems.push(mapContentItemToAdminItem(rows[0]));
    }

    return jsonResponse(200, { items: updatedItems });
  }

  const translations = await translateRuPayload({
    name_ru: body.name_ru,
    description_ru: body.description_ru,
    text: body.text,
  });

  return jsonResponse(200, translations);
}

async function trackAnalyticsEvent(env, slug, body) {
  return jsonResponse(200, { ok: true, tracked: false });
}

async function getAnalytics(env, slug, range = "today") {
  const timeZone = DEFAULT_RESTAURANT_TIME_ZONE;
  const todayKey = formatDateKeyInTimeZone(new Date(), timeZone);
  const last7StartKey = shiftDateKey(todayKey, -6);
  const last30StartKey = shiftDateKey(todayKey, -29);

  return jsonResponse(200, {
    ok: true,
    analytics: {
      menuVisits: { today: 0, yesterday: 0, last7Days: 0, last30Days: 0, year: 0, allTime: 0 },
      uniqueGuests: { today: 0, last7Days: 0, last30Days: 0, year: 0, allTime: 0 },
      dishOpens: { today: 0, last7Days: 0, last30Days: 0, year: 0, allTime: 0 },
      averageViewTime: null,
      popularDishes: [],
      popularDishesToday: [],
      visitsByHour: buildVisitsByHour([], timeZone),
      visitsByDay: buildVisitsByDay([], last7StartKey, todayKey, timeZone),
      visitsByWeek: buildVisitsByWeek([], last30StartKey, todayKey, timeZone),
      visitsByMonth: buildVisitsByMonth([], Number(todayKey.slice(0, 4)), timeZone),
      dayDetails: buildDayDetails([], last30StartKey, todayKey, timeZone),
      allTimeSummary: buildAllTimeSummary([], timeZone),
      languages: [],
      devices: [],
      recentEvents: [],
      timeZone,
      range,
    },
  });
}
async function getMenuContentItems(env) {
  return supabaseRest(env, "content_items", {
    query: {
      select: "*",
      content_type: "eq.menu",
      order: "sort_order.asc",
    },
  });
}

async function getContentItem(env, id) {
  const rows = await supabaseRest(env, "content_items", {
    query: {
      select: "*",
      content_type: "eq.menu",
      id: `eq.${id}`,
      limit: "1",
    },
  });

  if (!rows[0]) throw new Error("Menu item was not found.");
  return rows[0];
}

function getVirtualRestaurant(slug) {
  return {
    id: slug,
    slug,
    name: "Tekemet Qonaev",
    city: "Qonaev",
    timezone: DEFAULT_RESTAURANT_TIME_ZONE,
    brand: "#2563eb",
    is_active: true,
  };
}

function mapContentItemToAdminItem(item) {
  const isTemporarilyInactive = Boolean(item.inactive_until && new Date(item.inactive_until).getTime() > Date.now());
  const isStoplisted = item.is_active === false || isTemporarilyInactive;
  return {
    ...item,
    category_id: sanitizeSectionKey(item.section_key || "mains"),
    name_ru: item.title_ru || "",
    name_kz: item.title_kk || "",
    name_en: item.title_en || "",
    description_ru: item.description_ru || "",
    description_kz: item.description_kk || "",
    description_en: item.description_en || "",
    currency: item.currency || "KZT",
    image_url: item.image_url || "",
    image_path: item.image_path || "",
    is_active: item.is_active !== false,
    is_stoplisted: isStoplisted,
    inactive_until: item.inactive_until || "",
    sort_order: Number(item.sort_order || 0),
    version: Number(item.version || 1),
  };
}

function buildContentCategories(items) {
  const seen = new Set(items.map((item) => sanitizeSectionKey(item.section_key || "mains")));
  DEFAULT_SECTION_ORDER.forEach((section) => seen.add(section));
  return Array.from(seen)
    .map((sectionKey) => ({
      id: sectionKey,
      section_key: sectionKey,
      name_ru: SECTION_LABELS_RU[sectionKey] || titleizeSection(sectionKey),
      name_kz: "",
      name_en: "",
      title_ru: SECTION_LABELS_RU[sectionKey] || titleizeSection(sectionKey),
      title_kk: "",
      title_en: "",
      sort_order: getSectionSort(sectionKey),
      is_active: true,
    }))
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));
}

function normalizeVirtualCategory(category) {
  const id = sanitizeSectionKey(category.id || category.section_key || category.name_ru || category.name || "section");
  const name = clean(category.name_ru || category.name || SECTION_LABELS_RU[id] || titleizeSection(id));
  return {
    id,
    section_key: id,
    name_ru: name,
    name_kz: clean(category.name_kz),
    name_en: clean(category.name_en),
    title_ru: name,
    title_kk: clean(category.name_kz),
    title_en: clean(category.name_en),
    sort_order: Number(category.sort_order || category.sort || getSectionSort(id)),
    is_active: category.is_active !== false && category.active !== false,
  };
}

function sanitizeSectionKey(value) {
  return slugify(value || "mains") || "mains";
}

function buildContentKey(sectionKey, title) {
  const slug = slugify(title || "");
  return slug ? `${sectionKey}-${slug}` : `menu-${sectionKey}-${Date.now()}`;
}

function getSectionSort(sectionKey) {
  const index = DEFAULT_SECTION_ORDER.indexOf(sectionKey);
  return index === -1 ? 1000 : (index + 1) * 10;
}

function titleizeSection(sectionKey) {
  return String(sectionKey || "section")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
async function uploadImage(env, slug, filename, dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image payload.");

  const bytes = base64ToBytes(match[2]);
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Image is larger than 10 MB.");

  const path = `${slug}/${filename}`;
  const upload = await fetch(`${normalizeSupabaseUrl(env)}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: createSupabaseHeaders(env, {
      "Content-Type": "image/webp",
      "x-upsert": "true",
    }),
    body: bytes,
  });

  if (!upload.ok) throw new Error(`Image upload failed: ${await upload.text()}`);

  return {
    image_url: `${normalizeSupabaseUrl(env)}/storage/v1/object/public/${BUCKET}/${path}`,
    image_path: path,
  };
}

async function googleTranslate(text, targetLanguage) {
  const source = clean(text);
  if (!source) return "";

  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "ru");
  url.searchParams.set("tl", targetLanguage);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", source);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Translate request failed: ${response.status}`);

  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload?.[0])) return "";
  return payload[0]
    .map((part) => Array.isArray(part) ? (part[0] || "") : "")
    .join("")
    .trim();
}

async function translateRuPayload(source) {
  const result = {};
  const nameRu = clean(source.name_ru || source.text);
  const descriptionRu = clean(source.description_ru);

  const jobs = [];
  if (nameRu) {
    jobs.push(googleTranslate(nameRu, "en").then((value) => { result.name_en = value; }));
    jobs.push(googleTranslate(nameRu, "kk").then((value) => { result.name_kz = value; }));
  }
  if (descriptionRu) {
    jobs.push(googleTranslate(descriptionRu, "en").then((value) => { result.description_en = value; }));
    jobs.push(googleTranslate(descriptionRu, "kk").then((value) => { result.description_kz = value; }));
  }

  await Promise.all(jobs);
  return result;
}

async function buildMissingTranslationUpdates(item) {
  const updates = {};
  const nameRu = clean(item.title_ru);
  const descriptionRu = clean(item.description_ru);

  const jobs = [];
  if (nameRu && !clean(item.title_en)) {
    jobs.push(googleTranslate(nameRu, "en").then((value) => {
      if (value) updates.title_en = value;
    }).catch(() => {}));
  }
  if (nameRu && !clean(item.title_kk)) {
    jobs.push(googleTranslate(nameRu, "kk").then((value) => {
      if (value) updates.title_kk = value;
    }).catch(() => {}));
  }
  if (descriptionRu && !clean(item.description_en)) {
    jobs.push(googleTranslate(descriptionRu, "en").then((value) => {
      if (value) updates.description_en = value;
    }).catch(() => {}));
  }
  if (descriptionRu && !clean(item.description_kk)) {
    jobs.push(googleTranslate(descriptionRu, "kk").then((value) => {
      if (value) updates.description_kk = value;
    }).catch(() => {}));
  }

  await Promise.all(jobs);
  return updates;
}

async function supabaseRest(env, table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${normalizeSupabaseUrl(env)}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

  const headers = createSupabaseHeaders(env, {
    "Content-Type": "application/json",
  });

  if (prefer) {
    assertHeaderValue("Prefer", prefer);
    headers.Prefer = prefer;
  }

  const result = await fetch(url.toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!result.ok) throw new Error(`Supabase ${table} ${method} failed: ${await result.text()}`);
  if (result.status === 204) return [];
  const text = await result.text();
  return text ? JSON.parse(text) : [];
}

function getConfigError(env) {
  const supabaseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const sessionSecret = getSessionSecret(env);

  if (!supabaseUrl) return "Exort admin backend is not configured";
  if (!isAsciiPrintable(supabaseUrl)) return "Exort admin backend is not configured";

  try {
    const parsedUrl = new URL(supabaseUrl);
    if (!["https:", "http:"].includes(parsedUrl.protocol)) {
      return "Exort admin backend is not configured";
    }
  } catch {
    return "Exort admin backend is not configured";
  }

  if (!serviceRoleKey) return "Exort admin backend is not configured";
  if (!isAsciiToken(serviceRoleKey)) {
    return "Exort admin backend is not configured";
  }

  if (!sessionSecret) return "Exort admin backend is not configured";
  if (!getAdminPin(env)) return "Exort admin backend is not configured";
  if (!isAsciiPrintable(sessionSecret)) {
    return "Exort admin backend is not configured";
  }

  return "";
}

function createSupabaseHeaders(env, extraHeaders = {}) {
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  Object.entries(extraHeaders).forEach(([name, value]) => {
    assertHeaderName(name);
    assertHeaderValue(name, value);
    headers[name] = value;
  });

  assertHeaderValue("apikey", headers.apikey);
  assertHeaderValue("Authorization", headers.Authorization);
  return headers;
}

async function verifyPin(env, pin, pinHash) {
  const value = String(pin || "");
  const stored = String(pinHash || "");
  const envPin = getAdminPin(env);
  if (value && envPin && await safeEqual(value, envPin)) return true;
  if (!value || !stored) return false;

  if (stored.startsWith("sha256:")) {
    return safeEqual(stored.slice(7), await sha256(value));
  }

  if (stored === "demo_hash_1234" && env.TEKEMET_ALLOW_LEGACY_DEMO_PIN !== "false") {
    return value === "1234";
  }

  return false;
}

async function signSession(env, payload) {
  const encoded = encodeBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signature = await hmac(env, encoded);
  return `${encoded}.${signature}`;
}

async function verifySession(env, token, slug) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) return null;
  if (!(await safeEqual(signature, await hmac(env, encoded)))) return null;

  const payload = JSON.parse(textDecoder.decode(decodeBase64Url(encoded)));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.slug !== slug) return null;
  return payload;
}

async function sha256(value) {
  const digest = await webCrypto.subtle.digest("SHA-256", textEncoder.encode(String(value)));
  return bytesToHex(new Uint8Array(digest));
}

async function hmac(env, value) {
  const key = await webCrypto.subtle.importKey(
    "raw",
    textEncoder.encode(getSessionSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await webCrypto.subtle.sign("HMAC", key, textEncoder.encode(String(value)));
  return encodeBase64Url(new Uint8Array(signature));
}

function getSessionSecret(env) {
  return String(env.TEKEMET_ADMIN_SESSION_SECRET || env.EXORT_ADMIN_SESSION_SECRET || "").trim();
}

function getAdminPin(env) {
  return String(env.TEKEMET_ADMIN_PIN || env.EXORT_ADMIN_PIN || "").trim();
}

async function safeEqual(left, right) {
  const a = textEncoder.encode(String(left));
  const b = textEncoder.encode(String(right));
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;

  for (let index = 0; index < max; index += 1) {
    diff |= (a[index] || 0) ^ (b[index] || 0);
  }

  return diff === 0;
}

function assertHeaderName(name) {
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(String(name))) {
    throw new Error(`Invalid HTTP header name: ${name}`);
  }
}

function assertHeaderValue(name, value) {
  if (!isAsciiPrintable(String(value))) {
    throw new Error(`Invalid HTTP header value for ${name}: only ASCII characters are allowed.`);
  }
}

function isAsciiToken(value) {
  return /^[\x21-\x7E]+$/.test(String(value || ""));
}

function isAsciiPrintable(value) {
  return /^[\x20-\x7E]*$/.test(String(value || ""));
}

function clean(value) {
  return String(value || "").trim();
}

function cleanLimited(value, maxLength) {
  const normalized = clean(value).replace(/[\u0000-\u001F\u007F]/g, " ");
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeEventType(value) {
  const normalized = clean(value);
  return ["menu_open", "dish_open", "language_change"].includes(normalized) ? normalized : "";
}

function normalizeDeviceType(value) {
  const normalized = clean(value).toLowerCase();
  return ["mobile", "tablet", "desktop"].includes(normalized) ? normalized : null;
}

function normalizeAnalyticsLanguage(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "kz") return "kk";
  return ["ru", "kk", "en"].includes(normalized) ? normalized : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function isDatabaseId(value) {
  const normalized = String(value || "").trim();
  return isUuid(normalized) || /^[1-9]\d*$/.test(normalized);
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getRangeStart(range, todayStart, last7Start, last30Start) {
  if (range === "today") return todayStart;
  if (range === "30d") return last30Start;
  if (range === "all") return null;
  return last7Start;
}

function normalizeAnalyticsRange(range) {
  const value = String(range || "today").toLowerCase();
  if (value === "week") return "7d";
  if (value === "month") return "30d";
  if (value === "year") return "year";
  if (value === "today" || value === "7d" || value === "30d" || value === "all") return value;
  return "today";
}

function getRangeStartKey(range, todayKey, last7StartKey, last30StartKey, yearStartKey) {
  if (range === "today") return todayKey;
  if (range === "30d") return last30StartKey;
  if (range === "year") return yearStartKey;
  if (range === "all") return null;
  return last7StartKey;
}

function isWithin(value, from, to) {
  const time = new Date(value).getTime();
  return time >= from.getTime() && time < to.getTime();
}

function isWithinDateKeys(value, fromKey, toKey, timeZone) {
  const key = formatDateKeyInTimeZone(value, timeZone);
  if (fromKey && key < fromKey) return false;
  if (toKey && key >= toKey) return false;
  return true;
}

function withAnalyticsLocalTime(event, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const parts = getTimeZoneParts(event.created_at, timeZone);
  return {
    ...event,
    localDateKey: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    localHour: parts.hour,
    localMonth: parts.month,
    localYear: parts.year,
  };
}

function isEventWithinLocalDateRange(event, fromKey, toKey) {
  const key = event.localDateKey;
  if (!key) return false;
  if (fromKey && key < fromKey) return false;
  if (toKey && key >= toKey) return false;
  return true;
}

function isEventOnOrAfterLocalDate(event, fromKey) {
  if (!fromKey) return true;
  return Boolean(event.localDateKey && event.localDateKey >= fromKey);
}

function countEventsByLocalDateRange(events, eventType, fromKey, toKey) {
  return events.filter((event) => (
    event.event_type === eventType &&
    isEventWithinLocalDateRange(event, fromKey, toKey)
  )).length;
}

function countUniqueSessionsByLocalDateRange(events, fromKey, toKey) {
  return new Set(events
    .filter((event) => (
      event.event_type === "menu_open" &&
      event.session_id &&
      isEventWithinLocalDateRange(event, fromKey, toKey)
    ))
    .map((event) => event.session_id)).size;
}

function countEvents(events, eventType, from) {
  const fromTime = from.getTime();
  return events.filter((event) => event.event_type === eventType && new Date(event.created_at).getTime() >= fromTime).length;
}

function countEventsByDateRange(events, eventType, fromKey, toKey, timeZone) {
  return events.filter((event) => (
    event.event_type === eventType &&
    isWithinDateKeys(event.created_at, fromKey, toKey, timeZone)
  )).length;
}

function countUniqueSessions(events, from) {
  const fromTime = from ? from.getTime() : 0;
  return new Set(events
    .filter((event) => event.event_type === "menu_open" && event.session_id && new Date(event.created_at).getTime() >= fromTime)
    .map((event) => event.session_id)).size;
}

function countUniqueSessionsByDateRange(events, fromKey, toKey, timeZone) {
  return new Set(events
    .filter((event) => (
      event.event_type === "menu_open" &&
      event.session_id &&
      isWithinDateKeys(event.created_at, fromKey, toKey, timeZone)
    ))
    .map((event) => event.session_id)).size;
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key];
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function buildVisitsByHour(menuOpenEvents) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 0 }));
  menuOpenEvents.forEach((event) => {
    const hour = new Date(event.created_at).getUTCHours();
    hours[hour].visits += 1;
  });
  return hours;
}

function buildVisitsByDay(events, start, todayStart) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    return {
      date: formatDateKey(date),
      label: formatWeekday(date),
      visits: events.filter((event) => event.event_type === "menu_open" && isWithin(event.created_at, date, next)).length,
      isToday: formatDateKey(date) === formatDateKey(todayStart),
    };
  });
}

function buildVisitsByWeek(events, start, todayStart) {
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    return {
      date: formatDateKey(date),
      label: formatWeekday(date),
      shortLabel: String(date.getUTCDate()).padStart(2, "0"),
      visits: events.filter((event) => event.event_type === "menu_open" && isWithin(event.created_at, date, next)).length,
      isToday: formatDateKey(date) === formatDateKey(todayStart),
    };
  });

  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push({
      weekLabel: `Неделя ${weeks.length + 1}`,
      days: days.slice(index, index + 7),
    });
  }
  return weeks;
}

function buildVisitsByMonth(events, year) {
  const labels = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  return labels.map((label, index) => {
    const start = new Date(Date.UTC(year, index, 1));
    const end = new Date(Date.UTC(year, index + 1, 1));
    return {
      month: index + 1,
      label,
      visits: events.filter((event) => event.event_type === "menu_open" && isWithin(event.created_at, start, end)).length,
    };
  });
}

function buildDayDetails(events, start, todayStart) {
  const details = {};
  Array.from({ length: 30 }, (_, index) => {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const dayEvents = events.filter((event) => event.event_type === "menu_open" && isWithin(event.created_at, date, next));
    details[formatDateKey(date)] = {
      date: formatDateKey(date),
      label: formatDateLabel(date),
      hours: buildVisitsByHour(dayEvents),
      isToday: formatDateKey(date) === formatDateKey(todayStart),
    };
  });
  return details;
}

function buildAllTimeSummary(events) {
  const menuOpenEvents = events.filter((event) => event.event_type === "menu_open");
  const dishOpenEvents = events.filter((event) => event.event_type === "dish_open");
  const monthCounts = countBy(menuOpenEvents.map((event) => ({ month: new Date(event.created_at).getUTCMonth() + 1 })), "month");
  const busiestMonthEntry = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];
  const monthLabels = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

  return {
    totalVisits: menuOpenEvents.length,
    totalUniqueGuests: new Set(menuOpenEvents.filter((event) => event.session_id).map((event) => event.session_id)).size,
    totalDishOpens: dishOpenEvents.length,
    busiestMonth: busiestMonthEntry ? monthLabels[Number(busiestMonthEntry[0]) - 1] : "Нет данных",
  };
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatWeekday(date) {
  return ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][date.getUTCDay()];
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", timeZone: "UTC" }).format(date);
}

function buildPercentRows(events, key, outputKey, format = (value) => value) {
  const counts = countBy(events.filter((event) => event[key]), key);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (!total) return [];
  return Object.entries(counts)
    .map(([value, count]) => ({ [outputKey]: format(value), count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

function buildRecentEvents(events, dishNames) {
  return events.map((event) => {
    let label = "Открыли меню";
    if (event.event_type === "dish_open") label = `Открыли карточку ${dishNames[event.menu_item_id] || "блюда"}`;
    if (event.event_type === "language_change") label = `Сменили язык на ${String(event.language || "").toUpperCase() || "другой"}`;
    return {
      type: event.event_type,
      label,
      createdAt: event.created_at,
    };
  });
}

function buildVisitsByHour(menuOpenEvents, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 0 }));
  menuOpenEvents.forEach((event) => {
    const hour = Number.isInteger(event.localHour) ? event.localHour : getTimeZoneParts(event.created_at, timeZone).hour;
    hours[hour].visits += 1;
  });
  return hours;
}

function buildVisitsByDay(events, startKey, todayKey, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = shiftDateKey(startKey, index);
    const nextKey = shiftDateKey(dateKey, 1);
    return {
      date: dateKey,
      label: formatWeekdayFromDateKey(dateKey),
      fullLabel: formatDateLabelFromDateKey(dateKey),
      visits: countEventsByLocalDateRange(events, "menu_open", dateKey, nextKey),
      isToday: dateKey === todayKey,
    };
  });
}

function buildVisitsByWeek(events, startKey, todayKey, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const days = Array.from({ length: 30 }, (_, index) => {
    const dateKey = shiftDateKey(startKey, index);
    const nextKey = shiftDateKey(dateKey, 1);
    return {
      date: dateKey,
      label: formatWeekdayFromDateKey(dateKey),
      fullLabel: formatDateLabelFromDateKey(dateKey),
      shortLabel: dateKey.slice(8, 10),
      visits: countEventsByLocalDateRange(events, "menu_open", dateKey, nextKey),
      isToday: dateKey === todayKey,
    };
  });

  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push({
      weekLabel: `Неделя ${weeks.length + 1}`,
      days: days.slice(index, index + 7),
    });
  }
  return weeks;
}

function buildVisitsByMonth(events, year, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const labels = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  return labels.map((label, index) => {
    const startKey = `${year}-${String(index + 1).padStart(2, "0")}-01`;
    const endKey = index === 11 ? `${year + 1}-01-01` : `${year}-${String(index + 2).padStart(2, "0")}-01`;
    return {
      month: index + 1,
      label,
      visits: countEventsByLocalDateRange(events, "menu_open", startKey, endKey),
    };
  });
}

function buildDayDetails(events, startKey, todayKey, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const details = {};
  Array.from({ length: 30 }, (_, index) => {
    const dateKey = shiftDateKey(startKey, index);
    const nextKey = shiftDateKey(dateKey, 1);
    const dayEvents = events.filter((event) => (
      event.event_type === "menu_open" &&
      isEventWithinLocalDateRange(event, dateKey, nextKey)
    ));
    details[dateKey] = {
      date: dateKey,
      label: formatDateLabelFromDateKey(dateKey),
      hours: buildVisitsByHour(dayEvents, timeZone),
      isToday: dateKey === todayKey,
    };
  });
  return details;
}

function buildAllTimeSummary(events, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const menuOpenEvents = events.filter((event) => event.event_type === "menu_open");
  const dishOpenEvents = events.filter((event) => event.event_type === "dish_open");
  const monthCounts = countBy(menuOpenEvents.map((event) => ({ month: getTimeZoneParts(event.created_at, timeZone).month })), "month");
  const busiestMonthEntry = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];
  const monthLabels = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

  return {
    totalVisits: menuOpenEvents.length,
    totalUniqueGuests: new Set(menuOpenEvents.filter((event) => event.session_id).map((event) => event.session_id)).size,
    totalDishOpens: dishOpenEvents.length,
    busiestMonth: busiestMonthEntry ? monthLabels[Number(busiestMonthEntry[0]) - 1] : "Нет данных",
  };
}

function buildRecentEvents(events, dishNames, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  return events.map((event) => {
    let label = "Открыли меню";
    if (event.event_type === "dish_open") label = `Открыли карточку ${dishNames[event.menu_item_id] || "блюда"}`;
    if (event.event_type === "language_change") label = `Сменили язык на ${String(event.language || "").toUpperCase() || "другой"}`;
    return {
      type: event.event_type,
      label,
      createdAt: event.created_at,
      displayTime: formatTimeInTimeZone(event.created_at, timeZone),
    };
  });
}

function getTimeZoneParts(value, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function formatDateKeyInTimeZone(value, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const parts = getTimeZoneParts(value, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function shiftDateKey(dateKey, offsetDays) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return date.toISOString().slice(0, 10);
}

function dateKeyToUtcDate(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatWeekdayFromDateKey(dateKey) {
  const date = dateKeyToUtcDate(dateKey);
  return ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][date.getUTCDay()];
}

function formatDateLabelFromDateKey(dateKey) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", timeZone: "UTC" }).format(dateKeyToUtcDate(dateKey));
}

function formatTimeInTimeZone(value, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function cleanOrNull(value) {
  const normalized = clean(value);
  return normalized || null;
}

function cleanIntegerOrNull(value) {
  const normalized = clean(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `item-${Date.now()}`;
}

function sanitizeSlug(value) {
  return String(value || DEFAULT_RESTAURANT_SLUG).toLowerCase().replace(/[^a-z0-9-]/g, "") || DEFAULT_RESTAURANT_SLUG;
}

function normalizeSupabaseUrl(env) {
  return String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(status, body) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: corsHeaders(),
  });
}


