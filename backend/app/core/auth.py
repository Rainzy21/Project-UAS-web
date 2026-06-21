"""
auth.py — Token verification using Supabase Admin SDK.

Manual decode JWT with PyJWT to avoid gotrue "alg" mismatch bugs
and save network calls.
"""
from __future__ import annotations

import asyncio
import logging

import jwt
from fastapi import HTTPException, Request

from app.core.config import settings
from app.core.supabase_client import supabase_admin

logger = logging.getLogger(__name__)


class MinimalUser:
    def __init__(self, id: str, email_confirmed_at: str | None):
        self.id = id
        self.email_confirmed_at = email_confirmed_at


def _extract_bearer_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    return auth.removeprefix("Bearer ")


async def verify_supabase_token(token: str, require_verified: bool = True):
    """
    Verify a Supabase JWT.
    Locally verifies HS256 tokens. For RS256, falls back to Supabase API.
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg", "HS256")

        if alg == "HS256":
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
                issuer=f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1",
            )
            user_id = payload.get("sub")
            email_confirmed_at = payload.get("email_confirmed_at")
        else:
            user_resp = await asyncio.to_thread(supabase_admin.auth.get_user, token)
            if not user_resp or not user_resp.user:
                raise HTTPException(status_code=401, detail="Invalid token")

            user_id = user_resp.user.id
            email_confirmed_at = user_resp.user.email_confirmed_at

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        user = MinimalUser(id=user_id, email_confirmed_at=email_confirmed_at)

        if require_verified and not user.email_confirmed_at:
            raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")

        return user

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Token verification failed (%s): %s", type(exc).__name__, exc)
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_user_id_from_request(
    request: Request,
    require_verified: bool = True,
) -> str:
    """Extract and verify the Bearer token from request; return user UUID."""
    token = _extract_bearer_token(request)
    user = await verify_supabase_token(token, require_verified=require_verified)
    return user.id


async def get_auth_from_request(
    request: Request,
    require_verified: bool = True,
) -> tuple[str, str]:
    """Return (user_id, access_token) after verification."""
    token = _extract_bearer_token(request)
    user = await verify_supabase_token(token, require_verified=require_verified)
    return user.id, token
