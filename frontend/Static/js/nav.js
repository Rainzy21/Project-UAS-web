/**
 * nav.js — Navbar State Controller (Supabase-aware)
 */
(function (window) {
    async function update() {
        const guestSection = document.getElementById('nav-guest');
        const userSection = document.getElementById('nav-user');
        const userName = document.getElementById('nav-user-name');
        const verifyBanner = document.getElementById('verify-banner');

        if (!guestSection || !userSection) return;

        const loggedIn = window.Auth ? await window.Auth.isLoggedIn() : false;

        if (loggedIn) {
            const user = await window.Auth.getUser();
            guestSection.classList.add('hidden');
            userSection.classList.remove('hidden');
            if (userName && user) {
                const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email || 'User';
                userName.textContent = name;
            }

            if (verifyBanner) {
                const verified = await window.Auth.isEmailVerified();
                verifyBanner.classList.toggle('hidden', verified);
            }
        } else {
            guestSection.classList.remove('hidden');
            userSection.classList.add('hidden');
            if (verifyBanner) verifyBanner.classList.add('hidden');
        }
        // Notify other modules of auth state change
        document.dispatchEvent(new CustomEvent('auth:statechange', { detail: { loggedIn } }));
    }

    document.addEventListener('DOMContentLoaded', async () => {
        await update();

        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (window.Auth) {
                    await window.Auth.logout();
                    await update(); // re-run to dispatch statechange
                }
            });
        }

        // Resend verification
        const resendBtn = document.getElementById('resend-verify-btn');
        if (resendBtn) {
            resendBtn.addEventListener('click', async () => {
                try {
                    const user = await window.Auth.getUser();
                    await window.Auth.resendVerification(user ? user.email : '');
                    if (window.showToast) window.showToast('Verification email sent!', 'success');
                } catch {
                    if (window.showToast) window.showToast('Failed to send. Try again later.', 'error');
                }
            });
        }

        // Scroll-triggered glass nav
        const nav = document.querySelector('.glass-nav');
        if (nav) {
            window.addEventListener('scroll', () => {
                nav.classList.toggle('scrolled', window.scrollY > 20);
            }, { passive: true });
        }

        // Check auth=required query param
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') === 'required') {
            const loggedIn = window.Auth ? await window.Auth.isLoggedIn() : false;
            if (!loggedIn && window.Auth) window.Auth.showModal('login');
        }
    });

    window.Nav = { update };
})(window);
