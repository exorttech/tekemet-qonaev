// ==============================
// MENU PAGE SCRIPTS
// ==============================

(function () {

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

function ensureImageModal() {
    let overlay = document.getElementById('menuImageModal');
    if (overlay) {
        return overlay;
    }

    overlay = document.createElement('div');
    overlay.className = 'image-modal-overlay';
    overlay.id = 'menuImageModal';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
        '<div class="image-modal" role="dialog" aria-modal="true" aria-labelledby="menuImageModalTitle">',
        '  <button type="button" class="image-modal__close" aria-label="Закрыть просмотр">&times;</button>',
        '  <img class="image-modal__img" alt="">',
        '  <p class="image-modal__caption" id="menuImageModalTitle"></p>',
        '</div>'
    ].join('');
    document.body.appendChild(overlay);
    return overlay;
}

function openImageModal(imageUrl, imageTitle) {
    if (!imageUrl) {
        return;
    }

    const overlay = ensureImageModal();
    const image = overlay.querySelector('.image-modal__img');
    const caption = overlay.querySelector('.image-modal__caption');

    image.src = imageUrl;
    image.alt = imageTitle || 'Фото блюда';
    caption.textContent = imageTitle || 'Фото блюда';

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function closeImageModal() {
    const overlay = document.getElementById('menuImageModal');
    if (!overlay) {
        return;
    }

    const image = overlay.querySelector('.image-modal__img');
    if (image) {
        image.src = '';
    }

    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

document.addEventListener('click', (event) => {
    const media = event.target.closest('.menu-item__media--clickable');
    if (media) {
        const imageUrl = media.getAttribute('data-image-url');
        const imageTitle = media.getAttribute('data-image-title');
        openImageModal(imageUrl, imageTitle);
        return;
    }

    const overlay = document.getElementById('menuImageModal');
    if (!overlay || !overlay.classList.contains('is-open')) {
        return;
    }

    closeImageModal();
});

document.addEventListener('keydown', (event) => {
    const overlay = document.getElementById('menuImageModal');
    if (!overlay || !overlay.classList.contains('is-open')) {
        return;
    }

    if (event.key === 'Escape') {
        closeImageModal();
        return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.menu-item__media--clickable')) {
        event.preventDefault();
        const media = event.target.closest('.menu-item__media--clickable');
        openImageModal(media.getAttribute('data-image-url'), media.getAttribute('data-image-title'));
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
