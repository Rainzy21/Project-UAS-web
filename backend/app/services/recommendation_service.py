from __future__ import annotations

"""Recommendation service — calls AI then TMDB, returns enriched movie list."""
from fastapi import HTTPException
from app.services import ai_service, tmdb_service

_FINAL_COUNT = 10
_YEAR_TOLERANCE = 1


async def generate(preferences: dict) -> list[dict]:
    # 1. Ask the AI for candidates
    ai_results = await ai_service.get_recommendations(preferences)
    tmdb_ids = [r["tmdb_id"] for r in ai_results]
    expected_year = {r["tmdb_id"]: r.get("year") for r in ai_results}

    # 2. Enrich with TMDB metadata (drops 404s and adult content)
    movies_data = await tmdb_service.fetch_all(tmdb_ids)

    # 3. Drop entries whose AI-claimed year doesn't match the TMDB release year
    verified: list[dict] = []
    for movie in movies_data:
        claimed = expected_year.get(movie["tmdb_id"])
        actual = movie.get("year")
        if claimed is not None and actual is not None and abs(actual - claimed) > _YEAR_TOLERANCE:
            continue
        verified.append(movie)

    # 4. Preserve AI ranking order, cap at _FINAL_COUNT
    order = {tid: i for i, tid in enumerate(tmdb_ids)}
    verified.sort(key=lambda m: order.get(m["tmdb_id"], len(order)))
    verified = verified[:_FINAL_COUNT]

    if not verified:
        raise HTTPException(status_code=502, detail="No valid movies found after TMDB lookup")

    return verified
