/**
 * my-list.js — Saved Movies Page
 *
 * Loads user's saved movies from Supabase directly (no FastAPI proxy).
 * Supports filter/sort/delete via Supabase JS client (RLS enforced).
 *
 * Requires: supabase CDN + auth.js loaded before this file.
 */
(function () {
    document.addEventListener('DOMContentLoaded', async () => {
        const grid = document.getElementById('mylist-grid');
        const emptyState = document.getElementById('mylist-empty');
        if (!grid) return;

        // Auth guard — tunggu session async
        const session = await (window.Auth ? window.Auth.getSession() : Promise.resolve(null));
        if (!session) {
            window.location.href = 'index.html?auth=required';
            return;
        }

        let allMovies = [];

        // ── Load movies dari Supabase langsung ───────────────
        async function loadMovies() {
            // Skeleton
            grid.innerHTML = '';
            for (let i = 0; i < 4; i++) {
                const skel = document.createElement('div');
                skel.className = 'glass-card flex flex-col';
                skel.innerHTML = `<div class="aspect-[2/3] skeleton"></div><div class="p-4"><div class="skeleton" style="height:16px;width:80%"></div></div>`;
                grid.appendChild(skel);
            }

            try {
                const sb = window.Auth.getClient();
                if (!sb) throw new Error('Supabase tidak terinisialisasi');

                // Query: saved_movies join movies (select * mengambil semua kolom movies)
                const { data, error } = await sb
                    .from('saved_movies')
                    .select('id, tmdb_id, note, tag, saved_at, movies(title, poster_url, rating, year)')
                    .order('saved_at', { ascending: false });

                if (error) throw new Error(error.message);

                // Flatten data: gabungkan kolom movies ke level atas
                allMovies = await Promise.all((data || []).map(async row => {
                    let title = row.movies?.title;
                    let poster_url = row.movies?.poster_url;
                    let rating = row.movies?.rating || 0;
                    let year = row.movies?.year || '';

                    // Jika data dari database tidak lengkap (contoh: karena error insert sebelumnya),
                    // tarik data langsung dari TMDB API sebagai fallback.
                    if (!title || title === 'Untitled' || !poster_url) {
                        try {
                            const tmdbData = await window.AppAPI.fetchMovieDetail(row.tmdb_id);
                            title = tmdbData.title || title;
                            if (tmdbData.poster_path) {
                                poster_url = window.AppAPI.posterUrl(tmdbData.poster_path);
                            }
                            rating = tmdbData.vote_average || rating;
                            year = tmdbData.release_date ? tmdbData.release_date.slice(0, 4) : year;
                        } catch (e) {
                            console.error('Gagal mengambil data dari TMDB untuk id:', row.tmdb_id, e);
                        }
                    }

                    return {
                        saved_id: row.id,
                        tmdb_id: row.tmdb_id,
                        note: row.note,
                        tag: row.tag,
                        saved_at: row.saved_at,
                        title: title || 'Untitled',
                        poster_url: poster_url || null,
                        rating: rating,
                        year: year,
                    };
                }));

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
                            <i class="fa-solid fa-star text-[10px]" style="color:var(--accent)"></i> ${rating}
                        </div>
                    </div>
                    <div class="p-4 flex flex-col gap-2">
                        <h3 class="font-semibold text-sm truncate text-white/90">${escapeHtml(title)}</h3>
                        <div class="flex justify-between items-center text-[11px] text-white/40">
                            <span>${year}</span>
                            ${m.tag ? `<span class="glass-pill text-[10px]">${escapeHtml(m.tag)}</span>` : ''}
                        </div>
                        ${m.note ? `<p class="text-xs text-white/30 italic truncate">"${escapeHtml(m.note)}"</p>` : ''}
                    </div>
                    <button class="delete-saved absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur text-white/60 hover:text-red-400 hover:bg-red-900/40 transition opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs border border-white/10" data-id="${m.saved_id}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                `;

                // Delete handler — hapus langsung dari Supabase
                card.querySelector('.delete-saved').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const savedId = e.currentTarget.dataset.id;
                    if (!confirm('Remove this movie from your list?')) return;
                    try {
                        const sb = window.Auth.getClient();
                        const { error } = await sb
                            .from('saved_movies')
                            .delete()
                            .eq('id', savedId);

                        if (error) throw new Error(error.message);

                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.9)';
                        card.style.transition = 'all 0.3s ease';
                        setTimeout(() => card.remove(), 300);
                        if (window.showToast) window.showToast('Removed from your list.', 'info');
                    } catch (err) {
                        if (window.showToast) window.showToast('Failed to remove: ' + err.message, 'error');
                    }
                });

                // Click to detail
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-saved')) return;
                    window.location.href = `detail.html?id=${m.tmdb_id}`;
                });

                grid.appendChild(card);
            });
        }

        // Filter handler
        const filterBar = document.getElementById('mylist-filters');
        if (filterBar) {
            filterBar.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-filter]');
                if (!btn) return;
                filterBar.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const filter = btn.dataset.filter;
                let filtered = [...allMovies];
                if (filter === 'recent') {
                    filtered.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
                } else if (filter === 'rating') {
                    filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                }
                renderList(filtered);
            });
        }

        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        loadMovies();
    });
})();
