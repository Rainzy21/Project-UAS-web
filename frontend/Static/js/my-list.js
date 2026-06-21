/**
 * my-list.js — Saved Movies Page
 */
(function () {
    document.addEventListener('DOMContentLoaded', async () => {
        const grid = document.getElementById('mylist-grid');
        const emptyState = document.getElementById('mylist-empty');
        if (!grid) return;

        const U = window.AppUtils;

        const session = await (window.Auth ? window.Auth.getSession() : Promise.resolve(null));
        if (!session) {
            window.location.href = 'index.html?auth=required';
            return;
        }

        let allMovies = [];

        function showError(msg) {
            grid.innerHTML = '';
            const p = document.createElement('p');
            p.className = 'col-span-full text-center text-white/40 py-12';
            p.textContent = msg;
            grid.appendChild(p);
        }

        async function loadMovies() {
            grid.innerHTML = '';
            for (let i = 0; i < 4; i++) {
                const skel = document.createElement('div');
                skel.className = 'glass-card flex flex-col';
                skel.innerHTML = `<div class="aspect-[2/3] skeleton"></div><div class="p-4"><div class="skeleton" style="height:16px;width:80%"></div></div>`;
                grid.appendChild(skel);
            }

            try {
                const sb = window.Auth.getClient();
                if (!sb) throw new Error('Supabase not initialized');

                const { data, error } = await sb
                    .from('saved_movies')
                    .select('id, tmdb_id, note, tag, saved_at, movies(title, poster_url, rating, year)')
                    .order('saved_at', { ascending: false });

                if (error) throw new Error(error.message);

                allMovies = await Promise.all((data || []).map(async row => {
                    let title = row.movies?.title;
                    let poster_url = row.movies?.poster_url;
                    let rating = row.movies?.rating || 0;
                    let year = row.movies?.year || '';

                    if (!title || title === 'Untitled' || !poster_url) {
                        try {
                            const movie = await window.Api.get(`/api/movies/${row.tmdb_id}`);
                            title = movie.title || title;
                            poster_url = movie.poster_url || poster_url;
                            rating = movie.rating || rating;
                            year = movie.year || year;
                        } catch (_) {}
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
                showError(err.message || 'Failed to load your list.');
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

                const posterWrap = document.createElement('div');
                posterWrap.className = 'relative aspect-[2/3] bg-gradient-to-b from-gray-800/60 to-gray-900/80 overflow-hidden';
                const posterSrc = U.safePosterUrl(m.poster_url);
                if (posterSrc) {
                    const img = document.createElement('img');
                    img.src = posterSrc;
                    img.alt = m.title || '';
                    img.className = 'w-full h-full object-cover';
                    img.loading = 'lazy';
                    posterWrap.appendChild(img);
                }
                const badge = document.createElement('div');
                badge.className = 'rating-badge absolute top-2 right-2';
                badge.innerHTML = `<i class="fa-solid fa-star text-[10px]" style="color:var(--accent)"></i> ${Number(m.rating || 0).toFixed(1)}`;
                posterWrap.appendChild(badge);
                card.appendChild(posterWrap);

                const body = document.createElement('div');
                body.className = 'p-4 flex flex-col gap-2';
                const h3 = document.createElement('h3');
                h3.className = 'font-semibold text-sm truncate text-white/90';
                h3.textContent = m.title || 'Untitled';
                body.appendChild(h3);

                const meta = document.createElement('div');
                meta.className = 'flex justify-between items-center text-[11px] text-white/40';
                const yearSpan = document.createElement('span');
                yearSpan.textContent = m.year ? String(m.year) : '';
                meta.appendChild(yearSpan);
                if (m.tag) {
                    const tagSpan = document.createElement('span');
                    tagSpan.className = 'glass-pill text-[10px]';
                    tagSpan.textContent = m.tag;
                    meta.appendChild(tagSpan);
                }
                body.appendChild(meta);

                if (m.note) {
                    const noteP = document.createElement('p');
                    noteP.className = 'text-xs text-white/30 italic truncate';
                    noteP.textContent = `"${m.note}"`;
                    body.appendChild(noteP);
                }
                card.appendChild(body);

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'delete-saved absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur text-white/60 hover:text-red-400 hover:bg-red-900/40 transition opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs border border-white/10';
                delBtn.dataset.id = m.saved_id;
                delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                card.appendChild(delBtn);

                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const savedId = e.currentTarget.dataset.id;
                    if (!confirm('Remove this movie from your list?')) return;
                    try {
                        const sb = window.Auth.getClient();
                        const { error } = await sb.from('saved_movies').delete().eq('id', savedId);
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

                card.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-saved')) return;
                    window.location.href = `detail.html?id=${encodeURIComponent(Number(m.tmdb_id))}`;
                });

                grid.appendChild(card);
            });
        }

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

        loadMovies();
    });
})();
