from __future__ import annotations

"""B26-B29 — User endpoints."""
import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.preference_preset import PreferencePreset
from app.models.recommendation_log import RecommendationLog
from app.models.saved_movie import SavedMovie
from app.models.user import User
from app.schemas.user import ChangePasswordRequest, DeleteAccountRequest, UpdateNameRequest, UserOut

router = APIRouter()


# ── B26 GET /me ───────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ── B27 PATCH /me ─────────────────────────────────────────────────────────────

@router.patch("/me", response_model=UserOut)
def update_me(
    body: UpdateNameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.name = body.name
    db.commit()
    db.refresh(current_user)
    return current_user


# ── B28 DELETE /me ────────────────────────────────────────────────────────────

@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    request: Request,
    body: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Verify current password
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=401,
            detail={"error": True, "code": "INVALID_CREDENTIALS", "message": "Incorrect password", "status": 401},
        )

    redis = await get_redis()

    # 2. Denylist access token
    access_token = request.headers.get("Authorization", "")[7:]
    try:
        ap = decode_token(access_token)
        ttl = ap["exp"] - int(time.time())
        if ttl > 0:
            await redis.setex(f"denylist:{access_token}", ttl, "1")
    except Exception:
        pass

    # 3. Delete PCA cache
    await redis.delete(f"user_pca:{current_user.id}")

    # 4. Cascade delete related data
    db.query(SavedMovie).filter(SavedMovie.user_id == current_user.id).delete()
    db.query(RecommendationLog).filter(RecommendationLog.user_id == current_user.id).delete()
    db.query(PreferencePreset).filter(PreferencePreset.user_id == current_user.id).delete()

    # 5. Delete user row
    db.delete(current_user)
    db.commit()


# ── B29 PATCH /me/password ────────────────────────────────────────────────────

@router.patch("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=401,
            detail={"error": True, "code": "INVALID_CREDENTIALS", "message": "Incorrect current password", "status": 401},
        )

    current_user.password_hash = hash_password(body.new_password)
    current_user.password_changed_at = datetime.utcnow()
    db.commit()

    redis = await get_redis()
    await redis.delete(f"user_pca:{current_user.id}")
