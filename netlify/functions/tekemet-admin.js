const { webcrypto } = require("crypto");
const { getAnalyticsV2 } = require("./tekemet-analytics");
const webCrypto = globalThis.crypto || webcrypto;
const btoa = globalThis.btoa || ((value) => Buffer.from(value, "binary").toString("base64"));
const atob = globalThis.atob || ((value) => Buffer.from(value, "base64").toString("binary"));

const BUCKET = "site-assets";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const ADMIN_NOT_CONFIGURED = "Tekemet admin backend is not configured";
const DEFAULT_RESTAURANT_SLUG = "tekemet-qonaev";
const DEFAULT_RESTAURANT_TIME_ZONE = "Asia/Almaty";
const DEFAULT_SECTION_ORDER = ["hotel-breakfasts", "breakfast", "salads", "appetizers", "mains", "sides", "drinks"];
const SECTION_LABELS_RU = {
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
        service: "tekemet-admin",
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

      if (action === "getData") return await getData(env, restaurantSlug);
      if (action === "translate" || action === "translateMissing") return await translate(env, action, body, restaurantSlug);
      if (action === "saveItem") return await saveItem(env, restaurantSlug, body.item);
      if (action === "deleteItem") return await deleteItem(env, restaurantSlug, body.itemId);
      if (action === "toggleStock") return await toggleStock(env, restaurantSlug, body.itemId, body.is_stoplisted);
      if (action === "uploadItemPhoto") return await uploadItemPhoto(env, restaurantSlug, body.itemId, body.imageData);
      if (action === "uploadMenuHeroPhoto") return await uploadMenuHeroPhoto(env, restaurantSlug, body.imageData);
      if (action === "saveCategory") return await saveCategory(env, restaurantSlug, body.category);
      if (action === "splitCategory") return await splitCategory(env, restaurantSlug, body.split || body);
      if (action === "sortCategories") return await sortCategories(env, restaurantSlug, body.categories || []);
      if (action === "getAnalytics") return await getAnalyticsV2(env, restaurantSlug, body);
      if (action === "getQrSources") return await getQrSources(env, restaurantSlug);
      if (action === "createQrSource") return await createQrSource(env, restaurantSlug, body);
      if (action === "deleteQrSource") return await deleteQrSource(env, restaurantSlug, body.sourceId);
      if (action === "deleteCategory") return await deleteCategory(env, restaurantSlug, body.categoryId, body.mode, body.targetCategoryId);
      if (action === "sortItems") return await sortItems(env, restaurantSlug, body.items || []);

      return jsonResponse(400, { error: "Unknown Tekemet admin action." });
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

  return jsonResponse(200, {
    items: items.filter((item) => !isMenuHeroContentItem(item) && !isCategoryArchiveContentItem(item)),
    menuHero: items.find(isMenuHeroContentItem) || null,
  });
}

async function buildAdminData(env, slug) {
  const [contentItems, categoryMeta] = await Promise.all([getMenuContentItems(env), getMenuCategoryMeta(env)]);
  const archivedSections = getArchivedCategoryKeys(contentItems);
  const menuHero = contentItems.find(isMenuHeroContentItem) || null;
  const dishItems = contentItems.filter((item) => !isMenuHeroContentItem(item) && !isCategoryArchiveContentItem(item));
  const categories = mergeCategoryMeta(buildContentCategories(dishItems, archivedSections), categoryMeta, archivedSections);
  const items = dishItems.map(mapContentItemToAdminItem);

  return {
    restaurant: getVirtualRestaurant(slug),
    categories,
    items,
    menuHero: menuHero ? mapContentItemToAdminItem(menuHero) : null,
  };
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

  const rawSectionKey = clean(item.category_id || item.section_key || current?.section_key || "");
  if (!rawSectionKey) throw new Error("Выберите раздел для карточки");
  const sectionKey = sanitizeSectionKey(rawSectionKey);
  const isHotelBreakfast = isHotelBreakfastSectionKey(sectionKey);
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
    price: isHotelBreakfast ? null : Number(item.price || 0),
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
  const current = await getContentItem(env, itemId);
  if (isMenuHeroContentItem(current)) {
    throw new Error("Главное фото меню нельзя удалить как блюдо.");
  }

  const rows = await supabaseRest(env, "content_items", {
    method: "DELETE",
    query: { id: `eq.${itemId}`, content_type: "eq.menu", select: "id" },
    prefer: "return=representation",
  });

  const deletedId = rows[0]?.id ? String(rows[0].id) : "";
  if (deletedId !== String(itemId)) {
    throw new Error("Блюдо не было удалено из базы данных.");
  }

  return jsonResponse(200, { ok: true, deletedItemId: deletedId });
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

async function uploadMenuHeroPhoto(env, slug, imageData) {
  const current = await getMenuHeroContentItem(env);
  const image = await uploadImage(
    env,
    slug,
    `menu-hero/menu-hero-${Date.now()}.webp`,
    imageData,
  );

  const payload = {
    content_type: "menu",
    section_key: current?.section_key || "hero",
    content_key: current?.content_key || "menu_hero",
    title_ru: current?.title_ru || "Menu hero",
    title_kk: current?.title_kk || "",
    title_en: current?.title_en || "",
    description_ru: current?.description_ru || "",
    description_kk: current?.description_kk || "",
    description_en: current?.description_en || "",
    currency: current?.currency || "KZT",
    is_active: true,
    sort_order: Number(current?.sort_order || 0),
    ...image,
  };

  const rows = await supabaseRest(env, "content_items", {
    method: current ? "PATCH" : "POST",
    query: current
      ? { id: `eq.${current.id}`, content_type: "eq.menu", select: "*" }
      : { select: "*" },
    body: current ? payload : [payload],
    prefer: "return=representation",
  });

  return jsonResponse(200, { menuHero: mapContentItemToAdminItem(Array.isArray(rows) ? rows[0] : rows) });
}

async function saveCategory(env, slug, category) {
  if (!category || !String(category.name_ru || category.name || "").trim() || !clean(category.name_kz) || !clean(category.name_en)) {
    throw new Error("Названия категории на русском, казахском и английском обязательны.");
  }

  const normalizedCategory = normalizeVirtualCategory(category);
  await unarchiveCategoryKey(env, normalizedCategory.section_key);
  await upsertMenuCategoryMeta(env, normalizedCategory);
  return jsonResponse(200, { category: normalizedCategory });
}

async function deleteCategory(env, slug, categoryId, mode = "", targetCategoryId = "") {
  const sectionKey = sanitizeSectionKey(categoryId);
  const targetKey = clean(targetCategoryId) ? sanitizeSectionKey(targetCategoryId) : "";
  const allItems = (await getMenuContentItems(env)).filter((item) => !isMenuHeroContentItem(item) && !isCategoryArchiveContentItem(item));
  const sourceItems = allItems.filter((item) => sanitizeSectionKey(item.section_key || "") === sectionKey);

  if (sourceItems.length) {
    if (mode === "move") {
      if (!targetKey) throw new Error("Выберите раздел для переноса блюд.");
      if (targetKey === sectionKey) throw new Error("Выберите другой раздел для переноса блюд.");
      await moveCategoryItems(env, sourceItems, targetKey);
    } else if (mode === "cascade") {
      for (const item of sourceItems) {
        await supabaseRest(env, "content_items", {
          method: "DELETE",
          query: { id: `eq.${item.id}`, content_type: "eq.menu" },
          prefer: "return=minimal",
        });
      }
    } else {
      throw new Error("Выберите безопасный способ удаления блюд.");
    }
  }

  await archiveCategoryKey(env, sectionKey);
  await deleteMenuCategoryMeta(env, sectionKey);
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
  const current = await buildAdminData(env, slug);
  for (const entry of categories || []) {
    const existing = current.categories.find((category) => category.id === sanitizeSectionKey(entry.id));
    if (!existing) continue;
    await upsertMenuCategoryMeta(env, normalizeVirtualCategory({
      ...existing,
      sort_order: Number(entry.sort_order || existing.sort_order || existing.sort || 0),
    }));
  }
  return getData(env, slug);
}

async function splitCategory(env, slug, split) {
  const rawSourceKey = clean(split?.categoryId || split?.sourceCategoryId || split?.sourceSectionKey || split?.source_key || "");
  if (!rawSourceKey) throw new Error("Выберите исходный раздел.");
  const sourceKey = sanitizeSectionKey(rawSourceKey);

  const allItems = (await getMenuContentItems(env)).filter((item) => !isMenuHeroContentItem(item) && !isCategoryArchiveContentItem(item));
  const sourceItems = allItems.filter((item) => sanitizeSectionKey(item.section_key || "") === sourceKey);
  if (!sourceItems.length) {
    throw new Error("В исходном разделе нет блюд для переноса.");
  }

  const category = split?.category || {};
  const nameRu = clean(category.name_ru);
  const nameKz = clean(category.name_kz);
  const nameEn = clean(category.name_en);
  if (!nameRu || !nameKz || !nameEn) throw new Error("Заполните название нового раздела на всех трёх языках.");

  const selectedIds = [...new Set((split?.itemIds || split?.item_ids || []).map((value) => String(value)))];
  const sourceIds = new Set(sourceItems.map((item) => String(item.id)));
  if (!selectedIds.length || selectedIds.some((id) => !sourceIds.has(id))) throw new Error("Выберите блюда из исходного раздела.");
  if (selectedIds.length >= sourceItems.length) throw new Error("Исходный раздел должен остаться непустым.");

  const usedKeys = new Set(allItems.map((item) => sanitizeSectionKey(item.section_key || "")).filter(Boolean));
  const targetKey = makeUniqueSectionKey(nameRu, usedKeys, sourceKey);
  await unarchiveCategoryKey(env, targetKey);
  await upsertMenuCategoryMeta(env, normalizeVirtualCategory({
    id: targetKey,
    name_ru: nameRu,
    name_kz: nameKz,
    name_en: nameEn,
    sort_order: Math.max(...(await buildAdminData(env, slug)).categories.map((entry) => Number(entry.sort_order || entry.sort || 0)), 0) + 10,
    is_active: true,
  }));

  const originals = sourceItems.filter((item) => selectedIds.includes(String(item.id))).map((item) => ({
    id: item.id,
    section_key: item.section_key || sourceKey,
    sort_order: Number(item.sort_order || 0),
  }));
  const moved = [];

  try {
    for (const original of originals) {
      await supabaseRest(env, "content_items", {
        method: "PATCH",
        query: { id: `eq.${original.id}`, content_type: "eq.menu" },
        body: { section_key: targetKey },
        prefer: "return=minimal",
      });
      moved.push(original);
    }

    const verifyRows = await getMenuContentItems(env);
    const verifyMap = new Map(verifyRows.map((item) => [String(item.id), sanitizeSectionKey(item.section_key || "")]));
    const failed = originals.some((original) => {
      return verifyMap.get(String(original.id)) !== targetKey;
    });
    if (failed) throw new Error("Не удалось проверить перенос блюд.");

  } catch (error) {
    for (const original of moved) {
      try {
        await supabaseRest(env, "content_items", {
          method: "PATCH",
          query: { id: `eq.${original.id}`, content_type: "eq.menu" },
          body: { section_key: original.section_key, sort_order: original.sort_order },
          prefer: "return=minimal",
        });
      } catch (rollbackError) {
        console.warn("[tekemet-admin-function] split rollback failed", rollbackError?.message || rollbackError);
      }
    }
    throw new Error(error?.message || "Не удалось разделить раздел. Блюда оставлены в исходном разделе.");
  }

  return getData(env, slug);
}

async function moveCategoryItems(env, items, targetSectionKey) {
  const originals = items.map((item) => ({
    id: item.id,
    section_key: item.section_key,
    sort_order: Number(item.sort_order || 0),
  }));
  const moved = [];

  try {
    for (const original of originals) {
      await supabaseRest(env, "content_items", {
        method: "PATCH",
        query: { id: `eq.${original.id}`, content_type: "eq.menu" },
        body: { section_key: targetSectionKey },
        prefer: "return=minimal",
      });
      moved.push(original);
    }

    const verifyRows = await getMenuContentItems(env);
    const verifyMap = new Map(verifyRows.map((item) => [String(item.id), sanitizeSectionKey(item.section_key || "")]));
    if (originals.some((original) => verifyMap.get(String(original.id)) !== targetSectionKey)) {
      throw new Error("Не удалось проверить перенос блюд.");
    }
  } catch (error) {
    for (const original of moved) {
      try {
        await supabaseRest(env, "content_items", {
          method: "PATCH",
          query: { id: `eq.${original.id}`, content_type: "eq.menu" },
          body: { section_key: original.section_key, sort_order: original.sort_order },
          prefer: "return=minimal",
        });
      } catch (rollbackError) {
        console.warn("[tekemet-admin-function] category delete rollback failed", rollbackError?.message || rollbackError);
      }
    }
    throw error;
  }
}

async function archiveCategoryKey(env, sectionKey) {
  const normalizedKey = sanitizeSectionKey(sectionKey);
  const contentKey = `category_archive_${normalizedKey}`;
  const existing = await supabaseRest(env, "content_items", {
    query: {
      select: "id",
      content_type: "eq.menu",
      content_key: `eq.${contentKey}`,
      limit: "1",
    },
  });

  const payload = {
    content_type: "menu",
    section_key: "category_archive",
    content_key: contentKey,
    title_ru: normalizedKey,
    description_ru: normalizedKey,
    currency: "KZT",
    is_active: false,
    sort_order: 0,
  };

  await supabaseRest(env, "content_items", {
    method: existing[0]?.id ? "PATCH" : "POST",
    query: existing[0]?.id
      ? { id: `eq.${existing[0].id}`, content_type: "eq.menu" }
      : {},
    body: existing[0]?.id ? payload : [payload],
    prefer: "return=minimal",
  });
}

async function unarchiveCategoryKey(env, sectionKey) {
  const normalizedKey = sanitizeSectionKey(sectionKey);
  await supabaseRest(env, "content_items", {
    method: "DELETE",
    query: { content_type: "eq.menu", content_key: `eq.category_archive_${normalizedKey}` },
    prefer: "return=minimal",
  }).catch(() => {});
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
  try {
    const eventType = normalizeEventType(body.eventType);
    if (!eventType) return jsonResponse(200, { ok: true, tracked: false });
    const restaurantId = await getRestaurantId(env, slug);
    const sourcePublicId = cleanLimited(body.sourcePublicId || body.sourceId || body.source_id || body.qrId || body.qr_id || body.source || body.qrCode, 64);
    const qrSource = restaurantId && sourcePublicId
      ? await resolveQrSource(env, restaurantId, sourcePublicId).catch(() => null)
      : null;

    const rawMenuItemId = body.menuItemId || body.itemId || body.dishId || "";
    const menuItemId = ["dish_open", "dish_close", "dish_photo_open"].includes(eventType)
      ? (await resolveAnalyticsContentItemId(env, rawMenuItemId, body.contentKey || body.content_key)) || cleanLimited(rawMenuItemId, 160)
      : null;
    const tracked = await writeAnalyticsEvent(env, slug, {
      eventType,
      menuItemId,
      contentKey: cleanLimited(body.contentKey || body.content_key, 160) || "",
      dishTitle: cleanLimited(body.dishTitleRu || body.dish_title_ru || body.title_ru || body.name_ru || body.dishTitle, 240) || "",
      sectionKey: cleanLimited(body.sectionKey || body.section_key || body.categoryId || body.category_id, 120) || "",
      price: cleanLimited(body.price || body.dishPrice, 80) || "",
      currency: cleanLimited(body.currency, 16) || "",
      language: normalizeAnalyticsLanguage(body.language) || "",
      deviceType: normalizeDeviceType(body.deviceType) || "",
      sessionId: cleanLimited(body.sessionId, 120) || "",
      referrer: cleanLimited(body.referrer, 500) || "",
      userAgent: cleanLimited(body.userAgent, 500) || "",
      durationMs: normalizeAnalyticsDuration(body.durationMs),
      qrSourceId: qrSource?.id || null,
      sourceFallback: qrSource?.name || "direct",
      metadata: {
        browser: cleanLimited(body.browser, 80) || "",
        os: cleanLimited(body.os, 80) || "",
        visitorId: cleanLimited(body.visitorId, 120) || "",
        pagePath: cleanLimited(body.pagePath || body.menuPageId, 180) || "",
        pageReferrer: cleanLimited(body.referrer, 500) || "",
        dishId: cleanLimited(menuItemId, 160) || "",
        contentKey: cleanLimited(body.contentKey || body.content_key, 160) || "",
        dishTitle: cleanLimited(body.dishTitleRu || body.dish_title_ru || body.title_ru || body.name_ru || body.dishTitle, 240) || "",
        sectionKey: cleanLimited(body.sectionKey || body.section_key || body.categoryId || body.category_id, 120) || "",
        price: cleanLimited(body.price || body.dishPrice, 80) || "",
        currency: cleanLimited(body.currency, 16) || "",
      },
    });

    return jsonResponse(200, { ok: true, tracked });
  } catch (error) {
    console.warn("[tekemet-admin-function] analytics tracking skipped", error?.message || error);
    return jsonResponse(200, { ok: true, tracked: false });
  }
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

async function getQrSources(env, slug) {
  const restaurantId = await requireRestaurantId(env, slug);
  const [sources, events] = await Promise.all([
    supabaseRest(env, "qr_sources", {
      query: { select: "*", restaurant_id: `eq.${restaurantId}`, order: "created_at.desc" },
    }),
    fetchQrAnalyticsEvents(env, restaurantId),
  ]);

  const stats = new Map();
  events.forEach((event) => {
    if (!event.qr_source_id) return;
    const current = stats.get(event.qr_source_id) || { sessions: new Set(), engaged: new Set(), lastVisitAt: "" };
    if (["session_start", "menu_open"].includes(event.event_type) && event.session_id) current.sessions.add(event.session_id);
    if (event.event_type === "dish_open" && event.session_id) current.engaged.add(event.session_id);
    if (!current.lastVisitAt || event.created_at > current.lastVisitAt) current.lastVisitAt = event.created_at;
    stats.set(event.qr_source_id, current);
  });

  const directEvents = events.filter(isDirectAnalyticsEvent);
  const directSessions = new Set(directEvents
    .filter((event) => ["session_start", "menu_open"].includes(event.event_type) && event.session_id)
    .map((event) => event.session_id));
  const directLastVisit = directEvents
    .filter((event) => event.event_type === "menu_open")
    .reduce((latest, event) => !latest || event.created_at > latest ? event.created_at : latest, "");
  const directSource = {
    id: "direct",
    source_key: "direct",
    source_type: "direct",
    name: "Прямой вход",
    is_active: true,
    is_system: true,
    visits: directSessions.size,
    uniqueGuests: directSessions.size,
    engagedSessions: new Set(directEvents.filter((event) => event.event_type === "dish_open" && event.session_id).map((event) => event.session_id)).size,
    lastVisitAt: directLastVisit || null,
    url: "",
  };

  return jsonResponse(200, {
    sources: [directSource, ...sources.filter((source) => source.source_type !== "direct").map((source) => {
      const sourceStats = stats.get(source.id);
      return {
        ...source,
        visits: sourceStats?.sessions.size || 0,
        uniqueGuests: sourceStats?.sessions.size || 0,
        engagedSessions: sourceStats?.engaged.size || 0,
        lastVisitAt: sourceStats?.lastVisitAt || null,
        url: buildPublicMenuUrl(slug, source.public_id, source.menu_path),
      };
    })],
  });
}

async function fetchQrAnalyticsEvents(env, restaurantId) {
  const rows = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const page = await supabaseRest(env, "menu_analytics_events", {
      query: {
        select: "id,qr_source_id,source_fallback,event_type,session_id,created_at",
        restaurant_id: `eq.${restaurantId}`,
        order: "created_at.asc",
        limit: "1000",
        offset: String(offset),
      },
    });
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function isDirectAnalyticsEvent(event) {
  if (event.qr_source_id) return false;
  const fallback = clean(event.source_fallback).toLowerCase();
  return !fallback || ["direct", "прямой вход", "прямой переход"].includes(fallback);
}

async function createQrSource(env, slug, body) {
  const restaurantId = await requireRestaurantId(env, slug);
  const name = cleanLimited(body.name, 100);
  if (!name) throw new Error("Укажите название источника.");
  const menuPath = normalizeQrMenuPath(body.menuPath);
  const rows = await supabaseRest(env, "qr_sources", {
    method: "POST",
    query: { select: "*" },
    body: [{
      restaurant_id: restaurantId,
      name,
      public_id: createPublicSourceId(),
      source_type: normalizeQrSourceType(body.sourceType),
      menu_path: menuPath,
      is_active: true,
    }],
    prefer: "return=representation",
  });
  const source = rows[0];
  return jsonResponse(200, { source: { ...source, visits: 0, uniqueGuests: 0, engagedSessions: 0, lastVisitAt: null, url: buildPublicMenuUrl(slug, source.public_id, menuPath) } });
}

async function deleteQrSource(env, slug, sourceId) {
  if (!isUuid(sourceId)) throw new Error("Некорректный идентификатор QR-источника.");
  const restaurantId = await requireRestaurantId(env, slug);
  const rows = await supabaseRest(env, "qr_sources", {
    query: { select: "id", id: `eq.${sourceId}`, restaurant_id: `eq.${restaurantId}`, limit: "1" },
  });
  if (!rows[0]) throw new Error("QR-источник не найден.");

  await supabaseRest(env, "qr_sources", {
    method: "PATCH",
    query: { id: `eq.${sourceId}`, restaurant_id: `eq.${restaurantId}` },
    body: { is_active: false },
    prefer: "return=minimal",
  });
  await supabaseRest(env, "menu_analytics_events", {
    method: "DELETE",
    query: { restaurant_id: `eq.${restaurantId}`, qr_source_id: `eq.${sourceId}` },
    prefer: "return=minimal",
  });
  await supabaseRest(env, "qr_sources", {
    method: "DELETE",
    query: { id: `eq.${sourceId}`, restaurant_id: `eq.${restaurantId}` },
    prefer: "return=minimal",
  });
  return jsonResponse(200, { ok: true, sourceId });
}

async function requireRestaurantId(env, slug) {
  const restaurantId = await getRestaurantId(env, slug);
  if (!restaurantId) throw new Error("Ресторан Tekemet не найден. Сначала примените безопасную SQL-миграцию.");
  return restaurantId;
}

function createPublicSourceId() {
  const bytes = webCrypto.getRandomValues(new Uint8Array(12));
  return encodeBase64Url(bytes);
}

function normalizeQrSourceType(value) {
  const type = clean(value).toLowerCase();
  return ["qr", "link", "social"].includes(type) ? type : "qr";
}

function normalizeQrMenuPath(value) {
  const path = cleanLimited(value, 180) || "/menu";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/menu";
}

function buildPublicMenuUrl(slug, publicId, menuPath = "/menu") {
  const path = normalizeQrMenuPath(menuPath);
  const separator = path.includes("?") ? "&" : "?";
  return `https://tekemetqonaev.com${path}${separator}source=${encodeURIComponent(publicId)}`;
}

async function resolveQrSource(env, restaurantId, publicId) {
  const normalized = cleanLimited(publicId, 64);
  if (!normalized) return null;
  const rows = await supabaseRest(env, "qr_sources", {
    query: {
      select: "id,name,public_id,source_type,is_active",
      restaurant_id: `eq.${restaurantId}`,
      public_id: `eq.${normalized}`,
      is_active: "eq.true",
      limit: "1",
    },
  });
  return rows[0] || null;
}

async function getMenuCategoryMeta(env) {
  try {
    return await supabaseRest(env, "content_items", {
      query: {
        select: "*",
        content_type: "eq.menu_category",
        order: "sort_order.asc",
      },
    });
  } catch (error) {
    console.warn("[tekemet-admin-function] category metadata read skipped", error?.message || error);
    return [];
  }
}

function mergeCategoryMeta(categories, metadata, archivedSections) {
  const result = new Map((categories || []).map((category) => [category.id, category]));
  for (const row of metadata || []) {
    const id = sanitizeSectionKey(row.section_key || row.content_key?.replace(/^category-/, "") || "");
    if (!id || archivedSections?.has(id)) continue;
    const existing = result.get(id) || normalizeVirtualCategory({ id });
    result.set(id, normalizeVirtualCategory({
      ...existing,
      id,
      name_ru: row.title_ru || existing.name_ru,
      name_kz: row.title_kk || existing.name_kz,
      name_en: row.title_en || existing.name_en,
      sort_order: Number(row.sort_order ?? existing.sort_order ?? existing.sort ?? 0),
      is_active: row.is_active !== false,
    }));
  }
  return [...result.values()].sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0) || left.id.localeCompare(right.id));
}

async function upsertMenuCategoryMeta(env, category) {
  const sectionKey = sanitizeSectionKey(category.section_key || category.id);
  const existing = await supabaseRest(env, "content_items", {
    query: { select: "id", content_type: "eq.menu_category", section_key: `eq.${sectionKey}`, limit: "1" },
  }).catch(() => []);
  const payload = {
    content_type: "menu_category",
    content_key: `category-${sectionKey}`,
    section_key: sectionKey,
    title_ru: clean(category.name_ru || category.title_ru),
    title_kk: clean(category.name_kz || category.title_kk),
    title_en: clean(category.name_en || category.title_en),
    description_ru: "",
    description_kk: "",
    description_en: "",
    price: 0,
    currency: "KZT",
    is_active: category.is_active !== false,
    sort_order: Number(category.sort_order || category.sort || getSectionSort(sectionKey)),
  };
  await supabaseRest(env, "content_items", {
    method: existing[0] ? "PATCH" : "POST",
    query: existing[0] ? { id: `eq.${existing[0].id}` } : {},
    body: existing[0] ? payload : [payload],
    prefer: "return=minimal",
  });
}

async function deleteMenuCategoryMeta(env, sectionKey) {
  await supabaseRest(env, "content_items", {
    method: "DELETE",
    query: { content_type: "eq.menu_category", section_key: `eq.${sanitizeSectionKey(sectionKey)}` },
    prefer: "return=minimal",
  }).catch((error) => console.warn("[tekemet-admin-function] category metadata delete skipped", error?.message || error));
}

async function getMenuHeroContentItem(env) {
  const rows = await supabaseRest(env, "content_items", {
    query: {
      select: "*",
      content_type: "eq.menu",
      order: "sort_order.asc",
    },
  });

  return rows.find(isMenuHeroContentItem) || null;
}


async function writeAnalyticsEvent(env, slug, payload) {
  const restaurantId = await getRestaurantId(env, slug);
  const packedDishReferrer = packDishAnalyticsReferrer(payload);
  const menuAnalyticsPayload = {
    ...(restaurantId ? { restaurant_id: restaurantId } : {}),
    event_type: payload.eventType,
    menu_item_id: shouldUsePrimaryMenuItemId(payload.menuItemId) ? payload.menuItemId : null,
    language: payload.language || null,
    device_type: payload.deviceType || null,
    session_id: payload.sessionId || null,
    user_agent: payload.userAgent || null,
    referrer: packedDishReferrer || payload.referrer || null,
    category_id: isUuid(payload.sectionKey) ? payload.sectionKey : null,
    qr_source_id: payload.qrSourceId || null,
    source_fallback: payload.sourceFallback || "direct",
    duration_ms: payload.durationMs,
    metadata: payload.metadata || {},
  };

  try {
    await supabaseRest(env, "menu_analytics_events", {
      method: "POST",
      body: [menuAnalyticsPayload],
      prefer: "return=minimal",
    });
    return true;
  } catch (menuAnalyticsError) {
    try {
      const legacyPayload = { ...menuAnalyticsPayload };
      delete legacyPayload.category_id;
      delete legacyPayload.qr_source_id;
      delete legacyPayload.source_fallback;
      delete legacyPayload.duration_ms;
      delete legacyPayload.metadata;
      await supabaseRest(env, "menu_analytics_events", {
        method: "POST",
        body: [legacyPayload],
        prefer: "return=minimal",
      });
      return true;
    } catch (legacyAnalyticsError) {
      try {
        return await writeFallbackAnalyticsEvent(env, payload);
      } catch (contentItemsError) {
      console.warn("[tekemet-admin-function] analytics write fallback failed", {
        menuAnalyticsError: menuAnalyticsError?.message || String(menuAnalyticsError),
        legacyAnalyticsError: legacyAnalyticsError?.message || String(legacyAnalyticsError),
        contentItemsError: contentItemsError?.message || String(contentItemsError),
      });
      return false;
      }
    }
  }
}


async function getRestaurantId(env, slug) {
  try {
    const rows = await supabaseRest(env, "restaurants", {
      query: {
        select: "id",
        slug: `eq.${sanitizeSlug(slug)}`,
        limit: "1",
      },
    });
    return rows[0]?.id || null;
  } catch {
    return null;
  }
}


async function resolveAnalyticsContentItemId(env, menuItemId, contentKey = "") {
  const normalizedId = clean(menuItemId);
  const normalizedContentKey = clean(contentKey || (!isDatabaseId(normalizedId) ? normalizedId : ""));
  try {
    if (isDatabaseId(normalizedId)) {
      const rows = await supabaseRest(env, "content_items", {
        query: {
          select: "id",
          content_type: "eq.menu",
          id: `eq.${normalizedId}`,
          limit: "1",
        },
      });
      if (rows[0]?.id) return rows[0].id;
    }

    if (normalizedContentKey) {
      const rows = await supabaseRest(env, "content_items", {
        query: {
          select: "id",
          content_type: "eq.menu",
          content_key: `eq.${normalizedContentKey}`,
          limit: "1",
        },
      });
      return rows[0]?.id || null;
    }

    return null;
  } catch {
    return null;
  }
}

function shouldUsePrimaryMenuItemId(value) {
  return isUuid(clean(value));
}


function packDishAnalyticsReferrer(payload) {
  if (!payload || !["dish_open", "dish_close", "dish_photo_open"].includes(payload.eventType)) return "";
  const dishId = cleanLimited(payload.menuItemId || payload.contentKey, 160) || "";
  const contentKey = cleanLimited(payload.contentKey, 160) || "";
  const title = cleanLimited(payload.dishTitle, 240) || "";
  const section = cleanLimited(payload.sectionKey, 120) || "";
  const price = cleanLimited(payload.price, 80) || "";
  const currency = cleanLimited(payload.currency, 16) || "";
  const durationMs = cleanLimited(payload.durationMs, 40) || "";
  const referrer = cleanLimited(payload.referrer, 500) || "";
  const encoded = Buffer.from(JSON.stringify({ dishId, contentKey, title, section, price, currency, durationMs, referrer }), "utf8").toString("base64url");
  return `dish:${encoded}`;
}


async function writeFallbackAnalyticsEvent(env, payload) {
  await supabaseRest(env, "content_items", {
    method: "POST",
    body: [{
      content_type: "analytics_event",
      section_key: payload.eventType,
      content_key: `analytics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title_ru: payload.menuItemId ? String(payload.menuItemId) : payload.contentKey || "",
      title_en: payload.language || "",
      title_kk: payload.deviceType || "",
      description_ru: payload.sessionId || "",
      description_en: payload.dishTitle || payload.referrer || "",
      description_kk: payload.sectionKey || payload.userAgent || "",
      badge_ru: payload.durationMs || "",
      is_active: true,
      sort_order: Math.floor(Date.now() / 1000),
    }],
    prefer: "return=minimal",
  });
  return true;
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
  const sectionKey = sanitizeSectionKey(item.section_key || "mains");
  const isHotelBreakfast = isHotelBreakfastSectionKey(sectionKey);
  return {
    ...item,
    category_id: sectionKey,
    name_ru: item.title_ru || "",
    name_kz: item.title_kk || "",
    name_en: item.title_en || "",
    description_ru: item.description_ru || "",
    description_kz: item.description_kk || "",
    description_en: item.description_en || "",
    currency: item.currency || "KZT",
    price: isHotelBreakfast ? null : Number(item.price || 0),
    image_url: item.image_url || "",
    image_path: item.image_path || "",
    is_active: item.is_active !== false,
    is_stoplisted: isStoplisted,
    inactive_until: item.inactive_until || "",
    sort_order: Number(item.sort_order || 0),
    version: Number(item.version || 1),
  };
}

function isMenuHeroContentItem(item) {
  const contentKey = clean(item?.content_key).toLowerCase();
  const sectionKey = clean(item?.section_key).toLowerCase();
  const title = clean(item?.title_ru || item?.title_en || item?.title_kk).toLowerCase();
  return contentKey === "menu_hero"
    || contentKey === "menu-hero"
    || contentKey === "hero"
    || sectionKey === "hero"
    || title === "menu hero"
    || title === "menu_hero"
    || title === "menu-hero";
}

function isCategoryArchiveContentItem(item) {
  const contentKey = clean(item?.content_key).toLowerCase();
  const sectionKey = clean(item?.section_key).toLowerCase();
  return sectionKey === "category_archive" || contentKey.startsWith("category_archive_");
}

function getArchivedCategoryKeys(items) {
  return new Set((items || [])
    .filter(isCategoryArchiveContentItem)
    .map((item) => sanitizeSectionKey(item.description_ru || String(item.content_key || "").replace(/^category_archive_/, "")))
    .filter(Boolean));
}

function buildContentCategories(items, archivedSections = new Set()) {
  const seen = new Set(items.map((item) => sanitizeSectionKey(item.section_key || "mains")));
  DEFAULT_SECTION_ORDER.forEach((section) => seen.add(section));
  return Array.from(seen)
    .filter((sectionKey) => !archivedSections.has(sectionKey))
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
  const name = clean(
    category.name_ru ||
    category.title_ru ||
    category.label_ru ||
    category.section_title_ru ||
    category.category_title_ru ||
    category.category_name_ru ||
    SECTION_LABELS_RU[id] ||
    category.name_kk ||
    category.title_kk ||
    category.label_kk ||
    category.name_kz ||
    category.title_kz ||
    category.label_kz ||
    category.name_en ||
    category.title_en ||
    category.label_en ||
    titleizeSection(id)
  );
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


function makeUniqueSectionKey(value, usedKeys, suffix) {
  const base = sanitizeSectionKey(value || `section-${suffix}`);
  let candidate = base;
  let counter = 2;
  while (!candidate || usedKeys.has(candidate)) {
    candidate = `${base || "section"}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function sanitizeSectionKey(value) {
  return slugify(value || "mains") || "mains";
}

function isHotelBreakfastSectionKey(value) {
  const sectionKey = sanitizeSectionKey(value || "");
  return sectionKey === "hotel-breakfasts" || sectionKey === "hotel-breakfast";
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
  return String(sectionKey || "section").trim() || "section";
}
async function uploadImage(env, slug, filename, dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image payload.");
  if (match[1].toLowerCase() !== "image/webp") throw new Error("Image must be optimized to WebP before upload.");

  const bytes = base64ToBytes(match[2]);
  if (bytes.byteLength > 800 * 1024) throw new Error("Optimized image is larger than 800 KB.");
  if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46
    || bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) {
    throw new Error("Invalid WebP image payload.");
  }

  const path = `${slug}/${filename}`;
  const upload = await fetch(`${normalizeSupabaseUrl(env)}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: createSupabaseHeaders(env, {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
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

  if (!supabaseUrl) return ADMIN_NOT_CONFIGURED;
  if (!isAsciiPrintable(supabaseUrl)) return ADMIN_NOT_CONFIGURED;

  try {
    const parsedUrl = new URL(supabaseUrl);
    if (!["https:", "http:"].includes(parsedUrl.protocol)) {
      return ADMIN_NOT_CONFIGURED;
    }
  } catch {
    return ADMIN_NOT_CONFIGURED;
  }

  if (!serviceRoleKey) return ADMIN_NOT_CONFIGURED;
  if (!isAsciiToken(serviceRoleKey)) {
    return ADMIN_NOT_CONFIGURED;
  }

  if (!sessionSecret) return ADMIN_NOT_CONFIGURED;
  if (!getAdminPin(env)) return ADMIN_NOT_CONFIGURED;
  if (!isAsciiPrintable(sessionSecret)) {
    return ADMIN_NOT_CONFIGURED;
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
  // Keep legacy Netlify variable names until the production environment is migrated.
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
  return ["menu_open", "session_start", "category_view", "dish_open", "dish_close", "dish_photo_open", "search", "search_no_results", "language_change", "menu_exit"].includes(normalized) ? normalized : "";
}

function normalizeDeviceType(value) {
  const normalized = clean(value).toLowerCase();
  return ["mobile", "tablet", "desktop"].includes(normalized) ? normalized : null;
}

function normalizeAnalyticsLanguage(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "kz") return "kk";
  return ["ru", "kk", "en", "tr"].includes(normalized) ? normalized : null;
}

function normalizeAnalyticsDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return null;
  return Math.max(0, Math.min(86400000, Math.round(duration)));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function isDatabaseId(value) {
  const normalized = String(value || "").trim();
  return isUuid(normalized) || /^[1-9]\d*$/.test(normalized);
}


function transliterateCyrillic(value) {
  const map = {
    "\u0430": "a", "\u0431": "b", "\u0432": "v", "\u0433": "g", "\u0434": "d", "\u0435": "e", "\u0451": "e",
    "\u0436": "zh", "\u0437": "z", "\u0438": "i", "\u0439": "y", "\u043a": "k", "\u043b": "l", "\u043c": "m",
    "\u043d": "n", "\u043e": "o", "\u043f": "p", "\u0440": "r", "\u0441": "s", "\u0442": "t", "\u0443": "u",
    "\u0444": "f", "\u0445": "h", "\u0446": "c", "\u0447": "ch", "\u0448": "sh", "\u0449": "sch",
    "\u044b": "y", "\u044d": "e", "\u044e": "yu", "\u044f": "ya", "\u044c": "", "\u044a": "",
    "\u04d9": "a", "\u0493": "g", "\u049b": "k", "\u04a3": "n", "\u04e9": "o", "\u04b1": "u",
    "\u04af": "u", "\u04bb": "h", "\u0456": "i",
  };
  return String(value || "").replace(/[\u0400-\u04ff]/g, (char) => map[char.toLowerCase()] ?? "");
}

function slugify(value) {
  return transliterateCyrillic(value || "item")
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


