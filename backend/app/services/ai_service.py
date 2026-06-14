from __future__ import annotations

"""B31 — AI service using Gemini (primary) with DeepSeek fallback.

Provider priority:
  1. Gemini    – primary (OpenAI-compatible endpoint, uses default key if needed)
  2. DeepSeek  – fallback when DEEPSEEK_API_KEY is set and working

Returns a list of dicts: [{"tmdb_id": int, "title": str, "year": int | None}]
Raises HTTP 502/AI_ERROR on total failure.
"""
import json
import logging
import re
import httpx

from fastapi import HTTPException
from openai import AsyncOpenAI

from app.constants import (
    ALLOWED_ERAS,
    ALLOWED_GENRES,
    ALLOWED_LANGUAGES,
    ALLOWED_MOODS,
    ALLOWED_WATCHING_WITH,
)
from app.core.config import settings

logger = logging.getLogger(__name__)

_DEEPSEEK_MODEL = "deepseek-chat"
_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
_GEMINI_MODEL = "gemini-2.0-flash"
_TEMPERATURE = 0.3     # low → factual / consistent TMDB IDs
_MAX_TOKENS = 2048

# Default Gemini API key fallback
_DEFAULT_GEMINI_KEY = "AIzaSyDefault-ReplaceWithRealKey"

_DEEPSEEK_CLIENT: AsyncOpenAI | None = None
_GEMINI_CLIENT: AsyncOpenAI | None = None

# Map era → (min_year, max_year | None) used to make the prompt unambiguous.
_ERA_RANGES: dict[str, tuple[int, int | None]] = {
    "Classic": (1900, 1979),
    "80s-90s": (1980, 1999),
    "2000s": (2000, 2009),
    "2010s": (2010, 2019),
    "Recent": (2020, None),
}

# Map UI language label → ISO 639-1 code used by TMDB `original_language`.
_LANGUAGE_ISO: dict[str, str] = {
    "English": "en",
    "Korean": "ko",
    "Spanish": "es",
    "French": "fr",
    "Japanese": "ja",
}


def _get_deepseek_client() -> AsyncOpenAI | None:
    """Return DeepSeek client if API key is available, else None."""
    global _DEEPSEEK_CLIENT
    if not settings.DEEPSEEK_API_KEY:
        return None
        
    if _DEEPSEEK_CLIENT is None:
        base_url = _DEEPSEEK_BASE_URL
        headers = {}
        if settings.DEEPSEEK_API_KEY.startswith("sk-or-"):
            base_url = "https://openrouter.ai/api/v1"
            headers = {
                "HTTP-Referer": settings.FRONTEND_URL,
                "X-Title": "SJ MovieRecommendation",
            }
            
        _DEEPSEEK_CLIENT = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=base_url,
            default_headers=headers if headers else None,
        )
    return _DEEPSEEK_CLIENT


async def _call_gemini_native(api_key: str, messages: list) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{_GEMINI_MODEL}:generateContent"
    contents = []
    system_instruction = None
    for msg in messages:
        if msg["role"] == "system":
            system_instruction = {"parts": [{"text": msg["content"]}]}
        elif msg["role"] == "user":
            contents.append({"role": "user", "parts": [{"text": msg["content"]}]})
        elif msg["role"] == "assistant":
            contents.append({"role": "model", "parts": [{"text": msg["content"]}]})
    
    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": _TEMPERATURE,
            "responseMimeType": "application/json",
        }
    }
    if system_instruction:
        payload["systemInstruction"] = system_instruction

    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=payload, timeout=60.0)
    if resp.status_code != 200:
        raise Exception(f"Gemini HTTP {resp.status_code}: {resp.text}")
    data = resp.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise Exception(f"Invalid Gemini format: {resp.text}")


def _validate_preferences(preferences: dict) -> None:
    """Validate all 5 preference fields against allowlist constants."""
    genre = preferences.get("genre", "")
    mood = preferences.get("mood", "")
    era = preferences.get("era", "")
    language = preferences.get("language", "")
    watching_with = preferences.get("watching_with", "")

    errors = []
    if genre not in ALLOWED_GENRES:
        errors.append(f"genre must be one of: {', '.join(sorted(ALLOWED_GENRES))}")
    if mood not in ALLOWED_MOODS:
        errors.append(f"mood must be one of: {', '.join(sorted(ALLOWED_MOODS))}")
    if era not in ALLOWED_ERAS:
        errors.append(f"era must be one of: {', '.join(sorted(ALLOWED_ERAS))}")
    if language not in ALLOWED_LANGUAGES:
        errors.append(f"language must be one of: {', '.join(sorted(ALLOWED_LANGUAGES))}")
    if watching_with not in ALLOWED_WATCHING_WITH:
        errors.append(f"watching_with must be one of: {', '.join(sorted(ALLOWED_WATCHING_WITH))}")

    if errors:
        raise HTTPException(
            status_code=422,
            detail={"error": True, "code": "VALIDATION_ERROR", "message": "; ".join(errors), "status": 422},
        )


def _era_clause(era: str) -> str:
    if era == "Any":
        return "- Release year: no restriction"
    rng = _ERA_RANGES.get(era)
    if not rng:
        return f"- Release era: {era}"
    lo, hi = rng
    if hi is None:
        return f"- Release year MUST be >= {lo} (released in {era.lower()} era)"
    return f"- Release year MUST be between {lo} and {hi} inclusive ({era} era)"


def _language_clause(language: str) -> str:
    if language == "Any":
        return "- Original language: no restriction"
    iso = _LANGUAGE_ISO.get(language, "")
    iso_hint = f' (TMDB original_language code "{iso}")' if iso else ""
    return f"- Original language MUST be {language}{iso_hint}; do NOT return dubs or English-language remakes"


def _audience_clause(watching_with: str) -> str:
    if watching_with == "Family":
        return (
            "- Audience: Family — every film MUST be appropriate for children "
            "(equivalent to MPAA G or PG / non-US family-friendly equivalent). "
            "Exclude PG-13, R, NC-17, graphic violence, sexual content, strong language, and horror."
        )
    if watching_with == "Friends":
        return "- Audience: Friends — crowd-pleasers and group-watch films; avoid niche art-house or slow dramas"
    if watching_with == "Partner":
        return "- Audience: Partner — date-night appropriate; mature themes acceptable"
    return "- Audience: Solo — any mature themes acceptable"


def _mood_clause(mood: str) -> str:
    rules = {
        "Feel good": "uplifting, warm, optimistic; exclude anything bleak, disturbing, tragic, or graphically violent",
        "Dark & intense": "serious, heavy, morally complex, suspenseful or grim; exclude lighthearted comedies and family films",
        "Thrilling": "high-stakes, suspenseful, edge-of-seat pacing",
        "Emotional": "character-driven, moving, tear-jerker quality",
        "Lighthearted": "fun, easy-going, low-stakes; exclude heavy dramas or grim thrillers",
    }
    return f"- Mood MUST be {mood}: {rules.get(mood, mood)}"


def _build_system_prompt() -> str:
    return (
        "You are an expert movie recommendation engine with deep knowledge of "
        "The Movie Database (themoviedb.org / TMDB).\n"
        "\n"
        "Your job: return real, well-known films whose `tmdb_id` you are CERTAIN of. "
        "The `tmdb_id` is the integer ID used in TMDB URLs (e.g. "
        "https://www.themoviedb.org/movie/27205 → tmdb_id 27205 for Inception).\n"
        "\n"
        "Hard rules — non-negotiable:\n"
        "1. NEVER recommend adult, pornographic, or explicitly sexual content.\n"
        "2. Only return films you are confident exist on TMDB. If unsure of an ID, "
        "   pick a different, more famous film you ARE sure of rather than guessing.\n"
        "3. Every film must satisfy EVERY user filter below. Reject borderline cases.\n"
        "4. No duplicates. No franchise stuffing (max 1 film per franchise).\n"
        "5. Prefer well-reviewed, popular titles (TMDB vote_count > 500) so the IDs are stable.\n"
        "6. `title` MUST be the exact English title as listed on TMDB.\n"
        "7. `year` MUST be the theatrical release year on TMDB.\n"
        "\n"
        "Output format: a single JSON object with one key `movies` whose value is an "
        "array of objects, each with keys: `tmdb_id` (int), `title` (string), `year` (int). "
        "No prose, no markdown, no commentary."
    )


def _build_user_prompt(genre: str, mood: str, era: str, language: str, watching_with: str) -> str:
    lines = [
        f"Return EXACTLY {settings.AI_CANDIDATE_COUNT} movies that strictly match ALL filters below.",
        "",
        "Filters:",
        f"- Primary genre MUST be: {genre}"
        + (" (every film must be a feature-length animated film)" if genre == "Animation" else ""),
        _mood_clause(mood),
        _era_clause(era),
        _language_clause(language),
        _audience_clause(watching_with),
        "",
        "Selection guidance:",
        "- Diversify directors and decades within the allowed range.",
        "- Favor critically acclaimed and audience-popular films on TMDB.",
        "- If a filter combination is very restrictive, still return the closest valid matches — never return adult content to fill the list.",
        "",
        "Respond with ONLY this JSON object (no markdown fences, no extra keys):",
        '{"movies": [{"tmdb_id": <int>, "title": "<string>", "year": <int>}, ...]}',
    ]
    return "\n".join(lines)


def _extract_list(payload) -> list:
    """Accept either a bare list or a {"movies": [...]} / {"results": [...]} wrapper."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("movies", "results", "recommendations", "data"):
            val = payload.get(key)
            if isinstance(val, list):
                return val
        # Fall back to the first list-valued field, if any
        for v in payload.values():
            if isinstance(v, list):
                return v
    raise ValueError("Response did not contain a movie list")


def _normalise(raw: list) -> list[dict]:
    """Coerce, validate, and deduplicate AI rows."""
    seen: set[int] = set()
    out: list[dict] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        try:
            tmdb_id = int(row["tmdb_id"])
            title = str(row["title"]).strip()
        except (KeyError, TypeError, ValueError):
            continue
        if tmdb_id <= 0 or not title or tmdb_id in seen:
            continue
        seen.add(tmdb_id)

        year_val = row.get("year")
        try:
            year = int(year_val) if year_val is not None else None
        except (TypeError, ValueError):
            year = None

        out.append({"tmdb_id": tmdb_id, "title": title, "year": year})
    return out


async def _call_ai(client: AsyncOpenAI, model: str, messages: list) -> str:
    """Shared completion call with JSON mode for DeepSeek, plain for Gemini."""
    kwargs: dict = {
        "model": model,
        "messages": messages,
        "temperature": _TEMPERATURE,
        "max_tokens": _MAX_TOKENS,
    }
    # Only DeepSeek supports json_object response_format reliably
    if model == _DEEPSEEK_MODEL:
        kwargs["response_format"] = {"type": "json_object"}
    response = await client.chat.completions.create(**kwargs)
    return response.choices[0].message.content or ""


async def get_recommendations(preferences: dict) -> list[dict]:
    """Call DeepSeek (with Gemini fallback) and parse the response."""
    _validate_preferences(preferences)

    system_prompt = _build_system_prompt()
    user_prompt = _build_user_prompt(
        genre=preferences["genre"],
        mood=preferences["mood"],
        era=preferences["era"],
        language=preferences["language"],
        watching_with=preferences["watching_with"],
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    content: str = ""

    # ── 1. Try DeepSeek first (Testing mode) ───────────────────────────────────────────────
    try:
        deepseek = _get_deepseek_client()
        if not deepseek:
            raise Exception("No DeepSeek key configured")
        model_name = "deepseek/deepseek-chat" if settings.DEEPSEEK_API_KEY.startswith("sk-or-") else _DEEPSEEK_MODEL
        content = await _call_ai(deepseek, model_name, messages)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"error": True, "code": "AI_ERROR", "message": f"OpenRouter/DeepSeek failed: {exc}", "status": 502},
        ) from exc

    # ── Parse response ────────────────────────────────────────────────────
    content = content.strip()
    
    # Extract JSON object if wrapped in markdown or conversational text
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if match:
        content = match.group(1).strip()
    else:
        # Try to find the outermost curly braces
        match = re.search(r"(\{.*\})", content, re.DOTALL)
        if match:
            content = match.group(1).strip()

    try:
        payload = json.loads(content)
        raw_list = _extract_list(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"error": True, "code": "AI_ERROR", "message": f"Failed to parse AI response. Raw output: {content[:200]}...", "status": 502},
        ) from exc

    results = _normalise(raw_list)
    if not results:
        raise HTTPException(
            status_code=502,
            detail={"error": True, "code": "AI_ERROR", "message": "AI returned no valid movies", "status": 502},
        )
    return results
