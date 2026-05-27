/**
 * history.js — Recommendation History Page
 *
 * Loads past recommendation sessions, expandable to show movies.
 */
(function () {
    document.addEventListener('DOMContentLoaded', async () => {
        const list = document.getElementById('history-list');
        const emptyState = document.getElementById('history-empty');
        if (!list) return;

        // Auth guard
        if (!window.Auth || !window.Auth.isLoggedIn()) {
            window.location.href = '/?auth=required';
            return;
        }

        let page = 1;
        const limit = 20;

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
                const sessions = data.sessions || data || [];
                renderHistory(sessions);
            } catch (err) {
                list.innerHTML = `<p class="text-center text-white/40 py-12">${err.message || 'Failed to load history.'}</p>`;
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

                card.innerHTML = `
                    <div class="flex justify-between items-start mb-3">
                        <span class="text-sm text-white/60">${date}</span>
                        <span class="text-xs text-white/40">${movieCount} movies</span>
                    </div>
                    <div class="flex flex-wrap gap-2 mb-3">
                        ${prefs.genre ? `<span class="glass-pill"><i class="fa-solid fa-film text-[10px]"></i> ${escapeHtml(prefs.genre)}</span>` : ''}
                        ${prefs.mood ? `<span class="glass-pill"><i class="fa-solid fa-masks-theater text-[10px]"></i> ${escapeHtml(prefs.mood)}</span>` : ''}
                        ${prefs.era ? `<span class="glass-pill"><i class="fa-solid fa-calendar text-[10px]"></i> ${escapeHtml(prefs.era)}</span>` : ''}
                        ${prefs.language ? `<span class="glass-pill"><i class="fa-solid fa-globe text-[10px]"></i> ${escapeHtml(prefs.language)}</span>` : ''}
                        ${prefs.watching_with ? `<span class="glass-pill"><i class="fa-solid fa-users text-[10px]"></i> ${escapeHtml(prefs.watching_with)}</span>` : ''}
                    </div>
                    <div class="history-movies hidden mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3"></div>
                    <button class="expand-btn text-xs text-white/30 hover:text-[#e50000] transition mt-2 flex items-center gap-1">
                        <i class="fa-solid fa-chevron-down text-[10px]"></i> Show movies
                    </button>
                `;

                // Expand
                const expandBtn = card.querySelector('.expand-btn');
                const moviesGrid = card.querySelector('.history-movies');
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
                            mini.innerHTML = `
                                <div class="aspect-[2/3] overflow-hidden bg-gray-900">
                                    ${m.poster_url ? `<img src="${m.poster_url}" alt="${escapeHtml(m.title)}" class="w-full h-full object-cover" loading="lazy">` : ''}
                                </div>
                                <div class="p-2">
                                    <p class="text-xs truncate text-white/70">${escapeHtml(m.title)}</p>
                                </div>
                            `;
                            mini.addEventListener('click', () => {
                                window.location.href = `detail.html?id=${m.tmdb_id}`;
                            });
                            moviesGrid.appendChild(mini);
                        });
                    }
                });

                list.appendChild(card);
            });
        }

        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        loadHistory();
    });
})();
