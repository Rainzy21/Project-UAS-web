/**
 * toast.js — Global Toast Notification System
 * Usage: window.showToast('Message', 'success'|'error'|'warning'|'info')
 */
(function (window) {
    const ICONS = {
        success: 'fa-solid fa-circle-check',
        error:   'fa-solid fa-circle-xmark',
        warning: 'fa-solid fa-triangle-exclamation',
        info:    'fa-solid fa-circle-info',
    };

    const DURATION = 4000; // ms

    function ensureContainer() {
        let c = document.getElementById('toast-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    function showToast(message, type = 'info') {
        const container = ensureContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icon = document.createElement('i');
        icon.className = `toast-icon ${ICONS[type] || ICONS.info}`;
        toast.appendChild(icon);

        const text = document.createElement('span');
        text.textContent = message;
        toast.appendChild(text);

        container.appendChild(toast);

        // Auto-remove
        setTimeout(() => {
            toast.classList.add('removing');
            toast.addEventListener('animationend', () => toast.remove());
        }, DURATION);
    }

    window.showToast = showToast;
})(window);
