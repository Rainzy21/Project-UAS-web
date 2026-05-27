document.addEventListener('DOMContentLoaded', () => {
    const loginModal = document.getElementById('login-modal');
    const signupModal = document.getElementById('signup-modal');
    const loginTrigger = document.getElementById('login-trigger');
    const restrictedActions = document.querySelectorAll('.action-restricted');
    const loginModalContext = document.getElementById('login-modal-context');

    window.toggleLoginModal = (show, message = "Please login to continue.") => {
        if (show) {
            loginModal.classList.remove('hidden');
            if (loginModalContext) loginModalContext.innerText = message;
        } else {
            loginModal.classList.add('hidden');
        }
    };

    window.toggleSignupModal = (show) => {
        if (show) {
            signupModal.classList.remove('hidden');
        } else {
            signupModal.classList.add('hidden');
        }
    };

    window.switchToSignup = () => {
        toggleLoginModal(false);
        toggleSignupModal(true);
    };

    window.switchToLogin = () => {
        toggleSignupModal(false);
        toggleLoginModal(true);
    };

    if (loginTrigger) {
        loginTrigger.addEventListener('click', () => toggleLoginModal(true));
    }

    // Menangani klik di luar modal untuk menutup
    window.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            toggleLoginModal(false);
        }
        if (e.target === signupModal) {
            toggleSignupModal(false);
        }
    });

    // Memicu modal jika user klik tombol Like/Wishlist sebelum login
    restrictedActions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleLoginModal(true, "Please login to save your favorites.");
        });
    });

    // Fetch and render trending/recent movies from TMDB
    async function renderMovies(){
        const container = document.getElementById('movie-grid');
        if(!container) return;
        try{
            const movies = await window.AppAPI.fetchTrendingMovies();
            container.replaceChildren();
            movies.forEach(m => {
                const card = document.createElement('div');
                card.className = 'card-bg rounded-lg border border-gray-800 overflow-hidden flex flex-col group cursor-pointer transition hover:border-gray-600';

                // Image container
                const imgContainer = document.createElement('div');
                imgContainer.className = 'relative aspect-[2/3] bg-gradient-to-b from-stone-700 to-gray-900';

                // Image
                const img = document.createElement('img');
                img.src = window.AppAPI.posterUrl(m.poster_path);
                img.alt = m.title;  
                img.className = 'w-full h-full object-cover';
                imgContainer.appendChild(img);

                // Badge Container for Rating
                const badge = document.createElement('div');
                badge.className = 'absolute top-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1 backdrop-blur-sm border border-gray-700/50';

                // Star icon
                const starIcon = document.createElement('i');
                starIcon.className = 'fa-solid fa-star text-[#ffc107] text-[10px]';
                badge.appendChild(starIcon);

                // Rating text
                const ratingText = document.createTextNode(` ${m.vote_average?.toFixed(1) || '0.0'}`);
                badge.appendChild(ratingText);
                imgContainer.appendChild(badge);

                card.appendChild(imgContainer);

                // Info container
                const infoContainer = document.createElement('div');
                infoContainer.className = 'p-4 flex flex-col gap-3';

                // Title
                const title = document.createElement('h3');
                title.className = 'font-bold text-sm truncate';
                title.textContent = m.title;
                infoContainer.appendChild(title);

                // Meta Row (Release year and type)
                const metaRow = document.createElement('div');
                metaRow.className = 'flex justify-between items-center text-[11px] text-gray-400';

                // Release Date Span
                const dateSpan = document.createElement('span');
                dateSpan.textContent = (m.release_date || '').slice(0, 4);
                metaRow.appendChild(dateSpan);

                // Type Span (Movie)
                const typeSpan = document.createElement('span');
                typeSpan.className = 'border border-gray-700 px-2 py-0.5 rounded uppercase tracking-wider bg-gray-900/50';
                typeSpan.textContent = 'Movie';
                metaRow.appendChild(typeSpan);

                infoContainer.appendChild(metaRow);

                // Favorite button
                const favBtn = document.createElement('button');
                favBtn.className = 'action-restricted flex items-center gap-2 text-xs text-gray-400 hover:text-white transition w-max mt-1';
                
                // Heart icon
                const heartIcon = document.createElement('i');
                heartIcon.className = 'fa-regular fa-heart';
                favBtn.appendChild(heartIcon);

                // Favorite text
                const favText = document.createTextNode(' Favorite');
                favBtn.appendChild(favText);

                // Attach standard click listener to newly created action-restricted button
                favBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (window.toggleLoginModal) {
                        window.toggleLoginModal(true, "Please login to save your favorites.");
                    }
                });

                infoContainer.appendChild(favBtn);
                card.appendChild(infoContainer);

                container.appendChild(card);
            });
        }catch(err){
            console.error('Failed to load movies', err);
            container.replaceChildren();
            const errParam = document.createElement('p');
            errParam.className = 'text-gray-400';
            errParam.textContent = 'Unable to load movies. Check TMDB API key.';
            container.appendChild(errParam);
        }
    }

    // Kick off movie rendering (non-blocking)
    setTimeout(() => { renderMovies(); }, 200);
});