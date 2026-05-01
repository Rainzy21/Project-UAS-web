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

    // Fetch and render trending/recent movies from TMDB
    async function renderMovies(){
        const container = document.getElementById('movie-grid');
        if(!container) return;
        try{
            const movies = await window.AppAPI.fetchTrendingMovies();
            container.innerHTML = '';
            movies.forEach(m => {
                const card = document.createElement('div');
                card.className = 'card-bg rounded-lg border border-gray-800 overflow-hidden flex flex-col group cursor-pointer transition hover:border-gray-600';
                card.innerHTML = `
                    <div class="relative aspect-[2/3] bg-gradient-to-b from-stone-700 to-gray-900">
                        <img src="${window.AppAPI.posterPath(m.poster_path)}" alt="${m.title}" class="w-full h-full object-cover"/>
                        <div class="absolute top-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1 backdrop-blur-sm border border-gray-700/50">
                            <i class="fa-solid fa-star text-[#ffc107] text-[10px]"></i> ${m.vote_average?.toFixed(1) || '0.0'}
                        </div>
                    </div>
                    <div class="p-4 flex flex-col gap-3">
                        <h3 class="font-bold text-sm truncate">${m.title}</h3>
                        <div class="flex justify-between items-center text-[11px] text-gray-400">
                            <span>${(m.release_date || '').slice(0,4)}</span>
                            <span class="border border-gray-700 px-2 py-0.5 rounded uppercase tracking-wider bg-gray-900/50">Movie</span>
                        </div>
                        <button class="action-restricted flex items-center gap-2 text-xs text-gray-400 hover:text-white transition w-max mt-1">
                            <i class="fa-regular fa-heart"></i> Favorite
                        </button>
                    </div>
                `;
                container.appendChild(card);
            });
        }catch(err){
            console.error('Failed to load movies', err);
            container.innerHTML = '<p class="text-gray-400">Unable to load movies. Check TMDB API key.</p>';
        }
    }

    // Kick off movie rendering (non-blocking)
    setTimeout(() => { renderMovies(); }, 200);
});