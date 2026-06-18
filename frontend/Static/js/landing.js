/**
 * landing.js — Landing page: taste demo, smooth scroll
 */
(function () {
    'use strict';

    const TMDB_KEY  = (window.APP_CONFIG && window.APP_CONFIG.TMDB_API_KEY) || '';
    const TMDB_BASE = 'https://api.themoviedb.org/3';
    const IMG_W500  = 'https://image.tmdb.org/t/p/w500';

    /* Sample picks per mood — frontend demo only, not sent to API */
    const TASTE_SAMPLES = {
        Unsettled: {
            tmdb_id: 496243,
            title: 'Parasite',
            year: 2019,
            match: 94,
            reason: 'Because you wanted something unsettled — moral complexity that lingers after the credits roll.',
        },
        Inspired: {
            tmdb_id: 2074,
            title: 'Dead Poets Society',
            year: 1989,
            match: 91,
            reason: 'Because an inspired mood calls for films that expand how you see the world — not just entertain it.',
        },
        Entertained: {
            tmdb_id: 118340,
            title: 'Guardians of the Galaxy',
            year: 2014,
            match: 92,
            reason: 'Because you wanted pure entertainment — sharp wit, kinetic energy, zero homework required.',
        },
        Emotional: {
            tmdb_id: 278,
            title: 'The Shawshank Redemption',
            year: 1994,
            match: 96,
            reason: 'Because emotional picks need real stakes and character depth — not cheap manipulation.',
        },
        Thrilled: {
            tmdb_id: 76341,
            title: 'Mad Max: Fury Road',
            year: 2015,
            match: 93,
            reason: 'Because thrilled means edge-of-seat pacing — high stakes from the first frame to the last.',
        },
    };

    const posterCache = {};

    async function tmdbFetch(path) {
        const sep = path.includes('?') ? '&' : '?';
        const res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${TMDB_KEY}&language=en-US`);
        if (!res.ok) throw new Error('TMDB ' + res.status);
        return res.json();
    }

    async function loadPoster(tmdbId) {
        if (posterCache[tmdbId]) return posterCache[tmdbId];
        if (!TMDB_KEY) return null;
        try {
            const data = await tmdbFetch(`/movie/${tmdbId}`);
            if (data.poster_path) {
                posterCache[tmdbId] = `${IMG_W500}${data.poster_path}`;
                return posterCache[tmdbId];
            }
        } catch (_) {}
        return null;
    }

    function initTasteDemo() {
        const container = document.getElementById('taste-moods');
        if (!container) return;

        Object.keys(TASTE_SAMPLES).forEach(mood => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lp-taste-mood';
            btn.textContent = mood;
            btn.addEventListener('click', () => selectTasteMood(mood, btn));
            container.appendChild(btn);
        });

        // Preload posters in background
        Object.values(TASTE_SAMPLES).forEach(s => loadPoster(s.tmdb_id));
    }

    async function selectTasteMood(mood, btn) {
        document.querySelectorAll('.lp-taste-mood').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        const sample = TASTE_SAMPLES[mood];
        if (!sample) return;

        const placeholder = document.getElementById('taste-placeholder');
        const card = document.getElementById('taste-card');
        const tease = document.getElementById('taste-tease');

        placeholder.classList.add('hidden');
        card.classList.remove('hidden');
        tease.classList.remove('hidden');

        const poster = await loadPoster(sample.tmdb_id);
        card.innerHTML = `
            ${poster
                ? `<img class="lp-taste-poster" src="${poster}" alt="${sample.title}" loading="lazy">`
                : `<div class="lp-taste-poster-ph"><i class="fa-solid fa-film"></i></div>`
            }
            <div class="lp-taste-body">
                <div class="lp-taste-match"><span class="lp-taste-match-val">${sample.match}%</span> match</div>
                <div class="lp-taste-title">${sample.title}</div>
                <div class="lp-taste-meta">${sample.year} · Sample pick for "${mood}" mood</div>
                <p class="lp-taste-reason">${sample.reason}</p>
            </div>
        `;

        // Re-trigger animation
        card.style.animation = 'none';
        void card.offsetWidth;
        card.style.animation = '';
    }

    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(a => {
            a.addEventListener('click', e => {
                const target = document.querySelector(a.getAttribute('href'));
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    function initNavScroll() {
        const nav = document.getElementById('main-nav');
        if (!nav) return;
        window.addEventListener('scroll', () => {
            nav.classList.toggle('scrolled', window.scrollY > 60);
        }, { passive: true });
    }

    function boot() {
        initNavScroll();
        initSmoothScroll();
        initTasteDemo();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
