from __future__ import annotations

import asyncio
import logging
import time
from fastapi import APIRouter, Request, HTTPException
from postgrest.exceptions import APIError
from app.core.auth import get_user_id_from_request
from app.core.supabase_client import supabase_admin
from app.services.recommendation_service import generate
from app.services.ai_service import _validate_preferences
from app.constants import MAX_PRESETS_PER_USER

from typing import Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory rate store — resets on server restart (acceptable for this project)
_rate_store: dict[str, list[float]] = {}
RATE_LIMIT = 10
RATE_WINDOW = 86400  # 24 hours in seconds


def _is_missing_table_error(exc: Exception) -> bool:
    return isinstance(exc, APIError) and getattr(exc, "code", None) == "PGRST205"


def _check_rate_limit(user_id: str) -> None:
    now = time.time()
    timestamps = _rate_store.get(user_id, [])
    timestamps = [t for t in timestamps if now - t < RATE_WINDOW]
    if len(timestamps) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Daily limit reached (10/day)")
    timestamps.append(now)
    _rate_store[user_id] = timestamps


class RecommendationPreferences(BaseModel):
    genre: Optional[str] = None
    mood: Optional[str] = None
    era: Optional[str] = None
    language: Optional[str] = None
    watching_with: Optional[str] = None

    model_config = {"extra": "ignore"}


class PresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    genre: str
    mood: str
    era: str
    language: str
    watching_with: str


def _preferences_dict(body: PresetCreate | RecommendationPreferences) -> dict:
    if isinstance(body, PresetCreate):
        return {
            "genre": body.genre,
            "mood": body.mood,
            "era": body.era,
            "language": body.language,
            "watching_with": body.watching_with,
        }
    prefs = body.model_dump(exclude_none=True)
    if len(prefs) < 5:
        raise HTTPException(
            status_code=422,
            detail={
                "error": True,
                "code": "VALIDATION_ERROR",
                "message": "All five preference fields are required",
                "status": 422,
            },
        )
    return prefs

@router.post("/generate")
async def generate_recommendations(request: Request, body: RecommendationPreferences):
    user_id = await get_user_id_from_request(request)
    _check_rate_limit(user_id)

    preferences = _preferences_dict(body)
    _validate_preferences(preferences)
    movies = await generate(preferences)

    try:
        await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: supabase_admin.table("recommendation_logs").insert({
                "user_id": user_id,
                "preferences": preferences,
                "tmdb_ids": [m["tmdb_id"] for m in movies],
            }).execute()
        )
    except APIError as exc:
        if not _is_missing_table_error(exc):
            raise
        logger.warning(
            "recommendation_logs table missing; run supabase_schema.sql in Supabase SQL Editor"
        )

    return {"movies": movies}


from app.services import tmdb_service

@router.get("/history")
async def history(request: Request, page: int = 1, limit: int = 20):
    user_id = await get_user_id_from_request(request)
    offset = (page - 1) * limit

    try:
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
    except APIError as exc:
        if _is_missing_table_error(exc):
            logger.warning(
                "recommendation_logs table missing; run supabase_schema.sql in Supabase SQL Editor"
            )
            return {"items": []}
        raise

    items = result.data
    # Hydrate movies for frontend history UI
    for item in items:
        tmdb_ids = item.get("tmdb_ids", [])
        if tmdb_ids:
            item["movies"] = await tmdb_service.fetch_all(tmdb_ids)
        else:
            item["movies"] = []

    return {"items": items}


@router.post("/presets")
async def create_preset(request: Request, body: PresetCreate):
    user_id = await get_user_id_from_request(request, require_verified=False)
    preferences = _preferences_dict(body)
    _validate_preferences(preferences)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Preset name is required")

    try:
        count_result = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: (
                supabase_admin.table("preference_presets")
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
                supabase_admin.table("preference_presets")
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
    user_id = await get_user_id_from_request(request, require_verified=False)

    try:
        result = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: (
                supabase_admin.table("preference_presets")
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
    user_id = await get_user_id_from_request(request, require_verified=False)

    try:
        existing = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: (
                supabase_admin.table("preference_presets")
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
                supabase_admin.table("preference_presets")
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
