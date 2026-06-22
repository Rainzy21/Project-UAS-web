(async function () {
    const titleEl = document.getElementById('callback-title');
    const msgEl = document.getElementById('callback-msg');
    const spinner = document.getElementById('spinner');

    function fail(message) {
        titleEl.textContent = 'Sign-in failed';
        msgEl.textContent = message;
        spinner.classList.add('hidden');
        setTimeout(() => { window.location.href = '/?auth=required'; }, 3500);
    }

    try {
        const sb = window.Auth && window.Auth.getClient();
        if (!sb) {
            fail('Auth is not configured.');
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const err = params.get('error_description') || params.get('error');
        if (err) {
            fail(decodeURIComponent(err.replace(/\+/g, ' ')));
            return;
        }

        // Email confirmation links use hash tokens (#access_token=...)
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
            const { data, error } = await sb.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            });
            if (error) {
                fail(error.message);
                return;
            }
            if (!data.session) {
                fail('No session found. Try again.');
                return;
            }
            const redirect = (window.AppUtils && window.AppUtils.safeRedirectPath(
                sessionStorage.getItem('postAuthRedirect')
            )) || '/';
            sessionStorage.removeItem('postAuthRedirect');
            history.replaceState(null, '', location.pathname + location.search);
            window.location.replace(redirect);
            return;
        }

        const code = params.get('code');
        if (!code) {
            fail('No authorization code in callback URL. Try signing in again.');
            return;
        }

        const { data, error } = await sb.auth.exchangeCodeForSession(code);
        if (error) {
            fail(error.message);
            return;
        }

        if (!data.session) {
            fail('No session found. Try again.');
            return;
        }

        const redirect = (window.AppUtils && window.AppUtils.safeRedirectPath(
            sessionStorage.getItem('postAuthRedirect')
        )) || '/';
        sessionStorage.removeItem('postAuthRedirect');
        history.replaceState(null, '', location.pathname + location.search);
        window.location.replace(redirect);
    } catch (err) {
        fail(err.message || 'An unexpected error occurred during sign in.');
    }
})();
