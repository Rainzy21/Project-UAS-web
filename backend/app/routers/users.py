"""Users router — /api/users/me endpoints for profile management."""
import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.core.auth import get_user_id_from_request
from app.core.supabase_client import supabase_admin, supabase_anon

router = APIRouter()


class UpdateNameBody(BaseModel):
    name: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class DeleteAccountBody(BaseModel):
    current_password: Optional[str] = None


def _get_providers(user) -> list[str]:
    identities = user.identities or []
    providers = []
    for identity in identities:
        if isinstance(identity, dict):
            provider = identity.get("provider")
        else:
            provider = getattr(identity, "provider", None)
        if provider:
            providers.append(provider)
    return providers


def _user_has_password(user) -> bool:
    return "email" in _get_providers(user)


async def _fetch_user(user_id: str):
    result = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: supabase_admin.auth.admin.get_user_by_id(user_id),
    )
    user = result.user
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _verify_current_password(email: str, password: str) -> None:
    if not supabase_anon:
        raise HTTPException(status_code=503, detail="Password verification unavailable")
    try:
        result = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: supabase_anon.auth.sign_in_with_password(
                {"email": email, "password": password}
            ),
        )
        if not result or not result.user:
            raise HTTPException(status_code=401, detail="Current password is incorrect")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Current password is incorrect")


# ── GET /api/users/me ─────────────────────────────────────────────────────────
@router.get("/me")
async def get_me(request: Request):
    """Return current user's profile. Allows unverified email."""
    user_id = await get_user_id_from_request(request, require_verified=False)

    try:
        user = await _fetch_user(user_id)
        meta = user.user_metadata or {}
        name = (
            meta.get("full_name")
            or meta.get("name")
            or (user.email.split("@")[0] if user.email else "User")
        )
        providers = _get_providers(user)

        return {
            "id": user.id,
            "email": user.email,
            "name": name,
            "email_verified": user.email_confirmed_at is not None,
            "created_at": str(user.created_at) if user.created_at else None,
            "providers": providers,
            "has_password": "email" in providers,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch user: {exc}")


# ── PATCH /api/users/me ───────────────────────────────────────────────────────
@router.patch("/me")
async def update_name(request: Request, body: UpdateNameBody):
    """Update the current user's display name."""
    user_id = await get_user_id_from_request(request, require_verified=False)

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")
    if len(name) > 100:
        raise HTTPException(status_code=422, detail="Name too long (max 100 chars)")

    try:
        await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: supabase_admin.auth.admin.update_user_by_id(
                user_id,
                {"user_metadata": {"full_name": name, "name": name}},
            ),
        )
        return {"success": True, "name": name}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to update name: {exc}")


# ── PATCH /api/users/me/password ─────────────────────────────────────────────
@router.patch("/me/password")
async def change_password(request: Request, body: ChangePasswordBody):
    """Change the current user's password (email/password accounts only)."""
    user_id = await get_user_id_from_request(request, require_verified=False)

    new_pw = body.new_password
    if len(new_pw) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    try:
        user = await _fetch_user(user_id)
        if not _user_has_password(user):
            raise HTTPException(
                status_code=400,
                detail="Password changes are not available for Google-only accounts",
            )
        if not user.email:
            raise HTTPException(status_code=400, detail="No email on file")

        await _verify_current_password(user.email, body.current_password)

        await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: supabase_admin.auth.admin.update_user_by_id(
                user_id,
                {"password": new_pw},
            ),
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to change password: {exc}")


# ── DELETE /api/users/me ──────────────────────────────────────────────────────
@router.delete("/me")
async def delete_account(request: Request, body: DeleteAccountBody):
    """Permanently delete the user's account."""
    user_id = await get_user_id_from_request(request, require_verified=False)

    try:
        user = await _fetch_user(user_id)
        if _user_has_password(user):
            if not body.current_password:
                raise HTTPException(status_code=422, detail="Password required to delete account")
            if not user.email:
                raise HTTPException(status_code=400, detail="No email on file")
            await _verify_current_password(user.email, body.current_password)

        await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: supabase_admin.auth.admin.delete_user(user_id),
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to delete account: {exc}")
