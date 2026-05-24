from __future__ import annotations

"""B33-B37 — Recommendations endpoints."""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.constants import (
    ALLOWED_ERAS,
    ALLOWED_GENRES,
    ALLOWED_LANGUAGES,
    ALLOWED_MOODS,
    ALLOWED_WATCHING_WITH,
    MAX_PRESETS_PER_USER,
)
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis import get_redis
from app.middleware.rate_limiter import rate_limit
from app.models.preference_preset import PreferencePreset
from app.models.recommendation_log import RecommendationLog
from app.models.user import User
from app.schemas.recommendation import (
    HistoryItem,
    HistoryResponse,
    PresetCreate,
    PresetOut,
    RecommendationOut,
    RecommendationRequest,
)
from app.services import recommendation_service

router = APIRouter()


# ── B33 POST /generate ────────────────────────────────────────────────────────

@router.post("/generate", response_model=RecommendationOut)
async def generate(
    body: RecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # email_verified check
    if not current_user.email_verified:
        raise HTTPException(
            status_code=403,
            detail={"error": True, "code": "EMAIL_NOT_VERIFIED", "message": "Please verify your email before generating recommendations", "status": 403},
        )

    # Validate all 5 preference fields against allowlist constants
    errors = []
    if body.genre not in ALLOWED_GENRES:
        errors.append(f"Invalid genre: {body.genre!r}")
    if body.mood not in ALLOWED_MOODS:
        errors.append(f"Invalid mood: {body.mood!r}")
    if body.era not in ALLOWED_ERAS:
        errors.append(f"Invalid era: {body.era!r}")
    if body.language not in ALLOWED_LANGUAGES:
        errors.append(f"Invalid language: {body.language!r}")
    if body.watching_with not in ALLOWED_WATCHING_WITH:
        errors.append(f"Invalid watching_with: {body.watching_with!r}")
    if errors:
        raise HTTPException(
            status_code=422,
            detail={"error": True, "code": "VALIDATION_ERROR", "message": "; ".join(errors), "status": 422},
        )

    # Rate limit 10/day per user_id
    redis = await get_redis()
    await rate_limit(redis, f"rl:gen:{current_user.id}", limit=10, window=86400)

    preferences = body.model_dump()
    return await recommendation_service.generate(preferences, current_user.id, db)


# ── B34 GET /history ──────────────────────────────────────────────────────────

@router.get("/history", response_model=HistoryResponse)
def get_history(
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 20
    offset = (page - 1) * limit

    total = db.query(RecommendationLog).filter(RecommendationLog.user_id == current_user.id).count()
    rows = (
        db.query(RecommendationLog)
        .filter(RecommendationLog.user_id == current_user.id)
        .order_by(RecommendationLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = [
        HistoryItem(
            id=row.id,
            preferences=row.preferences,
            created_at=row.created_at,
            movie_count=len(row.tmdb_ids) if row.tmdb_ids else 0,
        )
        for row in rows
    ]
    return HistoryResponse(items=items, total=total, page=page, limit=limit)


# ── B35 POST /presets ─────────────────────────────────────────────────────────

@router.post("/presets", response_model=PresetOut, status_code=status.HTTP_201_CREATED)
def create_preset(
    body: PresetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = db.query(PreferencePreset).filter(PreferencePreset.user_id == current_user.id).count()
    if count >= MAX_PRESETS_PER_USER:
        raise HTTPException(
            status_code=400,
            detail={"error": True, "code": "PRESET_LIMIT_REACHED", "message": f"Maximum {MAX_PRESETS_PER_USER} presets allowed", "status": 400},
        )

    preset = PreferencePreset(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=body.name,
        preferences=body.preferences,
        created_at=datetime.utcnow(),
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return preset


# ── B36 GET /presets ──────────────────────────────────────────────────────────

@router.get("/presets", response_model=list[PresetOut])
def list_presets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(PreferencePreset)
        .filter(PreferencePreset.user_id == current_user.id)
        .order_by(PreferencePreset.created_at.asc())
        .all()
    )


# ── B37 DELETE /presets/{preset_id} ──────────────────────────────────────────

@router.delete("/presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preset(
    preset_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    preset = (
        db.query(PreferencePreset)
        .filter(PreferencePreset.id == preset_id, PreferencePreset.user_id == current_user.id)
        .first()
    )
    if not preset:
        raise HTTPException(
            status_code=404,
            detail={"error": True, "code": "NOT_FOUND", "message": "Preset not found", "status": 404},
        )
    db.delete(preset)
    db.commit()
