/**
 * auth.js — Supabase Auth Controller
 *
 * Wraps Supabase JS client untuk login/register/logout,
 * dan mengontrol glassmorphism auth modal states.
 *
 * Requires: supabase CDN script loaded BEFORE this file.
 */
(function (window) {

    // ── Supabase client (sudah diinit di HTML via APP_CONFIG) ──
    function getClient() {
        if (window._supabaseClient) return window._supabaseClient;
        const cfg = window.APP_CONFIG;
        if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
            console.error('[auth.js] APP_CONFIG.SUPABASE_URL / SUPABASE_ANON_KEY belum diset!');
            return null;
        }
        window._supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
        return window._supabaseClient;
    }

    // ── Session helpers ────────────────────────────────────────
    async function getSession() {
        const sb = getClient();
        if (!sb) return null;
        const { data: { session } } = await sb.auth.getSession();
        return session;
    }

    async function getUser() {
        const session = await getSession();
        return session ? session.user : null;
    }

    async function isLoggedIn() {
        const session = await getSession();
        return !!session;
    }

    async function isEmailVerified() {
        const user = await getUser();
        return !!(user && user.email_confirmed_at);
    }

    function getAccessToken() {
        // Synchronous fallback — reads cached token
        try {
            const cfg = window.APP_CONFIG;
            const key = `sb-${new URL(cfg.SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw).access_token || null;
        } catch { /* ignore */ }
        return null;
    }

    // ── Auth actions ───────────────────────────────────────────
    async function login(email, password) {
        const sb = getClient();
        if (!sb) throw new Error('Supabase not initialised');
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        updateNavState();
        hideModal();
        if (window.showToast) window.showToast('Welcome back!', 'success');
        return data;
    }

    async function register(email, password, name) {
        const sb = getClient();
        if (!sb) throw new Error('Supabase not initialised');
        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: { data: { full_name: name, name } }
        });
        if (error) throw new Error(error.message);
        updateNavState();
        hideModal();
        if (window.showToast) window.showToast('Account created! Check your email to verify.', 'success');
        return data;
    }

    async function logout() {
        const sb = getClient();
        if (sb) await sb.auth.signOut();
        updateNavState();
        if (window.showToast) window.showToast('You have been logged out.', 'info');
        window.location.href = '/';
    }

    async function forgotPassword(email) {
        const sb = getClient();
        if (!sb) throw new Error('Supabase not initialised');
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`
        });
        if (error) throw new Error(error.message);
    }

    async function resendVerification(email) {
        const sb = getClient();
        if (!sb) throw new Error('Supabase not initialised');
        const { error } = await sb.auth.resend({ type: 'signup', email });
        if (error) throw new Error(error.message);
    }

    // ── Modal controller ───────────────────────────────────────
    function showModal(state = 'login') {
        const overlay = document.getElementById('auth-modal-overlay');
        if (!overlay) return;
        overlay.classList.add('active');
        overlay.classList.remove('hidden');
        overlay.querySelectorAll('[data-auth-panel]').forEach(p => p.classList.add('hidden'));
        const target = overlay.querySelector(`[data-auth-panel="${state}"]`);
        if (target) target.classList.remove('hidden');
        overlay.querySelectorAll('.auth-error').forEach(e => { e.textContent = ''; e.classList.add('hidden'); });
    }

    function hideModal() {
        const overlay = document.getElementById('auth-modal-overlay');
        if (!overlay) return;
        overlay.classList.remove('active');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }

    function updateNavState() {
        if (window.Nav && window.Nav.update) window.Nav.update();
    }

    // ── Form bindings ──────────────────────────────────────────
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
                const btn = loginForm.querySelector('[type="submit"]');
                btn && (btn.disabled = true);
                try {
                    await login(email, password);
                } catch (err) {
                    if (errEl) { errEl.textContent = err.message || 'Login failed'; errEl.classList.remove('hidden'); }
                } finally {
                    btn && (btn.disabled = false);
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
                const btn = signupForm.querySelector('[type="submit"]');
                btn && (btn.disabled = true);
                try {
                    await register(email, pw, name);
                } catch (err) {
                    if (errEl) { errEl.textContent = err.message || 'Registration failed'; errEl.classList.remove('hidden'); }
                } finally {
                    btn && (btn.disabled = false);
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
                } catch { /* show success regardless */ }
                showModal('forgot-sent');
            });
        }

        // Close on overlay click
        const overlay = document.getElementById('auth-modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => { if (e.target === overlay) hideModal(); });
        }

        // Login trigger (delegated)
        document.addEventListener('click', (e) => {
            if (e.target.closest('#login-trigger')) showModal('login');
        });

        // Listen for Supabase auth state changes
        const sb = getClient();
        if (sb) {
            sb.auth.onAuthStateChange((_event, session) => {
                updateNavState();
            });
        }
    });

    // ── Export ─────────────────────────────────────────────────
    window.Auth = {
        getClient,
        getSession,
        getUser,
        isLoggedIn,
        isEmailVerified,
        getAccessToken,
        login,
        register,
        logout,
        forgotPassword,
        resendVerification,
        showModal,
        hideModal,
    };
})(window);
