/**
 * profile.js — User Profile Page
 *
 * Edit name, change password, delete account.
 * Reads profile from /api/users/me (backend), falls back to Supabase session.
 */
(function () {
    document.addEventListener('DOMContentLoaded', async () => {
        const profileCard = document.getElementById('profile-card');
        if (!profileCard) return;

        // ── Auth guard (async-safe) ───────────────────────────
        let session = null;
        try {
            session = await window.Auth.getSession();
        } catch (e) { /* ignore */ }

        if (!session) {
            window.location.href = '/?auth=required';
            return;
        }

        // ── Load user profile ────────────────────────────────
        async function loadProfile() {
            try {
                // Try backend API first
                const user = await window.Api.get('/api/users/me');
                renderProfile({
                    name: user.name,
                    email: user.email,
                    email_verified: user.email_verified,
                    created_at: user.created_at,
                });
            } catch (err) {
                console.warn('[profile] API /api/users/me failed:', err.status, err.message);
                // Fallback: read directly from Supabase session
                try {
                    const sbUser = session.user;
                    const meta = sbUser.user_metadata || {};
                    const name = meta.full_name || meta.name || sbUser.email.split('@')[0];
                    renderProfile({
                        name: name,
                        email: sbUser.email,
                        email_verified: !!sbUser.email_confirmed_at,
                        created_at: sbUser.created_at,
                    });
                    // Show subtle warning if backend unavailable (not error-level)
                    if (err.status >= 500) {
                        console.warn('[profile] Using local session data (backend unavailable)');
                    }
                } catch (fallbackErr) {
                    console.error('[profile] Fallback failed:', fallbackErr);
                    if (window.showToast) window.showToast('Failed to load profile.', 'error');
                }
            }
        }

        function renderProfile({ name, email, email_verified, created_at }) {
            const nameEl = document.getElementById('profile-name');
            const emailEl = document.getElementById('profile-email');
            const sinceEl = document.getElementById('profile-since');
            const badge = document.getElementById('profile-verified-badge');
            const avatarEl = document.getElementById('profile-avatar-letter');

            if (nameEl) nameEl.textContent = name || 'User';
            if (emailEl) emailEl.textContent = email || '';
            if (sinceEl) sinceEl.textContent = created_at
                ? new Date(created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : '';

            // Avatar letter
            if (avatarEl) avatarEl.textContent = (name || email || 'U')[0].toUpperCase();

            // Email verification badge
            if (badge) {
                if (email_verified) {
                    badge.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i> Verified';
                    badge.className = 'text-xs text-emerald-400 flex items-center gap-1';
                } else {
                    badge.innerHTML = '<i class="fa-solid fa-circle-exclamation text-amber-400"></i> Not Verified';
                    badge.className = 'text-xs text-amber-400 flex items-center gap-1';
                }
            }
        }

        await loadProfile();

        // ── Edit name ────────────────────────────────────────
        const editNameBtn = document.getElementById('edit-name-btn');
        const nameDisplay = document.getElementById('profile-name');
        const nameInput = document.getElementById('name-input');
        const saveNameBtn = document.getElementById('save-name-btn');
        const cancelNameBtn = document.getElementById('cancel-name-btn');
        const nameEditGroup = document.getElementById('name-edit-group');

        if (editNameBtn) {
            editNameBtn.addEventListener('click', () => {
                nameInput.value = nameDisplay.textContent;
                nameDisplay.classList.add('hidden');
                editNameBtn.classList.add('hidden');
                nameEditGroup.classList.remove('hidden');
                nameInput.focus();
            });
        }

        if (cancelNameBtn) {
            cancelNameBtn.addEventListener('click', () => {
                nameEditGroup.classList.add('hidden');
                nameDisplay.classList.remove('hidden');
                editNameBtn.classList.remove('hidden');
            });
        }

        if (saveNameBtn) {
            saveNameBtn.addEventListener('click', async () => {
                const newName = nameInput.value.trim();
                if (!newName) return;
                try {
                    await window.Api.patch('/api/users/me', { name: newName });
                    nameDisplay.textContent = newName;
                    const avatarEl = document.getElementById('profile-avatar-letter');
                    if (avatarEl) avatarEl.textContent = newName[0].toUpperCase();
                    nameEditGroup.classList.add('hidden');
                    nameDisplay.classList.remove('hidden');
                    editNameBtn.classList.remove('hidden');
                    window.Nav && window.Nav.update();
                    if (window.showToast) window.showToast('Name updated!', 'success');
                } catch (err) {
                    if (window.showToast) window.showToast(err.message || 'Failed to update name.', 'error');
                }
            });
        }

        // ── Change password ──────────────────────────────────
        const pwForm = document.getElementById('change-password-form');
        if (pwForm) {
            pwForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const current = pwForm.querySelector('[name="current_password"]').value;
                const newPw = pwForm.querySelector('[name="new_password"]').value;
                const confirm = pwForm.querySelector('[name="confirm_password"]').value;
                const errEl = document.getElementById('pw-error');

                if (newPw !== confirm) {
                    errEl.textContent = 'Passwords do not match.';
                    errEl.classList.remove('hidden');
                    return;
                }
                if (newPw.length < 6) {
                    errEl.textContent = 'Password must be at least 6 characters.';
                    errEl.classList.remove('hidden');
                    return;
                }
                errEl.classList.add('hidden');

                const btn = pwForm.querySelector('[type="submit"]');
                if (btn) btn.disabled = true;

                try {
                    await window.Api.patch('/api/users/me/password', {
                        current_password: current,
                        new_password: newPw,
                    });
                    pwForm.reset();
                    if (window.showToast) window.showToast('Password changed successfully!', 'success');
                } catch (err) {
                    errEl.textContent = err.message || 'Failed to change password.';
                    errEl.classList.remove('hidden');
                } finally {
                    if (btn) btn.disabled = false;
                }
            });
        }

        // ── Delete account ───────────────────────────────────
        const deleteBtn = document.getElementById('delete-account-btn');
        const deleteModal = document.getElementById('delete-modal');
        const deleteCancel = document.getElementById('delete-cancel');
        const deleteConfirm = document.getElementById('delete-confirm');

        if (deleteBtn && deleteModal) {
            deleteBtn.addEventListener('click', () => {
                deleteModal.classList.add('active');
                deleteModal.classList.remove('hidden');
            });
            deleteCancel.addEventListener('click', () => {
                deleteModal.classList.remove('active');
                setTimeout(() => deleteModal.classList.add('hidden'), 300);
            });
            deleteConfirm.addEventListener('click', async () => {
                const pw = document.getElementById('delete-password').value;
                if (!pw) return;
                try {
                    await window.Api.delete('/api/users/me', { body: JSON.stringify({ current_password: pw }) });
                    window.Auth.logout && window.Auth.logout();
                    window.location.href = '/';
                } catch (err) {
                    if (window.showToast) window.showToast(err.message || 'Failed to delete account.', 'error');
                }
            });
        }
    });
})();
