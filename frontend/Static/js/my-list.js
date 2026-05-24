/**
 * my-list.js — Saved Movies Page
 *
 * Loads user's saved movies, supports filter/sort/delete.
 */
(function () {
    document.addEventListener('DOMContentLoaded', async () => {
        const grid = document.getElementById('mylist-grid');
        const emptyState = document.getElementById('mylist-empty');
        const filterBar = document.getElementById('mylist-filters');
        if (!grid) return;

        // Auth guard
        if (!window.Auth || !window.Auth.isLoggedIn()) {
            window.location.href = '/?auth=required';
            return;
        }

        let allMovies = [];
        let currentFilter = 'all';

        // ── Load movies ──────────────────────────────────────
        async function loadMovies() {
            grid.innerHTML = '';
            for (let i = 0; i < 4; i++) {
                const skel = document.createElement('div');
                skel.className = 'glass-card flex flex-col';
                skel.innerHTML = `<div class="aspect-[2/3] skeleton"></div><div class="p-4"><div class="skeleton" style="height:16px;width:80%"></div></div>`;
                grid.appendChild(skel);
            }

            try {
                const data = await window.Api.get('/api/movies/my-list');
                allMovies = data.movies || data || [];
                renderList(allMovies);
            } catch (err) {
                grid.innerHTML = `<p class="col-span-full text-center text-white/40 py-12">${err.message || 'Failed to load your list.'}</p>`;
            }
        }

        function renderList(movies) {
            grid.innerHTML = '';
            if (movies.length === 0) {
                grid.classList.add('hidden');
                if (emptyState) emptyState.classList.remove('hidden');
                return;
            }
            grid.classList.remove('hidden');
            if (emptyState) emptyState.classList.add('hidden');

            movies.forEach(m => {
                const card = document.createElement('div');
                card.className = 'glass-card flex flex-col relative group';

                const poster = m.poster_url || '';
                const title = m.title || 'Untitled';
                const year = m.year || '';
                const rating = (m.rating || 0).toFixed(1);

                card.innerHTML = `
                    <div class="relative aspect-[2/3] bg-gradient-to-b from-gray-800/60 to-gray-900/80 overflow-hidden">
                        ${poster ? `<img src="${poster}" alt="${escapeHtml(title)}" class="w-full h-full object-cover" loading="lazy">` : ''}
                        <div class="rating-badge absolute top-2 right-2">
                            <i class="fa-solid fa-star text-[#ffc107] text-[10px]"></i> ${rating}
                        </div>
                    </div>
                    <div class="p-4 flex flex-col gap-2">
                        <h3 class="font-semibold text-sm truncate text-white/90">${escapeHtml(title)}</h3>
                        <div class="flex justify-between items-center text-[11px] text-white/40">
                            <span>${year}</span>
                        </div>
                        ${m.note ? `<p class="text-xs text-white/30 italic truncate">"${escapeHtml(m.note)}"</p>` : ''}
                    </div>
                    <button class="delete-saved absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur text-white/60 hover:text-red-400 hover:bg-red-900/40 transition opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs border border-white/10" data-id="${m.saved_id || m.id}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                `;

                // Delete handler
                card.querySelector('.delete-saved').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const savedId = e.currentTarget.dataset.id;
                    if (!confirm('Remove this movie from your list?')) return;
                    try {
                        await window.Api.delete(`/api/movies/saved/${savedId}`);
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.9)';
                        setTimeout(() => card.remove(), 300);
                        if (window.showToast) window.showToast('Removed from your list.', 'info');
                    } catch (err) {
                        if (window.showToast) window.showToast('Failed to remove.', 'error');
                    }
                });

                // Click to detail
                card.addEventListener('click', () => {
                    window.location.href = `detail.html?id=${m.tmdb_id || m.id}`;
                });

                grid.appendChild(card);
            });
        }

        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        loadMovies();
    });
})();
