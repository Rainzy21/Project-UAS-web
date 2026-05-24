from __future__ import annotations

"""B30 — TMDB service.

fetch_movie(tmdb_id) → dict | None
fetch_all(ids)       → list[dict]   (only valid dicts, max 4 concurrent)
"""
import asyncio
import json
from typing import Optional

import httpx

from app.core.config import settings
from app.core.redis import get_redis


_SEMAPHORE = asyncio.Semaphore(settings.TMDB_CONCURRENCY)


def _movie_cache_key(tmdb_id: int) -> str:
    return f"tmdb:movie:{tmdb_id}"


def _build_movie_out(data: dict) -> dict:
    """Normalise a TMDB movie response into our schema shape."""
    poster = data.get("poster_path")
    return {
        "tmdb_id": data["id"],
        "title": data.get("title", ""),
        "overview": data.get("overview"),
        "poster_url": f"{settings.TMDB_IMAGE_BASE_URL}{poster}" if poster else None,
        "rating": data.get("vote_average"),
        "year": int(data["release_date"][:4]) if data.get("release_date") else None,
        "language": data.get("original_language"),
        "genres": [g["name"] for g in data.get("genres", [])],
    }


async def fetch_movie(tmdb_id: int) -> Optional[dict]:
    """Fetch a single movie, Redis-cached for 1 h. Returns None on 404."""
    redis = await get_redis()
    cache_key = _movie_cache_key(tmdb_id)

    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    async with _SEMAPHORE:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.TMDB_BASE_URL}/movie/{tmdb_id}",
                params={"api_key": settings.TMDB_API_KEY, "include_adult": "false"},
                timeout=10.0,
            )

    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=502,
            detail={"error": True, "code": "TMDB_ERROR", "message": "TMDB API error", "status": 502},
        )

    data = resp.json()
    # Drop adult content regardless of API key settings
    if data.get("adult", False):
        return None

    movie = _build_movie_out(data)
    await redis.setex(cache_key, settings.TMDB_CACHE_TTL, json.dumps(movie))
    return movie


async def fetch_all(ids: list[int]) -> list[dict]:
    """Fetch multiple movies concurrently (max 4 at a time). Skips None/adult results."""
    tasks = [fetch_movie(tmdb_id) for tmdb_id in ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, dict) and not r.get("adult", False)]
