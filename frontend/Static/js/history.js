/**
 * history.js — Recommendation History Page
 */
(function () {
    document.addEventListener('DOMContentLoaded', async () => {
        const list = document.getElementById('history-list');
        const emptyState = document.getElementById('history-empty');
        if (!list) return;

        const U = window.AppUtils;

        if (!window.Auth || !(await window.Auth.isLoggedIn())) {
            window.location.href = '/?auth=required';
            return;
        }

        let page = 1;
        const limit = 20;

        function showError(msg) {
            list.innerHTML = '';
            const p = document.createElement('p');
            p.className = 'text-center text-white/40 py-12';
            p.textContent = msg;
            list.appendChild(p);
        }

        function createPill(iconClass, text) {
            const span = document.createElement('span');
            span.className = 'glass-pill';
            const icon = document.createElement('i');
            icon.className = iconClass + ' text-[10px]';
            span.appendChild(icon);
            span.appendChild(document.createTextNode(' ' + text));
            return span;
        }

        async function loadHistory() {
            list.innerHTML = '';
            for (let i = 0; i < 3; i++) {
                const skel = document.createElement('div');
                skel.className = 'glass p-6 skeleton';
                skel.style.height = '100px';
                list.appendChild(skel);
            }

            try {
                const data = await window.Api.get(`/api/recommendations/history?page=${page}&limit=${limit}`);
                const sessions = data.items || data.sessions || (Array.isArray(data) ? data : []);
                renderHistory(sessions);
            } catch (err) {
                showError(err.message || 'Failed to load history.');
            }
        }

        function renderHistory(sessions) {
            list.innerHTML = '';
            if (sessions.length === 0) {
                list.classList.add('hidden');
                if (emptyState) emptyState.classList.remove('hidden');
                return;
            }
            list.classList.remove('hidden');
            if (emptyState) emptyState.classList.add('hidden');

            sessions.forEach(s => {
                const card = document.createElement('div');
                card.className = 'glass p-6 mb-4 cursor-pointer transition hover:bg-white/[0.06]';

                const date = s.created_at ? new Date(s.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : '';
                const prefs = s.preferences || {};
                const movieCount = s.movie_count || (s.movies ? s.movies.length : 0);

                const header = document.createElement('div');
                header.className = 'flex justify-between items-start mb-3';
                const dateSpan = document.createElement('span');
                dateSpan.className = 'text-sm text-white/60';
                dateSpan.textContent = date;
                const countSpan = document.createElement('span');
                countSpan.className = 'text-xs text-white/40';
                countSpan.textContent = `${movieCount} movies`;
                header.appendChild(dateSpan);
                header.appendChild(countSpan);
                card.appendChild(header);

                const pills = document.createElement('div');
                pills.className = 'flex flex-wrap gap-2 mb-3';
                if (prefs.genre) pills.appendChild(createPill('fa-solid fa-film', prefs.genre));
                if (prefs.mood) pills.appendChild(createPill('fa-solid fa-masks-theater', prefs.mood));
                if (prefs.era) pills.appendChild(createPill('fa-solid fa-calendar', prefs.era));
                if (prefs.language) pills.appendChild(createPill('fa-solid fa-globe', prefs.language));
                if (prefs.watching_with) pills.appendChild(createPill('fa-solid fa-users', prefs.watching_with));
                card.appendChild(pills);

                const moviesGrid = document.createElement('div');
                moviesGrid.className = 'history-movies hidden mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3';
                card.appendChild(moviesGrid);

                const expandBtn = document.createElement('button');
                expandBtn.type = 'button';
                expandBtn.className = 'expand-btn text-xs text-white/30 hover:text-[#e50000] transition mt-2 flex items-center gap-1';
                expandBtn.innerHTML = '<i class="fa-solid fa-chevron-down text-[10px]"></i> Show movies';
                card.appendChild(expandBtn);

                let expanded = false;
                expandBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    expanded = !expanded;
                    moviesGrid.classList.toggle('hidden', !expanded);
                    expandBtn.innerHTML = expanded
                        ? '<i class="fa-solid fa-chevron-up text-[10px]"></i> Hide movies'
                        : '<i class="fa-solid fa-chevron-down text-[10px]"></i> Show movies';

                    if (expanded && moviesGrid.children.length === 0 && s.movies) {
                        s.movies.forEach(m => {
                            const mini = document.createElement('div');
                            mini.className = 'glass-card flex flex-col cursor-pointer';

                            const aspect = document.createElement('div');
                            aspect.className = 'aspect-[2/3] overflow-hidden bg-gray-900';
                            const posterSrc = U.safePosterUrl(m.poster_url);
                            if (posterSrc) {
                                const img = document.createElement('img');
                                img.src = posterSrc;
                                img.alt = m.title || '';
                                img.className = 'w-full h-full object-cover';
                                img.loading = 'lazy';
                                aspect.appendChild(img);
                            }
                            mini.appendChild(aspect);

                            const body = document.createElement('div');
                            body.className = 'p-2';
                            const titleP = document.createElement('p');
                            titleP.className = 'text-xs truncate text-white/70';
                            titleP.textContent = m.title || '';
                            body.appendChild(titleP);
                            mini.appendChild(body);

                            mini.addEventListener('click', () => {
                                window.location.href = `detail.html?id=${encodeURIComponent(Number(m.tmdb_id))}`;
                            });
                            moviesGrid.appendChild(mini);
                        });
                    }
                });

                list.appendChild(card);
            });
        }

        loadHistory();
    });
})();
