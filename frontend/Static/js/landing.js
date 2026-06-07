/**
 * landing.js — Landing Page Controller
 *
 * Fetches data from TMDB and renders:
 *   1. Hero Carousel (auto-play, infinite loop, TMDB trending backdrops)
 *   2. Trending Movies horizontal scroll row
 *   3. Infinite Ticker (poster strip)
 *   4. Popular Movies grid
 *
 * Also handles Watchlist add/remove via Supabase.
 */
(function () {
    'use strict';

    /* ── Config ──────────────────────────────────────────────── */
    const TMDB_KEY    = (window.APP_CONFIG && window.APP_CONFIG.TMDB_API_KEY) || '';
    const TMDB_BASE   = 'https://api.themoviedb.org/3';
    const IMG_ORIG    = 'https://image.tmdb.org/t/p/original';
    const IMG_W500    = 'https://image.tmdb.org/t/p/w500';
    const IMG_W300    = 'https://image.tmdb.org/t/p/w300';
    const HERO_INTERVAL = 7000; // ms between auto slides

    /* ── Genre Map ──────────────────────────────────────────── */
    const GENRE_MAP = {
        28: 'Action', 12: 'Adventure', 16: 'Animation',
        35: 'Comedy', 80: 'Crime', 99: 'Documentary',
        18: 'Drama', 10751: 'Family', 14: 'Fantasy',
        36: 'History', 27: 'Horror', 10402: 'Music',
        9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
        10770: 'TV Movie', 53: 'Thriller', 10752: 'War',
        37: 'Western'
    };

    /* ── Helpers ─────────────────────────────────────────────── */
    async function tmdb(path) {
        const sep = path.includes('?') ? '&' : '?';
        const res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${TMDB_KEY}&language=en-US`);
        if (!res.ok) throw new Error('TMDB ' + res.status);
        return res.json();
    }

    function fmt(n) {
        return n ? n.toFixed(1) : '–';
    }

    function year(dateStr) {
        return dateStr ? dateStr.slice(0, 4) : '';
    }

    function runtime(mins) {
        if (!mins) return '';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return h ? `${h}h ${m}m` : `${m}m`;
    }

    function genreNames(ids, max = 2) {
        return (ids || []).slice(0, max).map(id => GENRE_MAP[id] || '').filter(Boolean);
    }

    function goDetail(id) {
        window.location.href = `detail.html?id=${id}`;
    }

    /* ══════════════════════════════════════════════════════════
       HERO CAROUSEL
       ══════════════════════════════════════════════════════════ */
    let heroMovies = [];
    let heroIndex  = 0;
    let heroTimer  = null;
    let heroProgressTimer = null;
    let heroProgressStart = null;

    async function initHero() {
        try {
            // Fetch top 8 trending for hero
            const data = await tmdb('/trending/movie/week?page=1');
            heroMovies = (data.results || []).filter(m => m.backdrop_path).slice(0, 8);
            if (heroMovies.length === 0) return;

            // Remove skeleton
            const skeleton = document.getElementById('hero-skeleton');
            if (skeleton) skeleton.remove();

            buildHeroSlides();
            buildHeroIndicators();
            showHeroSlide(0, false);
            startHeroAutoplay();
        } catch (e) {
            console.error('Hero load failed', e);
        }
    }

    function buildHeroSlides() {
        const slidesEl = document.getElementById('hero-slides');
        heroMovies.forEach((m, i) => {
            const slide = document.createElement('div');
            slide.className = 'lp-slide';
            slide.dataset.index = i;

            const genres = genreNames(m.genre_ids);

            slide.innerHTML = `
                <div class="lp-slide-bg" style="background-image: url('${IMG_ORIG}${m.backdrop_path}');"></div>
                <div class="lp-slide-overlay"></div>
                <div class="lp-slide-content">
                    <div class="lp-slide-badge">
                        <span class="lp-badge-featured">Featured</span>
                        <span class="lp-slide-meta">${genres.join(' · ')}${m.release_date ? ' • ' + year(m.release_date) : ''}</span>
                    </div>
                    <h1 class="lp-slide-title">${(m.title || m.name || 'Unknown').toUpperCase()}</h1>
                    <div class="lp-slide-stats">
                        <div class="lp-rating">
                            <i class="fa-solid fa-star lp-rating-star"></i>
                            <span class="lp-rating-val">${fmt(m.vote_average)}</span>
                            <span style="font-size:0.75rem;color:rgba(255,255,255,0.35)">/10</span>
                        </div>
                        <span>${m.vote_count ? m.vote_count.toLocaleString() + ' votes' : ''}</span>
                    </div>
                    <p class="lp-slide-overview">${m.overview || 'No description available.'}</p>
                    <div class="lp-slide-actions">
                        <button class="lp-btn lp-btn-primary" onclick="goDetail(${m.id})">
                            <i class="fa-solid fa-circle-info"></i> View Details
                        </button>
                        <button class="lp-btn lp-btn-secondary lp-watchlist-btn" id="wl-btn-${m.id}"
                            data-id="${m.id}"
                            data-title="${(m.title||'').replace(/"/g,'&quot;')}"
                            data-poster="${m.poster_path || ''}"
                            data-rating="${m.vote_average || 0}"
                            data-year="${year(m.release_date)}"
                            onclick="addToWishlist(this)">
                            <i class="fa-solid fa-plus"></i> Watchlist
                        </button>
                    </div>
                </div>
            `;

            slidesEl.appendChild(slide);
        });
    }

    function buildHeroIndicators() {
        const el = document.getElementById('hero-indicators');
        heroMovies.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.className = 'lp-indicator';
            dot.setAttribute('aria-label', `Slide ${i + 1}`);
            dot.addEventListener('click', () => {
                stopHeroAutoplay();
                showHeroSlide(i);
                startHeroAutoplay();
            });
            el.appendChild(dot);
        });
    }

    function showHeroSlide(idx, animate = true) {
        const slides = document.querySelectorAll('.lp-slide');
        const indicators = document.querySelectorAll('.lp-indicator');

        // Deactivate all
        slides.forEach((s, i) => {
            if (s.classList.contains('active')) {
                if (animate) s.classList.add('leaving');
                setTimeout(() => { s.classList.remove('active', 'leaving'); }, 800);
            } else {
                s.classList.remove('active', 'entering', 'leaving');
            }
        });

        // Activate new
        const target = slides[idx];
        if (!target) return;
        if (animate) target.classList.add('entering');
        target.classList.add('active');
        setTimeout(() => target.classList.remove('entering'), 800);

        // Indicators
        indicators.forEach((dot, i) => {
            dot.classList.toggle('active', i === idx);
        });

        heroIndex = idx;
        resetHeroProgress();
    }

    function nextHeroSlide() {
        const next = (heroIndex + 1) % heroMovies.length;
        showHeroSlide(next);
    }

    function prevHeroSlide() {
        const prev = (heroIndex - 1 + heroMovies.length) % heroMovies.length;
        showHeroSlide(prev);
    }

    function startHeroAutoplay() {
        stopHeroAutoplay();
        heroTimer = setInterval(() => {
            nextHeroSlide();
        }, HERO_INTERVAL);
        resetHeroProgress();
    }

    function stopHeroAutoplay() {
        if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
        if (heroProgressTimer) { cancelAnimationFrame(heroProgressTimer); heroProgressTimer = null; }
    }

    function resetHeroProgress() {
        const fill = document.getElementById('hero-progress-fill');
        if (!fill) return;
        fill.style.transition = 'none';
        fill.style.width = '0%';
        void fill.offsetWidth; // reflow
        fill.style.transition = `width ${HERO_INTERVAL}ms linear`;
        fill.style.width = '100%';
    }

    // Arrow buttons
    document.getElementById('hero-prev').addEventListener('click', () => {
        stopHeroAutoplay();
        prevHeroSlide();
        startHeroAutoplay();
    });
    document.getElementById('hero-next').addEventListener('click', () => {
        stopHeroAutoplay();
        nextHeroSlide();
        startHeroAutoplay();
    });

    // Touch swipe
    let touchStartX = 0;
    const heroSection = document.getElementById('hero-section');
    heroSection.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    heroSection.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 40) {
            stopHeroAutoplay();
            dx < 0 ? nextHeroSlide() : prevHeroSlide();
            startHeroAutoplay();
        }
    });

    // Pause on hover
    heroSection.addEventListener('mouseenter', stopHeroAutoplay);
    heroSection.addEventListener('mouseleave', startHeroAutoplay);

    // Expose goDetail globally
    window.goDetail = goDetail;

    /* ══════════════════════════════════════════════════════════
       TRENDING ROW
       ══════════════════════════════════════════════════════════ */
    async function initTrending() {
        try {
            const data = await tmdb('/trending/movie/week?page=1');
            const movies = (data.results || []).slice(0, 20);

            const skeleton = document.getElementById('trending-skeleton');
            if (skeleton) skeleton.remove();

            const track = document.getElementById('trending-track');
            movies.forEach((m, i) => {
                const card = document.createElement('div');
                card.className = 'lp-movie-card';
                card.title = m.title || '';
                card.addEventListener('click', () => goDetail(m.id));

                const posterSrc = m.poster_path ? `${IMG_W300}${m.poster_path}` : '';

                card.innerHTML = `
                    ${i < 10 ? `<div class="lp-card-rank">${i + 1}</div>` : ''}
                    ${posterSrc
                        ? `<img class="lp-card-poster" src="${posterSrc}" alt="${m.title}" loading="lazy">`
                        : `<div class="lp-card-poster-placeholder"><i class="fa-solid fa-film"></i></div>`
                    }
                    <div class="lp-card-info">
                        <div class="lp-card-title">${m.title || m.name || 'Unknown'}</div>
                        <div class="lp-card-rating">
                            <i class="fa-solid fa-star lp-card-star"></i>
                            <span style="color:rgba(255,255,255,0.75);font-weight:600;">${fmt(m.vote_average)}</span>
                            <span>${year(m.release_date)}</span>
                        </div>
                    </div>
                `;
                track.appendChild(card);
            });

            // Arrow scroll
            const leftBtn  = document.getElementById('trending-left');
            const rightBtn = document.getElementById('trending-right');
            leftBtn.addEventListener('click', () => {
                track.scrollBy({ left: -340, behavior: 'smooth' });
            });
            rightBtn.addEventListener('click', () => {
                track.scrollBy({ left: 340, behavior: 'smooth' });
            });
        } catch (e) {
            console.error('Trending load failed', e);
        }
    }

    /* ══════════════════════════════════════════════════════════
       INFINITE TICKER
       ══════════════════════════════════════════════════════════ */
    async function initTicker() {
        try {
            const data = await tmdb('/movie/popular?page=1');
            const movies = (data.results || []).filter(m => m.poster_path).slice(0, 20);
            const ticker = document.getElementById('ticker-track');

            // Double the list for seamless infinite loop
            const doubled = [...movies, ...movies];
            doubled.forEach(m => {
                const item = document.createElement('div');
                item.className = 'lp-ticker-item';
                item.title = m.title || '';
                item.addEventListener('click', () => goDetail(m.id));
                item.innerHTML = `<img src="${IMG_W300}${m.poster_path}" alt="${m.title}" loading="lazy">`;
                ticker.appendChild(item);
            });
        } catch (e) {
            console.error('Ticker load failed', e);
        }
    }

    /* ══════════════════════════════════════════════════════════
       POPULAR GRID
       ══════════════════════════════════════════════════════════ */
    async function initPopular() {
        try {
            const data = await tmdb('/movie/now_playing?page=1');
            const movies = (data.results || []).slice(0, 8);

            const grid = document.getElementById('popular-grid');
            // Clear skeletons
            grid.innerHTML = '';

            movies.forEach(m => {
                const card = document.createElement('div');
                card.className = 'lp-wide-card';
                card.addEventListener('click', () => goDetail(m.id));

                const backdropSrc = m.backdrop_path ? `${IMG_W500}${m.backdrop_path}` : '';
                const posterSrc   = m.poster_path   ? `${IMG_W300}${m.poster_path}` : '';
                const imgSrc      = backdropSrc || posterSrc;
                const genres      = genreNames(m.genre_ids, 3);

                card.innerHTML = `
                    <div class="lp-wide-poster-wrap">
                        ${imgSrc
                            ? `<img src="${imgSrc}" alt="${m.title}" loading="lazy">`
                            : `<div style="aspect-ratio:16/9;background:#1a0000;display:flex;align-items:center;justify-content:center;font-size:2rem;color:rgba(229,0,0,0.3)"><i class="fa-solid fa-film"></i></div>`
                        }
                        <div class="lp-wide-poster-overlay"></div>
                        <div class="lp-wide-play"><i class="fa-solid fa-play" style="margin-left:3px;"></i></div>
                    </div>
                    <div class="lp-wide-info">
                        <div class="lp-wide-title">${m.title || m.name || 'Unknown'}</div>
                        <div class="lp-wide-row">
                            <div class="lp-wide-rating">
                                <i class="fa-solid fa-star lp-wide-rating-star"></i>
                                <span class="lp-wide-rating-val">${fmt(m.vote_average)}</span>
                                <span>/10</span>
                            </div>
                            <span class="lp-wide-year">${year(m.release_date)}</span>
                        </div>
                        ${genres.length ? `<div class="lp-wide-genres">${genres.map(g => `<span class="lp-genre-pill">${g}</span>`).join('')}</div>` : ''}
                    </div>
                `;
                grid.appendChild(card);
            });
        } catch (e) {
            console.error('Popular load failed', e);
        }
    }

    /* ══════════════════════════════════════════════════════════
       WISHLIST / WATCHLIST LOGIC
       ══════════════════════════════════════════════════════════ */

    // Track saved tmdb_ids for UI state
    let savedIds = new Set();

    /**
     * Add or remove a movie from the user's watchlist (saved_movies table).
     * Called by the Watchlist button's onclick.
     */
    window.addToWishlist = async function (btn) {
        // Not logged in → show login modal
        const session = window.Auth ? await window.Auth.getSession() : null;
        if (!session) {
            if (window.Auth) window.Auth.showModal('login');
            return;
        }

        const tmdbId  = Number(btn.dataset.id);
        const title   = btn.dataset.title   || 'Unknown';
        const poster  = btn.dataset.poster  || '';
        const rating  = parseFloat(btn.dataset.rating) || 0;
        const yrStr   = btn.dataset.year    || '';
        const yr      = yrStr ? parseInt(yrStr, 10) : null;
        const sb      = window.Auth.getClient();

        // Already saved → remove
        if (savedIds.has(tmdbId)) {
            try {
                btn.disabled = true;
                const { error } = await sb
                    .from('saved_movies')
                    .delete()
                    .eq('tmdb_id', tmdbId)
                    .eq('user_id', session.user.id);
                if (error) throw error;
                savedIds.delete(tmdbId);
                setWatchlistBtn(btn, false);
                if (window.showToast) window.showToast('Removed from Watchlist.', 'info');
            } catch (e) {
                if (window.showToast) window.showToast('Failed: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
            }
            return;
        }

        // Not saved → save via RPC (preferred) or direct insert (fallback)
        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving\u2026';

            const posterUrl = poster ? `https://image.tmdb.org/t/p/w500${poster}` : '';
            let saved = false;

            // Attempt 1: RPC function (handles both movies + saved_movies atomically)
            const { error: rpcErr } = await sb.rpc('save_movie_to_wishlist', {
                p_tmdb_id:    tmdbId,
                p_title:      title,
                p_poster_url: posterUrl,
                p_rating:     rating,
                p_year:       yr,
            });

            if (!rpcErr) {
                saved = true;
            } else if (rpcErr.code === 'PGRST202' || rpcErr.message.includes('Could not find')) {
                // RPC not deployed yet → fallback: direct upsert + insert
                console.warn('[wishlist] RPC not found, trying direct insert');
                try {
                    await sb.from('movies').upsert(
                        { tmdb_id: tmdbId, title, poster_url: posterUrl, rating, year: yr },
                        { onConflict: 'tmdb_id', ignoreDuplicates: true }
                    );
                } catch (_) { /* ignore movies insert errors — may succeed if movie already exists */ }

                const { error: insertErr } = await sb
                    .from('saved_movies')
                    .insert({ tmdb_id: tmdbId, user_id: session.user.id });

                if (insertErr && insertErr.code !== '23505') throw insertErr;
                saved = true;
            } else {
                throw rpcErr;
            }

            if (saved) {
                savedIds.add(tmdbId);
                setWatchlistBtn(btn, true);
                if (window.showToast) window.showToast(`\u201c${title}\u201d added to Watchlist!`, 'success');
            }
        } catch (e) {
            if (window.showToast) window.showToast('Failed: ' + e.message, 'error');
            setWatchlistBtn(btn, false);
        } finally {
            btn.disabled = false;
        }
    };


    /** Update button visual state */
    function setWatchlistBtn(btn, isSaved) {
        if (isSaved) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
            btn.style.background = 'rgba(229,0,0,0.25)';
            btn.style.borderColor = 'rgba(229,0,0,0.5)';
            btn.style.color = '#fff';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-plus"></i> Watchlist';
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
        }
    }

    /** Sync saved state after user logs in/out */
    async function syncWishlistState() {
        const session = window.Auth ? await window.Auth.getSession() : null;
        if (!session) { savedIds.clear(); return; }
        try {
            const sb = window.Auth.getClient();
            const { data } = await sb.from('saved_movies').select('tmdb_id');
            savedIds = new Set((data || []).map(r => r.tmdb_id));
            // Update any visible buttons
            document.querySelectorAll('.lp-watchlist-btn').forEach(btn => {
                setWatchlistBtn(btn, savedIds.has(Number(btn.dataset.id)));
            });
        } catch (_) {}
    }

    // Re-sync when auth state changes (login/logout)
    document.addEventListener('auth:statechange', syncWishlistState);
    // Initial sync after boot
    setTimeout(syncWishlistState, 1200);

    /* ══════════════════════════════════════════════════════════
       NAV SCROLL EFFECT
       ══════════════════════════════════════════════════════════ */
    const nav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });

    /* ══════════════════════════════════════════════════════════
       BOOT
       ══════════════════════════════════════════════════════════ */
    async function boot() {
        if (!TMDB_KEY) {
            console.warn('TMDB_API_KEY not set — landing data unavailable.');
            return;
        }
        // Run hero first (critical path), rest in parallel
        initHero();
        Promise.all([
            initTrending(),
            initTicker(),
            initPopular(),
        ]);
    }

    // Wait for API ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
