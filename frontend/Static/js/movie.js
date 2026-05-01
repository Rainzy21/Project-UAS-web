document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('auth-modal');
    const loginTrigger = document.getElementById('login-trigger');
    const closeModal = document.getElementById('close-modal');
    const restrictedActions = document.querySelectorAll('.action-restricted');
    const modalContext = document.getElementById('modal-context');

    const toggleModal = (show, message = "Please login to continue.") => {
        if (show) {
            modal.classList.remove('hidden');
            if (modalContext) modalContext.innerText = message;
        } else {
            modal.classList.add('hidden');
        }
    };

    if (loginTrigger) {
        loginTrigger.addEventListener('click', () => toggleModal(true));
    }

    if (closeModal) {
        closeModal.addEventListener('click', () => toggleModal(false));
    }

    // Menangani klik di luar modal untuk menutup
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            toggleModal(false);
        }
    });

    // Memicu modal jika user klik tombol Like/Wishlist sebelum login
    restrictedActions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleModal(true, "Please login to save your favorites.");
        });
    });
});