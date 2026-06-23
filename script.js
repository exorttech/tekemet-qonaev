// ==============================
// TEKEMET RESTO-HOTEL — Scripts
// ==============================

// Theme toggle
const themeToggle = document.getElementById('themeToggle');

// Load saved theme preference (dark by default)
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });

    themeToggle.style.cursor = 'pointer';
} else {
    console.warn('Theme toggle button not found (id="themeToggle").');
}

// Header scroll effect
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

// Scroll reveal
const revealElements = document.querySelectorAll(
    '.about, .about__grid, .room-card, .restaurant__text, .restaurant__images, .nearby-card, .map-section, .section-label, .section-title'
);

const nearbyCards = document.querySelectorAll('.nearby-card');
nearbyCards.forEach((card, index) => {
    card.style.transitionDelay = `${index * 0.12}s`;
});

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('reveal', 'visible');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });

revealElements.forEach(el => {
    el.classList.add('reveal');
    revealObserver.observe(el);
});

// Rooms carousel - horizontal scroll (show 3, move by 1)
const carousel = document.querySelector('.rooms__carousel');
const prevBtn = document.getElementById('prevRoom');
const nextBtn = document.getElementById('nextRoom');
const roomsNav = document.querySelector('.rooms__nav');

if (prevBtn && nextBtn && carousel) {
    let scrollStateTimeout;

    const setScrollingState = () => {
        if (!roomsNav) return;

        roomsNav.classList.add('is-scrolling');
        window.clearTimeout(scrollStateTimeout);
        scrollStateTimeout = window.setTimeout(() => {
            roomsNav.classList.remove('is-scrolling');
        }, 1200);
    };

    const getScrollStep = () => {
        const firstCard = carousel.querySelector('.room-card');
        if (!firstCard) return 0;

        const gap = parseFloat(window.getComputedStyle(carousel).columnGap || window.getComputedStyle(carousel).gap || '0');
        return firstCard.getBoundingClientRect().width + gap;
    };

    nextBtn.addEventListener('click', () => {
        setScrollingState();
        carousel.scrollBy({ left: getScrollStep(), behavior: 'smooth' });
    });

    prevBtn.addEventListener('click', () => {
        setScrollingState();
        carousel.scrollBy({ left: -getScrollStep(), behavior: 'smooth' });
    });

    carousel.addEventListener('scroll', setScrollingState, { passive: true });
}

// Map tabs
const mapTabs = document.querySelectorAll('.map__tab');
const map2gis = document.getElementById('map2gis');
const mapGoogle = document.getElementById('mapGoogle');

mapTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        mapTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const mapType = tab.dataset.map;
        if (mapType === '2gis') {
            map2gis.classList.remove('hidden');
            mapGoogle.classList.add('hidden');
        } else {
            mapGoogle.classList.remove('hidden');
            map2gis.classList.add('hidden');
        }
    });
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Burger menu (mobile)
const burger = document.getElementById('burger');
const nav = document.querySelector('.header__nav');

if (burger) {
    burger.addEventListener('click', () => {
        nav.classList.toggle('mobile-open');
        nav.classList.toggle('active');
        burger.classList.toggle('active');
    });
}

// Floating WhatsApp button (global)
if (!document.querySelector('.whatsapp-fab')) {
    const pageLang = (document.documentElement.lang || 'ru').toLowerCase();
    const waTextByLang = {
        kk: 'Сәлеметсіз бе! Ақпаратты толығырақ алғым келеді.',
        ru: 'Здравствуйте! Хочу уточнить информацию.',
        en: 'Hello! I would like to get more information.'
    };

    const waText = waTextByLang[pageLang] || waTextByLang.ru;
    const waLink = document.createElement('a');
    waLink.className = 'whatsapp-fab';
    waLink.href = 'https://wa.me/77072025888?text=' + encodeURIComponent(waText);
    waLink.target = '_blank';
    waLink.rel = 'noopener noreferrer';
    waLink.setAttribute('aria-label', 'WhatsApp');
    waLink.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16.03 5.01c-6.05 0-10.97 4.91-10.97 10.96 0 1.93.5 3.82 1.45 5.49L5 27l5.73-1.5a10.9 10.9 0 0 0 5.3 1.35h.01c6.05 0 10.96-4.92 10.96-10.97A10.95 10.95 0 0 0 16.03 5Zm6.39 15.53c-.27.76-1.57 1.44-2.17 1.53-.56.08-1.26.12-2.03-.13-.47-.15-1.08-.35-1.86-.69-3.28-1.42-5.42-4.73-5.58-4.95-.16-.22-1.33-1.77-1.33-3.37 0-1.6.84-2.39 1.14-2.72.3-.32.65-.4.87-.4.22 0 .44 0 .63.01.2.01.47-.08.74.56.27.65.92 2.24 1 2.4.08.16.13.35.03.56-.1.21-.15.34-.3.52-.15.17-.32.39-.45.52-.15.15-.31.31-.13.62.18.31.8 1.31 1.71 2.12 1.18 1.05 2.17 1.38 2.48 1.54.31.16.49.13.67-.08.18-.22.78-.91.99-1.22.21-.31.42-.26.71-.16.3.1 1.87.88 2.19 1.04.32.16.53.24.61.37.08.12.08.71-.19 1.47Z"/></svg>';

    document.body.appendChild(waLink);
}
