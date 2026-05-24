/**
 * auth.js — Authentication State & Modal Controller
 *
 * Manages JWT tokens in localStorage, provides login/register/logout,
 * and controls the glassmorphism auth modal states.
 */
(function (window) {
    const KEYS = {
        access:  'app_access_token',
        refresh: 'app_refresh_token',
        user:    'app_user',
    };

    let _refreshPromise = null;

    // ── Token helpers ──────────────────────────────────────────
    function getAccessToken() {
        return localStorage.getItem(KEYS.access);
    }

    function getRefreshToken() {
        return localStorage.getItem(KEYS.refresh);
    }

    function getUser() {
        try { return JSON.parse(localStorage.getItem(KEYS.user)); }
        catch { return null; }
    }

    function isLoggedIn() {
        return !!getAccessToken();
    }

    function isEmailVerified() {
        const u = getUser();
        return u && u.email_verified === true;
    }

    function saveTokens({ access_token, refresh_token, user }) {
        if (access_token) localStorage.setItem(KEYS.access, access_token);
        if (refresh_token) localStorage.setItem(KEYS.refresh, refresh_token);
        if (user) localStorage.setItem(KEYS.user, JSON.stringify(user));
    }

    function clearTokens() {
        localStorage.removeItem(KEYS.access);
        localStorage.removeItem(KEYS.refresh);
        localStorage.removeItem(KEYS.user);
    }

    // ── Refresh — singleton pattern ────────────────────────────
    async function refreshTokens() {
        if (_refreshPromise) return _refreshPromise;
        _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null; });
        return _refreshPromise;
    }

    async function _doRefresh() {
        const rt = getRefreshToken();
        if (!rt) return false;
        try {
            const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:8000';
            const res = await fetch(API_BASE + '/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: rt }),
            });
            if (!res.ok) {
                clearTokens();
                return false;
            }
            const data = await res.json();
            saveTokens(data);
            return true;
        } catch {
            clearTokens();
            return false;
        }
    }

    // ── Auth actions ───────────────────────────────────────────
    async function login(email, password) {
        const data = await window.Api.post('/api/auth/login', { email, password });
        if (data) {
            saveTokens(data);
            updateNavState();
            hideModal();
            if (window.showToast) window.showToast('Welcome back!', 'success');
        }
        return data;
    }

    async function register(name, email, password) {
        const data = await window.Api.post('/api/auth/register', { name, email, password });
        if (data) {
            saveTokens(data);
            updateNavState();
            hideModal();
            if (window.showToast) window.showToast('Account created! Please verify your email.', 'success');
        }
        return data;
    }

    async function logout() {
        try {
            await window.Api.post('/api/auth/logout', { refresh_token: getRefreshToken() });
        } catch { /* ignore */ }
        clearTokens();
        updateNavState();
        if (window.showToast) window.showToast('You have been logged out.', 'info');
        window.location.href = '/';
    }

    async function forgotPassword(email) {
        return window.Api.post('/api/auth/forgot-password', { email });
    }

    async function resetPassword(token, newPassword) {
        return window.Api.post('/api/auth/reset-password', { token, new_password: newPassword });
    }

    async function resendVerification() {
        return window.Api.post('/api/auth/resend-verification');
    }

    async function verifyEmail(token) {
        return window.Api.post('/api/auth/verify-email', { token });
    }

    // ── Modal controller ──────────────────────────────────────
    function showModal(state = 'login') {
        const overlay = document.getElementById('auth-modal-overlay');
        if (!overlay) return;
        overlay.classList.add('active');
        overlay.classList.remove('hidden');

        // Hide all panels, show requested one
        overlay.querySelectorAll('[data-auth-panel]').forEach(p => {
            p.classList.add('hidden');
        });
        const target = overlay.querySelector(`[data-auth-panel="${state}"]`);
        if (target) target.classList.remove('hidden');

        // Clear form errors
        overlay.querySelectorAll('.auth-error').forEach(e => { e.textContent = ''; e.classList.add('hidden'); });
    }

    function hideModal() {
        const overlay = document.getElementById('auth-modal-overlay');
        if (!overlay) return;
        overlay.classList.remove('active');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }

    // ── Nav state helper ───────────────────────────────────────
    function updateNavState() {
        if (window.Nav && window.Nav.update) window.Nav.update();
    }

    // ── Bind modal forms on DOMContentLoaded ──────────────────
    document.addEventListener('DOMContentLoaded', () => {
        // Login form
        const loginForm = document.getElementById('auth-login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const errEl = document.getElementById('login-error');
                errEl && errEl.classList.add('hidden');
                const email = loginForm.querySelector('[name="email"]').value.trim();
                const password = loginForm.querySelector('[name="password"]').value;
                try {
                    await login(email, password);
                } catch (err) {
                    if (errEl) {
                        errEl.textContent = err.message || 'Login failed';
                        errEl.classList.remove('hidden');
                    }
                }
            });
        }

        // Signup form
        const signupForm = document.getElementById('auth-signup-form');
        if (signupForm) {
            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const errEl = document.getElementById('signup-error');
                errEl && errEl.classList.add('hidden');
                const name = signupForm.querySelector('[name="name"]').value.trim();
                const email = signupForm.querySelector('[name="email"]').value.trim();
                const pw = signupForm.querySelector('[name="password"]').value;
                const pw2 = signupForm.querySelector('[name="confirm_password"]').value;
                if (pw !== pw2) {
                    if (errEl) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('hidden'); }
                    return;
                }
                try {
                    await register(name, email, pw);
                } catch (err) {
                    if (errEl) {
                        errEl.textContent = err.message || 'Registration failed';
                        errEl.classList.remove('hidden');
                    }
                }
            });
        }

        // Forgot password form
        const forgotForm = document.getElementById('auth-forgot-form');
        if (forgotForm) {
            forgotForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = forgotForm.querySelector('[name="email"]').value.trim();
                try {
                    await forgotPassword(email);
                    showModal('forgot-sent');
                } catch {
                    showModal('forgot-sent'); // Show success regardless (security)
                }
            });
        }

        // Modal close on overlay click
        const overlay = document.getElementById('auth-modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) hideModal();
            });
        }

        // Login trigger
        document.addEventListener('click', (e) => {
            if (e.target.closest('#login-trigger')) {
                showModal('login');
            }
        });
    });

    // ── Export ──────────────────────────────────────────────────
    window.Auth = {
        getAccessToken,
        getRefreshToken,
        getUser,
        isLoggedIn,
        isEmailVerified,
        saveTokens,
        clearTokens,
        refreshTokens,
        login,
        register,
        logout,
        forgotPassword,
        resetPassword,
        resendVerification,
        verifyEmail,
        showModal,
        hideModal,
    };
})(window);
