/**
 * auth.js — Supabase Auth (email/password + Google OAuth)
 */
(function (window) {
    'use strict';

    const AUTH_MODAL_HTML = `
<div id="auth-modal-overlay" class="glass-modal-overlay" aria-hidden="true">
    <div class="glass-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <button type="button" class="auth-modal-close" id="auth-modal-close" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="auth-modal-body">
            <div class="auth-modal-brand">
                <div class="auth-modal-logo">SJ</div>
            </div>

            <div data-auth-panel="login">
                <div class="auth-modal-header">
                    <h2 id="auth-modal-title" class="auth-modal-title">Sign in</h2>
                    <p class="auth-modal-subtitle" id="auth-modal-subtitle">Sign in to continue</p>
                </div>
                <p id="login-error" class="auth-form-error hidden" role="alert"></p>
                <form id="login-form" class="auth-form">
                    <div class="auth-field">
                        <label for="login-email">Email</label>
                        <input id="login-email" type="email" class="glass-input" placeholder="you@example.com" autocomplete="email" required>
                    </div>
                    <div class="auth-field">
                        <label for="login-password">Password</label>
                        <input id="login-password" type="password" class="glass-input" placeholder="Enter your password" autocomplete="current-password" required>
                    </div>
                    <p class="auth-forgot-link"><button type="button" class="auth-link-btn" data-auth-switch="forgot">Forgot password?</button></p>
                    <button type="submit" class="auth-submit-btn">Sign in</button>
                </form>
                <div class="auth-divider-or"><span>or</span></div>
                <div class="auth-oauth-buttons">
                    <button type="button" class="auth-oauth-btn auth-oauth-google" data-oauth="google">
                        <i class="fa-brands fa-google"></i>
                        <span>Continue with Google</span>
                    </button>
                </div>
                <p class="auth-switch">Don't have an account? <button type="button" class="auth-link-btn" data-auth-switch="signup">Create one</button></p>
            </div>

            <div data-auth-panel="signup" class="hidden">
                <div class="auth-modal-header">
                    <h2 class="auth-modal-title">Create account</h2>
                    <p class="auth-modal-subtitle" id="signup-modal-subtitle">Join SJ MovieReview</p>
                </div>
                <p id="signup-error" class="auth-form-error hidden" role="alert"></p>
                <div id="signup-success" class="hidden auth-modal-header">
                    <p class="auth-modal-subtitle">Check your email to confirm your account, then sign in.</p>
                </div>
                <form id="signup-form" class="auth-form">
                    <div class="auth-field">
                        <label for="signup-name">Name</label>
                        <input id="signup-name" type="text" class="glass-input" placeholder="Your name" autocomplete="name" required>
                    </div>
                    <div class="auth-field">
                        <label for="signup-email">Email</label>
                        <input id="signup-email" type="email" class="glass-input" placeholder="you@example.com" autocomplete="email" required>
                    </div>
                    <div class="auth-field">
                        <label for="signup-password">Password</label>
                        <input id="signup-password" type="password" class="glass-input" placeholder="Create a password" autocomplete="new-password" required>
                    </div>
                    <div class="auth-field">
                        <label for="signup-confirm">Confirm password</label>
                        <input id="signup-confirm" type="password" class="glass-input" placeholder="Repeat your password" autocomplete="new-password" required>
                    </div>
                    <button type="submit" class="auth-submit-btn">Create account</button>
                </form>
                <div class="auth-divider-or" id="signup-oauth-divider"><span>or</span></div>
                <div class="auth-oauth-buttons" id="signup-oauth-buttons">
                    <button type="button" class="auth-oauth-btn auth-oauth-google" data-oauth="google">
                        <i class="fa-brands fa-google"></i>
                        <span>Continue with Google</span>
                    </button>
                </div>
                <p class="auth-switch" id="signup-switch">Already have an account? <button type="button" class="auth-link-btn" data-auth-switch="login">Sign in</button></p>
            </div>

            <div data-auth-panel="forgot" class="hidden">
                <div class="auth-modal-header">
                    <h2 class="auth-modal-title">Reset password</h2>
                    <p class="auth-modal-subtitle">We'll email you a reset link</p>
                </div>
                <p id="forgot-error" class="auth-form-error hidden" role="alert"></p>
                <div id="forgot-sent" class="hidden auth-modal-header">
                    <p class="auth-modal-subtitle">Check your email for a password reset link.</p>
                </div>
                <form id="forgot-form" class="auth-form">
                    <div class="auth-field">
                        <label for="forgot-email">Email</label>
                        <input id="forgot-email" type="email" class="glass-input" placeholder="you@example.com" autocomplete="email" required>
                    </div>
                    <button type="submit" class="auth-submit-btn">Send reset link</button>
                </form>
                <p class="auth-switch"><button type="button" class="auth-link-btn" data-auth-switch="login">Back to sign in</button></p>
            </div>
        </div>
    </div>
</div>`;

    function getClient() {
        if (window._supabaseClient) return window._supabaseClient;
        const cfg = window.APP_CONFIG;
        if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
            console.error('[auth.js] APP_CONFIG.SUPABASE_URL / SUPABASE_ANON_KEY missing');
            return null;
        }
        window._supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
            auth: { detectSessionInUrl: false, flowType: 'pkce' },
        });
        return window._supabaseClient;
    }

    function getIdentities(user) {
        return (user && user.identities) || [];
    }

    function hasPasswordIdentity(user) {
        return getIdentities(user).some(i => i.provider === 'email');
    }

    function hasGoogleIdentity(user) {
        return getIdentities(user).some(i => i.provider === 'google');
    }

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
        return !!(await getSession());
    }

    async function isEmailVerified() {
        const user = await getUser();
        return !!(user && user.email_confirmed_at);
    }

    function getAccessToken() {
        try {
            const cfg = window.APP_CONFIG;
            const key = `sb-${new URL(cfg.SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw).access_token || null;
        } catch { /* ignore */ }
        return null;
    }

    function followPostAuthRedirect() {
        const redirect = sessionStorage.getItem('postAuthRedirect');
        if (!redirect) return false;
        sessionStorage.removeItem('postAuthRedirect');
        window.location.href = redirect;
        return true;
    }

    function notifyAuthChange(loggedIn) {
        if (window.Nav && window.Nav.update) window.Nav.update();
        else {
            document.dispatchEvent(new CustomEvent('auth:statechange', { detail: { loggedIn } }));
        }
    }

    async function logout() {
        const sb = getClient();
        if (sb) await sb.auth.signOut();
        notifyAuthChange(false);
        if (window.showToast) window.showToast('You have been logged out.', 'info');
        window.location.href = '/';
    }

    function resetPasswordRedirectUrl() {
        const { hostname, port, protocol } = window.location;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            const devPort = port || '5500';
            return `${protocol}//localhost:${devPort}/reset-password.html`;
        }
        return `${window.location.origin}/reset-password.html`;
    }

    async function resetPasswordForEmail(email) {
        const sb = getClient();
        if (!sb) throw new Error('Auth is not configured');
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: resetPasswordRedirectUrl(),
        });
        if (error) throw error;
    }

    function oauthRedirectUrl() {
        const { hostname, port, protocol } = window.location;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            const devPort = port || '5500';
            return `${protocol}//localhost:${devPort}/auth-callback.html`;
        }
        return `${window.location.origin}/auth-callback.html`;
    }

    function oauthErrorMessage(error) {
        const msg = (error && (error.message || error.msg || error.error_description)) || '';
        if (/provider is not enabled|unsupported provider/i.test(msg)) {
            return 'Google sign-in is not enabled yet. In Supabase Dashboard → Authentication → Providers, turn on Google and add your OAuth Client ID and Secret.';
        }
        if (/pkce|code verifier/i.test(msg)) {
            return 'Sign-in session expired. Clear site data, open http://localhost:5500, and try again.';
        }
        if (/redirect|url/i.test(msg)) {
            return 'Redirect URL not allowed. In Supabase → Authentication → URL Configuration, add http://localhost:5500/auth-callback.html';
        }
        return msg || 'Google sign-in failed';
    }

    function isDuplicateEmailError(msg) {
        return /already registered|already been registered|user already exists|email address is already/i.test(msg);
    }

    function loginErrorMessage(error, email) {
        const msg = (error && error.message) || '';
        if (/invalid login credentials|invalid email or password/i.test(msg)) {
            return 'Invalid email or password. If you signed up with Google, use Continue with Google.';
        }
        return msg || 'Sign in failed';
    }

    function signupErrorMessage(error) {
        const msg = (error && error.message) || '';
        if (isDuplicateEmailError(msg)) {
            return 'This email is already linked to an account. Sign in with Google or use a different email.';
        }
        return msg || 'Sign up failed';
    }

    function highlightGoogleButton(panel) {
        const overlay = getOverlay();
        if (!overlay) return;
        const btn = overlay.querySelector(`[data-auth-panel="${panel}"] [data-oauth="google"]`);
        if (btn) {
            btn.style.borderColor = 'rgba(234, 67, 53, 0.6)';
            btn.style.boxShadow = '0 0 12px rgba(234, 67, 53, 0.25)';
            setTimeout(() => {
                btn.style.borderColor = '';
                btn.style.boxShadow = '';
            }, 3000);
        }
    }

    async function signInWithPassword(email, password) {
        const sb = getClient();
        if (!sb) throw new Error('Auth is not configured');
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    }

    async function signUp({ name, email, password }) {
        const sb = getClient();
        if (!sb) throw new Error('Auth is not configured');
        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: {
                data: { name, full_name: name },
                emailRedirectTo: oauthRedirectUrl(),
            },
        });
        if (error) throw error;
        return data;
    }

    async function resendVerificationEmail() {
        const sb = getClient();
        if (!sb) throw new Error('Auth is not configured');
        const user = await getUser();
        if (!user || !user.email) throw new Error('No email on file');
        const { error } = await sb.auth.resend({
            type: 'signup',
            email: user.email,
            options: { emailRedirectTo: oauthRedirectUrl() },
        });
        if (error) throw error;
    }

    async function signInWithGoogle() {
        return signInWithOAuth('google');
    }

    async function signInWithOAuth(provider) {
        const sb = getClient();
        if (!sb) throw new Error('Auth is not configured');

        if (!sessionStorage.getItem('postAuthRedirect') && !window.location.pathname.endsWith('auth-callback.html')) {
            sessionStorage.setItem('postAuthRedirect', window.location.pathname + window.location.search);
        }

        const { error } = await sb.auth.signInWithOAuth({
            provider,
            options: { redirectTo: oauthRedirectUrl() },
        });
        if (error) throw new Error(oauthErrorMessage(error));
    }

    function ensureAuthModal() {
        const existing = document.getElementById('auth-modal-overlay');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', AUTH_MODAL_HTML);
    }

    function getOverlay() {
        return document.getElementById('auth-modal-overlay');
    }

    function showError(id, message) {
        const el = document.getElementById(id);
        if (!el) return;
        if (!message) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        el.textContent = message;
        el.classList.remove('hidden');
    }

    function resetSignupPanel() {
        const form = document.getElementById('signup-form');
        const success = document.getElementById('signup-success');
        const divider = document.getElementById('signup-oauth-divider');
        const oauthBtns = document.getElementById('signup-oauth-buttons');
        const switchEl = document.getElementById('signup-switch');
        if (form) form.classList.remove('hidden');
        if (success) success.classList.add('hidden');
        if (divider) divider.classList.remove('hidden');
        if (oauthBtns) oauthBtns.classList.remove('hidden');
        if (switchEl) switchEl.classList.remove('hidden');
        showError('signup-error', '');
    }

    function showPanel(state) {
        const overlay = getOverlay();
        if (!overlay) return;
        overlay.querySelectorAll('[data-auth-panel]').forEach(panel => {
            const isActive = panel.getAttribute('data-auth-panel') === state;
            panel.classList.toggle('hidden', !isActive);
        });
        if (state === 'signup') resetSignupPanel();
        if (state === 'forgot') {
            document.getElementById('forgot-form')?.classList.remove('hidden');
            document.getElementById('forgot-sent')?.classList.add('hidden');
        }
    }

    function showModal(state = 'login', options = {}) {
        const overlay = getOverlay();
        if (!overlay) return;

        showError('login-error', '');
        showError('signup-error', '');
        showError('forgot-error', '');
        showPanel(state);

        const subtitle = document.getElementById('auth-modal-subtitle');
        if (subtitle) {
            subtitle.textContent = options.message || 'Sign in to continue';
        }

        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('auth-modal-open');
    }

    function hideModal() {
        const overlay = getOverlay();
        if (!overlay) return;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('auth-modal-open');
    }

    function bindAuthModal() {
        const overlay = getOverlay();
        if (!overlay) return;

        document.getElementById('auth-modal-close')?.addEventListener('click', hideModal);
        overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(); });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && overlay.classList.contains('active')) hideModal();
        });

        overlay.querySelectorAll('[data-auth-switch]').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal(btn.getAttribute('data-auth-switch'));
            });
        });

        overlay.querySelectorAll('[data-oauth]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const panel = btn.closest('[data-auth-panel]');
                const panelName = panel ? panel.getAttribute('data-auth-panel') : 'login';
                const errorId = panelName === 'signup' ? 'signup-error' : 'login-error';
                showError(errorId, '');
                btn.disabled = true;
                try {
                    await signInWithOAuth(btn.getAttribute('data-oauth'));
                } catch (err) {
                    showError(errorId, oauthErrorMessage(err));
                    btn.disabled = false;
                }
            });
        });

        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            showError('login-error', '');
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const btn = e.target.querySelector('[type="submit"]');
            if (btn) btn.disabled = true;

            try {
                await signInWithPassword(email, password);
                hideModal();
                notifyAuthChange(true);
                if (!followPostAuthRedirect() && window.showToast) {
                    window.showToast('Signed in successfully!', 'success');
                }
            } catch (err) {
                const msg = loginErrorMessage(err, email);
                showError('login-error', msg);
                if (/google/i.test(msg)) highlightGoogleButton('login');
            } finally {
                if (btn) btn.disabled = false;
            }
        });

        document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            showError('signup-error', '');
            const name = document.getElementById('signup-name').value.trim();
            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value;
            const confirm = document.getElementById('signup-confirm').value;
            const btn = e.target.querySelector('[type="submit"]');

            if (password !== confirm) {
                showError('signup-error', 'Passwords do not match.');
                return;
            }
            if (password.length < 6) {
                showError('signup-error', 'Password must be at least 6 characters.');
                return;
            }

            if (btn) btn.disabled = true;

            try {
                const { session } = await signUp({ name, email, password });
                if (session) {
                    hideModal();
                    notifyAuthChange(true);
                    if (!followPostAuthRedirect() && window.showToast) {
                        window.showToast('Account created!', 'success');
                    }
                } else {
                    document.getElementById('signup-form').classList.add('hidden');
                    document.getElementById('signup-oauth-divider')?.classList.add('hidden');
                    document.getElementById('signup-oauth-buttons')?.classList.add('hidden');
                    document.getElementById('signup-switch')?.classList.add('hidden');
                    document.getElementById('signup-success')?.classList.remove('hidden');
                }
            } catch (err) {
                const msg = signupErrorMessage(err);
                showError('signup-error', msg);
                if (isDuplicateEmailError(msg) || /google/i.test(msg)) {
                    highlightGoogleButton('signup');
                }
            } finally {
                if (btn) btn.disabled = false;
            }
        });

        document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            showError('forgot-error', '');
            const email = document.getElementById('forgot-email').value.trim();
            const btn = e.target.querySelector('[type="submit"]');
            if (btn) btn.disabled = true;

            try {
                await resetPasswordForEmail(email);
                document.getElementById('forgot-form')?.classList.add('hidden');
                document.getElementById('forgot-sent')?.classList.remove('hidden');
            } catch (err) {
                showError('forgot-error', err.message || 'Could not send reset email');
            } finally {
                if (btn) btn.disabled = false;
            }
        });

        document.addEventListener('click', e => {
            if (e.target.closest('#login-trigger')) {
                e.preventDefault();
                const msg = e.target.closest('[data-auth-message]')?.getAttribute('data-auth-message');
                showModal('login', msg ? { message: msg } : {});
            }
        });

        const sb = getClient();
        if (sb) {
            sb.auth.onAuthStateChange((_event, session) => {
                notifyAuthChange(!!session);
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        ensureAuthModal();
        bindAuthModal();

        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') === 'required') {
            isLoggedIn().then(loggedIn => {
                if (!loggedIn) showModal('login', { message: 'Sign in to continue' });
            });
        }
    });

    window.Auth = {
        getClient,
        getSession,
        getUser,
        isLoggedIn,
        isEmailVerified,
        getAccessToken,
        getIdentities,
        hasPasswordIdentity,
        hasGoogleIdentity,
        logout,
        signInWithPassword,
        signUp,
        resendVerificationEmail,
        resetPasswordForEmail,
        signInWithGoogle,
        signInWithOAuth,
        showModal,
        hideModal,
    };
})(window);
