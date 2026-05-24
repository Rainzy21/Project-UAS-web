from __future__ import annotations

"""B32 — Recommendation service.

Calls ai_service → tmdb_service → writes RecommendationLog.
Raises 502/AI_ERROR if 0 valid movies returned after TMDB filtering.
"""
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.recommendation_log import RecommendationLog
from app.schemas.movie import MovieOut
from app.schemas.recommendation import RecommendationOut
from app.services import ai_service, tmdb_service

_FINAL_COUNT = 10           # how many movies to return to the client
_YEAR_TOLERANCE = 1         # ±1 year between AI-claimed year and TMDB release year


async def generate(preferences: dict, user_id: str, db: Session) -> RecommendationOut:
    # 1. Ask the AI for candidates (over-requests to compensate for TMDB drop-outs)
    ai_results = await ai_service.get_recommendations(preferences)
    tmdb_ids = [r["tmdb_id"] for r in ai_results]
    expected_year = {r["tmdb_id"]: r.get("year") for r in ai_results}

    # 2. Enrich with TMDB metadata (drops 404s and adult content)
    movies_data = await tmdb_service.fetch_all(tmdb_ids)

    # 3. Drop entries whose AI-claimed year doesn't match the TMDB release year —
    #    a strong signal that the AI hallucinated the tmdb_id.
    verified: list[dict] = []
    for movie in movies_data:
        claimed = expected_year.get(movie["tmdb_id"])
        actual = movie.get("year")
        if claimed is not None and actual is not None and abs(actual - claimed) > _YEAR_TOLERANCE:
            continue
        verified.append(movie)

    # 4. Preserve the AI's ranking order, then cap at _FINAL_COUNT.
    order = {tid: i for i, tid in enumerate(tmdb_ids)}
    verified.sort(key=lambda m: order.get(m["tmdb_id"], len(order)))
    verified = verified[:_FINAL_COUNT]

    if not verified:
        raise HTTPException(
            status_code=502,
            detail={"error": True, "code": "AI_ERROR", "message": "No valid movies found after TMDB lookup", "status": 502},
        )

    # 5. Persist recommendation log
    rec_id = str(uuid.uuid4())
    log = RecommendationLog(
        id=rec_id,
        user_id=user_id,
        preferences=preferences,
        ai_response={"results": ai_results},
        tmdb_ids=[m["tmdb_id"] for m in verified],
        created_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()

    movies = [MovieOut(**m) for m in verified]
    return RecommendationOut(recommendation_id=rec_id, movies=movies)
