from __future__ import annotations

"""TMDB service — in-memory TTL cache (no Redis)."""
import asyncio
import time
from typing import Optional

import httpx

from app.core.config import settings


_SEMAPHORE = asyncio.Semaphore(settings.TMDB_CONCURRENCY)
_TTL = settings.TMDB_CACHE_TTL

# cache: key -> (data, expire_ts)
_cache: dict[int, tuple[dict, float]] = {}
_TRENDING_KEY = -1


def _cache_get(key: int) -> Optional[dict]:
    entry = _cache.get(key)
    if entry and time.time() < entry[1]:
        return entry[0]
    return None


def _cache_set(key: int, value: dict, ttl: int = _TTL) -> None:
    _cache[key] = (value, time.time() + ttl)


def _build_movie_out(data: dict) -> dict:
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
    """Fetch a single movie, in-memory cached. Returns None on 404 or adult content."""
    cached = _cache_get(tmdb_id)
    if cached is not None:
        return cached

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
        raise HTTPException(status_code=502, detail="TMDB API error")

    data = resp.json()
    if data.get("adult", False):
        return None

    movie = _build_movie_out(data)
    _cache_set(tmdb_id, movie)
    return movie


async def get_trending() -> list[dict]:
    """Fetch trending movies for the week, in-memory cached."""
    cached = _cache_get(_TRENDING_KEY)
    if cached is not None:
        return cached  # type: ignore[return-value]

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.TMDB_BASE_URL}/trending/movie/week",
            params={"api_key": settings.TMDB_API_KEY},
            timeout=10.0,
        )

    if resp.status_code != 200:
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail="TMDB API error")

    results = [
        {
            "tmdb_id": m["id"],
            "title": m.get("title", ""),
            "overview": m.get("overview"),
            "poster_url": f"{settings.TMDB_IMAGE_BASE_URL}{m['poster_path']}" if m.get("poster_path") else None,
            "rating": m.get("vote_average"),
            "year": int(m["release_date"][:4]) if m.get("release_date") else None,
            "language": m.get("original_language"),
        }
        for m in resp.json().get("results", [])
        if not m.get("adult", False)
    ]

    _cache_set(_TRENDING_KEY, results)  # type: ignore[arg-type]
    return results


async def fetch_all(ids: list[int]) -> list[dict]:
    """Fetch multiple movies concurrently. Skips None/adult results."""
    tasks = [fetch_movie(tmdb_id) for tmdb_id in ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, dict) and not r.get("adult", False)]
