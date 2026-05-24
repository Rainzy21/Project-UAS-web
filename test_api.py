#!/usr/bin/env python3
"""
Quick end-to-end test for AI recommendation + movie endpoints.
Run from the repo root:
    python test_api.py
"""
import hashlib
import json
import secrets
import sqlite3
import sys
import time

import httpx
import redis as redis_sync

BASE = "http://localhost:8000"
DB   = "/Users/voldys/project/Project-UAS-web/backend/database.db"

# ── helpers ─────────────────────────────────────────────────────────────────

def ok(label, r):
    status = "✓" if r.status_code < 400 else "✗"
    print(f"{status}  [{r.status_code}] {label}")
    if r.status_code >= 400:
        print(f"   {r.text}")
    return r

def jprint(data):
    print(json.dumps(data, indent=2, ensure_ascii=False)[:800])

# ── 1. Health check ──────────────────────────────────────────────────────────
print("\n=== 1. Health ===")
r = httpx.get(f"{BASE}/")
ok("GET /", r)

# ── 2. Register ──────────────────────────────────────────────────────────────
print("\n=== 2. Register ===")
EMAIL = f"testuser_{int(time.time())}@example.com"
r = httpx.post(f"{BASE}/api/auth/register", json={
    "name": "Test User",
    "email": EMAIL,
    "password": "Secret123!",
})
ok("POST /api/auth/register", r)
if r.status_code >= 400:
    sys.exit(1)
data = r.json()
ACCESS  = data["access_token"]
USER_ID = data["user"]["id"]
print(f"   user_id: {USER_ID}")

# ── 3. Force email_verified via SQLite (SMTP not configured in dev) ──────────
print("\n=== 3. Patch email_verified in DB ===")
conn = sqlite3.connect(DB)
conn.execute("UPDATE users SET email_verified=1 WHERE id=?", (USER_ID,))
conn.commit()
conn.close()
print("✓  email_verified = True")

HEADERS = {"Authorization": f"Bearer {ACCESS}"}

# ── 4. Trending movies (no auth) ─────────────────────────────────────────────
print("\n=== 4. Trending Movies ===")
r = httpx.get(f"{BASE}/api/movies/trending", timeout=15)
ok("GET /api/movies/trending", r)
if r.status_code == 200:
    movies = r.json()
    print(f"   {len(movies)} movies returned")
    if movies:
        first = movies[0]
        TMDB_ID = first["tmdb_id"]
        print(f"   First: [{TMDB_ID}] {first['title']}")

# ── 5. Single movie detail ────────────────────────────────────────────────────
print("\n=== 5. Movie Detail ===")
r = httpx.get(f"{BASE}/api/movies/{TMDB_ID}", headers=HEADERS, timeout=10)
ok(f"GET /api/movies/{TMDB_ID}", r)
if r.status_code == 200:
    m = r.json()
    print(f"   {m['title']} ({m.get('year')})  ⭐ {m.get('rating')}")

# ── 6. AI Recommendation ─────────────────────────────────────────────────────
print("\n=== 6. AI Recommendation (DeepSeek + TMDB) ===")
print("   Calling DeepSeek... (may take a few seconds)")
r = httpx.post(f"{BASE}/api/recommendations/generate",
    headers=HEADERS,
    json={
        "genre": "Action",
        "mood": "Thrilling",
        "era": "2010s",
        "language": "English",
        "watching_with": "Friends",
    },
    timeout=60,
)
ok("POST /api/recommendations/generate", r)
if r.status_code == 200:
    rec = r.json()
    REC_ID = rec["recommendation_id"]
    print(f"   recommendation_id: {REC_ID}")
    print(f"   {len(rec['movies'])} movies returned:")
    for m in rec["movies"][:5]:
        print(f"     [{m['tmdb_id']}] {m['title']} ({m.get('year')})  ⭐ {m.get('rating')}")
    if len(rec["movies"]) > 5:
        print(f"     ... and {len(rec['movies']) - 5} more")
    AI_TMDB_IDS = [m["tmdb_id"] for m in rec["movies"][:2]]

# ── 7. Save movies ────────────────────────────────────────────────────────────
print("\n=== 7. Save Movies ===")
movies_to_save = [{"tmdb_id": TMDB_ID, "note": "from trending", "tag": "watch-later"}]
if "AI_TMDB_IDS" in dir() or "AI_TMDB_IDS" in locals():
    for tid in AI_TMDB_IDS:
        movies_to_save.append({"tmdb_id": tid, "note": "AI recommended", "tag": "action"})
r = httpx.post(f"{BASE}/api/movies/save",
    headers=HEADERS,
    json={"movies": movies_to_save},
    timeout=30,
)
ok("POST /api/movies/save", r)
if r.status_code == 200:
    print(f"   {r.json()['message']}")

# ── 8. My list ────────────────────────────────────────────────────────────────
print("\n=== 8. My Saved List ===")
r = httpx.get(f"{BASE}/api/movies/my-list", headers=HEADERS, timeout=10)
ok("GET /api/movies/my-list", r)
if r.status_code == 200:
    items = r.json()
    print(f"   {len(items)} saved items")
    for item in items[:3]:
        title = item.get("movie", {}) or {}
        print(f"     [{item['tmdb_id']}] tag={item['tag']}  note={item['note']}")
    SAVED_ID = items[0]["id"] if items else None

# ── 9. Saved status ───────────────────────────────────────────────────────────
print("\n=== 9. Saved Status ===")
ids_param = ",".join(str(i) for i in [TMDB_ID, 999999])
r = httpx.get(f"{BASE}/api/movies/saved/status?tmdb_ids={ids_param}", headers=HEADERS)
ok(f"GET /api/movies/saved/status?tmdb_ids={ids_param}", r)
if r.status_code == 200:
    jprint(r.json())

# ── 10. Recommendation history ────────────────────────────────────────────────
print("\n=== 10. Recommendation History ===")
r = httpx.get(f"{BASE}/api/recommendations/history", headers=HEADERS)
ok("GET /api/recommendations/history", r)
if r.status_code == 200:
    h = r.json()
    print(f"   {h['total']} total entries")

# ── 11. Create preset ─────────────────────────────────────────────────────────
print("\n=== 11. Preference Preset ===")
r = httpx.post(f"{BASE}/api/recommendations/presets",
    headers=HEADERS,
    json={"name": "Friday Night Action", "preferences": {
        "genre": "Action", "mood": "Thrilling",
        "era": "2010s", "language": "English", "watching_with": "Friends",
    }},
)
ok("POST /api/recommendations/presets", r)
if r.status_code == 201:
    preset = r.json()
    PRESET_ID = preset["id"]
    print(f"   preset_id: {PRESET_ID}")

r = httpx.get(f"{BASE}/api/recommendations/presets", headers=HEADERS)
ok("GET /api/recommendations/presets", r)
if r.status_code == 200:
    print(f"   {len(r.json())} preset(s)")

# ── 12. User profile ──────────────────────────────────────────────────────────
print("\n=== 12. User Profile ===")
r = httpx.get(f"{BASE}/api/users/me", headers=HEADERS)
ok("GET /api/users/me", r)
if r.status_code == 200:
    u = r.json()
    print(f"   {u['name']} | {u['email']} | verified={u['email_verified']}")

# ── 13. B22 Verify-email token flow (without SMTP) ───────────────────────────
print("\n=== 13. Verify-Email Token Flow (B22) ===")
# Register a second fresh user — email_verified starts False
VERIFY_EMAIL = f"verifytest_{int(time.time())}@example.com"
r = httpx.post(f"{BASE}/api/auth/register", json={
    "name": "Verify Test",
    "email": VERIFY_EMAIL,
    "password": "Secret123!",
})
ok("POST /api/auth/register (unverified user)", r)
if r.status_code == 201:
    VERIFY_USER_ID = r.json()["user"]["id"]
    # Inject a known token into Redis so we can verify without SMTP
    _rc = redis_sync.Redis.from_url("redis://localhost:6379", decode_responses=True)
    TEST_TOKEN = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(TEST_TOKEN.encode()).hexdigest()
    _rc.setex(f"email_verify:{token_hash}", 300, VERIFY_USER_ID)
    _rc.close()
    print(f"   Injected test token into Redis for user {VERIFY_USER_ID}")

    # Confirm unverified user cannot call generate
    _unverified_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r2 = httpx.post(f"{BASE}/api/recommendations/generate",
        headers=_unverified_headers,
        json={"genre": "Action", "mood": "Thrilling", "era": "2010s",
              "language": "English", "watching_with": "Friends"},
        timeout=10,
    )
    if r2.status_code == 403:
        print("✓  [403] unverified user correctly blocked from /generate")
    else:
        print(f"✗  expected 403, got {r2.status_code}: {r2.text}")

    # Call the real verify-email endpoint with the known token
    r3 = httpx.post(f"{BASE}/api/auth/verify-email?token={TEST_TOKEN}")
    ok("POST /api/auth/verify-email?token=<token>", r3)
    if r3.status_code == 200:
        # Confirm the DB flag was set
        conn = sqlite3.connect(DB)
        row = conn.execute(
            "SELECT email_verified FROM users WHERE id=?", (VERIFY_USER_ID,)
        ).fetchone()
        conn.close()
        verified = bool(row[0]) if row else False
        print(f"   DB email_verified = {verified}")
        if verified:
            print("✓  verify-email flow end-to-end confirmed")
        else:
            print("✗  DB flag not set after verify-email call")

        # Confirm the Redis key was deleted (one-time use)
        _rc2 = redis_sync.Redis.from_url("redis://localhost:6379", decode_responses=True)
        still_exists = _rc2.exists(f"email_verify:{token_hash}")
        _rc2.close()
        if not still_exists:
            print("✓  Redis token deleted after use (one-time token confirmed)")
        else:
            print("✗  Redis token still present after use")

# ── 14. Duplicate save (same tmdb_id twice → 200, count 0) ───────────────────
print("\n=== 14. Duplicate Save ===")
# Re-send the same movies we saved in step 7 — all should be duplicates
r = httpx.post(f"{BASE}/api/movies/save",
    headers=HEADERS,
    json={"movies": movies_to_save},
    timeout=30,
)
ok("POST /api/movies/save (all duplicates)", r)
if r.status_code == 200:
    body = r.json()
    saved_count = body.get("saved", -1)
    print(f"   saved count on duplicate = {saved_count}")
    if saved_count == 0:
        print("✓  Duplicate save returns 200 with count 0")
    else:
        print(f"✗  Expected count 0, got {saved_count}")

print("\n=== Done ===\n")
