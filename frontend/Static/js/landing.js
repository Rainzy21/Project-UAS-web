/**
 * landing.js — Landing page
 *
 * - Hero backdrop: pulled from TMDB trending (first movie with a backdrop)
 * - Trending This Week: carousel from /api/movies/trending
 * - Top Rated All Time: carousel from /api/movies/top-rated
 * - Taste Demo: mood → genre → /api/movies/discover (live TMDB picks)
 *
 * Zero static images / hardcoded movie data.
 */
(function () {
    'use strict';

    // ── TMDB Genre IDs ─────────────────────────────────────────────────────
    const MOOD_CONFIG = {
        Unsettled: {
            genreId: 53,
            genreLabel: 'Thriller',
            reason: 'A high-rated Thriller picked because you wanted moral tension that lingers after the credits.',
        },
        Inspired: {
            genreId: 18,
            genreLabel: 'Drama',
            reason: 'A top-rated Drama — because an inspired mood calls for films that expand how you see the world.',
        },
        Entertained: {
            genreId: 35,
            genreLabel: 'Comedy',
            reason: 'A crowd-favourite Comedy — sharp wit, easy watch, zero homework required.',
        },
        Emotional: {
            genreId: 10749,
            genreLabel: 'Romance / Drama',
            reason: 'A deeply emotional pick with real character stakes — not cheap manipulation.',
        },
        Thrilled: {
            genreId: 28,
            genreLabel: 'Action',
            reason: 'A top-rated Action film — edge-of-seat pacing, high stakes from the first frame.',
        },
    };

    // Cache for discover results
    const _discoverCache = {};
    const _pickIndex = {};

    // ── Fetch helpers ───────────────────────────────────────────────────────
    async function apiFetch(path) {
        try {
            const data = await window.Api.get(path);
            return data.results || data || [];
        } catch (e) {
            console.warn('[landing] API fetch failed:', path, e);
            return [];
        }
    }

    async function fetchTrending() {
        return apiFetch('/api/movies/trending');
    }

    async function fetchTopRated() {
        return apiFetch('/api/movies/top-rated');
    }

    async function fetchGenreMovies(genreId) {
        if (_discoverCache[genreId]) return _discoverCache[genreId];
        const movies = await apiFetch(`/api/movies/discover?genre_id=${genreId}`);
        _discoverCache[genreId] = movies;
        return movies;
    }

    // ── Hero backdrop from TMDB trending ───────────────────────────────────
    async function initHeroBackdrop(trendingMovies) {
        const heroBg = document.querySelector('.lp-hero-static-bg');
        if (!heroBg) return;

        // Find first trending movie that has a backdrop_url
        const pick = trendingMovies.find(m => m.backdrop_url);
        if (!pick) return;

        // Preload image before applying
        const img = new Image();
        img.src = pick.backdrop_url;
        img.onload = () => {
            heroBg.style.backgroundImage = `url('${pick.backdrop_url}')`;
        };
    }

    // ── Build Movie Card ───────────────────────────────────────────────────
    function buildMovieCard(movie, rank) {
        const card = document.createElement('div');
        card.className = 'lp-movie-card';
        card.title = movie.title;

        // Overlay with "Save to My List"
        const overlay = document.createElement('div');
        overlay.className = 'lp-movie-card-overlay';
        const overlayText = document.createElement('span');
        overlayText.className = 'lp-movie-card-overlay-text';
        overlayText.innerHTML = '<i class="fa-solid fa-bookmark"></i> Save to My List';
        overlay.appendChild(overlayText);
        card.appendChild(overlay);

        // Rank Badge
        if (rank !== undefined) {
            const badge = document.createElement('div');
            badge.className = 'lp-movie-rank';
            badge.textContent = rank;
            card.appendChild(badge);
        }

        // Poster Image
        if (movie.poster_url) {
            const img = document.createElement('img');
            img.className = 'lp-movie-card-poster';
            img.src = movie.poster_url;
            img.alt = movie.title;
            img.loading = 'lazy';
            img.onerror = () => { img.style.display = 'none'; };
            card.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'lp-movie-card-poster';
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.color = 'rgba(255,255,255,0.2)';
            placeholder.innerHTML = '<i class="fa-solid fa-film fa-2x"></i>';
            card.appendChild(placeholder);
        }

        // Info section
        const info = document.createElement('div');
        info.className = 'lp-movie-card-info';

        const title = document.createElement('div');
        title.className = 'lp-movie-card-title';
        title.textContent = movie.title;
        info.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'lp-movie-card-meta';

        if (movie.rating) {
            const ratingEl = document.createElement('span');
            ratingEl.className = 'lp-movie-card-rating';
            ratingEl.innerHTML = `<i class="fa-solid fa-star"></i> ${movie.rating.toFixed(1)}`;
            meta.appendChild(ratingEl);
        }
        if (movie.year) {
            const dot = document.createTextNode(movie.rating ? ' · ' : '');
            meta.appendChild(dot);
            meta.appendChild(document.createTextNode(movie.year));
        }
        info.appendChild(meta);
        card.appendChild(info);

        // Click to Save
        card.addEventListener('click', async (e) => {
            e.preventDefault();
            const session = window.Auth ? await window.Auth.getSession() : null;
            if (!session) {
                if (window.Auth) {
                    window.Auth.showModal('login', { message: 'Sign in to save movies to your list' });
                } else {
                    window.location.href = 'login.html';
                }
                return;
            }

            const sb = window.Auth.getClient();
            if (!sb) return;

            const tmdbId = Number(movie.tmdb_id);
            const yr = movie.year ? parseInt(movie.year, 10) : null;

            overlayText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            
            try {
                const { error: rpcErr } = await sb.rpc('save_movie_to_wishlist', {
                    p_tmdb_id: tmdbId,
                    p_title: movie.title || 'Untitled',
                    p_poster_url: movie.poster_url || '',
                    p_rating: movie.rating || 0,
                    p_year: yr,
                });

                if (rpcErr) throw rpcErr;
                
                overlayText.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
                if (window.showToast) window.showToast(`"${movie.title}" saved to My List!`, 'success');
            } catch (err) {
                overlayText.innerHTML = '<i class="fa-solid fa-bookmark"></i> Save to My List';
                if (window.showToast) window.showToast(err.message || 'Could not save', 'error');
            }
        });

        return card;
    }

    // ── Render a carousel track with movies ────────────────────────────────
    function renderTrack(trackId, movies, showRank) {
        const track = document.getElementById(trackId);
        if (!track) return;

        track.innerHTML = '';

        if (!movies.length) {
            const err = document.createElement('div');
            err.style.cssText = 'color:rgba(255,255,255,0.3);font-size:0.8125rem;padding:1rem;';
            err.textContent = 'Could not load movies. Check that the backend is running.';
            track.appendChild(err);
            return;
        }

        movies.forEach((movie, i) => {
            const card = buildMovieCard(movie, showRank ? i + 1 : undefined);
            track.appendChild(card);
        });

        // Duplicate for seamless scroll if requested (we will do 2 sets)
        movies.forEach((movie, i) => {
            const card = buildMovieCard(movie, showRank ? i + 1 : undefined);
            card.setAttribute('aria-hidden', 'true'); // accessibility for cloned items
            track.appendChild(card);
        });
    }

    function startAutoScroll(trackId) {
        const track = document.getElementById(trackId);
        if (!track) return;
        
        let scrollAmount = 0;
        const speed = 1; // 1 pixel per frame (60fps) -> ~60px per sec
        
        function step() {
            if (!track.matches(':hover')) {
                track.scrollLeft += speed;
                
                const firstCard = track.querySelector('.lp-movie-card');
                if (firstCard) {
                    const cardWidth = firstCard.offsetWidth;
                    const gap = parseFloat(window.getComputedStyle(track).gap) || 20; // fallback 20px
                    const totalItems = track.querySelectorAll('.lp-movie-card').length;
                    const itemsPerSet = totalItems / 2;
                    
                    const resetPoint = (cardWidth + gap) * itemsPerSet;
                    
                    if (track.scrollLeft >= resetPoint) {
                        track.scrollLeft -= resetPoint;
                    }
                }
            }
            requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // ── Taste Demo ─────────────────────────────────────────────────────────
    function initTasteDemo() {
        const container = document.getElementById('taste-moods');
        if (!container) return;

        Object.keys(MOOD_CONFIG).forEach(mood => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lp-taste-mood';
            btn.textContent = mood;
            btn.addEventListener('click', () => selectTasteMood(mood, btn));
            container.appendChild(btn);
        });

        // Pre-warm discover cache silently
        Object.values(MOOD_CONFIG).forEach(cfg => fetchGenreMovies(cfg.genreId));
    }

    async function selectTasteMood(mood, btn) {
        document.querySelectorAll('.lp-taste-mood').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        const cfg = MOOD_CONFIG[mood];
        if (!cfg) return;

        const placeholder = document.getElementById('taste-placeholder');
        const card = document.getElementById('taste-card');
        const tease = document.getElementById('taste-tease');

        placeholder.classList.add('hidden');
        card.classList.remove('hidden');
        tease.classList.remove('hidden');
        card.innerHTML = '<div class="lp-taste-loading"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';

        const movies = await fetchGenreMovies(cfg.genreId);

        if (!movies.length) {
            card.innerHTML = '<div class="lp-taste-error">Could not load a sample. Try again.</div>';
            return;
        }

        if (_pickIndex[mood] === undefined) _pickIndex[mood] = 0;
        const movie = movies[_pickIndex[mood] % movies.length];
        _pickIndex[mood]++;

        const matchScore = movie.rating
            ? Math.min(98, Math.round(55 + movie.rating * 4.3))
            : 80;

        card.innerHTML = '';

        // Poster
        if (movie.poster_url) {
            const img = document.createElement('img');
            img.src = movie.poster_url;
            img.alt = movie.title;
            img.className = 'lp-taste-poster';
            img.loading = 'lazy';
            card.appendChild(img);
        } else {
            const ph = document.createElement('div');
            ph.className = 'lp-taste-poster-ph';
            ph.innerHTML = '<i class="fa-solid fa-film"></i>';
            card.appendChild(ph);
        }

        // Body
        const body = document.createElement('div');
        body.className = 'lp-taste-body';

        const matchEl = document.createElement('div');
        matchEl.className = 'lp-taste-match';
        const matchVal = document.createElement('span');
        matchVal.className = 'lp-taste-match-val';
        matchVal.textContent = `${matchScore}%`;
        matchEl.appendChild(matchVal);
        matchEl.appendChild(document.createTextNode(' match'));

        const ratingEl = document.createElement('div');
        ratingEl.className = 'lp-taste-rating';
        ratingEl.innerHTML = `<i class="fa-solid fa-star" style="color:#f5c518;font-size:11px;"></i> ${movie.rating ? movie.rating.toFixed(1) : 'N/A'}`;

        const titleEl = document.createElement('div');
        titleEl.className = 'lp-taste-title';
        titleEl.textContent = movie.title;

        const metaEl = document.createElement('div');
        metaEl.className = 'lp-taste-meta';
        metaEl.textContent = `${movie.year || '—'} · ${cfg.genreLabel} · Sample pick for "${mood}" mood`;

        const reasonEl = document.createElement('p');
        reasonEl.className = 'lp-taste-reason';
        reasonEl.textContent = cfg.reason;

        const nextEl = document.createElement('button');
        nextEl.type = 'button';
        nextEl.className = 'lp-taste-next';
        nextEl.innerHTML = '<i class="fa-solid fa-shuffle"></i> Try another pick';
        nextEl.addEventListener('click', () => selectTasteMood(mood, btn));

        body.appendChild(matchEl);
        body.appendChild(ratingEl);
        body.appendChild(titleEl);
        body.appendChild(metaEl);
        body.appendChild(reasonEl);
        body.appendChild(nextEl);
        card.appendChild(body);

        card.style.animation = 'none';
        void card.offsetWidth;
        card.style.animation = '';
    }

    // ── Smooth scroll ───────────────────────────────────────────────────────
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

    // ── Nav scroll shadow ───────────────────────────────────────────────────
    function initNavScroll() {
        const nav = document.getElementById('main-nav');
        if (!nav) return;
        window.addEventListener('scroll', () => {
            nav.classList.toggle('scrolled', window.scrollY > 60);
        }, { passive: true });
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    async function boot() {
        initNavScroll();
        initSmoothScroll();
        initTasteDemo();

        const trendingRaw = await fetchTrending();
        
        // Shuffle the array and use all 20 to avoid seeing obvious duplicates
        const trending = [...trendingRaw].sort(() => 0.5 - Math.random());

        // Set hero backdrop from first trending movie that has one
        await initHeroBackdrop(trending);

        // Render carousels
        renderTrack('trending-track', trending, false);
        startAutoScroll('trending-track');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
