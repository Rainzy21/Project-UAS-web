"""Users router — /api/users/me endpoints for profile management."""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.auth import get_auth_from_request, get_user_id_from_request
from app.core.supabase_client import get_user_client, supabase_admin, supabase_anon

logger = logging.getLogger(__name__)

router = APIRouter()


class UpdateNameBody(BaseModel):
    name: str = Field(..., max_length=100)


class ChangePasswordBody(BaseModel):
    current_password: str = Field(..., max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


class DeleteAccountBody(BaseModel):
    current_password: Optional[str] = Field(None, max_length=128)


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
    # Creates a real Supabase session via sign_in_with_password; session is discarded.
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


@router.get("/me")
async def get_me(request: Request):
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
        logger.exception("Failed to fetch user profile")
        raise HTTPException(status_code=502, detail="Failed to fetch user profile") from exc


@router.get("/me/export")
async def export_my_data(request: Request):
    """GDPR-style data export: profile, saved movies, logs, presets."""
    user_id, token = await get_auth_from_request(request, require_verified=True)
    sb = get_user_client(token)

    user = await _fetch_user(user_id)
    meta = user.user_metadata or {}

    saved = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: sb.table("saved_movies").select("*").eq("user_id", user_id).execute(),
    )
    logs = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: sb.table("recommendation_logs").select("*").eq("user_id", user_id).execute(),
    )
    presets = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: sb.table("preference_presets").select("*").eq("user_id", user_id).execute(),
    )

    return {
        "profile": {
            "id": user.id,
            "email": user.email,
            "name": meta.get("full_name") or meta.get("name"),
            "email_verified": user.email_confirmed_at is not None,
            "created_at": str(user.created_at) if user.created_at else None,
        },
        "saved_movies": saved.data or [],
        "recommendation_logs": logs.data or [],
        "preference_presets": presets.data or [],
    }


@router.patch("/me")
async def update_name(request: Request, body: UpdateNameBody):
    user_id = await get_user_id_from_request(request, require_verified=False)

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")

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
        logger.exception("Failed to update name")
        raise HTTPException(status_code=502, detail="Failed to update name") from exc


@router.patch("/me/password")
async def change_password(request: Request, body: ChangePasswordBody):
    user_id = await get_user_id_from_request(request, require_verified=True)

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
                {"password": body.new_password},
            ),
        )

        try:
            await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: supabase_admin.auth.admin.sign_out(user_id, "others"),
            )
        except Exception as exc:
            logger.warning("Session revocation after password change failed: %s", exc)

        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to change password")
        raise HTTPException(status_code=502, detail="Failed to change password") from exc


@router.delete("/me")
async def delete_account(request: Request, body: DeleteAccountBody):
    user_id = await get_user_id_from_request(request, require_verified=True)

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
        logger.exception("Failed to delete account")
        raise HTTPException(status_code=502, detail="Failed to delete account") from exc
