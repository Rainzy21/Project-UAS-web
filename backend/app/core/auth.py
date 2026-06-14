"""
auth.py — Token verification using Supabase Admin SDK.

Manual decode JWT with PyJWT to avoid gotrue "alg" mismatch bugs
and save network calls.
"""
import jwt
from fastapi import HTTPException, Request
from app.core.config import settings

from app.core.supabase_client import supabase_admin
import asyncio

class MinimalUser:
    def __init__(self, id: str, email_confirmed_at: str | None):
        self.id = id
        self.email_confirmed_at = email_confirmed_at

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
                audience="authenticated"
            )
            user_id = payload.get("sub")
            email_confirmed_at = payload.get("email_confirmed_at")
        else:
            # For RS256, use the Supabase API to fetch and verify the user
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
    except Exception as exc:
        print(f"[auth] Token verification failed: {exc}")
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_user_id_from_request(
    request: Request,
    require_verified: bool = True
) -> str:
    """Extract and verify the Bearer token from request; return user UUID."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth.removeprefix("Bearer ")
    user = await verify_supabase_token(token, require_verified=require_verified)
    return user.id
