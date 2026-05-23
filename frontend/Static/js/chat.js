/**
 * chat.js — AI Support Chatbot powered by DeepSeek
 *
 * The chat sends messages to the Django backend proxy (/api/chat/)
 * which forwards them to DeepSeek's API. This keeps the API token
 * safely on the server side (BFF pattern).
 */
document.addEventListener('DOMContentLoaded', () => {
    // ── DOM references ──────────────────────────────────────────
    const panel        = document.getElementById('chat-panel');
    const toggleBtn    = document.getElementById('chat-toggle-btn');
    const toggleIcon   = document.getElementById('chat-toggle-icon');
    const closeBtn     = document.getElementById('chat-close-btn');
    const messagesDiv  = document.getElementById('chat-messages');
    const form         = document.getElementById('chat-form');
    const input        = document.getElementById('chat-input');
    const sendBtn      = document.getElementById('chat-send-btn');
    const suggestions  = document.getElementById('chat-suggestions');

    if (!panel || !toggleBtn) return;

    // ── Conversation state ──────────────────────────────────────
    // System prompt is now handled server-side in views.py for security.
    // The client only sends user/assistant messages.
    let history = []; // { role: 'user'|'assistant', content: string }

    // ── Helpers ─────────────────────────────────────────────────

    /** Escape text for safe insertion into the DOM via textContent. */
    function createBubble(text, sender) {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-end gap-2 ' + (sender === 'user' ? 'justify-end' : 'justify-start');

        if (sender === 'bot') {
            const avatar = document.createElement('div');
            avatar.className = 'w-7 h-7 bg-gradient-to-br from-[#ffc107] to-[#ff9800] rounded-full flex items-center justify-center flex-shrink-0';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-robot text-black text-[10px]';
            avatar.appendChild(icon);
            wrapper.appendChild(avatar);
        }

        const bubble = document.createElement('div');
        bubble.className = sender === 'user'
            ? 'max-w-[75%] bg-[#ffc107] text-black text-[13px] rounded-2xl rounded-br-sm px-4 py-2.5 leading-relaxed'
            : 'max-w-[75%] bg-gray-800/80 text-gray-200 text-[13px] rounded-2xl rounded-bl-sm px-4 py-2.5 leading-relaxed border border-gray-700/40';
        bubble.textContent = text;
        wrapper.appendChild(bubble);

        return wrapper;
    }

    function createTypingIndicator() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-end gap-2 justify-start';
        wrapper.id = 'typing-indicator';

        const avatar = document.createElement('div');
        avatar.className = 'w-7 h-7 bg-gradient-to-br from-[#ffc107] to-[#ff9800] rounded-full flex items-center justify-center flex-shrink-0';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-robot text-black text-[10px]';
        avatar.appendChild(icon);
        wrapper.appendChild(avatar);

        const bubble = document.createElement('div');
        bubble.className = 'bg-gray-800/80 text-gray-400 text-[13px] rounded-2xl rounded-bl-sm px-4 py-3 border border-gray-700/40 flex items-center gap-1';

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.className = 'w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce';
            dot.style.animationDelay = (i * 0.15) + 's';
            bubble.appendChild(dot);
        }

        wrapper.appendChild(bubble);
        return wrapper;
    }

    function scrollToBottom() {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // ── Toggle panel ────────────────────────────────────────────
    function openPanel() {
        panel.classList.remove('hidden');
        toggleIcon.classList.replace('fa-comment', 'fa-xmark');
        input.focus();
        scrollToBottom();
    }

    function closePanel() {
        panel.classList.add('hidden');
        toggleIcon.classList.replace('fa-xmark', 'fa-comment');
    }

    toggleBtn.addEventListener('click', () => {
        panel.classList.contains('hidden') ? openPanel() : closePanel();
    });

    closeBtn.addEventListener('click', closePanel);

    // ── Enable / disable send button based on input ─────────────
    input.addEventListener('input', () => {
        sendBtn.disabled = !input.value.trim();
    });

    // ── Welcome message on first open ───────────────────────────
    (function addWelcome() {
        const welcome = createBubble('Halo! 🎬 Saya SJ MovieBot, asisten rekomendasi film kamu. Mau cari film apa hari ini?', 'bot');
        messagesDiv.appendChild(welcome);
    })();

    // ── Suggested questions ─────────────────────────────────────
    document.querySelectorAll('.chat-suggestion').forEach(btn => {
        btn.addEventListener('click', () => {
            input.value = btn.textContent;
            sendBtn.disabled = false;
            sendMessage(btn.textContent);
        });
    });

    // ── Send message ────────────────────────────────────────────
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        sendMessage(text);
    });

    async function sendMessage(text) {
        // Render user bubble
        messagesDiv.appendChild(createBubble(text, 'user'));
        input.value = '';
        sendBtn.disabled = true;
        scrollToBottom();

        // Hide suggestions after first message
        if (suggestions) suggestions.classList.add('hidden');

        // Add to history
        history.push({ role: 'user', content: text });

        // Show typing indicator
        const typing = createTypingIndicator();
        messagesDiv.appendChild(typing);
        scrollToBottom();

        try {
            const reply = await fetchBotReply(history);
            history.push({ role: 'assistant', content: reply });

            // Remove typing indicator and show reply
            const indicator = document.getElementById('typing-indicator');
            if (indicator) indicator.remove();
            messagesDiv.appendChild(createBubble(reply, 'bot'));
        } catch (err) {
            const indicator = document.getElementById('typing-indicator');
            if (indicator) indicator.remove();
            messagesDiv.appendChild(createBubble('Sorry, I couldn\'t process that right now. Please try again later.', 'bot'));
        }

        scrollToBottom();
    }

    // ── Backend proxy call ──────────────────────────────────────
    async function fetchBotReply(conversationHistory) {
        const res = await fetch('/api/chat/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: conversationHistory.slice(-10), // keep context window manageable
            }),
        });

        if (!res.ok) {
            throw new Error('Chat API returned ' + res.status);
        }

        const data = await res.json();
        return data.reply || 'Maaf, tidak ada respons saat ini.';
    }
});
