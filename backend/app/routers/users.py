"""Users router — /api/users/me endpoints for profile management."""
import asyncio
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.core.auth import get_user_id_from_request
from app.core.supabase_client import supabase_admin

router = APIRouter()


class UpdateNameBody(BaseModel):
    name: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class DeleteAccountBody(BaseModel):
    current_password: str


# ── GET /api/users/me ─────────────────────────────────────────────────────────
@router.get("/me")
async def get_me(request: Request):
    """Return current user's profile. Allows unverified email."""
    user_id = await get_user_id_from_request(request, require_verified=False)

    try:
        result = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: supabase_admin.auth.admin.get_user_by_id(user_id)
        )
        user = result.user
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        meta = user.user_metadata or {}
        name = (
            meta.get("full_name")
            or meta.get("name")
            or (user.email.split("@")[0] if user.email else "User")
        )

        return {
            "id": user.id,
            "email": user.email,
            "name": name,
            "email_verified": user.email_confirmed_at is not None,
            "created_at": str(user.created_at) if user.created_at else None,
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
                {"user_metadata": {"full_name": name, "name": name}}
            )
        )
        return {"success": True, "name": name}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to update name: {exc}")


# ── PATCH /api/users/me/password ─────────────────────────────────────────────
@router.patch("/me/password")
async def change_password(request: Request, body: ChangePasswordBody):
    """Change the current user's password via Supabase admin API."""
    user_id = await get_user_id_from_request(request, require_verified=False)

    new_pw = body.new_password
    if len(new_pw) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    try:
        await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: supabase_admin.auth.admin.update_user_by_id(
                user_id,
                {"password": new_pw}
            )
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
        await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: supabase_admin.auth.admin.delete_user(user_id)
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to delete account: {exc}")
