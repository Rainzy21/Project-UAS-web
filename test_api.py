#!/usr/bin/env python3
"""
Smoke test for the Supabase-based FastAPI backend.

Usage:
    # Start backend first: cd backend && uvicorn app.main:app --reload --port 8000
  python test_api.py

Optional env for authenticated endpoints:
    TEST_SUPABASE_JWT=eyJ...   # Bearer token from a logged-in Supabase session
"""
from __future__ import annotations

import json
import os
import sys

import httpx

BASE = os.environ.get("API_BASE", "http://localhost:8000")
TOKEN = os.environ.get("TEST_SUPABASE_JWT", "")


def ok(label: str, r: httpx.Response) -> bool:
    mark = "✓" if r.status_code < 400 else "✗"
    print(f"{mark}  [{r.status_code}] {label}")
    if r.status_code >= 400:
        print(f"   {r.text[:300]}")
    return r.status_code < 400


def main() -> int:
    print(f"\n=== Smoke test → {BASE} ===\n")

    try:
        r = httpx.get(f"{BASE}/", timeout=10)
    except httpx.ConnectError:
        print("✗  Backend not reachable. Start uvicorn on port 8000 first.")
        return 1

    if not ok("GET /", r):
        return 1

    r = httpx.get(f"{BASE}/health", timeout=10)
    ok("GET /health", r)

    r = httpx.get(f"{BASE}/api/movies/trending", timeout=15)
    ok("GET /api/movies/trending", r)

    if not TOKEN:
        print("\n(skip) Authenticated endpoints — set TEST_SUPABASE_JWT to test")
        print("\nLegacy SQLite auth tests removed; this project uses Supabase Auth.\n")
        return 0

    headers = {"Authorization": f"Bearer {TOKEN}"}
    print("\n=== Authenticated (TEST_SUPABASE_JWT) ===\n")

    r = httpx.get(f"{BASE}/api/users/me", headers=headers, timeout=10)
    ok("GET /api/users/me", r)

    r = httpx.get(f"{BASE}/api/recommendations/presets", headers=headers, timeout=10)
    ok("GET /api/recommendations/presets", r)

    prefs = {
        "genre": "Sci-fi",
        "mood": "Thrilled",
        "era": "2010s",
        "language": "English",
        "watching_with": "Solo",
    }
    r = httpx.post(
        f"{BASE}/api/recommendations/presets",
        headers=headers,
        json={"name": "smoke-test-preset", **prefs},
        timeout=10,
    )
    if ok("POST /api/recommendations/presets", r):
        try:
            preset_id = r.json().get("id")
            if preset_id:
                r2 = httpx.delete(
                    f"{BASE}/api/recommendations/presets/{preset_id}",
                    headers=headers,
                    timeout=10,
                )
                ok(f"DELETE /api/recommendations/presets/{preset_id}", r2)
        except json.JSONDecodeError:
            pass

    print("\nDone.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
