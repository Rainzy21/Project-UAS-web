/**
 * Force a single dev origin so Supabase PKCE storage stays on localhost.
 * Browsing via 127.0.0.1 breaks Google sign-in (code verifier not found).
 */
(function () {
    'use strict';
    if (window.location.hostname !== '127.0.0.1') return;

    const { protocol, port, pathname, search, hash } = window.location;
    const host = port ? `localhost:${port}` : 'localhost';
    window.location.replace(`${protocol}//${host}${pathname}${search}${hash}`);
})();
