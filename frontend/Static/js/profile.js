/**
 * profile.js — User Profile Page
 *
 * Edit name, change password, delete account.
 */
(function () {
    document.addEventListener('DOMContentLoaded', async () => {
        const profileCard = document.getElementById('profile-card');
        if (!profileCard) return;

        // Auth guard
        if (!window.Auth || !window.Auth.isLoggedIn()) {
            window.location.href = '/?auth=required';
            return;
        }

        // ── Load user profile ────────────────────────────────
        try {
            const user = await window.Api.get('/api/users/me');
            document.getElementById('profile-name').textContent = user.name || 'User';
            document.getElementById('profile-email').textContent = user.email || '';
            document.getElementById('profile-since').textContent = user.created_at
                ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : '';

            // Email verification badge
            const badge = document.getElementById('profile-verified-badge');
            if (badge) {
                if (user.email_verified) {
                    badge.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i> Verified';
                    badge.className = 'text-xs text-emerald-400 flex items-center gap-1';
                } else {
                    badge.innerHTML = '<i class="fa-solid fa-circle-exclamation text-amber-400"></i> Not Verified';
                    badge.className = 'text-xs text-amber-400 flex items-center gap-1';
                }
            }
        } catch (err) {
            if (window.showToast) window.showToast('Failed to load profile.', 'error');
        }

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
                    // Update local user
                    const user = window.Auth.getUser();
                    if (user) {
                        user.name = newName;
                        window.Auth.saveTokens({ user });
                    }
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
                errEl.classList.add('hidden');

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
                    window.Auth.clearTokens();
                    window.location.href = '/';
                } catch (err) {
                    if (window.showToast) window.showToast(err.message || 'Failed to delete account.', 'error');
                }
            });
        }
    });
})();
