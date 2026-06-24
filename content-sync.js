(function () {
    const MENU_TABLE = 'content_items';
    const STORAGE_BUCKET = 'site-assets';
    const MENU_TYPE = 'menu';
    const ROOM_TYPE = 'room';
    const locale = (document.documentElement.lang || 'ru').toLowerCase();
    const pageKind = document.body.classList.contains('menu-page') ? MENU_TYPE : ROOM_TYPE;

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
        const symbol = currency || '₸';

        if (typeof safeValue === 'number') {
            return new Intl.NumberFormat('ru-RU').format(safeValue) + ' ' + symbol;
        }

        return String(safeValue);
    }

    function localeField(record, baseName) {
        return record[baseName + '_' + locale]
            || record[baseName + '_ru']
            || record[baseName + '_en']
            || record[baseName + '_kk']
            || '';
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
        // Group records by section
        const sections = {};
        records.forEach((record) => {
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
                        const price = formatPrice(record.price, record.currency);
                        const imageUrl = resolveImageUrl(record, client);
                        const hasImage = Boolean(imageUrl);
                        const isTextOnlySection = sectionKey === 'hotel-breakfasts';

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

                        let html = '<div class="menu-item' + (hasImage ? ' has-image' : '') + (isTextOnlySection ? ' menu-item--text-only' : '') + '" data-content-id="' + escapeHtml(record.id) + '" data-content-key="' + escapeHtml(record.content_key) + '">';

                        if (!isTextOnlySection) {
                            html += '<div class="menu-item__media' + (hasImage ? ' menu-item__media--clickable' : '') + '"' + (hasImage ? ' role="button" tabindex="0" data-content-id="' + escapeHtml(record.id) + '" data-image-url="' + escapeHtml(imageUrl) + '" data-image-title="' + escapeHtml(title) + '" aria-label="Открыть фото: ' + escapeHtml(title) + '"' : '') + '>';
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
                html += '<a href="https://wa.me/77072025888?text=' + encodeURIComponent('Hello! I would like to book a room at TEKEMET RESTO-HOTEL.') + '" class="btn btn--small" target="_blank" rel="noopener noreferrer">' + escapeHtml(bookingLabel) + '</a></div>';

                html += '</div>';
                return html;
            })
            .join('');
    }

    async function loadAndRender() {
        if (!window.TekemetSupabase || !window.TekemetSupabase.hasConfig()) {
            await loadAndRenderFromBackend();
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
        } catch (err) {
            // ignore failures (column may not exist)
            console.debug('[content-sync] auto-activate skipped:', err && err.message);
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
            console.warn('Content render error:', error);
        }
    }

    async function loadAndRenderFromBackend() {
        try {
            const response = await fetch('/.netlify/functions/tekemet-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'getPublicContent', contentType: pageKind })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.error) {
                console.warn('Content backend load failed:', payload.error || response.status);
                return;
            }

            const records = payload.items || [];
            if (pageKind === MENU_TYPE) {
                renderMenuItems(records, null);
                trackMenuEvent('menu_open');
            } else {
                renderRoomItems(records, null);
            }
        } catch (error) {
            console.warn('Content backend render error:', error);
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
                console.info('[content-sync] Applying menu hero image:', url);
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
            console.warn('Content sync failed:', error);
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

    function getDeviceType() {
        const width = window.innerWidth || document.documentElement.clientWidth || 0;
        if (width < 768) return 'mobile';
        if (width < 1100) return 'tablet';
        return 'desktop';
    }

    function trackMenuEvent(eventType, menuItemId) {
        if (!eventType) return;
        fetch('/.netlify/functions/tekemet-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'trackAnalyticsEvent',
                eventType,
                menuItemId: menuItemId || null,
                language: locale,
                deviceType: getDeviceType(),
                sessionId: getAnalyticsSessionId(),
                userAgent: navigator.userAgent || '',
                referrer: document.referrer || ''
            })
        }).catch(() => {});
    }

    document.addEventListener('click', (event) => {
        const media = event.target.closest('.menu-item__media--clickable');
        if (!media) return;
        const item = media.closest('.menu-item');
        const contentId = media.dataset.contentId || (item && item.dataset.contentId) || '';
        if (contentId) trackMenuEvent('dish_open', contentId);
    });

    window.TekemetContentSync = {
        refresh: loadAndRender,
        locale
    };
})();

