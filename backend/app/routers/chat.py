"""Chat router — DeepSeek-powered movie assistant chatbot."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from openai import AsyncOpenAI
from app.core.config import settings

router = APIRouter()

_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
_MODEL = "deepseek-chat"
_MAX_TOKENS = 800
_TEMPERATURE = 0.7

_CLIENT: AsyncOpenAI | None = None

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


def _get_client() -> AsyncOpenAI:
    global _CLIENT
    if _CLIENT is None:
        if not settings.DEEPSEEK_API_KEY:
            raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY not configured")
        _CLIENT = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=_DEEPSEEK_BASE_URL,
        )
    return _CLIENT


@router.post("/chat")
async def chat(body: ChatMessage):
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    if len(body.message) > 500:
        raise HTTPException(status_code=422, detail="Message too long (max 500 chars)")

    # Build message history (last 6 messages for context)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    for msg in body.history[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": str(content)[:500]})

    messages.append({"role": "user", "content": body.message.strip()})

    try:
        client = _get_client()
        response = await client.chat.completions.create(
            model=_MODEL,
            messages=messages,
            temperature=_TEMPERATURE,
            max_tokens=_MAX_TOKENS,
        )
        reply = response.choices[0].message.content or "Sorry, I couldn't generate a response."
        return {"reply": reply}

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AI service error: {str(exc)}"
        ) from exc
