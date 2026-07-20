// ==============================
// MENU PAGE SCRIPTS
// ==============================

(function () {
let activeDishModalSession = null;

// Service charge popup (shown on each visit)
window.addEventListener('load', function() {
    const modal = document.getElementById('serviceModal');
    if (!modal) {
        return;
    }

    const acceptButton = document.getElementById('acceptService');

    const closeModal = () => {
        modal.classList.remove('is-open');
        document.body.classList.remove('modal-open');
    };

    modal.classList.add('is-open');
    document.body.classList.add('modal-open');

    if (acceptButton) {
        acceptButton.addEventListener('click', closeModal);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) {
            closeModal();
        }
    });
});

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (match) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[match]));
}

function getDishModalCopy() {
    const lang = (document.documentElement.lang || 'ru').toLowerCase();
    if (lang.startsWith('en')) {
        return {
            close: 'Close',
            details: 'Dish details',
            weight: 'Weight',
            calories: 'Calories',
            spice: 'Spice level'
        };
    }
    if (lang.startsWith('kk')) {
        return {
            close: 'Жабу',
            details: 'Тағам туралы',
            weight: 'Салмағы',
            calories: 'Калория',
            spice: 'Ащылық'
        };
    }
    return {
        close: 'Закрыть',
        details: 'О блюде',
        weight: 'Вес',
        calories: 'Калории',
        spice: 'Острота'
    };
}

function ensureDishModal() {
    let overlay = document.getElementById('menuDishModal');
    if (overlay) {
        return overlay;
    }

    const copy = getDishModalCopy();
    overlay = document.createElement('div');
    overlay.className = 'dish-modal-overlay';
    overlay.id = 'menuDishModal';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
        '<button class="dish-modal__backdrop" type="button" data-close-dish-modal aria-label="' + escapeHtml(copy.close) + '"></button>',
        '<article class="dish-modal" role="dialog" aria-modal="true" aria-labelledby="menuDishModalTitle">',
        '  <button type="button" class="dish-modal__close" data-close-dish-modal aria-label="' + escapeHtml(copy.close) + '">&times;</button>',
        '  <div class="dish-modal__inner" data-dish-modal-content></div>',
        '</article>'
    ].join('');
    document.body.appendChild(overlay);
    return overlay;
}

function getDishModalItem(contentId) {
    if (!contentId) {
        return null;
    }

    if (window.TekemetContentSync && typeof window.TekemetContentSync.getMenuItem === 'function') {
        return window.TekemetContentSync.getMenuItem(contentId);
    }

    return (window.TekemetMenuItemsById || {})[String(contentId)] || null;
}

function trackDishOpen(item) {
    if (window.TekemetContentSync && typeof window.TekemetContentSync.trackDishOpen === 'function') {
        try {
            window.TekemetContentSync.trackDishOpen(item);
            return;
        } catch (error) {
            console.warn('[tekemet-menu] dish_open primary tracker failed', error);
        }
    }
    trackDishEventFallback('dish_open', item);
}

function trackDishClose(item, durationMs) {
    if (window.TekemetContentSync && typeof window.TekemetContentSync.trackDishClose === 'function') {
        try {
            window.TekemetContentSync.trackDishClose(item, durationMs);
            return;
        } catch (error) {
            console.warn('[tekemet-menu] dish_close primary tracker failed', error);
        }
    }
    trackDishEventFallback('dish_close', item, durationMs);
}

function trackDishPhotoOpen(item) {
    if (window.TekemetContentSync && typeof window.TekemetContentSync.trackDishPhotoOpen === 'function') {
        try {
            window.TekemetContentSync.trackDishPhotoOpen(item);
            return;
        } catch (error) {
            console.warn('[tekemet-menu] dish_photo_open primary tracker failed', error);
        }
    }
    trackDishEventFallback('dish_photo_open', item);
}

function getAnalyticsSessionIdFallback() {
    try {
        const key = 'tekemet.analytics.session';
        let value = sessionStorage.getItem(key);
        if (!value) {
            value = 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem(key, value);
        }
        return value;
    } catch {
        return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
}

function getDeviceTypeFallback() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    if (width < 768) return 'mobile';
    if (width < 1100) return 'tablet';
    return 'desktop';
}

function getAdminFunctionUrlFallback() {
    try {
        const configured = window.TEKEMET_ADMIN_API_URL
            || localStorage.getItem('tekemet.admin.apiUrl')
            || '';
        if (configured) return configured;

        const host = window.location.hostname || '';
        if (host === 'tekemetqonaev.com' || host.endsWith('.tekemetqonaev.com')) {
            return '/.netlify/functions/tekemet-admin';
        }
    } catch {}

    return 'https://tekemetqonaev.com/.netlify/functions/tekemet-admin';
}

function trackDishEventFallback(eventType, item, durationMs) {
    if (!item || !item.id) return;
    const body = JSON.stringify({
        action: 'trackAnalyticsEvent',
        restaurantSlug: 'tekemet-qonaev',
        eventType,
        menuItemId: item.id,
        itemId: item.id,
        dishId: item.id,
        contentKey: item.contentKey || '',
        dishTitle: item.titleRu || item.title || '',
        dishTitleRu: item.titleRu || item.title || '',
        sectionKey: item.sectionKey || '',
        language: document.documentElement.lang === 'kk' ? 'kk' : (document.documentElement.lang || 'ru').slice(0, 2),
        deviceType: getDeviceTypeFallback(),
        sessionId: getAnalyticsSessionIdFallback(),
        userAgent: navigator.userAgent || '',
        referrer: document.referrer || '',
        durationMs: Number(durationMs || 0),
        sourcePublicId: new URLSearchParams(window.location.search).get('source')
            || new URLSearchParams(window.location.search).get('source_id')
            || new URLSearchParams(window.location.search).get('qr_id')
            || '',
    });
    const url = getAdminFunctionUrlFallback();

    try {
        if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) {
            return;
        }
    } catch {}

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
    }).catch(() => {});
}

function renderDishModalContent(item) {
    const copy = getDishModalCopy();
    const meta = [
        item.weight ? { label: copy.weight, value: item.weight } : null,
        item.calories ? { label: copy.calories, value: item.calories } : null,
        item.spice ? { label: copy.spice, value: item.spice } : null
    ].filter(Boolean);
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];

    return [
        item.imageUrl ? '<figure class="dish-modal__media"><img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.imageAlt || item.title) + '"></figure>' : '',
        '<div class="dish-modal__body">',
        item.sectionTitle ? '<p class="dish-modal__kicker">' + escapeHtml(item.sectionTitle) + '</p>' : '',
        '<h2 id="menuDishModalTitle">' + escapeHtml(item.title) + '</h2>',
        item.description ? '<p class="dish-modal__description">' + escapeHtml(item.description) + '</p>' : '',
        (item.price || item.oldPrice) ? [
            '<div class="dish-modal__price-stack">',
            item.oldPrice ? '<span class="dish-modal__old-price">' + escapeHtml(item.oldPrice) + '</span>' : '',
            item.price ? '<strong>' + escapeHtml(item.price) + '</strong>' : '',
            '</div>'
        ].join('') : '',
        meta.length ? '<dl class="dish-modal__meta">' + meta.map((entry) => '<div><dt>' + escapeHtml(entry.label) + '</dt><dd>' + escapeHtml(entry.value) + '</dd></div>').join('') + '</dl>' : '',
        tags.length ? '<div class="dish-modal__tags">' + tags.map((tag) => '<span>' + escapeHtml(tag) + '</span>').join('') + '</div>' : '',
        '</div>'
    ].join('');
}

function ensureDishImageViewer() {
    let overlay = document.getElementById('menuDishImageViewer');
    if (overlay) {
        return overlay;
    }

    overlay = document.createElement('div');
    overlay.className = 'dish-image-viewer';
    overlay.id = 'menuDishImageViewer';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
        '<button class="dish-image-viewer__backdrop" type="button" data-close-dish-image aria-label="Закрыть фото"></button>',
        '<figure class="dish-image-viewer__content" role="dialog" aria-modal="true" aria-label="Фото блюда">',
        '  <button class="dish-image-viewer__close" type="button" data-close-dish-image aria-label="Закрыть фото">&times;</button>',
        '  <img data-dish-image-viewer-img alt="">',
        '  <figcaption data-dish-image-viewer-title></figcaption>',
        '</figure>'
    ].join('');
    document.body.appendChild(overlay);
    return overlay;
}

function openDishImageViewer(trigger) {
    const imageUrl = trigger?.getAttribute('data-image-url') || '';
    if (!imageUrl) {
        return;
    }

    const contentId = trigger.getAttribute('data-content-id') || trigger.closest('[data-menu-dish-card]')?.getAttribute('data-content-id') || '';
    const item = getDishModalItem(contentId) || {
        id: contentId,
        title: trigger.getAttribute('data-image-title') || '',
        titleRu: trigger.getAttribute('data-image-title') || ''
    };
    const title = item.titleRu || item.title || trigger.getAttribute('data-image-title') || 'Фото блюда';
    const overlay = ensureDishImageViewer();
    const image = overlay.querySelector('[data-dish-image-viewer-img]');
    const caption = overlay.querySelector('[data-dish-image-viewer-title]');

    image.src = imageUrl;
    image.alt = title;
    caption.textContent = title;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    trackDishPhotoOpen(item);
}

function closeDishImageViewer() {
    const overlay = document.getElementById('menuDishImageViewer');
    if (!overlay) {
        return false;
    }

    const wasOpen = overlay.classList.contains('is-open');
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    const image = overlay.querySelector('[data-dish-image-viewer-img]');
    if (image) image.removeAttribute('src');
    if (!isServiceModalOpen() && !document.getElementById('menuDishModal')?.classList.contains('is-open')) {
        document.body.classList.remove('modal-open');
    }
    return wasOpen;
}

function openDishModal(contentId) {
    const item = getDishModalItem(contentId);
    if (!item) {
        return;
    }

    const overlay = ensureDishModal();
    const content = overlay.querySelector('[data-dish-modal-content]');
    content.innerHTML = renderDishModalContent(item);

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    activeDishModalSession = {
        item,
        openedAt: Date.now()
    };
    trackDishOpen(item);
}

function isServiceModalOpen() {
    const modal = document.getElementById('serviceModal');
    return Boolean(modal && modal.classList.contains('is-open'));
}

function closeDishModal() {
    const overlay = document.getElementById('menuDishModal');
    if (!overlay) {
        return;
    }

    if (activeDishModalSession && overlay.classList.contains('is-open')) {
        const durationMs = Date.now() - activeDishModalSession.openedAt;
        trackDishClose(activeDishModalSession.item, durationMs);
    }
    activeDishModalSession = null;

    const content = overlay.querySelector('[data-dish-modal-content]');
    if (content) {
        content.innerHTML = '';
    }

    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (!isServiceModalOpen()) {
        document.body.classList.remove('modal-open');
    }
}

document.addEventListener('click', (event) => {
    const imageCloseButton = event.target.closest('[data-close-dish-image]');
    if (imageCloseButton) {
        closeDishImageViewer();
        return;
    }

    const closeButton = event.target.closest('[data-close-dish-modal]');
    if (closeButton) {
        closeDishModal();
        return;
    }

    const imageTrigger = event.target.closest('[data-image-url]');
    if (imageTrigger) {
        event.preventDefault();
        event.stopPropagation();
        openDishImageViewer(imageTrigger);
        return;
    }

    const card = event.target.closest('[data-menu-dish-card]');
    if (!card) {
        return;
    }

    openDishModal(card.getAttribute('data-content-id'));
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (!closeDishImageViewer()) {
            closeDishModal();
        }
        return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-image-url]')) {
        event.preventDefault();
        event.stopPropagation();
        openDishImageViewer(event.target.closest('[data-image-url]'));
        return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-menu-dish-card]')) {
        event.preventDefault();
        const card = event.target.closest('[data-menu-dish-card]');
        openDishModal(card.getAttribute('data-content-id'));
    }
});

// Menu filter tabs
let filterTabs = document.querySelectorAll('.filter-tab');
let menuSections = document.querySelectorAll('.menu-section');
let menuItems = document.querySelectorAll('.menu-item');
const backToTopButton = document.getElementById('backToTop');
const hasAllTab = !!document.querySelector('.filter-tab[data-category="all"]');
const isAnchorTabsMenu = !hasAllTab;
let activeFilterMode = 'all';
let tabLockUntil = 0;
let isTicking = false;

const filterTabsContainer = document.querySelector('.filter-tabs');

function configureFilterTabsLayout(container) {
    if (!container) {
        return;
    }

    container.style.display = 'flex';
    container.style.flexWrap = 'nowrap';
    container.style.justifyContent = 'flex-start';
    container.style.overflowX = 'auto';
    container.style.overflowY = 'hidden';
    container.style.webkitOverflowScrolling = 'touch';
    container.style.scrollBehavior = 'smooth';
    container.style.cursor = 'grab';
    container.style.userSelect = 'none';
}

function refreshMenuCollections() {
    filterTabs = document.querySelectorAll('.filter-tab');
    menuSections = document.querySelectorAll('.menu-section');
    menuItems = document.querySelectorAll('.menu-item');

    menuItems.forEach(item => {
        item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    });
}

function enableFilterTabsDragScroll(container) {
    if (!container) {
        return;
    }

    let isMouseDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let moved = false;

    container.addEventListener('mousedown', (event) => {
        if (event.button !== 0) {
            return;
        }

        isMouseDown = true;
        moved = false;
        startX = event.pageX;
        startScrollLeft = container.scrollLeft;
        container.classList.add('is-dragging');
    });

    container.addEventListener('mousemove', (event) => {
        if (!isMouseDown) {
            return;
        }

        const deltaX = event.pageX - startX;
        if (Math.abs(deltaX) > 3) {
            moved = true;
        }

        container.scrollLeft = startScrollLeft - deltaX;
        event.preventDefault();
    });

    const stopDragging = () => {
        isMouseDown = false;
        container.classList.remove('is-dragging');
    };

    container.addEventListener('mouseleave', stopDragging);
    container.addEventListener('mouseup', stopDragging);
    window.addEventListener('mouseup', stopDragging);

    container.addEventListener('dragstart', (event) => {
        event.preventDefault();
    });

    container.addEventListener('click', (event) => {
        if (!moved) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        moved = false;
    }, true);
}

function setActiveTab(category, keepInView) {
    filterTabs.forEach(t => t.classList.remove('active'));
    const nextActiveTab = document.querySelector('.filter-tab[data-category="' + category + '"]');
    if (nextActiveTab) {
        nextActiveTab.classList.add('active');
        if (keepInView) {
            nextActiveTab.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        }
    }
}

function getCurrentSectionCategory() {
    if (menuSections.length === 0) {
        return null;
    }

    const menuFilter = document.querySelector('.menu-filter');
    const markerY = (menuFilter ? menuFilter.getBoundingClientRect().bottom : 0) + 8;
    let fallbackSection = menuSections[0];

    for (const section of menuSections) {
        const rect = section.getBoundingClientRect();
        if (rect.top <= markerY && rect.bottom > markerY) {
            return section.getAttribute('data-section');
        }

        if (rect.top <= markerY) {
            fallbackSection = section;
        }
    }

    return fallbackSection ? fallbackSection.getAttribute('data-section') : null;
}

function updateActiveSectionByScroll() {
    if (Date.now() < tabLockUntil) {
        return;
    }

    if (activeFilterMode !== 'all') {
        return;
    }

    const category = getCurrentSectionCategory();
    if (category) {
        setActiveTab(category, true);
    }
}

if (filterTabs.length > 0) {
    configureFilterTabsLayout(filterTabsContainer);
    enableFilterTabsDragScroll(filterTabsContainer);

    if (isAnchorTabsMenu) {
        // Anchor tabs mode: active color follows current section on scroll.
        filterTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();

                const category = tab.getAttribute('data-category');
                if (!category) {
                    return;
                }

                const hrefTarget = tab.getAttribute('href');
                let targetSection = null;
                if (hrefTarget && hrefTarget.startsWith('#')) {
                    targetSection = document.querySelector(hrefTarget);
                }
                if (!targetSection) {
                    targetSection = document.querySelector('.menu-section[data-section="' + category + '"]');
                }

                setActiveTab(category, true);
                tabLockUntil = Date.now() + 900;
                activeFilterMode = 'all';

                if (targetSection) {
                    const menuFilter = document.querySelector('.menu-filter');
                    const offset = menuFilter ? menuFilter.offsetHeight + 8 : 0;
                    const targetY = targetSection.getBoundingClientRect().top + window.pageYOffset - offset;
                    window.scrollTo({ top: targetY, behavior: 'smooth' });
                }
            });
        });

        window.addEventListener('scroll', () => {
            if (!isTicking) {
                window.requestAnimationFrame(() => {
                    updateActiveSectionByScroll();
                    isTicking = false;
                });
                isTicking = true;
            }
        });

        window.addEventListener('resize', updateActiveSectionByScroll);
        updateActiveSectionByScroll();
    } else {
        // Other pages: keep old filter behavior.
        filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const category = tab.getAttribute('data-category');
                activeFilterMode = category || 'all';

                setActiveTab(category, false);

                menuItems.forEach(item => {
                    const itemCategory = item.getAttribute('data-category');

                    if (category === 'all' || itemCategory === category) {
                        item.style.display = 'block';
                        setTimeout(() => {
                            item.style.opacity = '1';
                            item.style.transform = 'translateY(0)';
                        }, 10);
                    } else {
                        item.style.opacity = '0';
                        item.style.transform = 'translateY(10px)';
                        setTimeout(() => {
                            item.style.display = 'none';
                        }, 300);
                    }
                });

                menuSections.forEach(section => {
                    const sectionCategory = section.getAttribute('data-section');

                    if (category === 'all' || sectionCategory === category) {
                        section.style.display = 'block';
                    } else {
                        section.style.display = 'none';
                    }
                });
            });
        });
    }
}

// Add transition to menu items
menuItems.forEach(item => {
    item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
});

window.TekemetMenuAPI = {
    refresh: refreshMenuCollections
};

if (backToTopButton) {
    let lastScrollY = window.scrollY;

    const toggleBackToTop = () => {
        const currentScrollY = window.scrollY;
        const scrollingDown = currentScrollY > lastScrollY + 2;
        const scrollingUp = currentScrollY < lastScrollY - 2;

        if (currentScrollY > 320) {
            backToTopButton.classList.add('visible');

            if (scrollingDown) {
                backToTopButton.classList.add('is-ghost');
            } else if (scrollingUp) {
                backToTopButton.classList.remove('is-ghost');
            }
        } else {
            backToTopButton.classList.remove('visible');
            backToTopButton.classList.remove('is-ghost');
        }

        lastScrollY = currentScrollY;
    };

    backToTopButton.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', toggleBackToTop, { passive: true });
    toggleBackToTop();
}

})();
