from __future__ import annotations

"""B38-B44 — Movie endpoints.

⚠ Route registration order matters: /{tmdb_id} MUST be last.
"""
import json
import uuid
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis import get_redis
from app.middleware.rate_limiter import rate_limit
from app.models.movie import Movie
from app.models.saved_movie import SavedMovie
from app.models.user import User
from app.schemas.movie import (
    MovieOut,
    SavedMovieListCreate,
    SavedMovieOut,
    SavedMovieUpdate,
    SavedStatusItem,
)
from app.services import tmdb_service

router = APIRouter()


# ── B38 POST /save ─────────────────────────────────────────────────────────────

@router.post("/save")
async def save_movies(
    body: SavedMovieListCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.email_verified:
        raise HTTPException(
            status_code=403,
            detail={"error": True, "code": "EMAIL_NOT_VERIFIED", "message": "Please verify your email to save movies", "status": 403},
        )

    saved_count = 0
    for item in body.movies:
        # Ensure Movie row exists (fetch from TMDB if missing)
        movie_row = db.query(Movie).filter(Movie.tmdb_id == item.tmdb_id).first()
        if not movie_row:
            movie_data = await tmdb_service.fetch_movie(item.tmdb_id)
            if not movie_data:
                continue  # Skip invalid TMDB IDs
            movie_row = Movie(
                tmdb_id=movie_data["tmdb_id"],
                title=movie_data["title"],
                overview=movie_data.get("overview"),
                poster_url=movie_data.get("poster_url"),
                rating=movie_data.get("rating"),
                year=movie_data.get("year"),
                language=movie_data.get("language"),
                genres=movie_data.get("genres"),
                created_at=datetime.utcnow(),
            )
            db.add(movie_row)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                movie_row = db.query(Movie).filter(Movie.tmdb_id == item.tmdb_id).first()

        # Insert SavedMovie, skip on duplicate
        saved = SavedMovie(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            tmdb_id=item.tmdb_id,
            note=item.note,
            tag=item.tag,
            saved_at=datetime.utcnow(),
        )
        db.add(saved)
        try:
            db.flush()
            saved_count += 1
        except IntegrityError:
            db.rollback()  # Duplicate — silently skip

    db.commit()
    return {"saved": saved_count, "message": f"{saved_count} movie(s) saved"}


# ── B39 GET /my-list ───────────────────────────────────────────────────────────

@router.get("/my-list", response_model=list[SavedMovieOut])
def my_list(
    genre: Optional[str] = None,
    tag: Optional[str] = None,
    sort_by: str = Query("saved_at", pattern="^(saved_at|rating|year)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(SavedMovie)
        .join(Movie, SavedMovie.tmdb_id == Movie.tmdb_id)
        .filter(SavedMovie.user_id == current_user.id)
    )

    if tag:
        query = query.filter(SavedMovie.tag == tag)
    if genre:
        # genres is JSON stored as list; SQLite JSON path filtering
        query = query.filter(Movie.genres.contains(genre))

    # Sorting
    sort_col = {
        "saved_at": SavedMovie.saved_at,
        "rating": Movie.rating,
        "year": Movie.year,
    }[sort_by]
    if order == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    offset = max(0, (page - 1) * limit)
    rows = query.offset(offset).limit(limit).all()

    result = []
    for row in rows:
        movie_row = db.query(Movie).filter(Movie.tmdb_id == row.tmdb_id).first()
        result.append(
            SavedMovieOut(
                id=row.id,
                tmdb_id=row.tmdb_id,
                note=row.note,
                tag=row.tag,
                saved_at=row.saved_at,
                movie=MovieOut.model_validate(movie_row) if movie_row else None,
            )
        )
    return result


# ── B42 GET /saved/status ─────────────────────────────────────────────────────
# Registered BEFORE /{tmdb_id} to avoid route shadowing

@router.get("/saved/status")
def saved_status(
    tmdb_ids: str = Query(..., description="Comma-separated TMDB IDs, max 50"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    id_strings = [s.strip() for s in tmdb_ids.split(",") if s.strip()]
    if len(id_strings) > 50:
        raise HTTPException(
            status_code=400,
            detail={"error": True, "code": "VALIDATION_ERROR", "message": "Maximum 50 tmdb_ids allowed", "status": 400},
        )

    try:
        id_ints = [int(s) for s in id_strings]
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail={"error": True, "code": "VALIDATION_ERROR", "message": "tmdb_ids must be integers", "status": 400},
        )

    rows = (
        db.query(SavedMovie)
        .filter(SavedMovie.user_id == current_user.id, SavedMovie.tmdb_id.in_(id_ints))
        .all()
    )
    saved_map = {str(row.tmdb_id): row.id for row in rows}

    return {
        str(tid): SavedStatusItem(saved=str(tid) in saved_map, saved_id=saved_map.get(str(tid)))
        for tid in id_ints
    }


# ── B40 PATCH /saved/{saved_id} ───────────────────────────────────────────────

@router.patch("/saved/{saved_id}", response_model=SavedMovieOut)
def update_saved(
    saved_id: str,
    body: SavedMovieUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(SavedMovie)
        .filter(SavedMovie.id == saved_id, SavedMovie.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"error": True, "code": "NOT_FOUND", "message": "Saved movie not found", "status": 404},
        )
    if body.note is not None:
        row.note = body.note
    if body.tag is not None:
        row.tag = body.tag
    db.commit()
    db.refresh(row)
    movie_row = db.query(Movie).filter(Movie.tmdb_id == row.tmdb_id).first()
    return SavedMovieOut(
        id=row.id,
        tmdb_id=row.tmdb_id,
        note=row.note,
        tag=row.tag,
        saved_at=row.saved_at,
        movie=MovieOut.model_validate(movie_row) if movie_row else None,
    )


# ── B41 DELETE /saved/{saved_id} ──────────────────────────────────────────────

@router.delete("/saved/{saved_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved(
    saved_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(SavedMovie)
        .filter(SavedMovie.id == saved_id, SavedMovie.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"error": True, "code": "NOT_FOUND", "message": "Saved movie not found", "status": 404},
        )
    db.delete(row)
    db.commit()


# ── B43 GET /trending ─────────────────────────────────────────────────────────

@router.get("/trending", response_model=list[MovieOut])
async def trending(request: Request):
    redis = await get_redis()
    client_ip = request.client.host if request.client else "unknown"
    await rate_limit(redis, f"rl:trending:{client_ip}", limit=60, window=60)

    cache_key = "tmdb:trending"
    cached = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        return [MovieOut(**m) for m in data]

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.TMDB_BASE_URL}/trending/movie/week",
            params={"api_key": settings.TMDB_API_KEY},
            timeout=10.0,
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail={"error": True, "code": "TMDB_ERROR", "message": "TMDB API error", "status": 502},
        )

    items = resp.json().get("results", [])
    movies = []
    for data in items:
        poster = data.get("poster_path")
        m = {
            "tmdb_id": data["id"],
            "title": data.get("title", data.get("name", "")),
            "overview": data.get("overview"),
            "poster_url": f"{settings.TMDB_IMAGE_BASE_URL}{poster}" if poster else None,
            "rating": data.get("vote_average"),
            "year": int(data["release_date"][:4]) if data.get("release_date") else None,
            "language": data.get("original_language"),
            "genres": None,  # trending endpoint doesn't return genre names
        }
        movies.append(m)

    await redis.setex(cache_key, 300, json.dumps(movies))  # TTL 5 min
    return [MovieOut(**m) for m in movies]


# ── B44 GET /{tmdb_id} ──────────────────────────────────────────────────────
# ⚠ MUST be registered last in this router

@router.get("/{tmdb_id}", response_model=MovieOut)
async def get_movie(tmdb_id: int, db: Session = Depends(get_db)):
    # Check Movie table first
    movie_row = db.query(Movie).filter(Movie.tmdb_id == tmdb_id).first()
    if movie_row:
        return movie_row

    # Proxy TMDB (uses Redis cache internally)
    movie_data = await tmdb_service.fetch_movie(tmdb_id)
    if not movie_data:
        raise HTTPException(
            status_code=404,
            detail={"error": True, "code": "NOT_FOUND", "message": "Movie not found", "status": 404},
        )
    return MovieOut(**movie_data)

