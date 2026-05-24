from __future__ import annotations

"""B18-B25 — Auth endpoints."""
import hashlib
import secrets
import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.middleware.rate_limiter import rate_limit
from app.models.user import User
from app.schemas.user import (
    DeleteAccountRequest,
    RefreshRequest,
    TokenPair,
    UserCreate,
    UserLogin,
    UserOut,
)
from app.services import email_service

router = APIRouter()


def _token_pair(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=UserOut.model_validate(user),
    )


# ── B18 Register ─────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail={"error": True, "code": "VALIDATION_ERROR", "message": "Email already registered", "status": 400})

    user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hash_password(user_in.password),
        email_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Send verification email (non-blocking failure)
    try:
        redis = await get_redis()
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        await redis.setex(f"email_verify:{token_hash}", 86400, user.id)  # 24h TTL
        await email_service.send_verification_email(user.email, token)
    except Exception:
        pass  # Don't fail registration if email sending fails

    return _token_pair(user)


# ── B19 Login ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenPair)
async def login(user_in: UserLogin, request: Request, db: Session = Depends(get_db)):
    redis = await get_redis()
    client_ip = request.client.host if request.client else "unknown"
    await rate_limit(redis, f"rl:login:{client_ip}", limit=5, window=60)

    user = db.query(User).filter(User.email == user_in.email).first()
    if not user or not verify_password(user_in.password, user.password_hash):
        raise HTTPException(status_code=401, detail={"error": True, "code": "INVALID_CREDENTIALS", "message": "Invalid email or password", "status": 401})

    return _token_pair(user)


# ── B20 Refresh ───────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(body: RefreshRequest, db: Session = Depends(get_db)):
    redis = await get_redis()

    try:
        payload = decode_token(body.refresh_token)
    except JWTError:
        raise HTTPException(status_code=401, detail={"error": True, "code": "TOKEN_EXPIRED", "message": "Invalid or expired refresh token", "status": 401})

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail={"error": True, "code": "TOKEN_EXPIRED", "message": "Not a refresh token", "status": 401})

    if await redis.get(f"denylist:{body.refresh_token}"):
        raise HTTPException(status_code=401, detail={"error": True, "code": "TOKEN_REVOKED", "message": "Token has been revoked", "status": 401})

    user_id: str = payload["sub"]
    # Denylist old refresh token with remaining TTL
    remaining = payload["exp"] - int(time.time())
    if remaining > 0:
        await redis.setex(f"denylist:{body.refresh_token}", remaining, "1")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail={"error": True, "code": "UNAUTHORIZED", "message": "User not found", "status": 401})

    return _token_pair(user)


# ── B21 Logout ────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    body: RefreshRequest,
    current_user: User = Depends(get_current_user),
):
    redis = await get_redis()
    access_token = request.headers.get("Authorization", "")[7:]

    # Denylist access token
    try:
        ap = decode_token(access_token)
        ttl = ap["exp"] - int(time.time())
        if ttl > 0:
            await redis.setex(f"denylist:{access_token}", ttl, "1")
    except Exception:
        pass

    # Denylist refresh token
    try:
        rp = decode_token(body.refresh_token)
        ttl = rp["exp"] - int(time.time())
        if ttl > 0:
            await redis.setex(f"denylist:{body.refresh_token}", ttl, "1")
    except Exception:
        pass

    # Delete password_changed_at cache
    await redis.delete(f"user_pca:{current_user.id}")


# ── B22 Verify Email ──────────────────────────────────────────────────────────

@router.post("/verify-email")
async def verify_email(token: str, db: Session = Depends(get_db)):
    redis = await get_redis()
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    user_id = await redis.get(f"email_verify:{token_hash}")
    if not user_id:
        raise HTTPException(status_code=400, detail={"error": True, "code": "INVALID_RESET_TOKEN", "message": "Invalid or expired verification token", "status": 400})

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail={"error": True, "code": "INVALID_RESET_TOKEN", "message": "User not found", "status": 400})

    user.email_verified = True
    db.commit()
    await redis.delete(f"email_verify:{token_hash}")
    return {"message": "Email verified successfully"}


# ── B23 Resend Verification ───────────────────────────────────────────────────

@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
async def resend_verification(
    current_user: User = Depends(get_current_user),
):
    redis = await get_redis()
    await rate_limit(redis, f"rl:resend:{current_user.id}", limit=3, window=3600)

    if current_user.email_verified:
        return  # Already verified, no-op

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    await redis.setex(f"email_verify:{token_hash}", 86400, current_user.id)
    await email_service.send_verification_email(current_user.email, token)


# ── B24 Forgot Password ───────────────────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(email: str, request: Request, db: Session = Depends(get_db)):
    redis = await get_redis()
    await rate_limit(redis, f"rl:forgot:{email}", limit=3, window=3600)

    user = db.query(User).filter(User.email == email).first()
    if user:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        await redis.setex(f"pwd_reset:{token_hash}", 3600, user.id)  # 1h TTL
        try:
            await email_service.send_password_reset_email(user.email, token)
        except Exception:
            pass

    # Always return 200 to avoid account enumeration
    return {"message": "If an account with that email exists, a reset link has been sent"}


# ── B25 Reset Password ────────────────────────────────────────────────────────

@router.post("/reset-password")
async def reset_password(token: str, new_password: str, db: Session = Depends(get_db)):
    redis = await get_redis()
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    user_id = await redis.get(f"pwd_reset:{token_hash}")
    if not user_id:
        raise HTTPException(status_code=400, detail={"error": True, "code": "INVALID_RESET_TOKEN", "message": "Invalid or expired reset token", "status": 400})

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail={"error": True, "code": "INVALID_RESET_TOKEN", "message": "User not found", "status": 400})

    user.password_hash = hash_password(new_password)
    user.password_changed_at = datetime.utcnow()
    db.commit()

    # Invalidate PCA cache + delete reset token (one-time use)
    await redis.delete(f"user_pca:{user_id}")
    await redis.delete(f"pwd_reset:{token_hash}")

    return {"message": "Password reset successfully"}

