/**
 * chat.js — SJ MovieBot AI Chatbot
 *
 * Glassmorphism floating chatbot powered by DeepSeek via FastAPI backend.
 * Maintains conversation history for context-aware responses.
 * Token: DEEPSEEK_API_KEY dari .env backend (tidak di-expose ke frontend).
 */
(function (window) {
    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:8000';

    // ── State ─────────────────────────────────────────────────
    let isOpen = false;
    let isTyping = false;
    let history = []; // [{role: 'user'|'assistant', content: string}]

    const WELCOME_MSG = 'Halo! Saya **SJ MovieBot** 🎬 Mau nonton apa malam ini? Tanyakan rekomendasi film, info tentang sutradara, atau genre favorit kamu!';

    // ── DOM Refs ──────────────────────────────────────────────
    function el(id) { return document.getElementById(id); }

    // ── Render helpers ────────────────────────────────────────
    function renderMarkdown(text) {
        // Simple markdown: **bold**, *italic*, newlines, bullet lists
        return text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code class="text-amber-300 bg-white/5 px-1 rounded text-xs">$1</code>')
            .replace(/^[-•]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
            .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="space-y-1 my-1">$&</ul>')
            .replace(/\n/g, '<br>');
    }

    function appendMessage(role, text, animate = true) {
        const container = el('chat-messages');
        if (!container) return;

        const isBot = role === 'assistant';
        const bubble = document.createElement('div');
        bubble.className = `flex items-end gap-2 ${isBot ? '' : 'flex-row-reverse'}`;

        if (animate) {
            bubble.style.opacity = '0';
            bubble.style.transform = 'translateY(10px)';
            bubble.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        }

        const avatar = isBot
            ? `<div class="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <i class="fa-solid fa-robot text-black text-[10px]"></i>
               </div>`
            : `<div class="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
                <i class="fa-regular fa-user text-white/50 text-[10px]"></i>
               </div>`;

        const bubbleStyle = isBot
            ? `background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px 16px 16px 4px;`
            : `background: linear-gradient(135deg, rgba(255,193,7,0.2), rgba(255,152,0,0.15)); border: 1px solid rgba(255,193,7,0.2); border-radius: 16px 16px 4px 16px;`;

        bubble.innerHTML = `
            ${isBot ? avatar : ''}
            <div class="max-w-[78%] px-4 py-2.5 text-sm leading-relaxed" style="${bubbleStyle}; backdrop-filter: blur(10px);">
                ${isBot ? renderMarkdown(text) : `<span style="color:rgba(255,255,255,0.85)">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`}
            </div>
            ${!isBot ? avatar : ''}
        `;

        container.appendChild(bubble);

        // Animate in
        if (animate) {
            requestAnimationFrame(() => {
                bubble.style.opacity = '1';
                bubble.style.transform = 'translateY(0)';
            });
        }

        container.scrollTop = container.scrollHeight;
        return bubble;
    }

    function showTypingIndicator() {
        const container = el('chat-messages');
        if (!container) return null;

        const indicator = document.createElement('div');
        indicator.id = 'typing-indicator';
        indicator.className = 'flex items-end gap-2';
        indicator.style.opacity = '0';
        indicator.style.transition = 'opacity 0.2s';
        indicator.innerHTML = `
            <div class="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <i class="fa-solid fa-robot text-black text-[10px]"></i>
            </div>
            <div class="px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style="animation-delay:0ms"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style="animation-delay:150ms"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style="animation-delay:300ms"></span>
            </div>
        `;
        container.appendChild(indicator);
        requestAnimationFrame(() => { indicator.style.opacity = '1'; });
        container.scrollTop = container.scrollHeight;
        return indicator;
    }

    function removeTypingIndicator() {
        const ind = el('typing-indicator');
        if (ind) ind.remove();
    }

    function setSendDisabled(disabled) {
        const btn = el('chat-send-btn');
        const input = el('chat-input');
        if (btn) btn.disabled = disabled;
        if (input) input.disabled = disabled;
    }

    // ── Open / Close ──────────────────────────────────────────
    function openChat() {
        const panel = el('chat-panel');
        const icon = el('chat-toggle-icon');
        if (!panel) return;

        isOpen = true;
        panel.classList.remove('hidden');
        if (icon) { icon.classList.remove('fa-comment'); icon.classList.add('fa-xmark'); }

        // Show welcome message if first time
        const container = el('chat-messages');
        if (container && container.children.length === 0) {
            appendMessage('assistant', WELCOME_MSG, false);
        }

        // Focus input
        setTimeout(() => {
            const input = el('chat-input');
            if (input) input.focus();
        }, 200);
    }

    function closeChat() {
        const panel = el('chat-panel');
        const icon = el('chat-toggle-icon');
        if (!panel) return;

        isOpen = false;
        panel.classList.add('hidden');
        if (icon) { icon.classList.remove('fa-xmark'); icon.classList.add('fa-comment'); }
    }

    // ── Send message ──────────────────────────────────────────
    async function sendMessage(text) {
        if (!text || !text.trim() || isTyping) return;
        text = text.trim();

        // Hide suggestions after first message
        const suggestions = el('chat-suggestions');
        if (suggestions) suggestions.style.display = 'none';

        // Render user bubble
        appendMessage('user', text);
        history.push({ role: 'user', content: text });

        // Clear input
        const input = el('chat-input');
        if (input) { input.value = ''; updateSendBtn(); }

        // Show typing
        isTyping = true;
        setSendDisabled(true);
        const indicator = showTypingIndicator();

        try {
            const res = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, history: history.slice(-6) }),
            });

            removeTypingIndicator();

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || `Error ${res.status}`);
            }

            const data = await res.json();
            const reply = data.reply || 'Sorry, I had trouble responding.';

            appendMessage('assistant', reply);
            history.push({ role: 'assistant', content: reply });

            // Keep history bounded
            if (history.length > 20) history = history.slice(-16);

        } catch (err) {
            removeTypingIndicator();
            appendMessage('assistant', `⚠️ Maaf, terjadi error: ${err.message}. Pastikan backend sedang berjalan di ${API_BASE}.`);
        } finally {
            isTyping = false;
            setSendDisabled(false);
            const inp = el('chat-input');
            if (inp) { inp.disabled = false; inp.focus(); }
        }
    }

    // ── Input handler ─────────────────────────────────────────
    function updateSendBtn() {
        const btn = el('chat-send-btn');
        const input = el('chat-input');
        if (btn && input) btn.disabled = !input.value.trim() || isTyping;
    }

    // ── Init ──────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        const toggleBtn = el('chat-toggle-btn');
        const closeBtn = el('chat-close-btn');
        const form = el('chat-form');
        const input = el('chat-input');

        if (toggleBtn) toggleBtn.addEventListener('click', () => isOpen ? closeChat() : openChat());
        if (closeBtn) closeBtn.addEventListener('click', closeChat);

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                if (input) sendMessage(input.value);
            });
        }

        if (input) {
            input.addEventListener('input', updateSendBtn);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input.value);
                }
            });
        }

        // Suggestion chips
        document.querySelectorAll('.chat-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!isOpen) openChat();
                sendMessage(btn.textContent.trim());
            });
        });
    });

    // ── Export ────────────────────────────────────────────────
    window.ChatBot = { open: openChat, close: closeChat, send: sendMessage };
})(window);
