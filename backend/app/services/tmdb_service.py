from __future__ import annotations

"""TMDB service — LRU TTL cache."""
import asyncio
import time
from collections import OrderedDict
from typing import Optional

import httpx

from app.core.config import settings


_SEMAPHORE = asyncio.Semaphore(settings.TMDB_CONCURRENCY)
_TTL = settings.TMDB_CACHE_TTL
_MAX_ENTRIES = settings.TMDB_CACHE_MAX_ENTRIES

_cache: OrderedDict[int, tuple[dict, float]] = OrderedDict()
_TRENDING_KEY = -1
_FULL_DETAIL_CACHE: OrderedDict[int, tuple[dict, float]] = OrderedDict()


def _cache_get(cache: OrderedDict, key: int) -> Optional[dict]:
    entry = cache.get(key)
    if entry and time.time() < entry[1]:
        cache.move_to_end(key)
        return entry[0]
    if key in cache:
        del cache[key]
    return None


def _cache_set(cache: OrderedDict, key: int, value: dict, ttl: int = _TTL) -> None:
    cache[key] = (value, time.time() + ttl)
    cache.move_to_end(key)
    while len(cache) > _MAX_ENTRIES:
        cache.popitem(last=False)


def _tmdb_headers() -> dict[str, str]:
    if settings.TMDB_API_KEY:
        return {"Authorization": f"Bearer {settings.TMDB_API_KEY}"}
    return {}


def _tmdb_params(extra: dict | None = None) -> dict:
    return {"include_adult": "false", **(extra or {})}


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
    cached = _cache_get(_cache, tmdb_id)
    if cached is not None:
        return cached

    async with _SEMAPHORE:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.TMDB_BASE_URL}/movie/{tmdb_id}",
                params=_tmdb_params(),
                headers=_tmdb_headers(),
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
    _cache_set(_cache, tmdb_id, movie)
    return movie


async def fetch_movie_full(tmdb_id: int) -> Optional[dict]:
    cached = _cache_get(_FULL_DETAIL_CACHE, tmdb_id)
    if cached is not None:
        return cached

    async with _SEMAPHORE:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.TMDB_BASE_URL}/movie/{tmdb_id}",
                params=_tmdb_params({
                    "append_to_response": "credits,videos",
                    "language": "en-US",
                }),
                headers=_tmdb_headers(),
                timeout=15.0,
            )

    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail="TMDB API error")

    data = resp.json()
    if data.get("adult", False):
        return None

    poster = data.get("poster_path")
    backdrop = data.get("backdrop_path")
    movie = {
        "tmdb_id": data["id"],
        "title": data.get("title", ""),
        "overview": data.get("overview"),
        "poster_url": f"{settings.TMDB_IMAGE_BASE_URL}{poster}" if poster else None,
        "backdrop_url": f"https://image.tmdb.org/t/p/original{backdrop}" if backdrop else None,
        "rating": data.get("vote_average"),
        "year": int(data["release_date"][:4]) if data.get("release_date") else None,
        "language": data.get("original_language"),
        "genres": [{"name": g["name"]} for g in data.get("genres", [])],
        "runtime": data.get("runtime"),
        "status": data.get("status"),
        "budget": data.get("budget"),
        "revenue": data.get("revenue"),
        "spoken_languages": data.get("spoken_languages", []),
        "production_companies": data.get("production_companies", []),
        "credits": data.get("credits", {}),
        "videos": data.get("videos", {}),
    }
    _cache_set(_FULL_DETAIL_CACHE, tmdb_id, movie)
    return movie


async def get_trending() -> list[dict]:
    cached = _cache_get(_cache, _TRENDING_KEY)
    if cached is not None:
        return cached  # type: ignore[return-value]

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.TMDB_BASE_URL}/trending/movie/week",
            params=_tmdb_params({"language": "en-US"}),
            headers=_tmdb_headers(),
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

    _cache_set(_cache, _TRENDING_KEY, results)  # type: ignore[arg-type]
    return results


async def fetch_all(ids: list[int]) -> list[dict]:
    tasks = [fetch_movie(tmdb_id) for tmdb_id in ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, dict) and not r.get("adult", False)]
