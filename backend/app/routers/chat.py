from __future__ import annotations

"""Chat router — Gemini-powered movie assistant chatbot with DeepSeek fallback.

Provider priority:
  1. Google Gemini                  – primary (OpenAI-compatible endpoint)
  2. DeepSeek (OpenAI-compatible)  – fallback when Gemini fails or key is absent
"""
import time
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from openai import AsyncOpenAI
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
_DEEPSEEK_MODEL = "deepseek-chat"
_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
_GEMINI_MODEL = "gemini-2.0-flash"
_MAX_TOKENS = 800
_TEMPERATURE = 0.7

_CHAT_RATE_STORE: dict[str, list[float]] = {}
_CHAT_RATE_LIMIT = 30
_CHAT_RATE_WINDOW = 60

_DEEPSEEK_CLIENT: AsyncOpenAI | None = None
_GEMINI_CLIENT: AsyncOpenAI | None = None


def _check_chat_rate_limit(client_ip: str) -> None:
    now = time.time()
    timestamps = _CHAT_RATE_STORE.get(client_ip, [])
    timestamps = [t for t in timestamps if now - t < _CHAT_RATE_WINDOW]
    if len(timestamps) >= _CHAT_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many chat requests. Try again shortly.")
    timestamps.append(now)
    _CHAT_RATE_STORE[client_ip] = timestamps

SYSTEM_PROMPT = """You are SJ MovieBot, an enthusiastic and knowledgeable AI movie assistant for SJ MovieReview.

Your personality:
- Friendly, passionate, and concise
- You LOVE talking about movies, directors, actors, genres, and cinema history
- You give specific, confident recommendations with brief reasons why
- You use movie emojis occasionally (🎬🍿⭐🎭) but don't overdo it
- You keep responses SHORT (max 3-4 sentences or a short list) — users are on a website, not reading an essay

You can:
- Recommend movies by genre, mood, era, or specific criteria
- Answer questions about films, directors, actors
- Suggest hidden gems and classics
- Compare movies or discuss themes
- Help users decide what to watch tonight

You cannot:
- Access real-time data, box office numbers, or streaming availability
- Guarantee TMDB IDs are correct
- Make up movies that don't exist

Always respond in the same language the user writes in (Indonesian or English).
If asked in Indonesian, respond in Indonesian. If in English, respond in English."""


class ChatMessage(BaseModel):
    message: str
    history: list[dict] = []


def _get_deepseek_client() -> AsyncOpenAI | None:
    """Return DeepSeek client if API key is available, else None."""
    global _DEEPSEEK_CLIENT
    if not settings.DEEPSEEK_API_KEY:
        return None
    if _DEEPSEEK_CLIENT is None:
        _DEEPSEEK_CLIENT = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=_DEEPSEEK_BASE_URL,
        )
    return _DEEPSEEK_CLIENT


def _get_gemini_client() -> AsyncOpenAI | None:
    """Return Gemini client if API key is configured."""
    global _GEMINI_CLIENT
    if not settings.GEMINI_API_KEY:
        return None
    if _GEMINI_CLIENT is None:
        _GEMINI_CLIENT = AsyncOpenAI(
            api_key=settings.GEMINI_API_KEY,
            base_url=_GEMINI_BASE_URL,
        )
    return _GEMINI_CLIENT


def _build_messages(body: ChatMessage) -> list[dict]:
    """Build message list with system prompt and conversation history."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in body.history[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": str(content)[:500]})
    messages.append({"role": "user", "content": body.message.strip()})
    return messages


@router.post("/chat")
async def chat(request: Request, body: ChatMessage):
    client_ip = request.client.host if request.client else "unknown"
    _check_chat_rate_limit(client_ip)

    if not body.message or not body.message.strip():
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    if len(body.message) > 500:
        raise HTTPException(status_code=422, detail="Message too long (max 500 chars)")

    messages = _build_messages(body)

    # ── 1. Try Gemini first ───────────────────────────────────────────────
    gemini = _get_gemini_client()
    if gemini:
        try:
            response = await gemini.chat.completions.create(
                model=_GEMINI_MODEL,
                messages=messages,
                temperature=_TEMPERATURE,
                max_tokens=_MAX_TOKENS,
            )
            reply = response.choices[0].message.content or "Sorry, I couldn't generate a response."
            return {"reply": reply, "provider": "gemini"}
        except Exception as exc:
            logger.warning("Gemini failed (%s), falling back to DeepSeek.", exc)

    # ── 2. Fallback: DeepSeek ─────────────────────────────────────────────
    deepseek = _get_deepseek_client()
    if deepseek:
        try:
            response = await deepseek.chat.completions.create(
                model=_DEEPSEEK_MODEL,
                messages=messages,
                temperature=_TEMPERATURE,
                max_tokens=_MAX_TOKENS,
            )
            reply = response.choices[0].message.content or "Sorry, I couldn't generate a response."
            return {"reply": reply, "provider": "deepseek"}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Both AI providers failed. Last error: {str(exc)}"
            ) from exc

    raise HTTPException(status_code=503, detail="No AI provider available")
