# Backend Migration Plan — Supabase

## Architecture After Migration

**Supabase owns:** Auth, all database tables, RLS access control.  
**FastAPI owns:** AI pipeline (`/generate`), TMDB proxy (`/trending`, `/{tmdb_id}`), recommendation history read, JWT verification.

```
backend/
├── main.py
├── .env
├── requirements.txt
└── app/
    ├── core/
    │   ├── config.py          # settings only
    │   ├── auth.py            # verify_supabase_token()
    │   └── supabase_client.py # admin client (service role)
    ├── routers/
    │   ├── movies.py          # trending + detail
    │   └── recommendations.py # generate + history
    └── services/
        ├── ai_service.py
        ├── tmdb_service.py
        └── recommendation_service.py
```

The only integration point between frontend and FastAPI is the Supabase JWT:  
Frontend logs in → gets Supabase access token → sends it as `Authorization: Bearer <token>` to FastAPI → FastAPI verifies it using `SUPABASE_JWT_SECRET`.

---

## Phase 1 — Supabase Project Setup

> Do this first and verify independently before touching FastAPI code.

### 1.1 Create the project

Go to [supabase.com](https://supabase.com) → New project. Collect from **Settings → API**:

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Project URL (e.g. `https://xyzxyz.supabase.co`) |
| `SUPABASE_ANON_KEY` | Public anon key (frontend only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret service role key (backend only) |
| `SUPABASE_JWT_SECRET` | **Settings → API → JWT Settings** — NOT the anon/service keys |

### 1.2 Create database tables

Run in **SQL Editor**:

```sql
-- Profiles (mirrors auth.users 1:1)
CREATE TABLE public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name       text,
  created_at timestamptz DEFAULT now()
);

-- Movie cache (populated by FastAPI on demand)
CREATE TABLE public.movies (
  tmdb_id    integer PRIMARY KEY,
  title      text NOT NULL,
  overview   text,
  poster_url text,
  rating     numeric,
  year       integer,
  language   text,
  genres     jsonb,
  created_at timestamptz DEFAULT now()
);

-- Saved movies / wishlist
CREATE TABLE public.saved_movies (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  tmdb_id  integer NOT NULL REFERENCES public.movies ON DELETE CASCADE,
  note     text,
  tag      text,
  saved_at timestamptz DEFAULT now(),
  UNIQUE (user_id, tmdb_id)
);

-- AI recommendation history
CREATE TABLE public.recommendation_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  preferences jsonb,
  ai_response jsonb,
  tmdb_ids    jsonb,
  created_at  timestamptz DEFAULT now()
);

-- Preference presets
CREATE TABLE public.preference_presets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  name        text NOT NULL,
  preferences jsonb,
  created_at  timestamptz DEFAULT now()
);
```

### 1.3 Auto-create profile on signup

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, created_at)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'name',
    now()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 1.4 Enable Row Level Security

```sql
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_movies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_presets  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows" ON public.profiles
  USING (auth.uid() = id);

CREATE POLICY "own rows" ON public.saved_movies
  USING (auth.uid() = user_id);

CREATE POLICY "own rows" ON public.recommendation_logs
  USING (auth.uid() = user_id);

CREATE POLICY "own rows" ON public.preference_presets
  USING (auth.uid() = user_id);
```

### 1.5 Update `.env`

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret-from-jwt-settings
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

TMDB_API_KEY=
DEEPSEEK_API_KEY=
FRONTEND_URL=http://localhost:5500
TMDB_CONCURRENCY=4
AI_CANDIDATE_COUNT=15
```

### 1.6 Phase 1 verification (do before Phase 2)

- [ ] Register a user via Supabase Auth (dashboard → Authentication → Users → Invite / use the frontend form)
- [ ] Query `SELECT * FROM public.profiles` — row auto-created by trigger
- [ ] Log in → copy the JWT → decode at [jwt.io](https://jwt.io) — confirm `email_confirmed_at` is present after verifying email and **absent** (not null) before verification
- [ ] Confirm `sub` field in JWT payload = user UUID in `profiles.id`

---

## Phase 2 — Delete from the Codebase

> Remove everything at once before rewriting anything.

**Backend directories (delete entirely):**
- `backend/app/models/`
- `backend/app/schemas/`
- `backend/app/middleware/`

**Backend files:**
- `backend/app/core/database.py`
- `backend/app/core/security.py`
- `backend/app/core/deps.py`
- `backend/app/core/redis.py`
- `backend/app/routers/auth.py`
- `backend/app/routers/users.py`
- `backend/app/services/email_service.py`
- `backend/alembic/` (entire directory)
- `backend/alembic.ini`
- `backend/init_db.py`

**Frontend files (chat feature dropped):**
- `frontend/Static/js/chat.js`
- `frontend/templates/partials/chat_box.html`
- Remove the `<script src=".../chat.js">` tag from `frontend/templates/Base/Base.html`
- Remove the `{% include "partials/chat_box.html" %}` include from `Base.html`

---

## Phase 3 — Rewrite `app/core/config.py`

Replace the entire file with only what FastAPI needs:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_JWT_SECRET: str
    SUPABASE_SERVICE_ROLE_KEY: str

    TMDB_API_KEY: str = ""
    TMDB_BASE_URL: str = "https://api.themoviedb.org/3"
    TMDB_IMAGE_BASE_URL: str = "https://image.tmdb.org/t/p/w500"
    TMDB_CONCURRENCY: int = 4
    TMDB_CACHE_TTL: int = 3600

    DEEPSEEK_API_KEY: str = ""
    AI_CANDIDATE_COUNT: int = 15

    FRONTEND_URL: str = "http://localhost:5500"

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## Phase 4 — Rewrite `main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routers import movies, recommendations

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(movies.router, prefix="/api/movies")
app.include_router(recommendations.router, prefix="/api/recommendations")
```

---

## Phase 5 — New `app/core/auth.py`

> **Critical:** Supabase omits `email_confirmed_at` entirely from the JWT when email is unconfirmed — it is never `null`, it is absent. Use a key-presence check (`"email_confirmed_at" not in payload`), not a truthiness check (`not payload.get(...)`). Verify the exact field name by decoding a real Supabase JWT at jwt.io before implementation.

```python
import jwt
from fastapi import HTTPException, Request
from app.core.config import settings


def verify_supabase_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    if "email_confirmed_at" not in payload:
        raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")

    return payload  # payload["sub"] = user UUID


def get_user_id_from_request(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth.removeprefix("Bearer ")
    payload = verify_supabase_token(token)
    return payload["sub"]
```

---

## Phase 6 — New `app/core/supabase_client.py`

> **Important:** Use `SUPABASE_SERVICE_ROLE_KEY` here, not `SUPABASE_ANON_KEY`. The service role key bypasses RLS — required for server-side writes where there is no browser session. An anon-key client on the server would fail the `auth.uid() = user_id` RLS policy.

```python
from supabase import create_client, Client
from app.core.config import settings

supabase_admin: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY,
)
```

---

## Phase 7 — Rewrite `routers/movies.py`

Keep only two public (no auth) endpoints. Delete all saved-movie routes — the frontend calls Supabase directly for those.

```python
from fastapi import APIRouter, HTTPException
from app.services.tmdb_service import TMDBService

router = APIRouter()
tmdb = TMDBService()


@router.get("/trending")
async def trending():
    return await tmdb.get_trending()


@router.get("/{tmdb_id}")
async def movie_detail(tmdb_id: int):
    movie = await tmdb.fetch_movie(tmdb_id)
    if not movie:
        raise HTTPException(status_code=404, detail="Not found")
    return movie
```

**Deleted routes** (frontend → Supabase direct):
- `POST /api/movies/save`
- `GET /api/movies/my-list`
- `GET /api/movies/saved/status`
- `PATCH /api/movies/saved/{id}`
- `DELETE /api/movies/saved/{id}`

---

## Phase 8 — Rewrite `routers/recommendations.py`

> **Note on `supabase-py` sync/async:** `.execute()` is synchronous in the current stable SDK. Calling it directly inside an `async` route blocks the event loop. Use `run_in_executor` as shown below, or verify whether the version you pin has native async support (`await client.table(...).execute()`) before choosing an approach.

```python
import asyncio
import time
from fastapi import APIRouter, Request, HTTPException
from app.core.auth import get_user_id_from_request
from app.core.supabase_client import supabase_admin
from app.services.recommendation_service import RecommendationService

router = APIRouter()
service = RecommendationService()

# In-memory rate store — resets on server restart (acceptable for this project)
_rate_store: dict[str, list[float]] = {}
RATE_LIMIT = 10
RATE_WINDOW = 86400  # 24 hours in seconds


def _check_rate_limit(user_id: str) -> None:
    now = time.time()
    timestamps = _rate_store.get(user_id, [])
    timestamps = [t for t in timestamps if now - t < RATE_WINDOW]
    if len(timestamps) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Daily limit reached (10/day)")
    timestamps.append(now)
    _rate_store[user_id] = timestamps


@router.post("/generate")
async def generate(request: Request, body: dict):
    user_id = get_user_id_from_request(request)
    _check_rate_limit(user_id)

    movies = await service.generate(body.get("preferences", {}))

    await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: supabase_admin.table("recommendation_logs").insert({
            "user_id": user_id,
            "preferences": body.get("preferences"),
            "tmdb_ids": [m["tmdb_id"] for m in movies],
        }).execute()
    )

    return {"movies": movies}


@router.get("/history")
async def history(request: Request, page: int = 1, limit: int = 10):
    user_id = get_user_id_from_request(request)
    offset = (page - 1) * limit

    result = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: (
            supabase_admin.table("recommendation_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    )

    return {"items": result.data}
```

**Deleted routes** (frontend → Supabase direct):
- `POST /api/recommendations/presets`
- `GET /api/recommendations/presets`
- `DELETE /api/recommendations/presets/{id}`

---

## Phase 9 — Update Services

### `services/tmdb_service.py`

Remove all Redis imports and `get_redis()` calls. Replace with an in-memory TTL cache using `(data, expire_ts)` tuples.

> **Important:** A plain `dict` without stored timestamps has no expiry and grows forever. Always store the expiry timestamp alongside the data.

```python
import time

_cache: dict[int, tuple[dict, float]] = {}
_TRENDING_KEY = -1
_TTL = 3600  # seconds


def _cache_get(key: int):
    entry = _cache.get(key)
    if entry and time.time() < entry[1]:
        return entry[0]
    return None


def _cache_set(key: int, value: dict, ttl: int = _TTL):
    _cache[key] = (value, time.time() + ttl)
```

Replace all `await redis.get(...)` / `await redis.set(...)` calls with `_cache_get(key)` / `_cache_set(key, value)`.

### `services/recommendation_service.py`

Remove the `db: Session` parameter and all SQLAlchemy ORM inserts from `generate()`. The method returns only the enriched movie list — the router handles the Supabase write.

### `services/ai_service.py`

No changes required.

---

## Phase 10 — Update `requirements.txt`

**Remove these packages:**
```
sqlalchemy
alembic
passlib[bcrypt]
bcrypt
aiosmtplib
python-jose[cryptography]
redis
anthropic
```

**Keep these packages:**
```
fastapi
uvicorn[standard]
httpx
openai
python-dotenv
pydantic
pydantic-settings
```

**Add these packages:**
```
PyJWT
supabase
```

> After editing, run `pip install -r requirements.txt` and confirm no import errors on startup.

---

## Phase 11 — Frontend: Supabase JS SDK

### 11.1 `Base.html`

- Add Supabase JS CDN **before** all other `<script>` tags:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  ```
- Remove the `<script src=".../chat.js">` tag
- Remove the `{% include "partials/chat_box.html" %}` include

### 11.2 New `frontend/Static/js/auth.js`

> **Note:** `SUPABASE_URL` and `SUPABASE_ANON_KEY` are intentionally public-facing values — the anon key is designed to be exposed in browser code and is safe to commit. The `SUPABASE_SERVICE_ROLE_KEY` is different: it must never appear in frontend code or a public repository.

```javascript
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

supabase.auth.onAuthStateChange((event, session) => {
    const loginBtn = document.getElementById("login-btn");
    const userDisplay = document.getElementById("user-display");

    if (session) {
        loginBtn?.classList.add("hidden");
        if (userDisplay) userDisplay.textContent = session.user.email;
    } else {
        loginBtn?.classList.remove("hidden");
        if (userDisplay) userDisplay.textContent = "";
    }
});
```

Load this file in `Base.html` after the Supabase CDN script.

### 11.3 Login modal (`login.html`)

Add submit handler to the login form:

```javascript
document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        document.getElementById("login-error").textContent = error.message;
    } else {
        document.getElementById("login-modal").classList.add("hidden");
    }
});
```

### 11.4 Signup modal (`signup.html`)

```javascript
document.getElementById("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("signup-name").value;
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
    });

    if (error) {
        document.getElementById("signup-error").textContent = error.message;
    } else {
        document.getElementById("signup-modal").innerHTML =
            "<p>Check your email to confirm your account.</p>";
    }
});
```

### 11.5 Logout (nav button)

```javascript
document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.reload();
});
```

### 11.6 `api.js` — auth header helper

Add this function to `api.js`:

```javascript
async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return {};
    return { Authorization: `Bearer ${session.access_token}` };
}
```

Use `getAuthHeaders()` in all calls to FastAPI (`/api/recommendations/generate`, `/api/recommendations/history`).

### 11.7 Frontend → Supabase direct calls

These operations call Supabase directly using the anon client (RLS enforces access):

**Save a movie:**
```javascript
await supabase.from("saved_movies").insert({ tmdb_id, note, tag });
```

**Get wishlist:**
```javascript
const { data } = await supabase.from("saved_movies").select("*, movies(*)");
```

**Remove from wishlist:**
```javascript
await supabase.from("saved_movies").delete().eq("id", savedId);
```

**Save a preset:**
```javascript
await supabase.from("preference_presets").insert({ name, preferences });
```

**Load presets:**
```javascript
const { data } = await supabase.from("preference_presets").select("*").order("created_at");
```

**Delete a preset:**
```javascript
await supabase.from("preference_presets").delete().eq("id", presetId);
```

---

## Verification Checklist

Run in order. Confirm each before proceeding to the next phase.

| # | Check | Expected result |
|---|---|---|
| 1 | Query `SELECT * FROM public.profiles` in Supabase SQL editor | Table exists |
| 2 | Register user → query profiles | Row auto-created by trigger |
| 3 | Verify email → decode JWT at jwt.io | `email_confirmed_at` present |
| 4 | Decode JWT of unverified user | `email_confirmed_at` absent (not null) |
| 5 | `GET /api/movies/trending` (no token) | 200 + TMDB data |
| 6 | `GET /api/movies/{tmdb_id}` (no token) | 200 + movie data |
| 7 | `POST /api/recommendations/generate` with valid Bearer token | 200 + row in `recommendation_logs` |
| 8 | `GET /api/recommendations/history` with same token | 200 + list containing that row |
| 9 | `POST /api/recommendations/generate` 11× in 24 h | 11th request → 429 |
| 10 | Call `/generate` with unverified-email token | 403 `EMAIL_NOT_VERIFIED` |
| 11 | Call any protected endpoint with expired/invalid token | 401 |
| 12 | Save movie from frontend | Row visible in Supabase `saved_movies` table editor |
| 13 | Save preset from frontend | Row visible in `preference_presets` table editor |

---

## Key Notes

| Topic | Note |
|---|---|
| `SUPABASE_JWT_SECRET` | From **Settings → API → JWT Settings**. Not the anon key. Not the service_role key. Using the wrong value causes all JWT verifications to fail with `InvalidSignatureError`. |
| `email_confirmed_at` check | Use `"email_confirmed_at" not in payload`. The field is absent when unconfirmed — never `null`. A truthiness check on `.get()` also works but is less explicit. |
| Service role client | `supabase_admin` uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS. Never expose this key to the frontend. |
| `supabase-py` sync/async | `.execute()` is synchronous in the current stable SDK. Use `asyncio.run_in_executor` in async routes (shown in Phase 8) or verify async support in the version you pin. |
| In-memory rate limiter | `_rate_store` resets on server restart — acceptable for a university project. |
| In-memory TMDB cache | `_cache` also resets on restart and has no max size. Add an LRU bound if the server runs for extended periods. |
