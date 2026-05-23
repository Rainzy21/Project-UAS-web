"""
views.py — Backend-for-Frontend (BFF) proxy views.

The /api/chat/ endpoint forwards conversation messages to the DeepSeek API
and returns the assistant reply.  The AI token is read from the DEEPSEEK_API_KEY
environment variable (or from backend/.env) so it never reaches the browser.
"""

import json
import logging
import os
import urllib.request
from http import HTTPStatus
from pathlib import Path

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger(__name__)

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

# Maximum number of conversation turns the client may send (to limit token usage)
MAX_MESSAGES = 12

# ── Load .env file if present ────────────────────────────────────────────────
# This reads the .env in the project root so you don't need to set env vars
# manually every time.  The file is gitignored so the key stays private.
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"
if _ENV_FILE.is_file():
    with open(_ENV_FILE, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#"):
                continue
            if "=" in _line:
                _key, _, _val = _line.partition("=")
                _key = _key.strip()
                _val = _val.strip()
                if _key and _val:
                    os.environ.setdefault(_key, _val)


# ── TMDB helper (server-side) ────────────────────────────────────────────────
TMDB_API_URL = "https://api.themoviedb.org/3"


def _fetch_tmdb_trending():
    """Fetch this week's trending movies from TMDB to enrich the AI context.
    Returns a short text summary or empty string on failure."""
    tmdb_key = os.environ.get("TMDB_API_KEY", "")
    if not tmdb_key:
        return ""
    try:
        url = f"{TMDB_API_URL}/trending/movie/week?api_key={tmdb_key}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        movies = data.get("results", [])[:10]
        if not movies:
            return ""
        lines = []
        for i, m in enumerate(movies, 1):
            title = m.get("title", "Unknown")
            year = (m.get("release_date") or "")[:4]
            rating = m.get("vote_average", 0)
            overview = (m.get("overview") or "")[:120]
            lines.append(f"{i}. {title} ({year}) — ⭐ {rating:.1f} — {overview}")
        return "\n".join(lines)
    except Exception:
        logger.debug("Could not fetch TMDB trending, skipping context enrichment")
        return ""


# ── System prompt for movie recommendation bot ───────────────────────────────
SYSTEM_PROMPT = """Kamu adalah "SJ MovieBot", asisten AI ramah di website SJ MovieReview yang ahli dalam rekomendasi film.

## Peran Utama
- Memberikan rekomendasi film berdasarkan genre, mood, aktor, sutradara, atau preferensi pengguna
- Menjelaskan sinopsis film tanpa spoiler
- Memberikan rating dan ulasan singkat
- Membantu pengguna menavigasi fitur website SJ MovieReview

## Panduan Respons
- Jawab dalam Bahasa Indonesia, kecuali pengguna bertanya dalam bahasa Inggris
- Jawab singkat dan padat (maksimal 150 kata)
- Gunakan emoji untuk membuat percakapan lebih hidup 🎬🍿⭐
- Saat merekomendasikan film, sebutkan: judul, tahun, genre, dan rating
- Jika user minta rekomendasi tapi tidak spesifik, tanyakan preferensi mereka (genre, mood, dll)
- Jangan berikan spoiler kecuali diminta

## Fitur Website SJ MovieReview
- 🏠 Homepage: menampilkan film featured dan trending
- 🎬 All Movies: jelajahi koleksi film lengkap
- ❤️ Favorite: simpan film favorit (perlu login)
- 📑 Wishlist: daftar film yang ingin ditonton (perlu login)
- 👤 Login/Sign Up: buat akun untuk akses fitur lengkap

## Contoh Rekomendasi
Jika ditanya "rekomendasikan film action":
"Berikut rekomendasi film action terbaik 🎬:
1. **John Wick 4** (2023) — ⭐ 7.7 — Aksi non-stop Keanu Reeves
2. **Top Gun: Maverick** (2022) — ⭐ 8.3 — Tom Cruise kembali menerbangkan jet
3. **The Batman** (2022) — ⭐ 7.7 — Batman versi gelap Robert Pattinson"

Jika ditanya hal di luar topik film/website, jawab dengan sopan bahwa kamu spesialis film dan arahkan kembali ke topik film.
"""


@csrf_exempt
@require_POST
def chat_proxy(request):
    """Receive conversation messages from the frontend and forward them to
    DeepSeek's chat completions endpoint.  Returns a JSON object with the
    shape ``{ "reply": "…" }``."""

    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        return JsonResponse(
            {"error": "AI service is not configured. Set DEEPSEEK_API_KEY in .env file."},
            status=HTTPStatus.SERVICE_UNAVAILABLE,
        )

    # ── Parse request body ───────────────────────────────────────
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse(
            {"error": "Invalid JSON body."},
            status=HTTPStatus.BAD_REQUEST,
        )

    messages = body.get("messages")
    if not isinstance(messages, list) or len(messages) == 0:
        return JsonResponse(
            {"error": "messages must be a non-empty list."},
            status=HTTPStatus.BAD_REQUEST,
        )

    # Validate and sanitise each message entry (skip system — we inject our own)
    sanitised = []
    for msg in messages[:MAX_MESSAGES]:
        role = msg.get("role")
        content = msg.get("content", "")
        if role not in ("user", "assistant"):
            continue
        if not isinstance(content, str) or len(content) > 2000:
            continue
        sanitised.append({"role": role, "content": content})

    if not sanitised:
        return JsonResponse(
            {"error": "No valid messages provided."},
            status=HTTPStatus.BAD_REQUEST,
        )

    # ── Build the final messages with server-side system prompt ───
    # Enrich with live TMDB data so the bot knows what's trending
    trending_text = _fetch_tmdb_trending()
    enriched_prompt = SYSTEM_PROMPT
    if trending_text:
        enriched_prompt += (
            "\n\n## Film Trending Minggu Ini (data live dari TMDB)\n"
            "Gunakan data ini saat user bertanya tentang film populer atau rekomendasi:\n"
            + trending_text
        )

    final_messages = [
        {"role": "system", "content": enriched_prompt},
        *sanitised,
    ]

    # ── Forward to DeepSeek API ──────────────────────────────────
    try:
        payload = json.dumps({
            "model": DEEPSEEK_MODEL,
            "messages": final_messages,
            "max_tokens": 400,
            "temperature": 0.7,
            "stream": False,
        }).encode("utf-8")

        req = urllib.request.Request(
            DEEPSEEK_API_URL,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        reply_text = (
            result.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "Maaf, saya tidak bisa memproses permintaan saat ini.")
        )

        return JsonResponse({"reply": reply_text})

    except Exception:
        logger.exception("DeepSeek API call failed")
        return JsonResponse(
            {"error": "Gagal menghubungi layanan AI. Silakan coba lagi nanti."},
            status=HTTPStatus.BAD_GATEWAY,
        )
