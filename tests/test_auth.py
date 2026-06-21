"""Auth endpoint tests."""
import time
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app


def _make_token(
    user_id: str = "user-123",
    email_confirmed_at: Optional[str] = "2024-01-01T00:00:00Z",
    issuer: Optional[str] = None,
) -> str:
    payload = {
        "sub": user_id,
        "aud": "authenticated",
        "iss": issuer or f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1",
        "exp": int(time.time()) + 3600,
    }
    if email_confirmed_at:
        payload["email_confirmed_at"] = email_confirmed_at
    return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_recommendations_generate_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post(
            "/api/recommendations/generate",
            json={
                "genre": "Action",
                "mood": "Thrilled",
                "era": "Any",
                "language": "Any",
                "watching_with": "Solo",
            },
        )
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_recommendations_generate_requires_verified_email():
    token = _make_token(email_confirmed_at=None)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post(
            "/api/recommendations/generate",
            json={
                "genre": "Action",
                "mood": "Thrilled",
                "era": "Any",
                "language": "Any",
                "watching_with": "Solo",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_jwt_wrong_issuer_rejected():
    token = _make_token(issuer="https://evil.supabase.co/auth/v1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get(
            "/api/recommendations/history",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_history_pagination_bounds():
    token = _make_token()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get(
            "/api/recommendations/history?page=0",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 422

        r2 = await client.get(
            "/api/recommendations/history?limit=9999",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r2.status_code == 422


@pytest.mark.asyncio
async def test_export_requires_verified_email():
    token = _make_token(email_confirmed_at=None)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get(
            "/api/users/me/export",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403


@pytest.mark.asyncio
@patch("app.routers.users.get_user_client")
@patch("app.routers.users._fetch_user", new_callable=AsyncMock)
async def test_export_scoped_to_authenticated_user(mock_fetch, mock_get_client):
    user = MagicMock()
    user.id = "user-123"
    user.email = "user@example.com"
    user.email_confirmed_at = "2024-01-01T00:00:00Z"
    user.created_at = None
    user.user_metadata = {"full_name": "Test User"}
    mock_fetch.return_value = user

    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    mock_get_client.return_value = sb

    token = _make_token(user_id="user-123")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get(
            "/api/users/me/export",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert r.status_code == 200
    assert r.json()["profile"]["id"] == "user-123"
    mock_get_client.assert_called_once()
    sb.table.assert_any_call("saved_movies")
    sb.table.assert_any_call("recommendation_logs")
    sb.table.assert_any_call("preference_presets")


@pytest.mark.asyncio
@patch("app.routers.recommendations._check_rate_limit", new_callable=AsyncMock)
async def test_generate_rate_limit_returns_429(mock_rate_limit):
    mock_rate_limit.side_effect = HTTPException(status_code=429, detail="Rate limit exceeded")
    token = _make_token()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post(
            "/api/recommendations/generate",
            json={
                "genre": "Action",
                "mood": "Thrilled",
                "era": "Any",
                "language": "Any",
                "watching_with": "Solo",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 429
