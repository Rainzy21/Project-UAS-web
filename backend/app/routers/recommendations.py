from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from app.constants import MAX_PRESETS_PER_USER
from app.core.auth import get_auth_from_request
from app.middleware.rate_limiter import check_rate_limit
from app.core.supabase_client import get_user_client
from app.services.ai_service import _validate_preferences
from app.services.recommendation_service import generate
from app.services import tmdb_service

logger = logging.getLogger(__name__)

router = APIRouter()

RATE_LIMIT = 10
RATE_WINDOW = 86400


def _is_missing_table_error(exc: Exception) -> bool:
    return isinstance(exc, APIError) and getattr(exc, "code", None) == "PGRST205"


async def _check_rate_limit(user_id: str) -> None:
    await check_rate_limit(f"rec:{user_id}", RATE_LIMIT, RATE_WINDOW)


class RecommendationPreferences(BaseModel):
    genre: str
    mood: str
    era: str
    language: str
    watching_with: str

    model_config = {"extra": "ignore"}


class PresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    genre: str
    mood: str
    era: str
    language: str
    watching_with: str


def _preferences_dict(body: PresetCreate | RecommendationPreferences) -> dict:
    return {
        "genre": body.genre,
        "mood": body.mood,
        "era": body.era,
        "language": body.language,
        "watching_with": body.watching_with,
    }


@router.post("/generate")
async def generate_recommendations(request: Request, body: RecommendationPreferences):
    user_id, token = await get_auth_from_request(request)
    await _check_rate_limit(user_id)

    preferences = _preferences_dict(body)
    _validate_preferences(preferences)
    movies = await generate(preferences)

    sb = get_user_client(token)

    try:
        await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: sb.table("recommendation_logs").insert({
                "user_id": user_id,
                "preferences": preferences,
                "tmdb_ids": [m["tmdb_id"] for m in movies],
            }).execute(),
        )
    except APIError as exc:
        if not _is_missing_table_error(exc):
            raise
        logger.warning(
            "recommendation_logs table missing; run supabase_schema.sql in Supabase SQL Editor"
        )

    return {"movies": movies}


@router.get("/history")
async def history(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    user_id, token = await get_auth_from_request(request)
    sb = get_user_client(token)
    offset = (page - 1) * limit

    try:
        result = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: (
                sb.table("recommendation_logs")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            ),
        )
    except APIError as exc:
        if _is_missing_table_error(exc):
            logger.warning(
                "recommendation_logs table missing; run supabase_schema.sql in Supabase SQL Editor"
            )
            return {"items": []}
        raise

    items = result.data
    all_ids: set[int] = set()
    for item in items:
        for tid in item.get("tmdb_ids") or []:
            all_ids.add(int(tid))

    movie_map: dict[int, dict] = {}
    if all_ids:
        fetched = await tmdb_service.fetch_all(list(all_ids))
        movie_map = {m["tmdb_id"]: m for m in fetched}

    for item in items:
        tmdb_ids = item.get("tmdb_ids") or []
        item["movies"] = [movie_map[tid] for tid in tmdb_ids if tid in movie_map]

    return {"items": items}


@router.post("/presets")
async def create_preset(request: Request, body: PresetCreate):
    user_id, token = await get_auth_from_request(request, require_verified=True)
    sb = get_user_client(token)
    preferences = _preferences_dict(body)
    _validate_preferences(preferences)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Preset name is required")

    try:
        count_result = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: (
                sb.table("preference_presets")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .execute()
            ),
        )
        if (count_result.count or 0) >= MAX_PRESETS_PER_USER:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": True,
                    "code": "PRESET_LIMIT_REACHED",
                    "message": f"Maximum {MAX_PRESETS_PER_USER} presets allowed",
                    "status": 400,
                },
            )

        result = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: (
                sb.table("preference_presets")
                .insert({
                    "user_id": user_id,
                    "name": name,
                    "preferences": preferences,
                })
                .execute()
            ),
        )
    except APIError as exc:
        if _is_missing_table_error(exc):
            raise HTTPException(
                status_code=503,
                detail="preference_presets table missing; run supabase_schema.sql",
            ) from exc
        raise

    row = result.data[0] if result.data else {}
    return {
        "id": row.get("id"),
        "name": row.get("name", name),
        "preferences": row.get("preferences", preferences),
        "created_at": row.get("created_at"),
    }


@router.get("/presets")
async def list_presets(request: Request):
    user_id, token = await get_auth_from_request(request, require_verified=True)

    try:
        result = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: (
                get_user_client(token)
                .table("preference_presets")
                .select("id, name, preferences, created_at")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            ),
        )
    except APIError as exc:
        if _is_missing_table_error(exc):
            return {"items": []}
        raise

    return {"items": result.data or []}


@router.delete("/presets/{preset_id}")
async def delete_preset(request: Request, preset_id: str):
    user_id, token = await get_auth_from_request(request, require_verified=True)
    sb = get_user_client(token)

    try:
        existing = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: (
                sb.table("preference_presets")
                .select("id")
                .eq("id", preset_id)
                .eq("user_id", user_id)
                .execute()
            ),
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="NOT_FOUND")

        await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: (
                sb.table("preference_presets")
                .delete()
                .eq("id", preset_id)
                .eq("user_id", user_id)
                .execute()
            ),
        )
    except APIError as exc:
        if _is_missing_table_error(exc):
            raise HTTPException(status_code=404, detail="NOT_FOUND") from exc
        raise

    return {"deleted": True}
