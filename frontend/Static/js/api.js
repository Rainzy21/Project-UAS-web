/**
 * api.js — Central HTTP Client
 *
 * Wraps fetch dengan Supabase JWT token (diambil dari supabase.auth.getSession),
 * TMDB direct calls untuk data publik, dan error normalization.
 *
 * Load order: supabase-cdn → api.js → auth.js → page scripts
 */
(function (window) {
    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:8000';
    const TMDB_BASE = 'https://api.themoviedb.org/3';

    // ── Auth header dari Supabase session ─────────────────────
    async function getAuthHeaders() {
        // Gunakan client yang sudah diinit oleh auth.js, atau fallback ke window.supabase
        const sb = window._supabaseClient || window.supabase;
        if (sb) {
            try {
                const { data: { session } } = await sb.auth.getSession();
                if (session && session.access_token) {
                    return { Authorization: `Bearer ${session.access_token}` };
                }
            } catch { /* fallback ke localStorage */ }
        }
        // Fallback: token tersimpan manual (untuk compat)
        const token = localStorage.getItem('app_access_token');
        if (token) return { Authorization: `Bearer ${token}` };
        return {};
    }

    // ── Core request ──────────────────────────────────────────
    async function request(method, path, body, options = {}) {
        const headers = await getAuthHeaders();
        if (body) headers['Content-Type'] = 'application/json';

        const res = await fetch(API_BASE + path, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            ...options,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
            const error = new Error(err.detail || err.message || 'Request failed');
            error.status = res.status;
            error.data = err;
            throw error;
        }

        if (res.status === 204) return null;
        return res.json();
    }

    // ── TMDB direct calls (public, no auth) ──────────────────
    function tmdbKey() {
        return (window.APP_CONFIG && window.APP_CONFIG.TMDB_API_KEY) || '';
    }

    async function tmdbFetch(path) {
        const key = tmdbKey();
        if (!key) throw new Error('TMDB_API_KEY not configured in APP_CONFIG');
        const res = await fetch(`${TMDB_BASE}${path}&api_key=${key}`);
        if (!res.ok) throw new Error('TMDB request failed: ' + res.status);
        return res.json();
    }

    async function fetchTrendingMovies() {
        const data = await tmdbFetch('/trending/movie/week?language=en-US');
        return data.results || [];
    }

    async function searchTmdbMovies(query, page = 1) {
        return tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&page=${page}&language=en-US`);
    }

    async function fetchMoviesByGenre(genreId, page = 1) {
        return tmdbFetch(`/discover/movie?with_genres=${genreId}&sort_by=popularity.desc&page=${page}&language=en-US`);
    }

    async function fetchMovieDetail(tmdbId) {
        return tmdbFetch(`/movie/${tmdbId}?append_to_response=credits,videos&language=en-US`);
    }

    function posterUrl(path) {
        return path ? `https://image.tmdb.org/t/p/w500${path}` : '';
    }

    function backdropUrl(path) {
        return path ? `https://image.tmdb.org/t/p/original${path}` : '';
    }

    // ── Exports ───────────────────────────────────────────────
    window.Api = {
        get:    (path, opts)       => request('GET',    path, null, opts),
        post:   (path, body, opts) => request('POST',   path, body, opts),
        patch:  (path, body, opts) => request('PATCH',  path, body, opts),
        delete: (path, opts)       => request('DELETE', path, null, opts),
    };

    window.AppAPI = {
        fetchTrendingMovies,
        searchTmdbMovies,
        fetchMoviesByGenre,
        fetchMovieDetail,
        posterUrl,
        backdropUrl,
    };
})(window);
