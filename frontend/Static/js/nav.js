/**
 * nav.js — Navbar State Controller
 *
 * Runs on every page. Shows guest or logged-in nav items,
 * and an email verification banner when needed.
 */
(function (window) {
    function update() {
        const guestSection = document.getElementById('nav-guest');
        const userSection = document.getElementById('nav-user');
        const userName = document.getElementById('nav-user-name');
        const verifyBanner = document.getElementById('verify-banner');

        if (!guestSection || !userSection) return;

        if (window.Auth && window.Auth.isLoggedIn()) {
            const user = window.Auth.getUser();
            guestSection.classList.add('hidden');
            userSection.classList.remove('hidden');
            if (userName && user) userName.textContent = user.name || 'User';

            // Email verification banner
            if (verifyBanner) {
                if (!window.Auth.isEmailVerified()) {
                    verifyBanner.classList.remove('hidden');
                } else {
                    verifyBanner.classList.add('hidden');
                }
            }
        } else {
            guestSection.classList.remove('hidden');
            userSection.classList.add('hidden');
            if (verifyBanner) verifyBanner.classList.add('hidden');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        update();

        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.Auth) window.Auth.logout();
            });
        }

        // Resend verification
        const resendBtn = document.getElementById('resend-verify-btn');
        if (resendBtn) {
            resendBtn.addEventListener('click', async () => {
                try {
                    await window.Auth.resendVerification();
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
        if (params.get('auth') === 'required' && window.Auth && !window.Auth.isLoggedIn()) {
            window.Auth.showModal('login');
        }
    });

    window.Nav = { update };
})(window);
