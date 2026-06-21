"""Pytest configuration."""
import base64
import json
import os

import pytest


def _fake_supabase_jwt(role: str) -> str:
    """Build a JWT-shaped string at runtime (not a real secret; avoids gitleaks in source)."""
    header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').decode().rstrip("=")
    payload = base64.urlsafe_b64encode(
        json.dumps({"iss": "test", "role": role}).encode()
    ).decode().rstrip("=")
    return f"{header}.{payload}.fake-test-signature-not-a-real-key"


os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-test-secret-test-secret-test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", _fake_supabase_jwt("service_role"))
os.environ.setdefault("SUPABASE_ANON_KEY", _fake_supabase_jwt("anon"))
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("ENVIRONMENT", "development")


@pytest.fixture
def anyio_backend():
    return "asyncio"
