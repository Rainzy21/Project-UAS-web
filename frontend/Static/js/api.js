/**
 * api.js — Central HTTP Client
 */
(function (window) {
    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:8000';

    async function getAuthHeaders() {
        const sb = window._supabaseClient || window.supabase;
        if (sb) {
            try {
                const { data: { session } } = await sb.auth.getSession();
                if (session && session.access_token) {
                    return { Authorization: `Bearer ${session.access_token}` };
                }
            } catch { /* no session */ }
        }
        return {};
    }

    async function request(method, path, body, options = {}) {
        const headers = await getAuthHeaders();
        const hasBody = body !== undefined && body !== null;
        if (hasBody) headers['Content-Type'] = 'application/json';

        const res = await fetch(API_BASE + path, {
            method,
            headers,
            body: hasBody ? JSON.stringify(body) : options.body,
            ...options,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
            let msg = err.detail || err.message || 'Request failed';
            if (typeof msg === 'object') {
                msg = msg.message || JSON.stringify(msg);
            }
            const error = new Error(msg);
            error.status = res.status;
            error.data = err;
            throw error;
        }

        if (res.status === 204) return null;
        return res.json();
    }

    async function fetchTrendingMovies() {
        const data = await request('GET', '/api/movies/trending');
        return data.results || data || [];
    }

    async function fetchMovieDetail(tmdbId) {
        return request('GET', `/api/movies/${encodeURIComponent(tmdbId)}/full`);
    }

    function posterUrl(path) {
        return path ? `https://image.tmdb.org/t/p/w500${path}` : '';
    }

    function backdropUrl(path) {
        return path ? `https://image.tmdb.org/t/p/original${path}` : '';
    }

    window.Api = {
        get:    (path, opts)       => request('GET',    path, null, opts),
        post:   (path, body, opts) => request('POST',   path, body, opts),
        patch:  (path, body, opts) => request('PATCH',  path, body, opts),
        delete: (path, body, opts) => request('DELETE', path, body, opts),
    };

    window.AppAPI = {
        fetchTrendingMovies,
        fetchMovieDetail,
        posterUrl,
        backdropUrl,
    };
})(window);
