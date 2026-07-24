(function () {
    const MENU_TABLE = 'content_items';
    const STORAGE_BUCKET = 'site-assets';
    const MENU_TYPE = 'menu';
    const ROOM_TYPE = 'room';
    const RESTAURANT_SLUG = 'tekemet-qonaev';
    const locale = (document.documentElement.lang || 'ru').toLowerCase();
    const pageKind = document.body.classList.contains('menu-page') ? MENU_TYPE : ROOM_TYPE;
    const DEFAULT_ADMIN_FUNCTION_URL = '/api/tekemet-admin';
    const LOCAL_ADMIN_FUNCTION_URL = 'https://tekemet-qonaev.pages.dev/api/tekemet-admin';

    function getAdminFunctionUrl() {
        const configured = window.TEKEMET_ADMIN_API_URL
            || localStorage.getItem('tekemet.admin.apiUrl')
            || '';
        if (configured) {
            return configured;
        }

        const host = window.location.hostname || '';
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
            return LOCAL_ADMIN_FUNCTION_URL;
        }
        if (host === 'tekemetqonaev.com' || host.endsWith('.tekemetqonaev.com')) {
            return '/api/tekemet-admin';
        }

        return DEFAULT_ADMIN_FUNCTION_URL;
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (match) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[match]));
    }

    function formatPrice(value, currency) {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        const numericValue = Number(value);
        const safeValue = Number.isFinite(numericValue) ? numericValue : String(value);
        const normalizedCurrency = String(currency || '').trim().toUpperCase();
        const symbol = normalizedCurrency === 'KZT' ? '\u20B8' : (currency || '\u20B8');

        if (typeof safeValue === 'number') {
            return new Intl.NumberFormat('ru-RU').format(safeValue) + ' ' + symbol;
        }

        return String(safeValue);
    }

    function normalizeOptionalNumber(value) {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        const numericValue = Number(value);
        return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : '';
    }

    function parseList(value) {
        if (!value) {
            return [];
        }

        if (Array.isArray(value)) {
            return value.map((item) => String(item || '').trim()).filter(Boolean);
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return [];
            }

            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map((item) => String(item || '').trim()).filter(Boolean);
                }
            } catch (error) {
                // Plain comma-separated values are supported as a fallback.
            }

            return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
        }

        return [];
    }

    function localeField(record, baseName) {
        return record[baseName + '_' + locale]
            || record[baseName + '_ru']
            || record[baseName + '_en']
            || record[baseName + '_kk']
            || '';
    }

    function getSpiceLabel(value) {
        const normalized = String(value || '').trim();
        const labels = {
            mild: { ru: 'Легкая острота', kk: 'Жеңіл ащылық', en: 'Mild spice' },
            medium: { ru: 'Средняя острота', kk: 'Орташа ащылық', en: 'Medium spice' },
            hot: { ru: 'Острое', kk: 'Ащы', en: 'Hot' }
        };

        return labels[normalized]?.[locale] || labels[normalized]?.ru || normalized;
    }

    function getSectionTitle(sectionKey) {
        const section = Array.from(document.querySelectorAll('.menu-section'))
            .find((element) => element.dataset.section === sectionKey);
        const title = section?.querySelector('.section-title');
        return title ? title.textContent.trim() : '';
    }

    function isHotelBreakfastSection(sectionKey) {
        const normalized = String(sectionKey || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
        return normalized === 'hotel-breakfasts' || normalized === 'hotel-breakfast';
    }

    function normalizeMenuPopupItem(record, client) {
        const imageUrl = resolveImageUrl(record, client);
        const isHotelBreakfast = isHotelBreakfastSection(record.section_key);
        const oldPrice = isHotelBreakfast ? null : normalizeOptionalNumber(record.old_price);
        const calories = normalizeOptionalNumber(record.calories);
        const badge = localeField(record, 'badge');
        const tags = parseList(record.tags || record.tag_list || record.badges);
        const spice = getSpiceLabel(record.spice_level);
        const title = localeField(record, 'title') || 'Блюдо';

        return {
            id: String(record.id || ''),
            contentKey: String(record.content_key || ''),
            sectionKey: String(record.section_key || ''),
            sectionTitle: getSectionTitle(record.section_key || ''),
            title,
            titleRu: record.title_ru || record.title_kk || record.title_en || record.content_key || '',
            description: localeField(record, 'description'),
            price: isHotelBreakfast ? '' : formatPrice(record.price, record.currency),
            rawPrice: isHotelBreakfast ? '' : record.price ?? '',
            currency: record.currency || 'KZT',
            oldPrice: oldPrice ? formatPrice(oldPrice, record.currency) : '',
            weight: String(record.weight || record.portion || record.volume || '').trim(),
            calories: calories ? new Intl.NumberFormat('ru-RU').format(calories) + ' ккал' : '',
            spice,
            tags: [badge].concat(tags).filter(Boolean),
            imageUrl,
            imageAlt: record.image_alt || title
        };
    }

    function isMenuHeroRecord(record) {
        const contentKey = String(record?.content_key || '').trim().toLowerCase();
        const sectionKey = String(record?.section_key || '').trim().toLowerCase();
        const title = String(record?.title_ru || record?.title_en || record?.title_kk || record?.title || '').trim().toLowerCase();
        return contentKey === 'menu_hero'
            || contentKey === 'menu-hero'
            || contentKey === 'hero'
            || sectionKey === 'hero'
            || title === 'menu hero'
            || title === 'menu_hero'
            || title === 'menu-hero';
    }

    function getMenuHeroRecord(records) {
        return (records || []).find(isMenuHeroRecord) || null;
    }

    function applyMenuHeroRecord(record, client) {
        if (!record) {
            return;
        }

        const imageUrl = resolveImageUrl(record, client);
        if (!imageUrl) {
            return;
        }

        localStorage.setItem('menuHeroImagePath', imageUrl);
        applyMenuHeroImage();
    }

    function resolveImageUrl(record, client) {
        if (record.image_url) {
            return record.image_url;
        }

        if (!record.image_path || !client || !client.storage) {
            return '';
        }

        const publicUrl = client.storage.from(STORAGE_BUCKET).getPublicUrl(record.image_path);
        return publicUrl && publicUrl.data && publicUrl.data.publicUrl ? publicUrl.data.publicUrl : '';
    }

    function renderHotelBreakfastDescription(description) {
        const lines = String(description || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length > 1) {
            return '<ul class="hotel-breakfast-card__choices">' + lines.map((line) => {
                const separatorIndex = line.indexOf(':');
                if (separatorIndex === -1) {
                    return '<li><span>' + escapeHtml(line) + '</span></li>';
                }

                const name = line.slice(0, separatorIndex).trim();
                const details = line.slice(separatorIndex + 1).trim();
                return '<li><strong>' + escapeHtml(name) + '</strong><span>' + escapeHtml(details) + '</span></li>';
            }).join('') + '</ul>';
        }

        const items = String(description || '')
            .split(',')
            .map((item) => item.trim().replace(/\.$/, ''))
            .filter(Boolean);

        if (items.length > 1) {
            return '<ul class="hotel-breakfast-card__compact-list">' + items
                .map((item) => '<li>' + escapeHtml(item) + '</li>')
                .join('') + '</ul>';
        }

        return description ? '<p class="menu-item__description">' + escapeHtml(description) + '</p>' : '';
    }

    function renderMenuItems(records, client) {
        const popupItems = {};
        records.filter((record) => !isMenuHeroRecord(record)).forEach((record) => {
            const popupItem = normalizeMenuPopupItem(record, client);
            if (popupItem.id) {
                popupItems[popupItem.id] = popupItem;
            }
        });
        window.TekemetMenuItemsById = popupItems;

        // Group records by section
        const sections = {};
        records.filter((record) => !isMenuHeroRecord(record)).forEach((record) => {
            const section = record.section_key || 'menu';
            if (!sections[section]) {
                sections[section] = [];
            }
            sections[section].push(record);
        });

        // Sort each section by sort_order
        Object.keys(sections).forEach((section) => {
            sections[section].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        });

        // Render into each menu-grid
        document.querySelectorAll('.menu-grid').forEach((grid) => {
            const sectionKey = grid.closest('.menu-section')?.dataset.section;
            if (sectionKey && sections[sectionKey]) {
                grid.innerHTML = sections[sectionKey]
                    .map((record) => {
                        const title = localeField(record, 'title') || 'Блюдо';
                        const description = localeField(record, 'description');
                        const isTextOnlySection = isHotelBreakfastSection(sectionKey);
                        const price = isTextOnlySection ? '' : formatPrice(record.price, record.currency);
                        const imageUrl = resolveImageUrl(record, client);
                        const hasImage = Boolean(imageUrl);

                        const isDrinkSubsectionHeading = sectionKey === 'drinks'
                            && !price
                            && !description
                            && !hasImage
                            && (record.badge_ru === null || record.badge_ru === undefined || record.badge_ru === '')
                            && (record.badge_en === null || record.badge_en === undefined || record.badge_en === '')
                            && (record.badge_kk === null || record.badge_kk === undefined || record.badge_kk === '');

                        if (isDrinkSubsectionHeading) {
                            return '<h3 class="menu-drinks-group-title">' + escapeHtml(title) + '</h3>';
                        }

                        let html = '<div class="menu-item' + (hasImage ? ' has-image' : '') + (isTextOnlySection ? ' menu-item--text-only' : '') + '" role="button" tabindex="0" data-menu-dish-card data-content-id="' + escapeHtml(record.id) + '" data-content-key="' + escapeHtml(record.content_key) + '">';

                        if (!isTextOnlySection) {
                            html += '<div class="menu-item__media' + (hasImage ? ' menu-item__media--clickable' : '') + '"' + (hasImage ? ' role="button" tabindex="0" aria-label="Открыть фото блюда ' + escapeHtml(title) + '" data-content-id="' + escapeHtml(record.id) + '" data-image-url="' + escapeHtml(imageUrl) + '" data-image-title="' + escapeHtml(title) + '"' : '') + '>';
                            if (hasImage) {
                                html += '<img class="menu-item__image" src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(title) + '" loading="lazy" decoding="async">';
                            } else {
                                html += '<div class="menu-item__image-placeholder">Фото блюда</div>';
                            }
                            html += '</div>';
                        }

                        html += '<div class="menu-item__content">';
                        html += '<div class="menu-item__header"><h3>' + escapeHtml(title) + '</h3></div>';

                        const badge = localeField(record, 'badge');
                        if (badge) {
                            html += '<div class="menu-item__badge">' + escapeHtml(badge) + '</div>';
                        }

                        if (description && isTextOnlySection) {
                            html += renderHotelBreakfastDescription(description);
                        } else if (description) {
                            html += '<p class="menu-item__description">' + escapeHtml(description) + '</p>';
                        }

                        if (price) {
                            html += '<div class="menu-item__price">' + escapeHtml(price) + '</div>';
                        }

                        html += '</div>';

                        html += '</div>';
                        return html;
                    })
                    .join('');
            }
        });
    }

    function renderRoomItems(records, client) {
        const carousel = document.querySelector('.rooms__carousel');
        if (!carousel) {
            return;
        }

        // Skip rendering if static content already exists (hard-coded room cards in HTML)
        if (carousel.childElementCount > 0) {
            return;
        }

        // Sort by sort_order
        records.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        carousel.innerHTML = records
            .map((record) => {
                const title = localeField(record, 'title') || 'Номер';
                const description = localeField(record, 'description');
                const price = formatPrice(record.price, record.currency);
                const badge = localeField(record, 'badge') || title;
                const imageUrl = resolveImageUrl(record, client) || 'images/hero-bg.webp';

                let html = '<div class="room-card" data-content-id="' + escapeHtml(record.id) + '" data-content-key="' + escapeHtml(record.content_key) + '">';

                html += '<div class="room-card__image"><img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(title) + '" loading="lazy" decoding="async"><span class="room-card__badge">' + escapeHtml(badge) + '</span></div>';

                html += '<div class="room-card__info"><h3>' + escapeHtml(title) + '</h3>';

                // If description is empty, show default features list
                if (description) {
                    html += '<p>' + escapeHtml(description) + '</p>';
                } else {
                    const defaultFeatures = [
                        'Кондиционер, кабельное ТВ, Wi‑Fi',
                        'Халат, тапочки, душевые принадлежности',
                        'Полотенца, вода, чай',
                        'Завтрак на 2-х персон включен'
                    ];
                    html += '<ul class="room-card__features">' + defaultFeatures.map(f => '<li>' + escapeHtml(f) + '</li>').join('') + '</ul>';
                }

                if (price) {
                    html += '<p class="room-card__price">' + escapeHtml(price) + '</p>';
                }

                const bookingLabel = (locale && locale.startsWith('en')) ? 'Book now' : 'ЗАБРОНИРОВАТЬ';
                html += '<a href="https://wa.me/87472025888?text=' + encodeURIComponent('Hello! I would like to book a room at TEKEMET RESTO-HOTEL.') + '" class="btn btn--small" target="_blank" rel="noopener noreferrer">' + escapeHtml(bookingLabel) + '</a></div>';

                html += '</div>';
                return html;
            })
            .join('');
    }

    async function loadAndRender() {
        const loadedFromBackend = await loadAndRenderFromBackend();
        if (loadedFromBackend) {
            return;
        }

        if (!window.TekemetSupabase || !window.TekemetSupabase.hasConfig()) {
            return;
        }

        const client = window.TekemetSupabase.getClient();
        if (!client) {
            return;
        }

        // Auto-activate any records where inactive_until has passed (best-effort)
        try {
            const probe = await client
                .from(MENU_TABLE)
                .select('inactive_until')
                .limit(1);

            if (!probe.error) {
                await client
                    .from(MENU_TABLE)
                    .update({ is_active: true, inactive_until: null })
                    .lte('inactive_until', new Date().toISOString())
                    .eq('is_active', false);
            }
        } catch {
            // ignore failures (column may not exist)
        }

        try {
            const { data, error } = await client
                .from(MENU_TABLE)
                .select('*')
                .eq('content_type', pageKind)
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            if (error) {
                console.warn('Content load failed:', error.message);
                return;
            }

            const records = data || [];

            if (pageKind === MENU_TYPE) {
                applyMenuHeroRecord(getMenuHeroRecord(records), client);
                renderMenuItems(records, client);
                trackMenuEvent('menu_open');
            } else {
                renderRoomItems(records, client);
            }

            // If hero image not yet applied from localStorage, try loading a special record
            try {
                const applied = document.getElementById('menu-hero')?.dataset?.menuHeroApplied;
                const savedImageUrl = localStorage.getItem('menuHeroImagePath');
                if (!applied && !savedImageUrl && client) {
                    const { data: heroData } = await client
                        .from(MENU_TABLE)
                        .select('*')
                        .eq('content_key', 'menu_hero')
                        .limit(1)
                        .maybeSingle();

                    if (heroData && (heroData.image_url || heroData.image_path)) {
                        const imageUrl = heroData.image_url || (heroData.image_path ? client.storage.from(STORAGE_BUCKET).getPublicUrl(heroData.image_path).data.publicUrl : null);
                        if (imageUrl) {
                            localStorage.setItem('menuHeroImagePath', imageUrl);
                            applyMenuHeroImage();
                        }
                    }
                }
            } catch (err) {
                console.warn('Failed to load hero image from DB fallback:', err);
            }
        } catch (error) {
            console.warn('Не удалось отрисовать контент из Supabase:', error);
        }
    }

    async function loadAndRenderFromBackend() {
        try {
            const response = await fetch(getAdminFunctionUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'getPublicContent', contentType: pageKind })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.error) {
                console.warn('Не удалось загрузить контент через backend:', payload.error || response.status);
                return false;
            }

            const records = payload.items || [];
            if (pageKind === MENU_TYPE) {
                applyMenuHeroRecord(payload.menuHero || getMenuHeroRecord(records), null);
                renderMenuItems(records, null);
                trackMenuEvent('menu_open');
            } else {
                renderRoomItems(records, null);
            }
            return true;
        } catch (error) {
            console.warn('Ошибка загрузки контента через backend:', error);
            return false;
        }
    }

    function applyMenuHeroImage() {
        const menuHero = document.getElementById('menu-hero');
        if (!menuHero) {
            return;
        }

        const savedImageUrl = localStorage.getItem('menuHeroImagePath');
        if (savedImageUrl) {
            try {
                const url = String(savedImageUrl || '');
                menuHero.style.setProperty('background-image', 'url("' + url + '")', 'important');
                menuHero.style.setProperty('background-size', 'cover', 'important');
                menuHero.style.setProperty('background-position', 'center', 'important');
                menuHero.style.setProperty('background-repeat', 'no-repeat', 'important');
                menuHero.dataset.menuHeroApplied = '1';
            } catch (err) {
                console.warn('[content-sync] Failed to apply menu hero image', err);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        applyMenuHeroImage();
        loadAndRender().catch((error) => {
            console.warn('Синхронизация контента не выполнена:', error);
        });
    });

    function getAnalyticsSessionId() {
        const key = 'tekemet.analytics.session';
        let value = sessionStorage.getItem(key);
        if (!value) {
            value = 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem(key, value);
        }
        return value;
    }

    function getAnalyticsVisitorId() {
        const key = 'tekemet.analytics.visitor';
        let value = localStorage.getItem(key);
        if (!value) {
            value = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
            localStorage.setItem(key, value);
        }
        return value;
    }

    function getUrlParam(name) {
        try {
            return new URLSearchParams(window.location.search).get(name) || '';
        } catch {
            return '';
        }
    }

    function getBrowserName() {
        const agent = navigator.userAgent || '';
        if (/Edg\//.test(agent)) return 'Edge';
        if (/OPR\//.test(agent)) return 'Opera';
        if (/Chrome\//.test(agent)) return 'Chrome';
        if (/Safari\//.test(agent) && !/Chrome\//.test(agent)) return 'Safari';
        if (/Firefox\//.test(agent)) return 'Firefox';
        return '';
    }

    function getOsName() {
        const agent = navigator.userAgent || '';
        if (/Windows/i.test(agent)) return 'Windows';
        if (/Android/i.test(agent)) return 'Android';
        if (/iPhone|iPad|iPod/i.test(agent)) return 'iOS';
        if (/Mac OS X/i.test(agent)) return 'macOS';
        if (/Linux/i.test(agent)) return 'Linux';
        return '';
    }

    function getDeviceType() {
        const width = window.innerWidth || document.documentElement.clientWidth || 0;
        if (width < 768) return 'mobile';
        if (width < 1100) return 'tablet';
        return 'desktop';
    }

    function trackMenuEvent(eventType, extra = {}) {
        if (!eventType) return;
        const payload = (extra && typeof extra === 'object')
            ? extra
            : { menuItemId: extra || null };
        const body = JSON.stringify({
            action: 'trackAnalyticsEvent',
            restaurantSlug: RESTAURANT_SLUG,
            eventType,
            menuItemId: payload.menuItemId || null,
            language: locale,
            deviceType: getDeviceType(),
            sessionId: getAnalyticsSessionId(),
            visitorId: getAnalyticsVisitorId(),
            pagePath: window.location.pathname || '/menu',
            browser: getBrowserName(),
            os: getOsName(),
            qrCode: getUrlParam('qr') || getUrlParam('table'),
            source: getUrlParam('source') || getUrlParam('utm_source'),
            sourcePublicId: getUrlParam('source') || getUrlParam('source_id') || getUrlParam('qr_id'),
            userAgent: navigator.userAgent || '',
            referrer: document.referrer || '',
            ...payload
        });
        const analyticsUrl = getAdminFunctionUrl();

        try {
            if (navigator.sendBeacon) {
                const queued = navigator.sendBeacon(analyticsUrl, new Blob([body], { type: 'application/json' }));
                if (queued) return;
            }
        } catch (error) {
            console.warn('[tekemet-menu] analytics beacon skipped', error);
        }

        fetch(analyticsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true
        }).catch(() => {});
    }

    function trackDishOpen(itemOrId) {
        const item = itemOrId && typeof itemOrId === 'object'
            ? itemOrId
            : (window.TekemetMenuItemsById || {})[String(itemOrId || '')] || null;
        const menuItemId = item?.id || itemOrId || null;
        if (!menuItemId) return;

        trackMenuEvent('dish_open', {
            menuItemId,
            itemId: menuItemId,
            dishId: menuItemId,
            contentKey: item?.contentKey || '',
            dishTitle: item?.titleRu || item?.title || '',
            dishTitleRu: item?.titleRu || item?.title || '',
            dishCategory: item?.sectionTitle || item?.sectionKey || '',
            sectionKey: item?.sectionKey || '',
            dishPrice: item?.rawPrice || item?.price || '',
            price: item?.rawPrice || item?.price || '',
            currency: item?.currency || 'KZT',
            restaurantSlug: RESTAURANT_SLUG,
            timestamp: new Date().toISOString()
        });
    }

    function trackDishClose(itemOrId, durationMs) {
        const item = itemOrId && typeof itemOrId === 'object'
            ? itemOrId
            : (window.TekemetMenuItemsById || {})[String(itemOrId || '')] || null;
        const menuItemId = item?.id || itemOrId || null;
        if (!menuItemId) return;

        trackMenuEvent('dish_close', {
            menuItemId,
            itemId: menuItemId,
            dishId: menuItemId,
            contentKey: item?.contentKey || '',
            dishTitle: item?.titleRu || item?.title || '',
            dishTitleRu: item?.titleRu || item?.title || '',
            dishCategory: item?.sectionTitle || item?.sectionKey || '',
            sectionKey: item?.sectionKey || '',
            dishPrice: item?.rawPrice || item?.price || '',
            price: item?.rawPrice || item?.price || '',
            currency: item?.currency || 'KZT',
            durationMs: Number(durationMs || 0),
            restaurantSlug: RESTAURANT_SLUG,
            timestamp: new Date().toISOString()
        });
    }

    function trackDishPhotoOpen(itemOrId) {
        const item = itemOrId && typeof itemOrId === 'object'
            ? itemOrId
            : (window.TekemetMenuItemsById || {})[String(itemOrId || '')] || null;
        const menuItemId = item?.id || itemOrId || null;
        if (!menuItemId) return;

        trackMenuEvent('dish_photo_open', {
            menuItemId,
            itemId: menuItemId,
            dishId: menuItemId,
            contentKey: item?.contentKey || '',
            dishTitle: item?.titleRu || item?.title || '',
            dishTitleRu: item?.titleRu || item?.title || '',
            dishCategory: item?.sectionTitle || item?.sectionKey || '',
            sectionKey: item?.sectionKey || '',
            dishPrice: item?.rawPrice || item?.price || '',
            price: item?.rawPrice || item?.price || '',
            currency: item?.currency || 'KZT',
            restaurantSlug: RESTAURANT_SLUG,
            timestamp: new Date().toISOString()
        });
    }

    window.TekemetContentSync = {
        refresh: loadAndRender,
        locale,
        getMenuItem: (id) => (window.TekemetMenuItemsById || {})[String(id || '')] || null,
        trackDishOpen,
        trackDishClose,
        trackDishPhotoOpen
    };
})();




