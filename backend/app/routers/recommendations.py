import asyncio
import time
from fastapi import APIRouter, Request, HTTPException
from app.core.auth import get_user_id_from_request
from app.core.supabase_client import supabase_admin
from app.services.recommendation_service import generate

from pydantic import BaseModel

router = APIRouter()

# In-memory rate store — resets on server restart (acceptable for this project)
_rate_store: dict[str, list[float]] = {}
RATE_LIMIT = 10
RATE_WINDOW = 86400  # 24 hours in seconds


def _check_rate_limit(user_id: str) -> None:
    now = time.time()
    timestamps = _rate_store.get(user_id, [])
    timestamps = [t for t in timestamps if now - t < RATE_WINDOW]
    if len(timestamps) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Daily limit reached (10/day)")
    timestamps.append(now)
    _rate_store[user_id] = timestamps


class RecommendationPreferences(BaseModel):
    genre: str | None = None
    mood: str | None = None
    era: str | None = None
    language: str | None = None
    watching_with: str | None = None
    
    model_config = {"extra": "allow"}

@router.post("/generate")
async def generate_recommendations(request: Request, body: RecommendationPreferences):
    user_id = await get_user_id_from_request(request)
    _check_rate_limit(user_id)

    preferences = body.model_dump(exclude_none=True)
    movies = await generate(preferences)

    await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: supabase_admin.table("recommendation_logs").insert({
            "user_id": user_id,
            "preferences": preferences,
            "tmdb_ids": [m["tmdb_id"] for m in movies],
        }).execute()
    )

    return {"movies": movies}


from app.services import tmdb_service

@router.get("/history")
async def history(request: Request, page: int = 1, limit: int = 10):
    user_id = await get_user_id_from_request(request)
    offset = (page - 1) * limit

    result = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: (
            supabase_admin.table("recommendation_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    )

    items = result.data
    # Hydrate movies for frontend history UI
    for item in items:
        tmdb_ids = item.get("tmdb_ids", [])
        if tmdb_ids:
            item["movies"] = await tmdb_service.fetch_all(tmdb_ids)
        else:
            item["movies"] = []

    return {"items": items}
