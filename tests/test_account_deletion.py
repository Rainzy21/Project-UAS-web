"""Account deletion endpoint tests."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.test_auth import _make_token


def _password_user():
    user = MagicMock()
    user.email = "user@example.com"
    user.identities = [{"provider": "email"}]
    return user


def _google_user():
    user = MagicMock()
    user.email = "user@gmail.com"
    user.identities = [{"provider": "google"}]
    return user


@pytest.mark.asyncio
async def test_delete_account_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.request("DELETE", "/api/users/me", json={})
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_delete_account_requires_verified_email():
    token = _make_token(email_confirmed_at=None)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.request(
            "DELETE",
            "/api/users/me",
            json={},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403


@pytest.mark.asyncio
@patch("app.routers.users._fetch_user", new_callable=AsyncMock)
async def test_delete_account_password_required(mock_fetch):
    mock_fetch.return_value = _password_user()
    token = _make_token()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.request(
            "DELETE",
            "/api/users/me",
            json={},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 422


@pytest.mark.asyncio
@patch("app.routers.users.supabase_admin")
@patch("app.routers.users._verify_current_password", new_callable=AsyncMock)
@patch("app.routers.users._fetch_user", new_callable=AsyncMock)
async def test_delete_account_calls_delete_user(mock_fetch, mock_verify, mock_admin):
    mock_fetch.return_value = _password_user()
    mock_admin.auth.admin.delete_user = MagicMock()
    token = _make_token(user_id="user-abc")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.request(
            "DELETE",
            "/api/users/me",
            json={"current_password": "correct-password"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert r.status_code == 200
    assert r.json()["success"] is True
    mock_verify.assert_awaited_once()
    mock_admin.auth.admin.delete_user.assert_called_once_with("user-abc")


@pytest.mark.asyncio
@patch("app.routers.users.supabase_admin")
@patch("app.routers.users._fetch_user", new_callable=AsyncMock)
async def test_delete_google_account_without_password(mock_fetch, mock_admin):
    mock_fetch.return_value = _google_user()
    mock_admin.auth.admin.delete_user = MagicMock()
    token = _make_token(user_id="google-user-1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.request(
            "DELETE",
            "/api/users/me",
            json={},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert r.status_code == 200
    mock_admin.auth.admin.delete_user.assert_called_once_with("google-user-1")
