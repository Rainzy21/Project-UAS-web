"""Pytest configuration."""
import os

import pytest

_TEST_JWT = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCicm9sZSI6ImFub24iLCJpYXQiOjE2LCJleHAiOjk5OTk5OTk5OTl9."
    "test-signature"
)
_TEST_SERVICE = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYsImV4cCI6OTk5OTk5OTk5fQ."
    "test-signature"
)

os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_JWT_SECRET"] = "test-secret-test-secret-test-secret-test"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = _TEST_SERVICE
os.environ["SUPABASE_ANON_KEY"] = _TEST_JWT
os.environ["REDIS_URL"] = "redis://localhost:6379"
os.environ["ENVIRONMENT"] = "development"


@pytest.fixture
def anyio_backend():
    return "asyncio"
