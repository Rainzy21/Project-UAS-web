/**
 * recommendations.js — 5-step form matching backend constants + AI payload
 * Guests can complete the form; results require login.
 */
(function () {
    'use strict';

    // Must match backend/app/constants.py exactly
    const OPTIONS = {
        genre:         ['Action', 'Drama', 'Comedy', 'Horror', 'Sci-fi', 'Romance', 'Thriller', 'Animation'],
        mood:          ['Unsettled', 'Inspired', 'Entertained', 'Emotional', 'Thrilled'],
        era:           ['Classic', '80s-90s', '2000s', '2010s', 'Recent', 'Any'],
        language:      ['English', 'Korean', 'Spanish', 'French', 'Japanese', 'Any'],
        watching_with: ['Solo', 'Partner', 'Friends', 'Family'],
    };

    const STEP_LABELS = ['Genre', 'Mood', 'Era', 'Language', 'Audience'];
    const FIELDS = ['genre', 'mood', 'era', 'language', 'watching_with'];
    const PENDING_KEY = 'recPendingAnswers';
    const PENDING_GEN_KEY = 'recPendingGenerate';

    const REASON_TEMPLATES = [
        (m) => `Because you wanted a <strong>${m.toLowerCase()}</strong> mood in ${'{genre}'}.`,
        (m) => `Because your taste leans <strong>${m.toLowerCase()}</strong> — same energy we matched on.`,
        (m) => `Because the <strong>${'{genre}'}</strong> picks fit your ${m.toLowerCase()} feeling.`,
        (m) => `Because this matches your ${m.toLowerCase()} preference from the quiz.`,
    ];

    const state = { step: 1, answers: {} };

    document.addEventListener('DOMContentLoaded', async () => {
        const form = document.getElementById('rec-form');
        if (!form) return;

        initOptionChips();
        bindNav(form);
        bindPresets();

        const params = new URLSearchParams(window.location.search);
        const prefillGenre = params.get('genre');
        if (prefillGenre && OPTIONS.genre.includes(prefillGenre)) {
            const container = document.querySelector('[data-field="genre"]');
            selectOption('genre', prefillGenre, container);
            showStep(2, 'forward');
        } else {
            showStep(1, 'forward');
        }

        await maybeResumeAfterLogin();
        await loadPresets();
    });

    function initOptionChips() {
        document.querySelectorAll('[data-field]').forEach(container => {
            const field = container.dataset.field;
            (OPTIONS[field] || []).forEach(value => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'rec-option';
                btn.textContent = value;
                btn.dataset.value = value;
                btn.addEventListener('click', () => selectOption(field, value, container));
                container.appendChild(btn);
            });
        });
    }

    function selectOption(field, value, container) {
        state.answers[field] = value;
        container.querySelectorAll('.rec-option').forEach(b => {
            b.classList.toggle('selected', b.dataset.value === value);
        });
        document.getElementById('rec-next').disabled = false;
        document.getElementById('rec-submit').disabled = false;
    }

    function showStep(n, direction) {
        const old = state.step;
        const dir = direction || (n > old ? 'forward' : 'backward');
        state.step = n;

        document.querySelectorAll('.rec-step').forEach(s => {
            const stepNum = Number(s.dataset.step);
            if (stepNum === old && stepNum !== n) {
                s.classList.remove('step-enter', 'step-enter-reverse');
                s.classList.add(dir === 'forward' ? 'step-exit' : 'step-exit-reverse');
                s.addEventListener('animationend', () => {
                    s.classList.add('hidden');
                    s.classList.remove('step-exit', 'step-exit-reverse');
                }, { once: true });
            } else if (stepNum === n) {
                s.classList.remove('hidden', 'step-exit', 'step-exit-reverse');
                s.classList.add(dir === 'forward' ? 'step-enter' : 'step-enter-reverse');
            }
        });

        document.getElementById('rec-step-current').textContent = n;
        document.getElementById('rec-step-label').textContent = STEP_LABELS[n - 1];
        document.getElementById('rec-progress-bar').style.width = (n * 20) + '%';

        document.querySelectorAll('.step-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i + 1 === n);
            dot.classList.toggle('completed', i + 1 < n);
        });
        document.querySelectorAll('.step-dot-line').forEach((line, i) => {
            line.classList.toggle('active', i + 1 < n);
        });

        document.getElementById('rec-back').disabled = n === 1;
        const isLast = n === 5;
        document.getElementById('rec-next').classList.toggle('hidden', isLast);
        document.getElementById('rec-submit').classList.toggle('hidden', !isLast);

        const currentField = FIELDS[n - 1];
        const hasAnswer = !!state.answers[currentField];
        document.getElementById('rec-next').disabled = !hasAnswer;
        document.getElementById('rec-submit').disabled = !hasAnswer;
    }

    function bindNav(form) {
        document.getElementById('rec-back').addEventListener('click', () => {
            if (state.step > 1) showStep(state.step - 1, 'backward');
        });
        document.getElementById('rec-next').addEventListener('click', () => {
            if (state.step < 5) showStep(state.step + 1, 'forward');
        });
        form.addEventListener('submit', e => {
            e.preventDefault();
            handleSubmit();
        });
        document.getElementById('rec-restart').addEventListener('click', restart);

        document.addEventListener('auth:statechange', async (e) => {
            if (e.detail && e.detail.loggedIn && sessionStorage.getItem(PENDING_GEN_KEY) === '1') {
                await runGeneration();
            }
        });
    }

    async function handleSubmit() {
        hideError();
        const session = window.Auth ? await window.Auth.getSession() : null;
        if (!session) {
            sessionStorage.setItem(PENDING_KEY, JSON.stringify(state.answers));
            sessionStorage.setItem(PENDING_GEN_KEY, '1');
            if (window.Auth) {
                window.Auth.showModal('login', { message: 'Your answers are saved — sign in with Google to get your picks' });
            }
            return;
        }
        await runGeneration();
    }

    async function maybeResumeAfterLogin() {
        const savedRaw = sessionStorage.getItem(PENDING_KEY);
        if (savedRaw) {
            try {
                const saved = JSON.parse(savedRaw);
                Object.assign(state.answers, saved);
                restoreAnswerChips();
                const answered = FIELDS.filter(f => state.answers[f]).length;
                if (answered > 0) showStep(Math.min(answered, 5), 'forward');
            } catch (_) {}
        }

        if (sessionStorage.getItem(PENDING_GEN_KEY) !== '1') return;
        const session = window.Auth ? await window.Auth.getSession() : null;
        if (!session) return;

        await runGeneration();
    }

    function restoreAnswerChips() {
        FIELDS.forEach(field => {
            const value = state.answers[field];
            if (!value) return;
            const container = document.querySelector(`[data-field="${field}"]`);
            if (container) selectOption(field, value, container);
        });
    }

    function clearPending() {
        sessionStorage.removeItem(PENDING_KEY);
        sessionStorage.removeItem(PENDING_GEN_KEY);
    }

    async function runGeneration() {
        hideError();
        clearPending();

        document.getElementById('rec-form').classList.add('hidden');
        document.getElementById('rec-progress').classList.add('hidden');
        document.getElementById('rec-loading').classList.remove('hidden');

        const { genre, mood, era, language, watching_with } = state.answers;
        const lines = [
            `Matching primary genre: ${genre}…`,
            `Applying ${mood} mood filter…`,
            era !== 'Any' ? `Restricting to ${era} releases…` : 'Scanning all eras…',
            language !== 'Any' ? `Filtering for ${language} originals…` : 'Including all languages…',
            `Adjusting for ${watching_with} viewing…`,
            'Ranking 10 best matches…',
        ];

        const reasoningPromise = animateReasoning(lines);

        try {
            const payload = {
                genre,
                mood,
                era,
                language,
                watching_with,
            };
            const data = await window.Api.post('/api/recommendations/generate', payload);
            await reasoningPromise;
            document.getElementById('rec-loading').classList.add('hidden');
            await renderResults(data.movies || []);
        } catch (err) {
            document.getElementById('rec-loading').classList.add('hidden');
            document.getElementById('rec-form').classList.remove('hidden');
            document.getElementById('rec-progress').classList.remove('hidden');

            if (err.status === 401) {
                sessionStorage.setItem(PENDING_KEY, JSON.stringify(state.answers));
                sessionStorage.setItem(PENDING_GEN_KEY, '1');
                showError('Please sign in to get your picks.');
                if (window.Auth) {
                    window.Auth.showModal('login', { message: 'Your answers are saved — sign in with Google to get your picks' });
                }
            } else if (err.status === 403) {
                const detail = err.data?.detail || err.message || '';
                const needsVerify = detail === 'EMAIL_NOT_VERIFIED'
                    || (typeof detail === 'object' && detail.code === 'EMAIL_NOT_VERIFIED');
                if (needsVerify) {
                    sessionStorage.setItem(PENDING_KEY, JSON.stringify(state.answers));
                    sessionStorage.setItem(PENDING_GEN_KEY, '1');
                    showError('Please verify your email before generating recommendations.');
                    const banner = document.getElementById('verify-banner');
                    if (banner) banner.classList.remove('hidden');
                } else {
                    showError('Please sign in to get your picks.');
                    if (window.Auth) {
                        window.Auth.showModal('login', { message: 'Sign in to get your picks' });
                    }
                }
            } else if (err.status === 429) {
                showError("You've reached today's limit. Come back tomorrow.");
            } else {
                showError(err.message || 'Something went wrong. Please try again.');
            }
        }
    }

    async function animateReasoning(lines) {
        const log = document.getElementById('reasoning-log');
        log.innerHTML = '';
        for (const text of lines) {
            const li = document.createElement('li');
            li.textContent = text;
            log.appendChild(li);
            await delay(600);
            li.classList.add('visible', 'active');
            log.querySelectorAll('li').forEach(el => { if (el !== li) el.classList.remove('active'); });
        }
        await delay(350);
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    async function fetchSavedTmdbIds() {
        const session = window.Auth ? await window.Auth.getSession() : null;
        if (!session) return new Set();

        try {
            const sb = window.Auth.getClient();
            if (!sb) return new Set();
            const { data, error } = await sb
                .from('saved_movies')
                .select('tmdb_id')
                .eq('user_id', session.user.id);
            if (error) throw error;
            return new Set((data || []).map(row => row.tmdb_id));
        } catch (_) {
            return new Set();
        }
    }

    async function saveMovieToList(movie) {
        const session = window.Auth ? await window.Auth.getSession() : null;
        if (!session) throw new Error('Sign in required');

        const sb = window.Auth.getClient();
        if (!sb) throw new Error('Auth is not configured');

        const tmdbId = Number(movie.tmdb_id);
        const posterUrl = movie.poster_url || '';
        const yr = movie.year ? parseInt(movie.year, 10) : null;

        const { error: rpcErr } = await sb.rpc('save_movie_to_wishlist', {
            p_tmdb_id: tmdbId,
            p_title: movie.title || 'Untitled',
            p_poster_url: posterUrl,
            p_rating: movie.rating || 0,
            p_year: yr,
        });

        if (rpcErr) {
            if (rpcErr.code === 'PGRST202' || rpcErr.message.includes('Could not find')) {
                const { error: upsertErr } = await sb.from('movies').upsert(
                    {
                        tmdb_id: tmdbId,
                        title: movie.title || 'Untitled',
                        poster_url: posterUrl,
                        rating: movie.rating || 0,
                        year: yr,
                    },
                    { onConflict: 'tmdb_id', ignoreDuplicates: true }
                );
                if (upsertErr) throw upsertErr;

                const { error: ins } = await sb.from('saved_movies')
                    .insert({ tmdb_id: tmdbId, user_id: session.user.id });
                if (ins && ins.code !== '23505') throw ins;
            } else {
                throw rpcErr;
            }
        }
    }

    function setSaveButtonSaved(btn) {
        btn.classList.add('is-saved');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved to My List';
    }

    async function renderResults(movies) {
        const grid = document.getElementById('rec-results-grid');
        grid.innerHTML = '';
        const mood = state.answers.mood || 'your';
        const savedIds = await fetchSavedTmdbIds();

        if (!movies.length) {
            grid.innerHTML = '<p class="text-center text-white/40 py-12">No matches found. Try different filters.</p>';
        } else {
            movies.forEach((m, i) => {
                const match = Math.round(97 - i * (7 / Math.max(movies.length - 1, 1)));
                const reason = REASON_TEMPLATES[i % REASON_TEMPLATES.length](mood)
                    .replace('{genre}', state.answers.genre || 'your picks');
                const isSaved = savedIds.has(m.tmdb_id);

                const card = document.createElement('article');
                card.className = 'rec-result-card';
                card.innerHTML = `
                    <a href="detail.html?id=${m.tmdb_id}" class="rec-result-link">
                        ${m.poster_url
                            ? `<img class="rec-result-poster" src="${m.poster_url}" alt="" loading="lazy">`
                            : `<div class="rec-result-poster rec-rate-poster-ph"><i class="fa-solid fa-film"></i></div>`
                        }
                        <div class="rec-result-body">
                            <div class="rec-result-match"><span class="rec-result-match-val">${match}%</span> match</div>
                            <div class="rec-result-title">${m.title || 'Unknown'}</div>
                            <div class="rec-result-meta">${m.year || ''}${m.rating ? ' · ★ ' + Number(m.rating).toFixed(1) : ''}</div>
                            <p class="rec-result-reason">${reason}</p>
                        </div>
                    </a>
                    <button type="button" class="rec-result-save${isSaved ? ' is-saved' : ''}" data-tmdb-id="${m.tmdb_id}"${isSaved ? ' disabled' : ''}>
                        <i class="fa-${isSaved ? 'solid fa-check' : 'regular fa-bookmark'}"></i>
                        ${isSaved ? 'Saved to My List' : 'Save to My List'}
                    </button>
                `;

                const saveBtn = card.querySelector('.rec-result-save');
                if (!isSaved) {
                    saveBtn.addEventListener('click', async e => {
                        e.preventDefault();
                        e.stopPropagation();
                        saveBtn.disabled = true;
                        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
                        try {
                            await saveMovieToList(m);
                            savedIds.add(m.tmdb_id);
                            setSaveButtonSaved(saveBtn);
                            if (window.showToast) {
                                window.showToast(`"${m.title || 'Film'}" saved to My List!`, 'success');
                            }
                        } catch (err) {
                            saveBtn.disabled = false;
                            saveBtn.innerHTML = '<i class="fa-regular fa-bookmark"></i> Save to My List';
                            if (window.showToast) {
                                window.showToast(err.message || 'Could not save', 'error');
                            }
                        }
                    });
                }

                grid.appendChild(card);
            });
        }

        document.getElementById('rec-results').classList.remove('hidden');
        document.getElementById('rec-save-preset').classList.remove('hidden');
        const saveMsg = document.getElementById('preset-save-msg');
        if (saveMsg) {
            saveMsg.textContent = '';
            saveMsg.classList.add('hidden');
        }
    }

    function bindPresets() {
        document.getElementById('preset-save-btn')?.addEventListener('click', saveCurrentPreset);
    }

    async function loadPresets() {
        const section = document.getElementById('rec-presets');
        const list = document.getElementById('rec-presets-list');
        const empty = document.getElementById('rec-presets-empty');
        if (!section || !list) return;

        const session = window.Auth ? await window.Auth.getSession() : null;
        if (!session) {
            section.classList.add('hidden');
            return;
        }

        try {
            const data = await window.Api.get('/api/recommendations/presets');
            const items = data.items || [];
            list.innerHTML = '';
            section.classList.remove('hidden');
            empty.classList.toggle('hidden', items.length > 0);

            items.forEach(preset => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'rec-preset-chip';
                btn.innerHTML = `<span>${preset.name}</span><i class="fa-solid fa-xmark rec-preset-delete" data-id="${preset.id}" title="Delete"></i>`;
                btn.addEventListener('click', e => {
                    if (e.target.closest('.rec-preset-delete')) return;
                    applyPreset(preset.preferences || {});
                });
                btn.querySelector('.rec-preset-delete')?.addEventListener('click', async e => {
                    e.stopPropagation();
                    await deletePreset(preset.id);
                });
                list.appendChild(btn);
            });
        } catch (_) {
            section.classList.add('hidden');
        }
    }

    function applyPreset(prefs) {
        if (!prefs) return;
        state.answers = { ...prefs };
        restoreAnswerChips();
        document.getElementById('rec-results').classList.add('hidden');
        document.getElementById('rec-save-preset').classList.add('hidden');
        document.getElementById('rec-form').classList.remove('hidden');
        document.getElementById('rec-progress').classList.remove('hidden');
        hideError();
        showStep(5, 'forward');
        if (window.showToast) window.showToast('Preferences loaded — click Get Recommendations', 'info');
    }

    async function saveCurrentPreset() {
        const session = window.Auth ? await window.Auth.getSession() : null;
        if (!session) {
            window.Auth?.showModal('login', { message: 'Sign in to save presets' });
            return;
        }

        const nameInput = document.getElementById('preset-name');
        const msgEl = document.getElementById('preset-save-msg');
        const name = (nameInput?.value || '').trim();
        if (!name) {
            if (msgEl) {
                msgEl.textContent = 'Enter a name for this preset.';
                msgEl.classList.remove('hidden');
            }
            return;
        }

        const btn = document.getElementById('preset-save-btn');
        if (btn) btn.disabled = true;

        try {
            await window.Api.post('/api/recommendations/presets', {
                name,
                ...state.answers,
            });
            if (nameInput) nameInput.value = '';
            if (msgEl) {
                msgEl.textContent = 'Preset saved!';
                msgEl.classList.remove('hidden');
            }
            if (window.showToast) window.showToast('Preset saved', 'success');
            await loadPresets();
        } catch (err) {
            const text = err.message || 'Could not save preset';
            if (msgEl) {
                msgEl.textContent = text;
                msgEl.classList.remove('hidden');
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function deletePreset(id) {
        if (!confirm('Delete this saved preset?')) return;
        try {
            await window.Api.delete(`/api/recommendations/presets/${id}`);
            if (window.showToast) window.showToast('Preset deleted', 'info');
            await loadPresets();
        } catch (err) {
            if (window.showToast) window.showToast(err.message || 'Delete failed', 'error');
        }
    }

    function restart() {
        state.step = 1;
        state.answers = {};
        clearPending();
        document.querySelectorAll('.rec-option.selected').forEach(b => b.classList.remove('selected'));
        document.getElementById('rec-results').classList.add('hidden');
        document.getElementById('rec-save-preset').classList.add('hidden');
        document.getElementById('rec-form').classList.remove('hidden');
        document.getElementById('rec-progress').classList.remove('hidden');
        hideError();
        showStep(1, 'backward');
    }

    function showError(msg) {
        const el = document.getElementById('rec-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }
    function hideError() {
        document.getElementById('rec-error').classList.add('hidden');
    }
})();
