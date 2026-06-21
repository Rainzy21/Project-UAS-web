# Security & Deployment Audit — Project-UAS-web (SJ MovieReview)

**Original audit branch:** `feat/full-mvp-stabilization`  
**Original audit SHA:** `57cb92078bfc48ee4b643c3815258ecb291137f9`  
**Original audit date:** 2026-06-19  
**Verification pass date:** 2026-06-22 (initial + re-verified same day after remediation commit)  
**Remediation pass date:** 2026-06-22 (§6.5 code fixes applied in working tree)  
**Verification scope:** Cross-check every §2 finding against the current working tree (uncommitted changes included; not yet on `main`)  
**Method:** Manual code review + targeted grep/static analysis (no dynamic penetration test, no live Supabase/TLS verification)

> **Reproducibility note:** The original audit pinned commit `57cb920`. The **2026-06-22 verification pass** reviewed the current working tree, which includes substantial remediation work not yet committed. Item statuses in §6 reflect code as it exists today, not the original SHA.

---

## 1. Executive Summary

### Original verdict (2026-06-19): **Not ready for production deployment**

### Current verdict (2026-06-22 verification): **⚠️ Almost — code remediation largely complete; operator actions remain**

Most P0/P1 code fixes are implemented in the working tree: secrets removed from `config.js` content, XSS sinks refactored, chat endpoint removed, user-scoped Supabase client on request hot paths, Redis rate limiting, JWT issuer validation, security headers/CSP, Docker/CI/runbook, and expanded tests. **Remaining gaps before public deploy:**

1. **SEC-01 (critical, operator):** Rotate exposed TMDB/Supabase keys and scrub git history — secrets still exist in committed history at `57cb920`. **`config.js` is untracked** (`git rm --cached` staged; commit pending); local copy remains gitignored.
2. **SEC-06 / B5 / B6 (operator):** Apply `supabase_migrations/002_movies_rls_lockdown.sql` and `003_retention_cleanup.sql` on the live Supabase project.
3. **SEC-16b, DEPLOY-07, TLS-01/02 (operator):** Configure Supabase Auth rate limits, TLS certs, and production env vars on the hosting platform.
4. **Accepted P2 partials (dev-simple):** Tailwind JIT CDN has no SRI (documented exception, no build step); IDOR/deletion tests are mocked with manual staging smoke in runbook; optional Sentry activates only when `SENTRY_DSN` is set.

See **§6 Verification Pass** for the full item-by-item status.

**Readiness tiers (post-verification):**

| Environment | Assessment |
|-------------|------------|
| Local dev (trusted operator) | **Ready** — `.env` + local `config.js` + schema applied |
| Staging / public beta | **⚠️ Almost** — complete §6 Human Action Checklist first |
| Production | **⚠️ Almost** — P2 items (monitoring, retention job, fuller test suite) recommended before sustained traffic |

---

## 2. Issue List

Issues are grouped by audit dimension. Each entry includes **location**, **severity**, **description**, and **recommended fix**.

> **Remediation snippets:** Several fixes below include example code (SEC-02, SEC-08, SEC-10, etc.). These are **illustrative** — they were not executed or unit-tested as part of this audit. A second reviewer should verify they compile and match your Supabase JWT issuer URL, Pydantic/FastAPI versions, and frontend module layout before merge. Security-critical one-liners (JWT `issuer`, chat history model) are especially easy to get subtly wrong.

---

### 2.1 Code Quality & Logic

#### CQ-01 — `Api.delete()` may omit `Content-Type` on JSON body
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`frontend/Static/js/api.js`](../frontend/Static/js/api.js) lines 32–40, 102; [`frontend/Static/js/profile.js`](../frontend/Static/js/profile.js) line 224 |
| **Description** | `request()` sets `Content-Type: application/json` only when the third `body` argument is truthy. `Api.delete()` passes the body via `options.body` (already stringified). FastAPI may fail to parse `DeleteAccountBody`, causing account deletion to fail silently or behave inconsistently. |
| **Fix** | Pass body as the third argument: `request('DELETE', path, bodyObj)` or set `Content-Type` when `options.body` is present. |

#### CQ-02 — History pagination has no bounds
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/routers/recommendations.py`](../backend/app/routers/recommendations.py) lines 114–116 |
| **Description** | `page` and `limit` query params are unvalidated. `page=0` or negative values produce invalid SQL offsets; very large `limit` triggers unbounded TMDB hydration per history row. |
| **Fix** | Use FastAPI `Query`: `page: int = Query(1, ge=1)`, `limit: int = Query(20, ge=1, le=100)`. |

#### CQ-03 — Sequential TMDB hydration in history endpoint
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/routers/recommendations.py`](../backend/app/routers/recommendations.py) lines 140–145 |
| **Description** | For each history item, `tmdb_service.fetch_all()` is awaited in a serial `for` loop. With 20 sessions × 10 movies, this creates latency spikes and TMDB quota pressure. |
| **Fix** | Batch-fetch unique `tmdb_id`s across all items in one `fetch_all` call, then map back to sessions. |

#### CQ-04 — `RecommendationPreferences` allows partial payloads until router check
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/app/routers/recommendations.py`](../backend/app/routers/recommendations.py) lines 42–47, 61–81 |
| **Description** | Fields are `Optional[str]`; `_preferences_dict()` raises 422 if fewer than 5 keys. Works, but Pydantic could reject earlier with clearer field-level errors. |
| **Fix** | Make all five fields required on `RecommendationPreferences` (non-optional `str`). |

#### CQ-05 — Password verification creates real Supabase sessions
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/app/routers/users.py`](../backend/app/routers/users.py) lines 54–69 |
| **Description** | `_verify_current_password()` calls `sign_in_with_password` to validate credentials. This creates a real auth session that is discarded, potentially polluting Supabase auth logs and session limits. |
| **Fix** | Use Supabase Admin API password verification if available, or document and monitor side effects. |

#### CQ-06 — Legacy Django templates still in repo
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`frontend/templates/`](../frontend/templates/) |
| **Description** | Old Django template stack (`login.html`, `signup.html`, etc.) is unused by the static app but may confuse maintainers or be accidentally served. |
| **Fix** | Remove or move to an `archive/` folder outside the deploy artifact. |

#### CQ-07 — `chat.js` not wired but present
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`frontend/Static/js/chat.js`](../frontend/Static/js/chat.js) |
| **Description** | Chat client exists; no HTML page includes it. Dead code path unless intentionally kept for future use. |
| **Fix** | Wire with auth + CSP-safe rendering, or delete until needed. |

---

### 2.2 Security

#### SEC-01 — **CRITICAL: Real secrets committed in tracked `config.js`**
| | |
|---|---|
| **Severity** | **critical** |
| **Location** | [`frontend/Static/js/config.js`](../frontend/Static/js/config.js) lines 5–8 (file is **git-tracked**) |
| **Description** | Production-like credentials are hardcoded and committed: |
| | ```javascript |
| | TMDB_API_KEY: '<redacted — was committed in config.js>', |
| | SUPABASE_URL: 'https://<project-ref>.supabase.co', |
| | SUPABASE_ANON_KEY: '<redacted — JWT anon key>', |
| | ``` |
| | Anyone with repo access (or if pushed to GitHub) can extract keys. TMDB key can be abused for quota exhaustion. Supabase anon key is expected in frontend but must be paired with strict RLS — combined with SEC-06 this is worse. |
| **Fix** | 1) **Rotate TMDB key immediately** in TMDB dashboard. 2) Replace tracked file with placeholders and inject at deploy time:

```javascript
// config.example.js — commit this; copy to config.js locally (gitignored)
window.APP_CONFIG = {
    API_BASE: '__API_BASE__',           // replaced by build script / nginx
    TMDB_API_KEY: '',                   // remove entirely; proxy via backend in prod
    SUPABASE_URL: '__SUPABASE_URL__',
    SUPABASE_ANON_KEY: '__SUPABASE_ANON_KEY__',
};
```

3) Add `frontend/Static/js/config.js` to `.gitignore`. 4) Run `git filter-repo` or BFG if history contains secrets. 5) Review Supabase anon key exposure; rotate if repo was public.

#### SEC-02 — Stored/reflected XSS in recommendation results
| | |
|---|---|
| **Severity** | **high** |
| **Location** | [`frontend/Static/js/recommendations.js`](../frontend/Static/js/recommendations.js) lines 354–364 |
| **Description** | `renderResults()` builds cards with `innerHTML`, interpolating `m.title`, `m.poster_url`, `m.tmdb_id`, and HTML `reason` without escaping. Malicious backend data, poisoned TMDB cache, or AI prompt injection can inject `<script>` or event handlers. |
| **Fix** | Replace template-string `innerHTML` with safe DOM construction. Example refactor for the title and poster (apply same pattern to meta/reason): |

```javascript
// shared helper (recommendations.js or utils.js)
function safePosterUrl(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' || !u.hostname.endsWith('image.tmdb.org')) return null;
        return u.href;
    } catch { return null; }
}

// inside renderResults — instead of card.innerHTML = `...${m.title}...`
const link = document.createElement('a');
link.href = `detail.html?id=${encodeURIComponent(Number(m.tmdb_id))}`;
link.className = 'rec-result-link';

const titleEl = document.createElement('div');
titleEl.className = 'rec-result-title';
titleEl.textContent = m.title || 'Unknown';  // never innerHTML for API strings

const posterSrc = safePosterUrl(m.poster_url);
if (posterSrc) {
    const img = document.createElement('img');
    img.className = 'rec-result-poster';
    img.src = posterSrc;
    img.alt = '';
    img.loading = 'lazy';
    link.appendChild(img);
}
```

Also extract a shared `escapeHtml()` (already present in `history.js`) and use it anywhere HTML formatting is intentional.

#### SEC-03 — XSS via preset names
| | |
|---|---|
| **Severity** | **high** |
| **Location** | [`frontend/Static/js/recommendations.js`](../frontend/Static/js/recommendations.js) ~line 437 |
| **Description** | `preset.name` from API is injected into `innerHTML` unescaped in preset chip buttons. Stored XSS for the account owner. |
| **Fix** | Use `textContent` or shared `escapeHtml()` helper. |

#### SEC-04 — XSS via unescaped poster URLs
| | |
|---|---|
| **Severity** | **high** |
| **Location** | [`frontend/Static/js/history.js`](../frontend/Static/js/history.js) lines 94–96; [`frontend/Static/js/my-list.js`](../frontend/Static/js/my-list.js) ~lines 108–110 |
| **Description** | `m.poster_url` placed in `src="${...}"` without URL validation. Titles use `escapeHtml()` in history, but URLs do not — `javascript:` or quote-breakout payloads possible if DB is poisoned. |
| **Fix** | Allowlist URL host/scheme before assigning to `img.src`; prefer DOM APIs. |

#### SEC-05 — XSS in movie detail page (cast / info)
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`frontend/detail.html`](../frontend/detail.html) lines 200–206, 226 |
| **Description** | TMDB `c.name`, `c.character`, and info values injected via `innerHTML`. TMDB is semi-trusted but defense-in-depth is missing. |
| **Fix** | Use `textContent` for all dynamic strings; create `img` elements programmatically. |

#### SEC-06 — Permissive `movies` table write policies
| | |
|---|---|
| **Severity** | **high** |
| **Location** | [`supabase_fix_wishlist.sql`](../supabase_fix_wishlist.sql) lines 36–49; fallback in [`frontend/detail.html`](../frontend/detail.html) lines 251–255, [`frontend/Static/js/recommendations.js`](../frontend/Static/js/recommendations.js) lines 310–324 |
| **Description** | Fix script adds `WITH CHECK (true)` INSERT/UPDATE on `public.movies` for all authenticated users. Any logged-in user can upsert arbitrary `poster_url`/`title` into the shared cache, which is then rendered unsafely (SEC-02/04). Base [`supabase_schema.sql`](../supabase_schema.sql) lines 12–22 creates `movies` without RLS. |
| **Fix** | Use only the `save_movie_to_wishlist` SECURITY DEFINER RPC; remove client-side `movies` upsert fallback. Add strict RLS (read-only for clients). Sanitize all rendered fields regardless. |

#### SEC-07 — Unauthenticated AI chat endpoint (cost abuse)
| | |
|---|---|
| **Severity** | **high** |
| **Location** | [`backend/app/routers/chat.py`](../backend/app/routers/chat.py) lines 112–115 |
| **Description** | `POST /api/chat` requires no JWT. Rate limit is 30 req/min per IP, stored in process memory. Attackers can exhaust Gemini/DeepSeek quotas and incur billing. |
| **Fix** | Require `get_user_id_from_request()`; add per-user daily caps; use Redis/shared rate store; consider removing endpoint if chat is not shipped. |

#### SEC-08 — Prompt injection via client-controlled chat history
| | |
|---|---|
| **Severity** | **high** |
| **Location** | [`backend/app/routers/chat.py`](../backend/app/routers/chat.py) lines 100–108, 69–71 |
| **Description** | `ChatMessage.history` is `list[dict]`. Clients can inject fake `assistant` role messages to bypass system prompt. Only `system` role is blocked. |
| **Fix** | Replace `list[dict]` with a typed model and reject non-user roles from the client: |

```python
from pydantic import BaseModel, Field
from typing import Literal

class HistoryMessage(BaseModel):
    role: Literal["user"]  # never accept "assistant" or "system" from client
    content: str = Field(..., max_length=500)

class ChatMessage(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=6)
```

Store assistant replies server-side (session/DB) if multi-turn chat is needed.

#### SEC-09 — Service-role Supabase bypasses all RLS
| | |
|---|---|
| **Severity** | **critical** |
| **Location** | [`backend/app/core/supabase_client.py`](../backend/app/core/supabase_client.py) lines 6–9; used in [`recommendations.py`](../backend/app/routers/recommendations.py), [`users.py`](../backend/app/routers/users.py) |
| **Description** | Backend uses `SUPABASE_SERVICE_ROLE_KEY` for all DB writes/reads. RLS policies in `supabase_schema.sql` are **completely bypassed** on the server path. Any missing `.eq("user_id", user_id)` filter becomes cross-tenant data access. **If the backend process or service-role key is compromised, the attacker gets unrestricted read/write on the entire database** — equivalent to DBA access. This is a tier-1 architectural risk, comparable in blast radius to SEC-01 (secret exposure). |
| **Fix** | Short term: audit every service-role query for mandatory `user_id` scoping; add IDOR integration tests. Medium term: pass the user's JWT to a user-scoped Supabase client and let RLS enforce ownership on `saved_movies`, `recommendation_logs`, and `preference_presets`. Reserve `supabase_admin` only for true admin ops (`delete_user`, `get_user_by_id`). Long term: eliminate service-role from request hot paths entirely. |

#### SEC-10 — JWT missing issuer (`iss`) validation
| | |
|---|---|
| **Severity** | **high** |
| **Location** | [`backend/app/core/auth.py`](../backend/app/core/auth.py) lines 34–39 |
| **Description** | HS256 decode checks `audience="authenticated"` but not `issuer`. Tokens from another Supabase project with a leaked/reused JWT secret could be accepted. |
| **Fix** | One-line change in the HS256 branch (or always verify via Supabase API): |

```python
payload = jwt.decode(
    token,
    settings.SUPABASE_JWT_SECRET,
    algorithms=["HS256"],
    audience="authenticated",
    issuer=f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1",
)
```

#### SEC-11 — Internal exception details leaked to clients
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/routers/users.py`](../backend/app/routers/users.py) lines 100, 127, 163, 189; [`backend/app/routers/chat.py`](../backend/app/routers/chat.py) lines 155–158; [`backend/app/services/ai_service.py`](../backend/app/services/ai_service.py) lines 369–373, 383 |
| **Description** | HTTP responses include raw exception strings and AI output snippets (`content[:200]`). Can reveal provider errors, stack hints, or model behavior. |
| **Fix** | Log full errors server-side; return generic `{code, message}` to clients. Never include raw AI output in errors. |

#### SEC-12 — Auth tokens persist in URL hash after OAuth/recovery
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`frontend/auth-callback.html`](../frontend/auth-callback.html) lines 74–94, 114–116; [`frontend/reset-password.html`](../frontend/reset-password.html) lines 74–88 |
| **Description** | After `setSession()`, redirect occurs without clearing `#access_token=...&refresh_token=...`. Tokens remain in browser history and may leak via Referer on subresource requests. |
| **Fix** | After successful `setSession()`, strip the hash **before** redirect:

```javascript
// auth-callback.html — after setSession succeeds
history.replaceState(null, '', location.pathname + location.search);
const redirect = sessionStorage.getItem('postAuthRedirect') || '/';
sessionStorage.removeItem('postAuthRedirect');
window.location.replace(redirect);
```

#### SEC-13 — Open redirect via `postAuthRedirect`
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`frontend/Static/js/auth.js`](../frontend/Static/js/auth.js) lines 162–167; [`frontend/auth-callback.html`](../frontend/auth-callback.html) lines 91–93 |
| **Description** | `sessionStorage.postAuthRedirect` is used as `window.location.href` / `location.replace` without same-origin validation. Values like `//evil.com` cause off-site redirect after login. |
| **Fix** | Allow only same-origin relative paths:

```javascript
function safeRedirectPath(stored) {
    if (!stored || typeof stored !== 'string') return '/';
    if (!stored.startsWith('/') || stored.startsWith('//')) return '/';
    if (/^https?:/i.test(stored)) return '/';
    return stored;
}
// use: window.location.href = safeRedirectPath(sessionStorage.getItem('postAuthRedirect'));
```

#### SEC-14 — JWT/session in `localStorage` (XSS amplification)
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`frontend/Static/js/auth.js`](../frontend/Static/js/auth.js) lines 113–115; [`frontend/Static/js/api.js`](../frontend/Static/js/api.js) lines 19–27 |
| **Description** | Supabase SPA pattern stores refresh tokens in `localStorage`. Combined with XSS sinks (SEC-02–05), any script injection grants full account takeover. Legacy `app_access_token` fallback adds another path. |
| **Fix** | Eliminate XSS first (priority). Consider BFF with httpOnly cookies for production; remove `app_access_token` fallback. **CSRF note:** the current Bearer-token SPA model is largely CSRF-immune (tokens are not sent automatically by the browser). If you implement the httpOnly-cookie BFF path, add CSRF protection — e.g. `SameSite=Strict` on session cookies and/or double-submit CSRF tokens on state-changing requests.

#### SEC-15 — Sensitive account ops allowed before email verification
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/routers/users.py`](../backend/app/routers/users.py) lines 76, 107, 134, 170; [`backend/app/routers/recommendations.py`](../backend/app/routers/recommendations.py) preset endpoints use `require_verified=False` |
| **Description** | Password change, account delete, and preset CRUD work with unverified email. Only `/api/recommendations/generate` requires verification by default. Attacker with signup token (before email click) can mutate account. |
| **Fix** | Set `require_verified=True` for destructive/sensitive endpoints unless explicitly documented otherwise. |

#### SEC-16 — Weak password policy (6 chars minimum)
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/routers/users.py`](../backend/app/routers/users.py) lines 136–138; [`frontend/Static/js/auth.js`](../frontend/Static/js/auth.js) lines 462–464; [`frontend/reset-password.html`](../frontend/reset-password.html) lines 39, 110–112 |
| **Description** | Minimum 6 characters, no complexity. No rate limiting on failed password verification attempts in application code. **Session revocation on password change is not implemented** — after `PATCH /me/password`, existing JWTs on other devices remain valid until expiry. Compounds with SEC-16a (account enumeration) and SEC-16b (login rate limits, unverified) for targeted credential attacks. |
| **Fix** | Align with Supabase Auth policy (≥8–12 chars, complexity); rate-limit `_verify_current_password` per user/IP. **After a successful password change**, invalidate other sessions so a stolen token cannot persist on other devices: |

```python
# users.py — after supabase_admin.auth.admin.update_user_by_id(..., {"password": new_pw})
await asyncio.to_thread(
    supabase_admin.auth.admin.sign_out,
    user_id,
    "others",  # keep current session if you pass its JWT; or "global" to revoke all
)
```

(Supabase Admin API: `signOut(user_id, scope='others'|'global'|'local'`.) Apply the same pattern after `reset-password.html` / Supabase `updateUser({ password })` if sessions should not survive a reset. Verify exact Python SDK method name against your `supabase` client version.

#### SEC-16b — Login brute-force rate limiting (Supabase Dashboard — not verified live)
| | |
|---|---|
| **Severity** | **low** (verification item) |
| **Location** | Supabase Auth `POST /auth/v1/token` (used by [`frontend/Static/js/auth.js`](../frontend/Static/js/auth.js) `signInWithPassword`); not configured in this repo |
| **Description** | SEC-16 covers app-side password policy and `_verify_current_password`, but **does not confirm** whether Supabase Dashboard rate limits are enabled for sign-in / token grants. Supabase provides Auth rate limiting (per IP / per user); if disabled or set too high, online password guessing against the login form is easier. This audit did not verify Dashboard settings (see §5). |
| **Fix** | Before go-live, confirm in **Supabase Dashboard → Authentication → Rate Limits** (or project Auth settings): sign-in/token endpoint limits are enabled with sensible thresholds. Document chosen values in the deployment runbook. Complements SEC-16a generic error messages. |

#### SEC-16a — Account enumeration via auth error messages
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`frontend/Static/js/auth.js`](../frontend/Static/js/auth.js) lines 238–243 (`signupErrorMessage`); lines 230–235 (`loginErrorMessage`) |
| **Description** | **Signup:** duplicate-email errors are mapped to an explicit message — *"This email is already linked to an account"* — confirming registration status to anyone who can submit an email. **Login:** primary path uses generic *"Invalid email or password"* (good), but non-credential errors fall through to raw `error.message` from Supabase, which may differ by account state. **Forgot password:** flow always shows success after submit (good — no enumeration in UI); relies on Supabase not leaking via timing. |
| **Fix** | Use the same generic copy for signup conflicts as login: *"If this email is registered, check your inbox or sign in."* Never surface provider-specific duplicate-user strings. Log detailed errors server-side only. Optionally enable Supabase Auth rate limiting on sign-up/sign-in endpoints. |

#### SEC-17 — TMDB API key in query string (log exposure)
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/app/services/tmdb_service.py`](../backend/app/services/tmdb_service.py) lines 54–57; [`frontend/Static/js/api.js`](../frontend/Static/js/api.js) line 67; [`frontend/Static/js/landing.js`](../frontend/Static/js/landing.js) line 54 |
| **Description** | API keys passed as `?api_key=` query params appear in proxy/access logs. |
| **Fix** | Use TMDB Bearer token header auth; proxy all TMDB calls through backend in production. |

#### SEC-18 — No Content Security Policy or Subresource Integrity
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | All HTML pages (e.g. [`frontend/index.html`](../frontend/index.html) lines 9–10) |
| **Description** | Tailwind CDN, Font Awesome, Supabase JS loaded without `integrity=` attributes. No CSP meta/header. CDN compromise = full site script injection. CSP also missing **`frame-ancestors`** (see SEC-21). |
| **Fix** | Add strict CSP via reverse proxy or meta tag. Example production baseline (tune per asset host): |

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' https://image.tmdb.org data:; connect-src 'self' https://*.supabase.co http://localhost:8000; frame-ancestors 'none'; base-uri 'self';
```

Add SRI hashes for CDN scripts; self-host critical assets where possible.

#### SEC-19 — OpenAPI `/docs` exposed by default
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/app/main.py`](../backend/app/main.py) lines 6–19 |
| **Description** | FastAPI Swagger UI available in production unless disabled. Increases attack surface mapping. |
| **Fix** | Set `docs_url=None, redoc_url=None` when `ENV=production`. |

#### SEC-20 — CORS allows all methods and headers
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/app/main.py`](../backend/app/main.py) lines 8–14 |
| **Description** | `allow_methods=["*"]`, `allow_headers=["*"]`. Origin is restricted (good), but broader than necessary. |
| **Fix** | Restrict to `GET, POST, PATCH, DELETE` and `Authorization, Content-Type`. |

#### SEC-21 — Clickjacking protection missing
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/main.py`](../backend/app/main.py); all frontend HTML pages (auth modal on every page) |
| **Description** | No `X-Frame-Options`, `Content-Security-Policy: frame-ancestors`, or equivalent. The app exposes login/signup modals and account actions — a reasonable clickjacking target (e.g. invisible iframe overlay tricking users into OAuth or "Save to My List" clicks). |
| **Fix** | Set on **both** static frontend host and API responses: |

```
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none';
```

In FastAPI, add middleware:

```python
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
```

#### SEC-22 — Hardcoded Supabase project ref in deploy script
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`scripts/apply_supabase_schema.sh`](../scripts/apply_supabase_schema.sh) line 7 |
| **Description** | `PROJECT_REF="<hardcoded-ref>"` was hardcoded (since fixed). Wrong project if env differs; couples script to one tenant. |
| **Fix** | Read project ref from `.env` (`SUPABASE_URL` parse) or require `SUPABASE_PROJECT_REF` env var. |

---

### 2.13 SSRF Assessment

#### SSRF-01 — No user-controlled outbound URL surface identified (TMDB)
| | |
|---|---|
| **Severity** | **informational (negative finding)** |
| **Location** | [`backend/app/services/tmdb_service.py`](../backend/app/services/tmdb_service.py) lines 54–57, 82–85; [`backend/app/routers/movies.py`](../backend/app/routers/movies.py) lines 12–14; [`backend/app/core/config.py`](../backend/app/core/config.py) line 14 |
| **Description** | Server-side HTTP exits only to TMDB. **`TMDB_BASE_URL` is hardcoded in settings** (`https://api.themoviedb.org/3`), not derived from user input. Movie paths use **`tmdb_id: int`** (FastAPI path param / validated int from AI pipeline) — not arbitrary URLs. Trending uses a fixed path (`/trending/movie/week`). **No SSRF surface identified** in the current backend TMDB integration. |
| **Caveat** | If future code accepts poster URLs, webhook callbacks, or "fetch this URL" features from users, re-assess. Frontend direct TMDB calls ([`frontend/Static/js/api.js`](../frontend/Static/js/api.js)) are browser-origin requests, not server SSRF. AI providers (Gemini/DeepSeek) receive prompt text, not URLs to fetch — monitor for tool-use / URL-fetch features if added later. |
| **Fix** | No change required today. Document invariant: "all server outbound HTTP must use allowlisted base URLs + typed IDs." Add code review checklist item for new httpx call sites. |

---

### 2.3 Environment & Configuration

#### ENV-01 — Dev API URL baked into frontend
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`frontend/Static/js/config.js`](../frontend/Static/js/config.js) line 5; fallback in [`frontend/Static/js/api.js`](../frontend/Static/js/api.js) line 10 |
| **Description** | `API_BASE: 'http://localhost:8000'`. HTTPS frontend calling HTTP API causes mixed-content blocks in production. |
| **Fix** | Inject at deploy from environment; use same-origin `/api` reverse proxy in production. |

#### ENV-02 — `.env` correctly gitignored; `.env.example` is safe
| | |
|---|---|
| **Severity** | **informational (positive)** |
| **Location** | [`.gitignore`](../.gitignore) line 14; [`.env.example`](../.env.example) |
| **Description** | `.env` is ignored. Example file uses placeholders only. |
| **Fix** | Add warning in `.env.example`: never commit `SUPABASE_SERVICE_ROLE_KEY`; rotate if leaked. |

#### ENV-03 — No environment separation (dev/staging/prod)
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/core/config.py`](../backend/app/core/config.py); [`frontend/Static/js/config.js`](../frontend/Static/js/config.js) |
| **Description** | Single config path; no `ENV`/`DEBUG` flag to toggle docs, CORS, logging verbosity. |
| **Fix** | Add `ENVIRONMENT` setting; branch behavior for prod vs dev. |

#### ENV-04 — `backend/dump.rdb` present (Redis dump, untracked)
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/dump.rdb`](../backend/dump.rdb) (untracked; now in `.gitignore`) |
| **Description** | Local Redis snapshot in repo tree. Could contain sensitive cached data if committed. |
| **Fix** | Ensure `.gitignore` covers it (done); delete local file if unused. |

---

### 2.4 Dependencies

#### DEP-01 — No Python lockfile
| | |
|---|---|
| **Severity** | **high** |
| **Location** | [`backend/requirements.txt`](../backend/requirements.txt) |
| **Description** | Most packages unpinned (`fastapi`, `uvicorn`, `openai`, `PyJWT`, `pydantic`). Only `supabase==2.9.1`, `httpx`, `websockets` constrained. Reproducible builds and CVE tracking are impossible. |
| **Fix** | Generate `requirements.lock` via `pip freeze` or migrate to Poetry/uv with lockfile. Run `pip-audit` in CI. |

#### DEP-02 — Unpinned major dependencies may pull breaking/vulnerable versions
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/requirements.txt`](../backend/requirements.txt) lines 1–17 |
| **Description** | `openai`, `fastapi`, `PyJWT` without upper bounds. Supply-chain drift on every fresh install. |
| **Fix** | Pin with compatible ranges; automate Dependabot/Renovate. |

#### DEP-03 — Frontend uses CDN scripts (no package lock)
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | HTML pages loading `@supabase/supabase-js@2`, Tailwind CDN, Font Awesome |
| **Description** | No npm lockfile; CDN tags can change. `@2` is a floating major range. |
| **Fix** | Pin exact CDN versions with SRI; or bundle via npm/vite with lockfile. |

#### DEP-04 — No duplicate dependency audit run
| | |
|---|---|
| **Severity** | **low** |
| **Description** | No evidence of `pip-audit`, `npm audit`, or Snyk in CI. |
| **Fix** | Add security scanning to CI pipeline. |

---

### 2.5 Error Handling & Logging

#### ERR-01 — Broad `except Exception` masks auth failures
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/core/auth.py`](../backend/app/core/auth.py) lines 65–67 |
| **Description** | Non-JWT exceptions (e.g. misconfigured `SUPABASE_JWT_SECRET`) return generic 401, making ops debugging hard while still not leaking details to client (acceptable tradeoff if logged). |
| **Fix** | Log exception type; distinguish config errors in logs (alert ops). |

#### ERR-02 — Missing-table errors silently swallowed for recommendation logs
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/app/routers/recommendations.py`](../backend/app/routers/recommendations.py) lines 101–106 |
| **Description** | If `recommendation_logs` table missing, generate succeeds but history is empty. User gets no indication schema is incomplete. |
| **Fix** | Return warning header or log metric; fail loudly in non-production if schema missing. |

#### ERR-03 — Frontend error messages in `innerHTML`
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`frontend/Static/js/history.js`](../frontend/Static/js/history.js) line 35; [`frontend/Static/js/my-list.js`](../frontend/Static/js/my-list.js) ~line 85 |
| **Description** | `err.message` from API injected into `innerHTML`. Malicious/compromised backend can inject markup. |
| **Fix** | Use `textContent` or escape. |

#### ERR-04 — `console.error` in production detail page
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`frontend/detail.html`](../frontend/detail.html) line 258 |
| **Description** | Upsert errors logged to browser console with object details. |
| **Fix** | Remove or gate behind dev flag. |

---

### 2.6 Performance

#### PERF-01 — In-memory rate limits not shared across workers
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/routers/recommendations.py`](../backend/app/routers/recommendations.py) lines 22–39; [`backend/app/routers/chat.py`](../backend/app/routers/chat.py) lines 27–42 |
| **Description** | Rate stores are process-local dicts. Restart clears limits; multiple Uvicorn workers multiply effective quota; useless behind load balancer without sticky sessions. |
| **Fix** | Redis-backed sliding window (planned in `backend-tasks.md` but not implemented). |

#### PERF-02 — TMDB in-memory cache unbounded
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/app/services/tmdb_service.py`](../backend/app/services/tmdb_service.py) |
| **Description** | `_cache` dict grows without max size; only TTL on read. Long-running process under diverse IDs consumes memory. |
| **Fix** | LRU cache with max entries (e.g. 1000). |

#### PERF-03 — History hydration N×TMDB pattern
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/routers/recommendations.py`](../backend/app/routers/recommendations.py) lines 140–145 |
| **Description** | See CQ-03. |
| **Fix** | Batch deduplicated TMDB fetches. |

#### PERF-04 — No `ProxyHeadersMiddleware` for real client IP
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/app/main.py`](../backend/app/main.py) |
| **Description** | Chat rate limit uses `request.client.host`. Behind reverse proxy, all requests may share one IP or get wrong IP. |
| **Fix** | Add trusted proxy middleware; read `X-Forwarded-For` from known proxies only. |

---

### 2.7 Tests

#### TEST-01 — Minimal smoke tests only
| | |
|---|---|
| **Severity** | **high** |
| **Location** | [`test_api.py`](../test_api.py) |
| **Description** | No pytest suite. Smoke test covers `GET /`, trending, chat, optional JWT endpoints. No tests for: auth rejection, IDOR, rate limits, email verification gate, XSS-safe responses, preset limits. |
| **Fix** | Add pytest + httpx AsyncClient tests for critical paths; frontend E2E with Playwright for auth wizard. |

#### TEST-02 — `test_tmdb.py` uses JWT secret from `.env` (dev script)
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`test_tmdb.py`](../test_tmdb.py) lines 11–24 |
| **Description** | Generates test JWT locally. Fine for dev; not part of CI. |
| **Fix** | Move to `scripts/` or document as manual-only. |

#### TEST-03 — No frontend unit/integration tests
| | |
|---|---|
| **Severity** | **medium** |
| **Description** | Zero JS test files. Auth flows, XSS helpers, API client regressions untested. |
| **Fix** | Add Vitest/Jest for `escapeHtml`, auth redirect validation, API client. |

---

### 2.8 Deployment Readiness

#### DEPLOY-01 — No Dockerfile or docker-compose
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | Repository root |
| **Description** | No containerized build. Deploy process is manual (README: run uvicorn + static server). |
| **Fix** | Add multi-stage Dockerfile for backend; nginx/Caddy config for frontend + API proxy. |

#### DEPLOY-02 — No CI/CD pipeline
| | |
|---|---|
| **Severity** | **medium** |
| **Description** | No GitHub Actions / GitLab CI for lint, test, security scan, deploy. |
| **Fix** | Add CI: `ruff`/`mypy`, pytest, `pip-audit`, secret scanning (gitleaks). |

#### DEPLOY-03 — Database migrations not automated for production
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`supabase_schema.sql`](../supabase_schema.sql), [`scripts/apply_supabase_schema.sh`](../scripts/apply_supabase_schema.sh) |
| **Description** | Schema applied manually via SQL Editor or psql script. No migration versioning (Alembic abandoned). Idempotent SQL uses `IF NOT EXISTS` (good) but no rollback strategy. |
| **Fix** | Document migration runbook; track schema version in DB; test on staging before prod. |

#### DEPLOY-04 — No health/readiness endpoints beyond root
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/app/main.py`](../backend/app/main.py) lines 22–24 |
| **Description** | `GET /` returns static JSON. No check of Supabase connectivity, TMDB, or AI provider availability. |
| **Fix** | Add `/health` (liveness) and `/ready` (checks Supabase + optional deps). |

#### DEPLOY-05 — No monitoring or alerting
| | |
|---|---|
| **Severity** | **medium** |
| **Description** | No structured logging aggregation, APM, error tracking (Sentry), or uptime monitoring configured. |
| **Fix** | Add Sentry for backend; log JSON to stdout; configure uptime check on `/health`. |

#### DEPLOY-06 — Debug artifacts in tree
| | |
|---|---|
| **Severity** | **low** |
| **Location** | [`backend/dump.rdb`](../backend/dump.rdb); [`recommend.py`](../recommend.py) (standalone script) |
| **Description** | Local Redis dump; assorted dev scripts not part of deploy artifact. |
| **Fix** | Clean before release; document dev-only files. |

#### DEPLOY-07 — Supabase schema may not be applied
| | |
|---|---|
| **Severity** | **high** (operational) |
| **Location** | [`supabase_schema.sql`](../supabase_schema.sql) |
| **Description** | Backend gracefully degrades when tables missing (empty history, warning logs). Production would appear broken without obvious error to users. |
| **Fix** | Run schema script before go-live; add readiness check that verifies tables exist. |

---

### 2.10 Transport Security (HTTPS / HSTS)

#### TLS-01 — HTTPS enforcement not configured for production
| | |
|---|---|
| **Severity** | **high** |
| **Location** | [`frontend/Static/js/config.js`](../frontend/Static/js/config.js) line 5 (`http://localhost:8000`); no reverse-proxy/TLS config in repo |
| **Description** | ENV-01 covers mixed-content risk (HTTPS page calling HTTP API) but the audit must state explicitly: **there is no production TLS termination config, HTTP→HTTPS redirect, or certificate management documented in this repository.** Serving the app over plain HTTP in production exposes JWTs, passwords, and OAuth codes to network observers. |
| **Fix** | Terminate TLS at Caddy/nginx/Cloudflare; serve frontend and API over HTTPS only; set `API_BASE` to `https://api.yourdomain.com`; redirect all HTTP to HTTPS. |

#### TLS-02 — HSTS not configured
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | No HSTS header in [`backend/app/main.py`](../backend/app/main.py) or frontend server config |
| **Description** | Without `Strict-Transport-Security`, users can be downgraded to HTTP via sslstrip-style attacks on first visit or misconfigured links. |
| **Fix** | On production HTTPS host, set: `Strict-Transport-Security: max-age=31536000; includeSubDomains` (add `preload` only after deliberate review). |

#### TLS-03 — Secure cookie flags N/A for current SPA pattern but document for BFF migration
| | |
|---|---|
| **Severity** | **low** (informational) |
| **Description** | Tokens live in `localStorage`, not cookies — `Secure`/`HttpOnly` cookie flags do not apply today. If migrating to httpOnly session cookies (SEC-14), `Secure` + `SameSite=Lax` are mandatory on HTTPS. |
| **Fix** | Document in deployment runbook when/if auth model changes. If adopting httpOnly cookies (SEC-14), pair `Secure` + `SameSite=Strict` with CSRF token or same-site-only cookie policy.

---

### 2.11 Input Bounds & DoS

Overlaps with prompt injection (SEC-08) and pagination (CQ-02) but warrants explicit assessment:

| Field / endpoint | Server-side bound today | Gap | Severity |
|------------------|------------------------|-----|----------|
| `POST /api/chat` `message` | 500 chars ([`chat.py`](../backend/app/routers/chat.py) line 120) | OK for message body | — |
| `POST /api/chat` `history` | Truncated to last 6 entries, 500 chars each in `_build_messages` | **No Pydantic `max_length` on list** — client can send megabyte JSON array before truncation; DoS via parse/memory | **medium** |
| Recommendation preferences (`genre`, `mood`, etc.) | Allowlist in [`ai_service._validate_preferences`](../backend/app/services/ai_service.py) | Values constrained to enum set (implicit max length) — OK | — |
| `PresetCreate.name` | `max_length=80` ([`recommendations.py`](../backend/app/routers/recommendations.py) line 53) | OK | — |
| `PATCH /api/users/me` `name` | Max 100 chars ([`users.py`](../backend/app/routers/users.py) line 112) | OK | — |
| `GET /api/recommendations/history` `limit` | **Unbounded** (CQ-02) | Attacker can request `limit=999999` | **medium** |
| FastAPI default request body | ~1 MB (Starlette default) | No explicit `@app` limit documented; large JSON bodies to `/generate` acceptable but should be documented | **low** |
| Frontend signup password | Min 6 chars client-side only | No max length — extremely long passwords could stress auth backend | **low** |

**Recommended fix (summary):** Add Pydantic `Field(max_length=…)` on all string models; cap `history` list length at schema level; bound pagination params; optionally set explicit `max_request_size` middleware for production.

---

### 2.12 Privacy & Data Handling

This app stores accounts, watchlists, and AI recommendation history on Supabase (shared multi-tenant infrastructure). No formal privacy program is documented in the repo.

#### PRIV-01 — No documented data retention or deletion policy
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | No privacy policy content (placeholder `#` links in HTML footers); no backend retention job |
| **Description** | `recommendation_logs` rows are kept indefinitely. No documented retention window, anonymization, or user-facing explanation of what is stored. |
| **Fix** | Publish Privacy Policy; define retention (e.g. delete logs older than 12 months); implement scheduled cleanup or document Supabase cron job. |

#### PRIV-02 — Account deletion completeness unclear to users
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | [`backend/app/routers/users.py`](../backend/app/routers/users.py) lines 181–184; [`supabase_schema.sql`](../supabase_schema.sql) lines 6–52 |
| **Description** | `DELETE /api/users/me` calls `supabase_admin.auth.admin.delete_user(user_id)`. Schema defines `ON DELETE CASCADE` from `auth.users` → `profiles` → `saved_movies`, `recommendation_logs`, `preference_presets`. **Likely complete** for app tables, but: (1) no verification test exists, (2) Supabase Auth audit/logs and backups may retain data per Supabase's policies, (3) UI does not explain what is deleted vs retained. |
| **Fix** | Add integration test: create user → save data → delete → assert zero rows in all user tables; document in Privacy Policy that provider-level backups may lag; consider explicit wipe of `recommendation_logs` before auth delete as belt-and-suspenders. |

#### PRIV-03 — No data export / portability endpoint (GDPR Art. 15 / 20 surface)
| | |
|---|---|
| **Severity** | **low** |
| **Description** | Users can view profile and history in UI but there is no "download my data" JSON export. For EU users this may be required under GDPR. |
| **Fix** | Add `GET /api/users/me/export` returning profile, saved_movies, recommendation_logs, presets — or document manual request process. |

#### PRIV-04 — PII in logs and error responses
| | |
|---|---|
| **Severity** | **medium** |
| **Location** | SEC-11 (exception leakage); Supabase Auth side effects from password verify (CQ-05) |
| **Description** | Risk of email, user id, or token fragments appearing in application logs if exception handlers log `{exc}` verbatim. No structured log redaction policy. |
| **Fix** | Structured logging with field allowlist; never log Authorization headers or passwords; review `logger.warning("Token verification failed: %s", exc)` in auth.py. |

#### PRIV-05 — Third-party data processors not documented
| | |
|---|---|
| **Severity** | **low** |
| **Description** | User preference data is sent to Gemini/DeepSeek for recommendations; watchlist metadata hits TMDB. Privacy Policy should disclose subprocessors (Supabase, Google, DeepSeek, TMDB). |
| **Fix** | Document in Privacy Policy and `.env.example` comments for operators. |

---

### 2.9 Positive Findings (controls that work)

| Control | Location | Notes |
|---------|----------|-------|
| Preference allowlist validation | [`backend/app/services/ai_service.py`](../backend/app/services/ai_service.py) `_validate_preferences` | Prevents arbitrary strings in AI prompts |
| Preset IDOR protection | [`backend/app/routers/recommendations.py`](../backend/app/routers/recommendations.py) lines 240–257 | Delete scoped by `user_id` + `preset_id` |
| History user isolation | [`backend/app/routers/recommendations.py`](../backend/app/routers/recommendations.py) line 124 | `.eq("user_id", user_id)` on logs |
| CORS not wildcard with credentials | [`backend/app/main.py`](../backend/app/main.py) line 10 | Single `FRONTEND_URL` origin |
| PKCE OAuth flow | [`frontend/Static/js/auth.js`](../frontend/Static/js/auth.js) lines 113–115 | `flowType: 'pkce'` |
| Origin guard for PKCE | [`frontend/Static/js/origin-guard.js`](../frontend/Static/js/origin-guard.js) | Redirects 127.0.0.1 → localhost |
| Password reset type check | [`frontend/reset-password.html`](../frontend/reset-password.html) line 79 | Requires `type === 'recovery'` |
| Toast/auth errors use textContent | [`frontend/Static/js/auth.js`](../frontend/Static/js/auth.js), toast.js | Safe error display |
| Adult content filter | [`backend/app/services/tmdb_service.py`](../backend/app/services/tmdb_service.py) | Filters adult TMDB results |
| `.env` gitignored | [`.gitignore`](../.gitignore) | Secrets file not tracked |

---

## 3. Deployment Blockers

These **must** be resolved before any public/staging deployment.

**Effort key:** **S** ≈ under 2 hours · **M** ≈ half day · **L** ≈ 1–3 days · **XL** ≈ 1 week+  
**Owner key:** who typically implements the fix (adjust for your team).

| # | Blocker | Severity | Effort | Owner | Phase | Primary location |
|---|---------|----------|--------|-------|-------|------------------|
| B1 | **Rotate and remove committed secrets** in `config.js`; stop tracking live keys in git; scrub history if repo was public | critical | M | Frontend + DevOps | **P0** | `frontend/Static/js/config.js` |
| B2 | **Refactor service-role architecture** — user-scoped Supabase client + RLS on request paths (SEC-09). *Highest blast radius.* | critical | XL | Backend | **P1-A** | `backend/app/core/supabase_client.py`, routers |
| B3 | **Fix XSS sinks** in recommendations, history, detail, my-list (`innerHTML` + unvalidated URLs). *Highest likelihood of user-facing exploit.* | high | L | Frontend | **P1-B** | `recommendations.js`, `history.js`, `detail.html`, `my-list.js` |
| B4 | **Authenticate `/api/chat`** or disable endpoint until chat ships | high | S | Backend | P1 | `backend/app/routers/chat.py` |
| B5 | **Lock down `movies` table writes** — RPC-only, remove permissive RLS fallback | high | M | Backend + DBA | P1 | `supabase_fix_wishlist.sql`, frontend fallbacks |
| B6 | **Apply Supabase schema** and verify tables exist (`recommendation_logs`, `preference_presets`, RLS) | high | S | DBA | P1 | `supabase_schema.sql` |
| B7 | **Production TLS** — HTTPS only, HTTP redirect, HSTS (TLS-01, TLS-02) | high | M | DevOps | P1 | Reverse proxy / hosting config |
| B8 | **Production config injection** — replace hardcoded localhost API URL; remove TMDB key from client | high | M | Frontend + DevOps | P1 | `config.js`, `api.js`, `landing.js` |
| B9 | **Pin Python dependencies** and add lockfile + `pip-audit` in CI | high | M | Backend + DevOps | P2 | `backend/requirements.txt` |
| B10 | **Add JWT issuer validation** | high | S | Backend | P1 | `backend/app/core/auth.py` |
| B11 | **Stop leaking internal errors** to HTTP clients | medium | M | Backend | P2 | `users.py`, `chat.py`, `ai_service.py` |
| B12 | **Clear OAuth tokens from URL hash** after session exchange | medium | S | Frontend | P2 | `auth-callback.html`, `reset-password.html` |
| B13 | **Validate post-auth redirect** (prevent open redirect) | medium | S | Frontend | P2 | `auth.js`, `auth-callback.html` |
| B14 | **Clickjacking + security headers** (`X-Frame-Options`, CSP `frame-ancestors`) | medium | S | DevOps + Backend | P2 | `main.py`, static host |
| B15 | **CSP + SRI** for CDN scripts | medium | M | Frontend + DevOps | P2 | All HTML pages |
| B16 | **Durable rate limiting** (Redis or equivalent) for recommendations + chat | medium | L | Backend | P2 | `recommendations.py`, `chat.py` |
| B17 | **Privacy Policy + deletion verification test** | medium | M | Product + Backend | P2 | Legal copy, `tests/` |
| B18 | **Add automated tests** for auth, IDOR, XSS regressions, critical API paths | medium | L | Backend + Frontend | P2 | New `tests/` directory |

**Phase key:** **P0** = immediate · **P1** = before any external user · **P1-A / P1-B** = **parallel** pre-release tracks (do not sequence one after the other) · **P2** = before sustained production traffic

### Parallel pre-release tracks (B2 vs B3)

| Track | Blocker | Rationale | Suggested approach |
|-------|---------|-----------|-------------------|
| **P1-A — Architecture** | B2 (SEC-09) | Worst-case: full database compromise via service role or missed filter | Phase 1: IDOR audit + tests on all service-role queries. Phase 2: user-scoped client for user tables. |
| **P1-B — User-facing exploit** | B3 (SEC-02–05) | Worst-case: XSS steals sessions / defaces UI for any visitor viewing poisoned data | Refactor `innerHTML` sinks first in `recommendations.js` and `history.js` (highest traffic). |

Both tracks belong in **the same pre-release milestone**. Numbering B2/B3 reflects blast-radius severity, **not** a directive to defer XSS until RLS refactor completes.

### Shared touchpoints (coordinate if parallelizing P1-A + P1-B)

B2 and B3 are independent in priority but **not fully independent in files**. Assign one owner or sequence these sub-items to avoid merge conflicts:

| Shared item | P1-A (B2 / B5) | P1-B (B3 / B5) | Coordination |
|-------------|----------------|----------------|--------------|
| **SEC-06 / B5** — permissive `movies` RLS + client upsert fallback | Remove `WITH CHECK (true)` policies; RPC-only writes | Remove frontend `movies` upsert fallback in `detail.html`, `recommendations.js` | **Same PR or paired PRs** — schema + frontend must land together |
| [`supabase_fix_wishlist.sql`](../supabase_fix_wishlist.sql) | DBA applies revised SQL | — | Backend/DBA owns file; Frontend consumes RPC-only path |
| [`supabase_schema.sql`](../supabase_schema.sql) `movies` RLS | Enable read-only client policies | — | Align with B2 service-role refactor |
| Poisoned `poster_url` in DB → XSS | Data integrity (RLS/RPC) | Rendering (`innerHTML` refactor) | Fix **both** for defense-in-depth; either alone is incomplete |

**Suggested split:** Frontend developer owns B3 + frontend half of B5; backend/DBA owns B2 + SQL half of B5; daily sync on B5 until merged.

### Quick wins (same sprint, low effort)

B4, B6, B10, B12, B13, B14 — collectively ~1 day for a single developer.

### Multi-day tracks (plan in parallel, not sequence)

- **B3 / P1-B** (XSS refactor) — often 2–3 days; **start early**; blocks user-facing exploit path.  
- **B2 / P1-A** (service-role → user-scoped client) — architectural; 3–5+ days; run **concurrently** with B3 if two owners available.  
- **B16 / B18** — infrastructure + test suite; P2, parallelize with feature freeze.

---

## 4. Recommended Remediation Priority

### Immediate (same day) — P0

> **Execution note — do this first, before P1-A/P1-B:** SEC-01 / **B1** is the only finding where **the clock is already running**. Committed TMDB and Supabase anon keys in git history accumulate exposure time; everything else can be sequenced, but **secret rotation cannot wait** on the parallel sprint. Rotate keys in TMDB and Supabase dashboards, stop tracking `config.js`, then kick off P1 work.

- **B1** — rotate TMDB key, scrub git history if needed, untrack `config.js`, add `config.example.js`

### Before any external user — P1 (parallel tracks)

**Do not treat B2 as a prerequisite for B3.** Assign owners and run in parallel where possible.

| Parallel track | Items | Owner |
|----------------|-------|-------|
| **P1-A — Blast radius** | **B2** (RLS / service-role phased refactor + IDOR tests) | Backend |
| **P1-B — Likely exploit** | **B3** (XSS sinks — prioritize `recommendations.js`, `history.js`) | Frontend |
| **P1 — Shared gate** | **B4, B5, B6, B7, B8, B10** — chat auth, movies RLS, schema, TLS, prod config, JWT issuer | Mixed |

Also address **SEC-16a** (account enumeration copy) in the same auth pass as **B8** — low effort, same file. Verify **SEC-16b** (Supabase login rate limits) in Dashboard before go-live (§5).

### Before sustained production traffic — P2
- **B9, B11–B18** — dependency pinning, error sanitization, OAuth hash cleanup, headers/CSP, rate limits, privacy docs, test suite

### Ongoing
- TEST-01, DEP-04, PERF-01, PRIV-01 retention job

### Document maturity (post-feedback)
This audit is suitable for MVP pre-release, bug bounty onboarding, or client-facing security disclosure **after P0 + P1 items are remediated or explicitly accepted as risk**. Remaining open items (SEC-16b Dashboard verification, shared touchpoint coordination, snippet compile-check) are operational follow-ups, not gaps in audit coverage.

---

## 5. Audit Limitations

- No dynamic penetration testing or authenticated fuzzing was performed.
- No automated CVE scan (`pip-audit`, `npm audit`) was executed in this audit.
- **Supabase Dashboard settings were not verified live** — only SQL files and code were reviewed. **Pre-go-live verification checklist (operator):**
  - RLS policies actually applied and match `supabase_schema.sql`
  - Auth redirect URLs (`auth-callback.html`, `reset-password.html`)
  - Google / Email providers enabled as intended
  - **Auth rate limits** for sign-in / token (`/auth/v1/token`) and sign-up — see SEC-16b
  - Email confirmation required for sensitive features
- **Pinned reference:** commit `57cb92078bfc48ee4b643c3815258ecb291137f9` on branch `feat/full-mvp-stabilization`. Uncommitted working-tree changes may differ; dispute resolution should use `git diff 57cb92078bfc48ee4b643c3815258ecb291137f9`.
- Production TLS/HSTS configuration was assessed from repository artifacts only — not verified on a live deployed host.
- GDPR/compliance assessment is lightweight (PRIV-01–05); not legal advice.
- **Remediation code snippets** (§2) were written during report revision and **were not compile- or run-verified** as part of this audit. Treat as guidance; require code review + tests before merge — especially SEC-08 (Pydantic chat model), SEC-10 (JWT `issuer` string must match your Supabase project's exact issuer URL), and CSP examples (must match your CDN hosts).
- **SSRF-01** is a static code-path review, not a dynamic SSRF test; re-assess when adding new outbound HTTP or AI tool-use features.

---

## 6. Verification Pass (2026-06-22)

Cross-check of every §2 finding against the current codebase. Status key:

| Status | Meaning |
|--------|---------|
| ✅ Done | Implemented correctly and verified in code |
| ⚠️ Partial | Started but incomplete or not fully correct |
| ❌ Missing | Not implemented at all |
| 🔑 Requires Human Action | Cannot be completed in code — needs owner/operator |
| ➖ N/A | Resolved by removal or no longer applicable |

### 6.1 Completion Summary

| Metric | Count |
|--------|------:|
| **Total items verified** | **67** |
| ✅ Done | 44 |
| ⚠️ Partial | 18 |
| ❌ Missing | 0 |
| 🔑 Requires Human Action | 5 |
| ➖ N/A | 0 |

> **Note:** Human-action items are expected pre-deploy steps, not counted as code failures. No ❌ Missing code items remain; accepted partials (SEC-18 Tailwind, SEC-09/PRIV-02 mocked tests) are documented dev-simple tradeoffs.

### 6.2 Deployment Blocker Status (§3)

| Blocker | Original | Verified status | Notes |
|---------|----------|-----------------|-------|
| B1 | SEC-01 secrets | ⚠️ Partial + 🔑 | `config.js` untracked via `git rm --cached`; placeholders + `config.example.js` + inject script. **Operator must rotate keys + scrub history at `57cb920`.** |
| B2 | SEC-09 service-role | ⚠️ Partial (accepted) | User-scoped client on hot paths; mocked export/deletion/rate-limit tests. Live IDOR smoke manual in runbook — no CI test project. |
| B3 | SEC-02–05 XSS | ✅ Done | `utils.js` helpers; DOM/`textContent` in recommendations, history, my-list, detail. |
| B4 | SEC-07 chat auth | ✅ Done | `chat.py` deleted; endpoint removed entirely. |
| B5 | SEC-06 movies RLS | ⚠️ Partial + 🔑 | `002_movies_rls_lockdown.sql` + RPC-only frontend; **operator must apply on live Supabase.** |
| B6 | DEPLOY-07 schema | 🔑 | Apply script includes `003_retention_cleanup.sql`; operator must run on target project. |
| B7 | TLS-01/02 | ⚠️ Partial + 🔑 | `deploy/nginx.conf` + FastAPI HSTS in production; **certs and live TLS are operator-owned.** |
| B8 | ENV-01 prod config | ⚠️ Partial | `inject-config.sh`; local dev still uses `localhost:8000` fallback in `api.js`. |
| B9 | DEP-01/02 lockfile | ✅ Done | Clean `requirements.lock` from Docker; CI installs lock; `pip-audit` fails CI on CVEs. |
| B10 | SEC-10 JWT issuer | ✅ Done | `auth.py` line 49. |
| B11 | SEC-11 error leak | ✅ Done | Generic client messages in `users.py`, `ai_service.py`. |
| B12 | SEC-12 OAuth hash | ✅ Done | `auth-callback.html`, `reset-password.html`. |
| B13 | SEC-13 open redirect | ✅ Done | `AppUtils.safeRedirectPath` in `utils.js`. |
| B14 | SEC-21 clickjacking | ✅ Done | FastAPI middleware + nginx + CSP `frame-ancestors` on HTML pages. |
| B15 | SEC-18 CSP/SRI | ⚠️ Partial (accepted) | CSP on all pages + nginx; SRI on Supabase JS + Font Awesome; Tailwind JIT CDN excluded by design (no dev build step). |
| B16 | PERF-01 Redis limits | ✅ Done | `rate_limiter.py` + Redis; recommendations daily cap. |
| B17 | PRIV-01/02 privacy | ⚠️ Partial | `privacy.html` + footer links; retention SQL; mocked deletion tests; manual cascade smoke in runbook. |
| B18 | TEST-01 tests | ⚠️ Partial | 13 pytest tests (auth, export, rate limit, deletion); `utils.test.js` in CI. |

### 6.3 Item-by-Item Breakdown

#### 2.1 Code Quality & Logic

```
[✅ Done] CQ-01 — Api.delete() Content-Type on JSON body
→ Finding: Api.delete passes body as third arg; request() sets Content-Type when body is truthy.
→ Location: frontend/Static/js/api.js:20-23,69; profile.js:224
→ Note: None.

[✅ Done] CQ-02 — History pagination bounds
→ Finding: page=Query(1, ge=1), limit=Query(20, ge=1, le=100).
→ Location: backend/app/routers/recommendations.py:96-97
→ Note: Covered by test_history_pagination_bounds.

[✅ Done] CQ-03 — Sequential TMDB hydration
→ Finding: History batch-collects tmdb_ids, single fetch_all, maps back.
→ Location: backend/app/routers/recommendations.py:124-136
→ Note: Same fix as PERF-03.

[✅ Done] CQ-04 — RecommendationPreferences partial payloads
→ Finding: All five fields are required non-optional str.
→ Location: backend/app/routers/recommendations.py:34-39
→ Note: None.

[⚠️ Partial] CQ-05 — Password verification creates real Supabase sessions
→ Finding: Still uses sign_in_with_password; comment documents side effect.
→ Location: backend/app/routers/users.py:58-74
→ Note: Acceptable short-term; monitor auth logs.

[✅ Done] CQ-06 — Legacy Django templates
→ Finding: frontend/templates/ deleted from tree.
→ Location: (removed)
→ Note: None.

[✅ Done] CQ-07 — chat.js dead code
→ Finding: frontend/Static/js/chat.js deleted.
→ Location: (removed)
→ Note: Paired with SEC-07 chat router removal.
```

#### 2.2 Security

```
[⚠️ Partial] SEC-01 — CRITICAL: secrets in config.js
→ Finding: config.js untracked (git rm --cached); placeholders only; config.example.js + inject-config.sh. Committed history at 57cb920 still contains live keys.
→ Location: frontend/Static/js/config.js, .gitignore:17, scripts/inject-config.sh
→ Note: 🔑 Operator must rotate keys + git filter-repo.

[✅ Done] SEC-02 — XSS in recommendation results
→ Finding: renderResults uses createElement/textContent/safePosterUrl.
→ Location: frontend/Static/js/recommendations.js:327-419
→ Note: Static icon innerHTML on save buttons is hardcoded (safe).

[✅ Done] SEC-03 — XSS via preset names
→ Finding: preset.name assigned via textContent.
→ Location: frontend/Static/js/recommendations.js:459
→ Note: None.

[✅ Done] SEC-04 — XSS via poster URLs
→ Finding: safePosterUrl used in history.js and my-list.js.
→ Location: frontend/Static/js/utils.js:13-22; history.js:123; my-list.js:99
→ Note: None.

[✅ Done] SEC-05 — XSS on detail page
→ Finding: textContent for titles/cast; safePosterUrl for images.
→ Location: frontend/detail.html:135-267
→ Note: None.

[⚠️ Partial] SEC-06 — Permissive movies table writes
→ Finding: 002_movies_rls_lockdown.sql drops permissive INSERT/UPDATE; frontend uses save_movie_to_wishlist RPC only; supabase_schema.sql enables read-only SELECT policies.
→ Location: supabase_migrations/002_movies_rls_lockdown.sql; recommendations.js:293; detail.html:284
→ Note: 🔑 Apply migration on live Supabase before deploy.

[✅ Done] SEC-07 — Unauthenticated AI chat
→ Finding: backend/app/routers/chat.py deleted; router not mounted.
→ Location: (removed)
→ Note: Endpoint removed rather than authenticated — acceptable if chat not shipped.

[✅ Done] SEC-08 — Prompt injection via chat history
→ Finding: Chat endpoint removed; issue moot.
→ Location: N/A
→ Note: Re-assess if chat is reintroduced.

[⚠️ Partial — accepted] SEC-09 — Service-role bypasses RLS
→ Finding: get_user_client(access_token) for recommendation_logs, preference_presets, export; supabase_admin limited to auth admin + /ready schema probe.
→ Location: backend/app/core/supabase_client.py:17-27; recommendations.py; users.py:107-127
→ Note: 13 pytest tests cover auth/export/rate-limit gates (mocked). Live cross-tenant IDOR verified manually on staging (runbook post-deploy).

[✅ Done] SEC-10 — JWT missing issuer validation
→ Finding: issuer=f"{SUPABASE_URL}/auth/v1" in HS256 decode.
→ Location: backend/app/core/auth.py:44-50
→ Note: test_jwt_wrong_issuer_rejected covers this.

[✅ Done] SEC-11 — Internal exception details leaked
→ Finding: Generic HTTP messages; logger.exception server-side.
→ Location: backend/app/routers/users.py:103-104; ai_service.py:368-391
→ Note: None.

[✅ Done] SEC-12 — Auth tokens in URL hash
→ Finding: history.replaceState before redirect in auth-callback and reset-password.
→ Location: frontend/auth-callback.html:97-98,123-124; reset-password.html:126
→ Note: None.

[✅ Done] SEC-13 — Open redirect via postAuthRedirect
→ Finding: safeRedirectPath blocks // and absolute URLs.
→ Location: frontend/Static/js/utils.js:24-28; auth.js:166; auth-callback.html:93-95
→ Note: utils.test.js covers cases.

[⚠️ Partial] SEC-14 — JWT in localStorage (XSS amplification)
→ Finding: XSS sinks fixed; app_access_token fallback removed; Supabase PKCE + localStorage pattern unchanged (standard SPA).
→ Location: frontend/Static/js/auth.js:114-115
→ Note: httpOnly BFF is a future hardening option, not a blocker if XSS stays fixed.

[⚠️ Partial] SEC-15 — Sensitive ops before email verification
→ Finding: password change, delete, presets, export require verified; PATCH /me name still allow unverified.
→ Location: backend/app/routers/users.py:145,169,209; recommendations.py:143
→ Note: Low risk for name-only update.

[⚠️ Partial] SEC-16 — Weak password policy / session revocation
→ Finding: min 8 / max 128 chars backend+frontend; sign_out(others) after password change and after reset-password.html updateUser; no app-side rate limit on _verify_current_password.
→ Location: users.py:22-23,191-195; auth.js; reset-password.html
→ Note: Align Supabase Auth password policy in Dashboard.

[✅ Done] SEC-16a — Account enumeration via auth errors
→ Finding: signupErrorMessage uses generic copy for duplicates.
→ Location: frontend/Static/js/auth.js:239-244
→ Note: loginErrorMessage always generic.

[🔑 Requires Human Action] SEC-16b — Login brute-force rate limiting (Supabase Dashboard)
→ Finding: Not configurable in repo; documented in DEPLOYMENT_RUNBOOK.md §2.
→ Location: Supabase Dashboard → Authentication → Rate Limits
→ Note: Operator must verify thresholds before go-live.

[⚠️ Partial] SEC-17 — TMDB API key in query string
→ Finding: Backend uses Authorization Bearer header; frontend proxies TMDB via backend (landing.js uses Api.get).
→ Location: backend/app/services/tmdb_service.py:40-43
→ Note: TMDB key fully removed from frontend config.

[⚠️ Partial — accepted] SEC-18 — No CSP or SRI
→ Finding: CSP on all HTML pages + nginx; SRI on Supabase JS@2.49.8 and Font Awesome 6.0.0. Tailwind JIT CDN has no SRI — accepted for MVP (avoids npm build in dev).
→ Location: frontend/*.html; deploy/nginx.conf:24; DEPLOYMENT_RUNBOOK.md §3c
→ Note: Self-hosting Tailwind is optional future hardening, not a staging blocker.

[✅ Done] SEC-19 — OpenAPI /docs exposed
→ Finding: docs_url=None when ENVIRONMENT=production.
→ Location: backend/app/main.py:17-23
→ Note: None.

[✅ Done] SEC-20 — CORS allows all methods/headers
→ Finding: Restricted to GET/POST/PATCH/DELETE and Authorization/Content-Type.
→ Location: backend/app/main.py:33-34
→ Note: None.

[✅ Done] SEC-21 — Clickjacking protection
→ Finding: X-Frame-Options + nosniff middleware; CSP frame-ancestors on pages and nginx.
→ Location: backend/app/main.py:38-45; deploy/nginx.conf:22-24
→ Note: None.

[✅ Done] SEC-22 — Hardcoded Supabase project ref in script
→ Finding: Parses PROJECT_REF from SUPABASE_URL env.
→ Location: scripts/apply_supabase_schema.sh:20-23
→ Note: None.
```

#### 2.13 SSRF

```
[✅ Done] SSRF-01 — No user-controlled outbound URL (informational)
→ Finding: TMDB_BASE_URL hardcoded; tmdb_id typed int; unchanged invariant holds.
→ Location: backend/app/services/tmdb_service.py; backend/app/core/config.py:21
→ Note: Re-assess if URL-fetch features added.
```

#### 2.3 Environment & Configuration

```
[⚠️ Partial] ENV-01 — Dev API URL baked into frontend
→ Finding: inject-config.sh for deploy; api.js still falls back to http://localhost:8000.
→ Location: scripts/inject-config.sh; frontend/Static/js/api.js:5
→ Note: Production should set API_BASE=/api via inject script.

[✅ Done] ENV-02 — .env gitignored; .env.example safe
→ Finding: .gitignore covers .env; .env.example has service-role warning.
→ Location: .gitignore:13-14; .env.example:4-5
→ Note: None.

[✅ Done] ENV-03 — No environment separation
→ Finding: ENVIRONMENT setting with is_production branches docs, HSTS, CORS behavior.
→ Location: backend/app/core/config.py:10,33-35
→ Note: None.

[✅ Done] ENV-04 — backend/dump.rdb present
→ Finding: *.rdb in .gitignore; file not in tree.
→ Location: .gitignore:46-48
→ Note: None.
```

#### 2.4 Dependencies

```
[✅ Done] DEP-01 — No Python lockfile
→ Finding: Clean requirements.lock generated in Docker; CI installs from lock.
→ Location: backend/requirements.txt; backend/requirements.lock; .github/workflows/ci.yml
→ Note: None.

[⚠️ Partial] DEP-02 — Unpinned major dependencies
→ Finding: requirements.txt uses compatible ranges; lock pins resolved versions for CI/prod.
→ Location: backend/requirements.txt; backend/requirements.lock
→ Note: Acceptable for dev; lock used in CI.

[⚠️ Partial] DEP-03 — Frontend CDN scripts (no package lock)
→ Finding: Supabase + Font Awesome pinned with SRI; Tailwind CDN still floating JIT (no npm lockfile).
→ Location: frontend/*.html
→ Note: Pair Tailwind self-host with full supply-chain lock if needed.

[✅ Done] DEP-04 — No dependency audit in CI
→ Finding: pip-audit blocks CI (no || true); gitleaks present; frontend utils.test.js in CI.
→ Location: .github/workflows/ci.yml
→ Note: None.
```

#### 2.5 Error Handling & Logging

```
[⚠️ Partial] ERR-01 — Broad except Exception in auth
→ Finding: Logs exception type name; still returns generic 401 to client.
→ Location: backend/app/core/auth.py:75-77
→ Note: Acceptable tradeoff; consider alerting on config errors.

[⚠️ Partial] ERR-02 — Missing-table errors swallowed
→ Finding: Still returns empty items[] with warning log for missing recommendation_logs.
→ Location: backend/app/routers/recommendations.py:116-120
→ Note: /ready now checks schema; consider 503 in non-production.

[✅ Done] ERR-03 — Frontend error messages in innerHTML
→ Finding: showError uses textContent in history.js and my-list.js.
→ Location: frontend/Static/js/history.js:20-25; my-list.js:20-25
→ Note: None.

[✅ Done] ERR-04 — console.error on detail page
→ Finding: No console.error in detail.html.
→ Location: frontend/detail.html
→ Note: None.
```

#### 2.6 Performance

```
[✅ Done] PERF-01 — In-memory rate limits
→ Finding: Redis sliding-window rate limiter.
→ Location: backend/app/middleware/rate_limiter.py
→ Note: Requires REDIS_URL in production.

[✅ Done] PERF-02 — TMDB cache unbounded
→ Finding: OrderedDict LRU with TMDB_CACHE_MAX_ENTRIES=1000.
→ Location: backend/app/services/tmdb_service.py:16-37
→ Note: None.

[✅ Done] PERF-03 — History hydration N×TMDB
→ Finding: Same batch fix as CQ-03.
→ Location: backend/app/routers/recommendations.py:124-136
→ Note: None.

[✅ Done] PERF-04 — No ProxyHeadersMiddleware
→ Finding: Added when TRUSTED_PROXY_IPS set; documented in .env.example.
→ Location: backend/app/main.py:26-27
→ Note: Set TRUSTED_PROXY_IPS=* on Render.
```

#### 2.7 Tests

```
[⚠️ Partial] TEST-01 — Minimal smoke tests
→ Finding: 13 pytest tests (auth, export, rate limit, deletion); no live Supabase IDOR integration tests.
→ Location: tests/test_auth.py; tests/test_account_deletion.py
→ Note: Expand before sustained production traffic.

[✅ Done] TEST-02 — test_tmdb.py dev script
→ Finding: Moved to scripts/test_tmdb.py.
→ Location: scripts/test_tmdb.py
→ Note: None.

[✅ Done] TEST-03 — No frontend tests
→ Finding: frontend/Static/js/utils.test.js runs in CI frontend job.
→ Location: frontend/Static/js/utils.test.js; .github/workflows/ci.yml
→ Note: None.
```

#### 2.8 Deployment Readiness

```
[✅ Done] DEPLOY-01 — No Dockerfile
→ Finding: Dockerfile + docker-compose.yml + deploy/nginx.conf added.
→ Location: repo root
→ Note: None.

[⚠️ Partial] DEPLOY-02 — No CI/CD
→ Finding: .github/workflows/ci.yml runs ruff, pytest, pip-audit (blocking), gitleaks, frontend utils tests.
→ Location: .github/workflows/ci.yml
→ Note: None.

[⚠️ Partial] DEPLOY-03 — Migrations not automated
→ Finding: apply_supabase_schema.sh runs schema + fix + 002 + 003 in order; DEPLOYMENT_RUNBOOK.md documents process.
→ Location: scripts/apply_supabase_schema.sh; docs/DEPLOYMENT_RUNBOOK.md
→ Note: Still manual; no Alembic/version table.

[✅ Done] DEPLOY-04 — Health/readiness endpoints
→ Finding: GET /health and GET /ready (Redis + Supabase schema).
→ Location: backend/app/main.py:63-92
→ Note: None.

[⚠️ Partial] DEPLOY-05 — No monitoring or alerting
→ Finding: Optional Sentry SDK in backend/app/main.py — init only when SENTRY_DSN set (no-op for local dev). Render healthCheckPath covers uptime.
→ Location: backend/app/main.py; backend/app/core/config.py; render.yaml
→ Note: 🔑 Operator pastes SENTRY_DSN in Render; optional external uptime ping on /health.

[✅ Done] DEPLOY-06 — Debug artifacts
→ Finding: dump.rdb gone; recommend.py moved to scripts/recommend.py.
→ Location: scripts/recommend.py
→ Note: None.

[🔑 Requires Human Action] DEPLOY-07 — Supabase schema may not be applied
→ Finding: /ready checks recommendation_logs; operator must run apply script on target project.
→ Location: scripts/apply_supabase_schema.sh
→ Note: See Human Action Checklist below.
```

#### 2.10 Transport Security

```
[⚠️ Partial] TLS-01 — HTTPS not configured for production
→ Finding: nginx.conf has HTTP→HTTPS redirect and TLS block; not verified on live host.
→ Location: deploy/nginx.conf:8-19
→ Note: 🔑 Operator provisions certs and domain.

[⚠️ Partial] TLS-02 — HSTS not configured
→ Finding: HSTS in nginx.conf and FastAPI production middleware.
→ Location: deploy/nginx.conf:21; backend/app/main.py:43-44
→ Note: 🔑 Effective only after TLS is live.

[🔑 Requires Human Action] TLS-03 — Secure cookie flags (informational)
→ Finding: Documented in runbook and SEC-14 notes; N/A for current localStorage SPA.
→ Location: docs/DEPLOYMENT_RUNBOOK.md
→ Note: Revisit if migrating to httpOnly cookies.
```

#### 2.11 Input Bounds

```
[✅ Done] INPUT-01 — Server-side input bounds (consolidated)
→ Finding: History limit bounded; preset/name/password max lengths set; frontend password maxlength=128 on all password inputs.
→ Location: recommendations.py, users.py, auth.js, profile.html, reset-password.html
→ Note: No explicit max_request_size middleware (low priority).
```

#### 2.12 Privacy & Data Handling

```
[⚠️ Partial] PRIV-01 — No data retention policy
→ Finding: privacy.html documents 12-month retention; `003_retention_cleanup.sql` adds function + pg_cron schedule; footer links on all pages point to privacy.html.
→ Location: frontend/privacy.html; supabase_migrations/003_retention_cleanup.sql
→ Note: 🔑 Operator must enable pg_cron and apply migration on live Supabase.

[⚠️ Partial — accepted] PRIV-02 — Account deletion completeness
→ Finding: DELETE /me + ON DELETE CASCADE in supabase_schema.sql; tests/test_account_deletion.py (mocked) verifies API contract and delete_user call.
→ Location: users.py:207-229; tests/test_account_deletion.py; supabase_schema.sql
→ Note: Live row-count verification is manual staging smoke (runbook post-deploy), not automated — avoids test Supabase project in CI.

[✅ Done] PRIV-03 — No data export endpoint
→ Finding: GET /api/users/me/export returns profile, saved_movies, logs, presets.
→ Location: backend/app/routers/users.py:107-140
→ Note: Documented in privacy.html.

[⚠️ Partial] PRIV-04 — PII in logs
→ Finding: auth.py logs exception type not full token; no formal redaction policy document.
→ Location: backend/app/core/auth.py:76
→ Note: Review log aggregation config at deploy time.

[✅ Done] PRIV-05 — Subprocessors not documented
→ Finding: Listed in privacy.html and .env.example comments; footer Privacy Policy links on all app pages.
→ Location: frontend/privacy.html; frontend/*.html footers
→ Note: None.
```

### 6.4 Human Action Checklist (hand off to project owner)

Complete these **before staging/public beta**. None block local dev.

- [ ] **Rotate secrets exposed in git history** (TMDB key, Supabase anon key at minimum) — TMDB Dashboard + Supabase Dashboard → API
- [ ] **Scrub git history** if repo was ever public — `git filter-repo` or BFG; force-push only with team coordination
- [ ] **Stop tracking config.js** — done in repo (`git rm --cached`); commit this change; keep local copy gitignored
- [ ] **Apply Supabase schema** — `SUPABASE_DB_PASSWORD='…' ./scripts/apply_supabase_schema.sh` (includes `002_movies_rls_lockdown.sql` and `003_retention_cleanup.sql`)
- [ ] **Verify RLS in Supabase Dashboard** — movies table read-only for clients; no permissive INSERT/UPDATE policies
- [ ] **Enable pg_cron** — Supabase Dashboard → Database → Extensions; verify monthly retention job after applying `003_retention_cleanup.sql`
- [ ] **Configure Supabase Auth** — redirect URLs, email confirmation, Google provider, **rate limits** (SEC-16b)
- [ ] **Set production environment variables** — `ENVIRONMENT=production`, all Supabase keys, Redis URL, AI keys, `FRONTEND_URL`, `TRUSTED_PROXY_IPS`
- [ ] **Inject frontend config at deploy** — `API_BASE=/api SUPABASE_URL=… SUPABASE_ANON_KEY=… ./scripts/inject-config.sh`
- [ ] **Provision TLS** — certs on nginx/Caddy/Render; verify HTTP→HTTPS redirect and HSTS on live URL
- [ ] **Configure monitoring (optional)** — set `SENTRY_DSN` on API service in Render; external uptime ping on `/health` if desired
- [ ] **Post-deploy smoke test** — OAuth (hash cleared), recommendations (verified email), rate limit 429, `/ready` 200

### 6.5 Remaining Tasks (operator-only)

No further code changes required for MVP/staging. Before public beta:

1. 🔑 Rotate secrets + scrub git history (SEC-01)
2. 🔑 Apply schema + enable pg_cron on live Supabase (SEC-06, PRIV-01, DEPLOY-07)
3. 🔑 Configure Supabase Auth (rate limits, redirects, email confirmation)
4. 🔑 Provision TLS + production env vars on hosting platform
5. 🔑 Set `SENTRY_DSN` in Render (optional but recommended for production error tracking)

**Accepted dev-simple tradeoffs (no action required):**
- Tailwind CDN without SRI (SEC-18)
- Mocked IDOR/deletion tests; manual staging smoke in runbook (SEC-09, PRIV-02)

### 6.6 Final Verdict

**⚠️ Almost — ready for staging after Human Action Checklist**

All code-path blockers are addressed or accepted as documented partials. Local dev is unchanged: no new mandatory env vars, no build steps, no test Supabase project. Remaining gate is operator work on the hosting platform and Supabase Dashboard.

---

### 6.7 Re-verification Delta (2026-06-22, P2 dev-simple pass)

| Change | Items affected | Status shift |
|--------|----------------|--------------|
| Optional `SENTRY_DSN` + sentry-sdk init | DEPLOY-05 | ❌ Missing → ⚠️ Partial (code-ready) |
| SEC-18 / SEC-09 / PRIV-02 marked accepted partial | B15, B2, B17 | Documented dev-simple tradeoffs |
| §6.5 trimmed to operator-only tasks | — | No code tasks remain |

**Tests run locally:** 13 pytest passed (SENTRY_DSN unset — no Sentry init).

---

*Report generated for internal use. Original audit: 2026-06-19. Verification pass: 2026-06-22. Code remediation + P2 dev-simple pass: 2026-06-22. Re-run after major releases or before each production deploy.*
