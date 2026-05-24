from __future__ import annotations

"""B11 — Auth Middleware

Validates JWT on every request that carries an Authorization: Bearer header.
Checks:
  1. Signature + expiry
  2. Redis denylist (denylist:{token})
  3. password_changed_at via Redis cache (user_pca:{user_id}, TTL 5 min)

Attaches request.state.user_id on success.
Raises 401 JSON on any failure.
"""
import time
from datetime import datetime

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.database import SessionLocal

# Routes that don't require authentication
_PUBLIC_PATHS: set[str] = {
    "/",
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/verify-email",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/movies/trending",
    "/docs",
    "/redoc",
    "/openapi.json",
}


def _error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": True, "code": code, "message": message, "status": status},
    )


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Skip auth for public paths and anything without a bearer token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            if path not in _PUBLIC_PATHS and not path.startswith(("/docs", "/redoc", "/openapi")):
                # Only enforce auth on /api/* routes that are not public
                if path.startswith("/api/"):
                    return _error("UNAUTHORIZED", "Authentication required", 401)
            return await call_next(request)

        token = auth_header[7:]

        # 1. Validate JWT signature + expiry
        try:
            payload = jwt.decode(
                token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
            )
        except JWTError:
            return _error("TOKEN_EXPIRED", "Invalid or expired token", 401)

        user_id: str | None = payload.get("sub")
        token_type: str = payload.get("type", "access")
        if not user_id or token_type != "access":
            return _error("TOKEN_EXPIRED", "Invalid token", 401)

        exp: int = payload.get("exp", 0)
        iat: int = payload.get("iat", 0)

        # 2. Redis denylist check
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            if await redis.get(f"denylist:{token}"):
                return _error("TOKEN_REVOKED", "Token has been revoked", 401)

            # 3. password_changed_at check via cache
            pca_key = f"user_pca:{user_id}"
            pca_cached = await redis.get(pca_key)

            if pca_cached is None:
                # Cache miss: fetch from DB
                pca_ts = await _get_pca_from_db(user_id)
                pca_value = str(pca_ts) if pca_ts is not None else "none"
                await redis.setex(pca_key, 300, pca_value)  # TTL 5 min
                pca_cached = pca_value

            if pca_cached != "none":
                try:
                    pca_dt = datetime.fromisoformat(pca_cached)
                    pca_epoch = pca_dt.timestamp()
                    if iat < pca_epoch:
                        return _error("TOKEN_REVOKED", "Token invalidated by password change", 401)
                except ValueError:
                    pass
        except Exception:
            # If Redis is unavailable, proceed (fail-open for availability)
            pass

        request.state.user_id = user_id
        return await call_next(request)


async def _get_pca_from_db(user_id: str):
    """Fetch user.password_changed_at synchronously in a thread."""
    import asyncio

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_get_pca, user_id)


def _sync_get_pca(user_id: str):
    from app.models.user import User

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        return user.password_changed_at if user else None
    finally:
        db.close()
