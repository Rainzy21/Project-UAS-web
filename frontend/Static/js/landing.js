/**
 * landing.js — Landing page: taste demo, smooth scroll
 */
(function () {
    'use strict';

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

    async function loadPoster(tmdbId) {
        if (posterCache[tmdbId]) return posterCache[tmdbId];
        try {
            const movie = await window.Api.get(`/api/movies/${tmdbId}`);
            if (movie.poster_url) {
                posterCache[tmdbId] = movie.poster_url;
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
        const U = window.AppUtils;

        placeholder.classList.add('hidden');
        card.classList.remove('hidden');
        tease.classList.remove('hidden');
        card.innerHTML = '';

        const poster = await loadPoster(sample.tmdb_id);
        const posterEl = U.createPosterElement(poster, 'lp-taste-poster');
        if (posterEl.classList.contains('rec-rate-poster-ph')) {
            posterEl.className = 'lp-taste-poster-ph';
        }
        card.appendChild(posterEl);

        const body = document.createElement('div');
        body.className = 'lp-taste-body';

        const matchEl = document.createElement('div');
        matchEl.className = 'lp-taste-match';
        const matchVal = document.createElement('span');
        matchVal.className = 'lp-taste-match-val';
        matchVal.textContent = `${sample.match}%`;
        matchEl.appendChild(matchVal);
        matchEl.appendChild(document.createTextNode(' match'));

        const titleEl = document.createElement('div');
        titleEl.className = 'lp-taste-title';
        titleEl.textContent = sample.title;

        const metaEl = document.createElement('div');
        metaEl.className = 'lp-taste-meta';
        metaEl.textContent = `${sample.year} · Sample pick for "${mood}" mood`;

        const reasonEl = document.createElement('p');
        reasonEl.className = 'lp-taste-reason';
        reasonEl.textContent = sample.reason;

        body.appendChild(matchEl);
        body.appendChild(titleEl);
        body.appendChild(metaEl);
        body.appendChild(reasonEl);
        card.appendChild(body);

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
