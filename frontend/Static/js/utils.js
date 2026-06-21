/**
 * utils.js — Shared safe rendering and redirect helpers
 */
(function (window) {
    'use strict';

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
        );
    }

    function safePosterUrl(url) {
        if (!url || typeof url !== 'string') return null;
        try {
            const u = new URL(url);
            if (u.protocol !== 'https:' || !u.hostname.endsWith('image.tmdb.org')) return null;
            return u.href;
        } catch {
            return null;
        }
    }

    function safeRedirectPath(stored) {
        if (!stored || typeof stored !== 'string') return '/';
        if (!stored.startsWith('/') || stored.startsWith('//')) return '/';
        if (/^https?:/i.test(stored)) return '/';
        return stored;
    }

    function createPosterElement(posterUrl, className) {
        const posterSrc = safePosterUrl(posterUrl);
        if (posterSrc) {
            const img = document.createElement('img');
            img.className = className || '';
            img.src = posterSrc;
            img.alt = '';
            img.loading = 'lazy';
            return img;
        }
        const ph = document.createElement('div');
        ph.className = (className || '') + ' rec-rate-poster-ph';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-film';
        ph.appendChild(icon);
        return ph;
    }

    window.AppUtils = {
        escapeHtml,
        safePosterUrl,
        safeRedirectPath,
        createPosterElement,
    };
})(window);
