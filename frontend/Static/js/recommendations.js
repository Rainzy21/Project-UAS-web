/**
 * recommendations.js — Multi-Step AI Recommendation Form
 *
 * Animated step wizard with glassmorphism option chips,
 * glowing progress bar, and result rendering.
 */
(function () {
    const OPTIONS = {
        genre:         ['Action', 'Drama', 'Comedy', 'Horror', 'Sci-fi', 'Romance', 'Thriller', 'Animation'],
        mood:          ['Feel good', 'Dark & intense', 'Thrilling', 'Emotional', 'Lighthearted'],
        era:           ['Classic', '80s-90s', '2000s', '2010s', 'Recent', 'Any'],
        language:      ['English', 'Korean', 'Spanish', 'French', 'Japanese', 'Any'],
        watching_with: ['Solo', 'Partner', 'Friends', 'Family'],
    };

    const STEP_ICONS = ['🎬', '🎭', '📅', '🌍', '👥'];
    const STEP_LABELS = ['Genre', 'Mood', 'Era', 'Language', 'Audience'];
    const FIELDS = ['genre', 'mood', 'era', 'language', 'watching_with'];

    const state = { step: 1, answers: {}, direction: 'forward' };

    document.addEventListener('DOMContentLoaded', async () => {
        const form = document.getElementById('rec-form');
        if (!form) return;

        // Auth guard — tunggu session async
        const session = await (window.Auth ? window.Auth.getSession() : Promise.resolve(null));
        if (!session) {
            window.location.href = 'index.html?auth=required';
            return;
        }

        // ── Render option chips ──────────────────────────────
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

        // ── Option selection ─────────────────────────────────
        function selectOption(field, value, container) {
            state.answers[field] = value;
            container.querySelectorAll('.rec-option').forEach(b => {
                b.classList.toggle('selected', b.dataset.value === value);
            });
            document.getElementById('rec-next').disabled = false;
            document.getElementById('rec-submit').disabled = false;
        }

        // ── Step navigation with animation ───────────────────
        function showStep(n, direction) {
            const old = state.step;
            const dir = direction || (n > old ? 'forward' : 'backward');
            state.step = n;

            document.querySelectorAll('.rec-step').forEach(s => {
                const stepNum = Number(s.dataset.step);
                if (stepNum === old && stepNum !== n) {
                    // Animate out
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

            // Update progress
            document.getElementById('rec-step-current').textContent = n;
            document.getElementById('rec-step-label').textContent = STEP_LABELS[n - 1];
            const progressBar = document.getElementById('rec-progress-bar');
            if (progressBar) progressBar.style.width = (n * 20) + '%';

            // Update dots
            document.querySelectorAll('.step-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i + 1 === n);
                dot.classList.toggle('completed', i + 1 < n);
            });
            document.querySelectorAll('.step-dot-line').forEach((line, i) => {
                line.classList.toggle('active', i + 1 < n);
            });

            // Buttons
            document.getElementById('rec-back').disabled = n === 1;
            const isLast = n === 5;
            document.getElementById('rec-next').classList.toggle('hidden', isLast);
            document.getElementById('rec-submit').classList.toggle('hidden', !isLast);

            // Re-evaluate
            const currentField = FIELDS[n - 1];
            const hasAnswer = !!state.answers[currentField];
            document.getElementById('rec-next').disabled = !hasAnswer;
            document.getElementById('rec-submit').disabled = !hasAnswer;
        }

        // Nav buttons
        document.getElementById('rec-next').addEventListener('click', () => {
            if (state.step < 5) showStep(state.step + 1, 'forward');
        });
        document.getElementById('rec-back').addEventListener('click', () => {
            if (state.step > 1) showStep(state.step - 1, 'backward');
        });

        // ── Submit ───────────────────────────────────────────
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();

            const currentSession = await (window.Auth ? window.Auth.getSession() : Promise.resolve(null));
            if (!currentSession) {
                showError('Please sign in to get AI recommendations.');
                window.Auth && window.Auth.showModal('login');
                return;
            }

            toggleLoading(true);
            try {
                const data = await window.Api.post('/api/recommendations/generate', state.answers);
                renderResults(data.movies || []);
            } catch (err) {
                if (err.status === 401) {
                    showError('Your session expired. Please sign in again.');
                } else if (err.status === 403) {
                    showError('Please verify your email before requesting recommendations.');
                } else if (err.status === 429) {
                    showError("You've reached today's limit. Come back tomorrow.");
                } else {
                    showError(err.message || 'Something went wrong. Please try again.');
                }
            } finally {
                toggleLoading(false);
            }
        });

        // ── Results ──────────────────────────────────────────
        function renderResults(movies) {
            const grid = document.getElementById('rec-results-grid');
            grid.innerHTML = '';

            if (movies.length === 0) {
                grid.innerHTML = '<p class="col-span-full text-center text-white/40 py-12">No matches found. Try different filters.</p>';
            } else {
                movies.forEach(m => {
                    const card = window.MovieUI.buildCard(m, { showSave: true });
                    grid.appendChild(card);
                });
            }

            document.getElementById('rec-form').classList.add('hidden');
            document.getElementById('rec-progress').classList.add('hidden');
            document.getElementById('rec-results').classList.remove('hidden');
        }

        // ── Restart ──────────────────────────────────────────
        document.getElementById('rec-restart').addEventListener('click', () => {
            state.step = 1;
            state.answers = {};
            document.querySelectorAll('.rec-option.selected').forEach(b => b.classList.remove('selected'));
            document.getElementById('rec-results').classList.add('hidden');
            document.getElementById('rec-form').classList.remove('hidden');
            document.getElementById('rec-progress').classList.remove('hidden');
            hideError();
            showStep(1, 'backward');
        });

        // ── Helpers ──────────────────────────────────────────
        function toggleLoading(on) {
            document.getElementById('rec-loading').classList.toggle('hidden', !on);
            document.getElementById('rec-form').classList.toggle('hidden', on);
            document.getElementById('rec-progress').classList.toggle('hidden', on);
        }
        function showError(msg) {
            const el = document.getElementById('rec-error');
            el.textContent = msg;
            el.classList.remove('hidden');
        }
        function hideError() {
            document.getElementById('rec-error').classList.add('hidden');
        }

        // Initial
        showStep(1, 'forward');
    });
})();
