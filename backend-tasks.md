# Backend Task Breakdown

## Locked Decisions

| Decision | Choice |
|---|---|
| Chat endpoint | **Dropped** — no conversational loop in the product |
| Ownership mismatch response | **404** everywhere — don't reveal whether a resource exists |
| Preset rename | **No PATCH** — delete-and-recreate is acceptable |
| Preference presets | **Added** — save/name/re-run. Re-run = frontend pre-fills form → calls existing `POST /generate` |
| `password_changed_at` check | **Redis cache** (`user_pca:{user_id}`, TTL 5 min) to avoid a DB hit on every authenticated request |

---

## Phase B1 — Infrastructure
> Do first. Everything depends on this.

| # | Task | File |
|---|---|---|
| B1 | Add all missing env vars to Settings | `app/core/config.py` |
| B2 | Set up Alembic | `alembic.ini` + `alembic/env.py` |
| B3 | Async Redis client + `get_redis()` dependency | `app/core/redis.py` *(new)* |
| B4 | Update User model — UUID id, `email_verified` (bool, default False), `password_changed_at` (DateTime nullable) | `app/models/user.py` |
| B5 | Rewrite Movie model — `tmdb_id` Integer PK, title, overview, poster_url, rating Float, year Int, language, genres JSON, created_at | `app/models/movie.py` |
| B6 | SavedMovie model — UUID id, user_id FK, tmdb_id FK, note Text, tag String, saved_at; `UniqueConstraint("user_id", "tmdb_id")` | `app/models/saved_movie.py` *(new)* |
| B7 | RecommendationLog model — UUID id, user_id FK, preferences JSON, ai_response JSON, tmdb_ids JSON, created_at | `app/models/recommendation_log.py` *(new)* |
| B8 | PreferencePreset model — UUID id, user_id FK→User, name String, preferences JSON, created_at. No unique constraint — multiple presets per user allowed | `app/models/preference_preset.py` *(new)* |
| B9 | Register all models in `__init__.py`, generate + run Alembic migration | `app/models/__init__.py` |

**New env vars required in `.env`:**
```
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=
TMDB_API_KEY=
TMDB_BASE_URL=https://api.themoviedb.org/3
TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p/w500
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=
FRONTEND_URL=http://localhost:5500
TRUSTED_PROXY_IP=
```

---

## Phase B2 — Middleware + Email Service
> Parallel. Depends on B1 + B3.

| # | Task | File |
|---|---|---|
| B10 | `ProxyHeadersMiddleware` (trusted_hosts from settings) + `CORSMiddleware` with `settings.FRONTEND_URL` — never `"*"` with `allow_credentials=True` | `app/main.py` |
| B11 | Auth middleware — JWT signature + expiry; Redis denylist (`denylist:{token}`); `password_changed_at` check via Redis cache (see note below); attach `user_id` to `request.state`; raise 401 on any failure. **Depends on B3 + B4** | `app/middleware/auth_middleware.py` *(new)* |
| B12 | Rate limiter utility — async sliding-window in Redis; keyed by `user_id` or `request.client.host`; raises 429/`RATE_LIMITED` | `app/middleware/rate_limiter.py` *(new)* |
| B13 | Email service — aiosmtplib SMTP from settings; `send_verification_email(to, token)` + `send_password_reset_email(to, token)`; inline plaintext+HTML templates | `app/services/email_service.py` *(new)* |

**B11 — `password_changed_at` check logic:**
```
1. Check Redis key  user_pca:{user_id}  (TTL 5 min)
2. On cache miss → fetch user.password_changed_at from DB → write to Redis
3. If token iat < password_changed_at → raise 401/TOKEN_REVOKED
```
> **Tradeoff:** 5-minute window where an old token can still authenticate after a password change. A full per-request DB lookup is the only alternative — this is the accepted tradeoff.

**Redis invalidation rule:** B21, B25, B28, B29 must all **delete `user_pca:{user_id}`** from Redis immediately after updating `password_changed_at`, so the next request picks up the new timestamp rather than the cached value.

---

## Phase B3 — Schemas
> Parallel with B2. Must complete before Phase B4+.

| # | Task | File |
|---|---|---|
| B14 | `UserCreate`, `UserLogin`, `UserOut` (id/name/email/email_verified/created_at), `TokenPair`, `RefreshRequest`, `DeleteAccountRequest`, `ChangePasswordRequest`, `UpdateNameRequest` | `app/schemas/user.py` |
| B15 | `MovieOut`, `SavedMovieCreate` (tmdb_id/note?/tag?) — **single-item schema**; `SavedMovieListCreate` ({movies: list[SavedMovieCreate]}) — **request body for POST /save**; `SavedMovieOut`, `SavedMovieUpdate`, `SavedStatusItem` (saved bool, saved_id?), `SavedStatusResponse` (dict[str, SavedStatusItem]) | `app/schemas/movie.py` |
| B16 | `RecommendationRequest`, `RecommendationOut` (recommendation_id + movies list[MovieOut]), `HistoryItem` (id/preferences/created_at/movie_count), `HistoryResponse`, `PresetCreate` (name + preferences), `PresetOut` (id/name/preferences/created_at) | `app/schemas/recommendation.py` |
| B17 | Allowlist constant sets + `MAX_PRESETS_PER_USER = 20`. Imported by `ai_service.py` and the recommendations router | `app/constants.py` *(new)* |

**B17 constants:**
```python
ALLOWED_GENRES       = {"Action", "Drama", "Comedy", "Horror", "Sci-fi", "Romance", "Thriller", "Animation"}
ALLOWED_MOODS        = {"Feel good", "Dark & intense", "Thrilling", "Emotional", "Lighthearted"}
ALLOWED_ERAS         = {"Classic", "80s-90s", "2000s", "2010s", "Recent", "Any"}
ALLOWED_LANGUAGES    = {"English", "Korean", "Spanish", "French", "Japanese", "Any"}
ALLOWED_WATCHING_WITH = {"Solo", "Partner", "Friends", "Family"}
MAX_PRESETS_PER_USER = 20
```

---

## Phase B4 — Auth Endpoints
> Depends on B2 + B3. Rewrite `routers/auth.py`.

| # | Endpoint | Notes |
|---|---|---|
| B18 | `POST /api/auth/register` | Hash password; `email_verified=False`; call `email_service.send_verification_email`; return `TokenPair` with user field. **Depends on B13** |
| B19 | `POST /api/auth/login` | Validate credentials; rate limit 5/min per `request.client.host` via B12; return `TokenPair` |
| B20 | `POST /api/auth/refresh` | Validate sig + expiry; check denylist; denylist old refresh token with remaining TTL (`payload["exp"] - int(time.time())`); issue new pair |
| B21 | `POST /api/auth/logout` | Denylist both tokens with remaining TTL; **delete `user_pca:{user_id}`** from Redis |
| B22 | `POST /api/auth/verify-email` | Validate token hash in Redis; set `email_verified=True`; delete token from Redis |
| B23 | `POST /api/auth/resend-verification` | Rate limit 3/hour per `user_id`; regenerate token hash; call email_service. **Depends on B13** |
| B24 | `POST /api/auth/forgot-password` | Always return 200 (no account enumeration); rate limit 3/hour per email address; store reset token hash in Redis (1h TTL); call email_service if user found. **Depends on B13** |
| B25 | `POST /api/auth/reset-password` | Validate token hash in Redis; update `password_hash`; set `password_changed_at`; **delete `user_pca:{user_id}`**; delete token from Redis (one-time use) |

---

## Phase B5 — User Endpoints
> Depends on B2 + B3. New file `routers/users.py`.

| # | Endpoint | Notes |
|---|---|---|
| B26 | `GET /api/users/me` | Return `UserOut` for current user |
| B27 | `PATCH /api/users/me` | Update `name` only; reject any `email` field in request body |
| B28 | `DELETE /api/users/me` | See detailed spec below |
| B29 | `PATCH /api/users/me/password` *(new scope — not in original plan)* | Verify `current_password`; update `password_hash`; set `password_changed_at`; **delete `user_pca:{user_id}`** |

**B28 — `DELETE /api/users/me` operation order:**
1. Verify `current_password` → return 401 if wrong, do not proceed
2. Denylist the **access token** with remaining TTL (from Authorization header)
3. Delete `user_pca:{user_id}` from Redis
4. Cascade delete: saved movies → recommendation logs → presets
5. Delete user row

> **Implementation note:** Only the access token can be denylisted — the refresh token is not sent with this request (only sent to `/auth/refresh`). After the user row is deleted, a stale refresh token will pass JWT + denylist checks but fail at B11's DB fallback with 401. No data is accessible since the row is gone.
>
> For exhaustive denylist coverage, two options at build time:
> - **(A)** Require the client to call `/auth/logout` before calling this endpoint
> - **(B)** Accept the refresh token in this request body alongside `current_password`
>
> Neither is a security requirement given the cascade delete. Make a deliberate choice.

---

## Phase B6 — Services
> Parallel. Depends on B1 + B3 + B17.

| # | Task | File |
|---|---|---|
| B30 | TMDB service — `fetch_movie(tmdb_id)`: httpx GET, Redis cache `tmdb:movie:{id}` TTL 1h, return None on 404; `fetch_all(ids)`: `asyncio.gather` + `Semaphore(4)`, return only valid dicts | `app/services/tmdb_service.py` *(new)* |
| B31 | AI service — build prompt from **B17 constants only** (no user strings injected directly); call Claude API (verify exact model ID at build time); parse `[{tmdb_id, title}]` JSON response; raise `AI_ERROR` 502 on failure | `app/services/ai_service.py` *(new)* |
| B32 | Recommendation service — call B31 then B30; write `RecommendationLog`; raise `AI_ERROR` if 0 valid movies returned after TMDB filtering; return enriched list | `app/services/recommendation_service.py` *(new)* |

---

## Phase B7 — All Endpoints
> Depends on B6.

### Recommendations — `routers/recommendations.py`

| # | Endpoint | Notes |
|---|---|---|
| B33 | `POST /api/recommendations/generate` | Check `email_verified` (403/`EMAIL_NOT_VERIFIED`); validate all 5 fields against B17 constants (422/`VALIDATION_ERROR`); rate limit 10/day per `user_id`; call recommendation_service |
| B34 | `GET /api/recommendations/history` | Paginated: `page` (default 1), `limit` (default 20) |
| B35 | `POST /api/recommendations/presets` | Auth required; count existing presets — if ≥ `MAX_PRESETS_PER_USER` return 400/`PRESET_LIMIT_REACHED`; insert `PreferencePreset`; return `PresetOut` |
| B36 | `GET /api/recommendations/presets` | Auth required; return `list[PresetOut]` for current user |
| B37 | `DELETE /api/recommendations/presets/{preset_id}` | Auth required; query `WHERE preset_id AND user_id`; **404** if not found or not owned; delete |

### Movies — `routers/movies.py`

| # | Endpoint | Notes |
|---|---|---|
| B38 | `POST /api/movies/save` | **Batch endpoint** — request body is `SavedMovieListCreate` (`{"movies": [{"tmdb_id": ..., "note": ..., "tag": ...}]}`). For each item: fetch TMDB metadata via tmdb_service if not in Movie table; `INSERT Movie ON CONFLICT DO NOTHING`; insert `SavedMovie`, catch `IntegrityError` → skip silently (duplicate = no-op). Return `{"saved": N, "message": "..."}` where N = count of newly inserted rows. Requires `email_verified` |
| B39 | `GET /api/movies/my-list` | Filter: `genre`, `tag`; sort: `saved_at`\|`rating`\|`year` + `asc`\|`desc`; paginate; auth required |
| B40 | `PATCH /api/movies/saved/{saved_id}` | Query `WHERE saved_id AND user_id`; **404** if not found or not owned; update `note`/`tag` |
| B41 | `DELETE /api/movies/saved/{saved_id}` | Query `WHERE saved_id AND user_id`; **404** if not found or not owned; delete |
| B42 | `GET /api/movies/saved/status?tmdb_ids=...` *(out-of-plan addition)* | Auth required; comma-separated `tmdb_ids`, max 50 (400 if exceeded); query `SavedMovie WHERE user_id=current AND tmdb_id IN ids`; response: `{"496243": {"saved": true, "saved_id": "uuid"}}`; no Redis cache (per-user data) |
| B43 | `GET /api/movies/trending` *(out-of-plan addition)* | No auth; IP rate limit 60/min via B12; proxy TMDB `/trending/movie/week`; Redis cache `tmdb:trending` TTL **5 min**; response `list[MovieOut]` |
| B44 | `GET /api/movies/{tmdb_id}` *(out-of-plan addition)* | No auth; check Movie table first, then proxy TMDB `/movie/{tmdb_id}`; Redis cache `tmdb:movie:{id}` TTL **1 h** (shared with tmdb_service); 404 if TMDB 404; response `MovieOut`. **⚠ Register this route last in the movies router** — FastAPI matches in registration order and `/{tmdb_id}` will shadow any static path (`/my-list`, `/trending`, `/saved/status`) registered after it |

---

## Phase B8 — Error Handling
> Last. Global.

| # | Task |
|---|---|
| B45 | Global exception handler in `main.py` — all errors return `{error, code, message, status}`; map SQLAlchemy / httpx / anthropic exceptions to documented error codes; add `PRESET_LIMIT_REACHED` to error code table |

**Full error code table:**

| Code | Status | Meaning |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `TOKEN_EXPIRED` | 401 | JWT has expired |
| `TOKEN_REVOKED` | 401 | Token is on Redis denylist |
| `INVALID_RESET_TOKEN` | 400 | Reset token missing, expired, or already used |
| `EMAIL_NOT_VERIFIED` | 403 | Account exists but email not verified |
| `UNAUTHORIZED` | 403 | Valid token but no permission for this action |
| `NOT_FOUND` | 404 | Resource does not exist (also used for ownership mismatch) |
| `RATE_LIMITED` | 429 | Too many requests |
| `PRESET_LIMIT_REACHED` | 400 | User has reached the 20-preset limit |
| `AI_ERROR` | 502 | Claude API failed |
| `TMDB_ERROR` | 502 | TMDB API failed |
| `VALIDATION_ERROR` | 422 | Bad request body or invalid preference value |

---

## Dependency Order

```
B1–B9
  → B10, B11 (needs B3 + B4), B12, B13   [parallel]
  → B14–B17                                [parallel with above]
  → B18–B25 (needs B13)
    B26–B29
    B30–B32 (needs B17)                   [all three groups parallel]
  → B33–B44                                [parallel]
  → B45
```

**Critical dependency notes:**
- B11 needs **B3** (Redis client) + **B4** (User model for DB fallback)
- B18, B23, B24 need **B13** (email service)
- B33, B35 need **B17** (constants)
- B21, B25, B28, B29 must all delete `user_pca:{user_id}` from Redis

---

## Rate Limit Reference

| Endpoint | Limit | Key |
|---|---|---|
| `POST /api/auth/login` | 5/min | `request.client.host` |
| `POST /api/auth/resend-verification` | 3/hour | `user_id` |
| `POST /api/auth/forgot-password` | 3/hour | email address |
| `POST /api/recommendations/generate` | 10/day | `user_id` |
| `GET /api/movies/trending` | 60/min | `request.client.host` |
| All other authenticated endpoints | 100/min | `user_id` |

---

*Total: 45 tasks across 8 phases.*
