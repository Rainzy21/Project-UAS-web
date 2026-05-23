# Frontend Plan — AI Movie Recommendation Website

## Overview

The frontend is a **static HTML/CSS/JavaScript** site served as plain files (no Django template engine needed). It talks exclusively to the FastAPI backend at `/api/...`. The browser never calls TMDB or Claude directly.

**Stack**
- HTML/CSS: Plain HTML5 + Tailwind CSS (CDN in dev, compiled in prod)
- Icons: Font Awesome 6
- JS: Vanilla ES2020+ (no framework — keeps the build zero-dependency)
- HTTP: `fetch` API with a thin wrapper that handles token injection and refresh
- Fonts: Google Fonts (current serif-title + sans)
- Serving: Any static file server (VS Code Live Server, Nginx, GitHub Pages, Netlify)

> The existing Django template syntax (`{% extends %}`, `{% url %}`, `{% static %}`) must be removed. Templates become standard `.html` files. All `{% url 'name' %}` references become plain paths (`/movies`, `/recommendations`, etc.).

---

## Project Structure

```
frontend/
├── index.html                    ← Home page
├── movies.html                   ← Browse all movies
├── detail.html                   ← Movie detail (loaded via ?id=tmdb_id)
├── recommendations.html          ← AI recommendation form + results
├── my-list.html                  ← Saved movies
├── history.html                  ← Recommendation history
├── profile.html                  ← User profile & settings
├── verify-email.html             ← Email verification landing page
├── reset-password.html           ← Password reset landing page
├── Static/
│   ├── css/
│   │   └── style.css             ← Custom styles (no change needed)
│   └── js/
│       ├── api.js                ← ★ Rewrite: fetch wrapper, token injection, auto-refresh
│       ├── auth.js               ← ★ New: login, register, logout, token storage
│       ├── nav.js                ← ★ New: navbar state (guest vs logged-in)
│       ├── movie.js              ← Rewrite: render cards, save/unsave, bind to backend
│       ├── recommendations.js    ← ★ New: form handling, result rendering
│       ├── my-list.js            ← ★ New: list page, filter/sort/delete
│       ├── profile.js            ← ★ New: profile page, edit name, delete account
│       ├── history.js            ← ★ New: recommendation history page
│       └── chat.js               ← Update: change proxy endpoint from Django to FastAPI
└── templates/
    └── partials/
        ├── movie_card.html       ← Keep as HTML fragment reference (JS builds cards)
        ├── chat_box.html         ← Keep (no change to structure)
        ├── footer.html           ← Keep (no change)
        ├── auth_modals.html      ← Rename from login.html + signup.html, add new states
        └── toast.html            ← ★ New: global toast notification container
```

---

## Pages & Routes

| URL | File | Auth required | Description |
|---|---|---|---|
| `/` | `index.html` | No | Hero + trending grid |
| `/movies.html` | `movies.html` | No | Browse all with genre filter |
| `/detail.html?id={tmdb_id}` | `detail.html` | No (save requires auth) | Movie detail |
| `/recommendations.html` | `recommendations.html` | Yes + verified | AI form + results |
| `/my-list.html` | `my-list.html` | Yes | Saved movies |
| `/history.html` | `history.html` | Yes | Past recommendation sessions |
| `/profile.html` | `profile.html` | Yes | Profile + settings |
| `/verify-email.html?token=...` | `verify-email.html` | No | Email verification |
| `/reset-password.html?token=...` | `reset-password.html` | No | Password reset |

---

## Auth State Management

### Token Storage

```
localStorage:
  app_access_token   — JWT access token (30-min lifetime)
  app_refresh_token  — JWT refresh token (30-day lifetime, rotated on use)
  app_user           — JSON: { id, name, email, email_verified }
```

> **Why `localStorage` and not cookies?** The FastAPI backend is on a different origin from the static frontend (e.g. `localhost:8000` vs `localhost:5500`). HttpOnly cross-origin cookies require `SameSite=None; Secure` which needs HTTPS even in local dev. `localStorage` with a short access token lifetime is a practical tradeoff for this project scope.

> **Security note:** Never store tokens in `sessionStorage` if you want persistence across tabs and refreshes. `localStorage` survives page close; be aware this increases XSS exposure — the CSP header on the server should be strict.

> **CDN risk and SRI:** This plan loads Font Awesome, Tailwind CDN, and Google Fonts from external servers. Any of those CDNs being compromised would give the attacker a script that can read `localStorage` and exfiltrate tokens silently. Add **Subresource Integrity (SRI) hashes** to every external `<script>` and `<link>` tag. SRI makes the browser refuse to execute a resource if its content no longer matches the expected hash — one attribute per tag but meaningful protection against supply-chain attacks:
> ```html
> <link
>   rel="stylesheet"
>   href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
>   integrity="sha384-<hash>"
>   crossorigin="anonymous"
> />
> <script
>   src="https://cdn.tailwindcss.com"
>   integrity="sha384-<hash>"
>   crossorigin="anonymous"
> ></script>
> ```
> Generate hashes at [srihash.org](https://www.srihash.org/) or with `openssl dgst -sha384 -binary file | openssl base64 -A`. Pin to exact version URLs (not floating `/latest` or unversioned CDN paths) so the hash stays valid.

### Auth State Object (`auth.js`)

```js
// Public surface exposed as window.Auth
{
  getUser()          → object | null
  getAccessToken()   → string | null
  isLoggedIn()       → boolean
  isEmailVerified()  → boolean
  saveTokens({ access_token, refresh_token, user })
  clearTokens()
  refreshTokens()    → Promise<boolean>  // returns false if refresh fails
}
```

### Token Refresh Flow

Every protected API call goes through `api.js`. On `401`:
1. Call `Auth.refreshTokens()` → `POST /api/auth/refresh`
2. If successful: save new tokens, retry original request once
3. If refresh also fails (token expired/revoked): call `Auth.clearTokens()`, redirect to `/?auth=required`, show login modal

```
Request → 401 → try refresh → success → retry → return response
                             → fail    → clear tokens → show login modal
```

---

## JavaScript Module Breakdown

### `api.js` — HTTP Client (Full Rewrite)

Central fetch wrapper. All other modules call this, never `fetch` directly.

```js
const API_BASE = 'http://localhost:8000';  // from config or window.APP_CONFIG

async function request(method, path, body, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = Auth.getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });

  if (res.status === 401 && !options._retry) {
    const refreshed = await Auth.refreshTokens();
    if (refreshed) return request(method, path, body, { ...options, _retry: true });
    // refresh failed — Auth module handles redirect
    return null;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw Object.assign(new Error(err.message || 'Request failed'), { code: err.code, status: res.status });
  }

  return res.status === 204 ? null : res.json();
}

export const api = {
  get:    (path, opts)       => request('GET',    path, null, opts),
  post:   (path, body, opts) => request('POST',   path, body, opts),
  patch:  (path, body, opts) => request('PATCH',  path, body, opts),
  delete: (path, opts)       => request('DELETE', path, null, opts),
};
```

> **Race condition — concurrent 401s:** If two requests fire at the same time and both receive a `401`, both will independently call `Auth.refreshTokens()`. The second refresh call will fail because the first call already rotated the token (the old refresh token is now on the denylist). The fix is to make `refreshTokens()` a **singleton promise**: if a refresh is already in-flight, all subsequent callers attach to the same promise rather than starting a new one. Implement in `auth.js`:
> ```js
> let _refreshPromise = null;
> 
> async function refreshTokens() {
>   if (_refreshPromise) return _refreshPromise;  // wait on the existing in-flight refresh
>   _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null; });
>   return _refreshPromise;
> }
> ```
> This ensures only one `/api/auth/refresh` call is ever in-flight at a time, and all concurrent 401 retriers get the same result.

**Config injection** — put one script tag before all others in each HTML file:
```html
<script>
  window.APP_CONFIG = { API_BASE: 'http://localhost:8000' };
</script>
```

---

### `auth.js` — Auth Actions

Handles all auth API calls and token storage.

**Functions**

| Function | Endpoint | Notes |
|---|---|---|
| `login(email, password)` | `POST /api/auth/login` | Saves tokens, updates nav |
| `register(name, email, password)` | `POST /api/auth/register` | Saves tokens, shows verify-email banner |
| `logout()` | `POST /api/auth/logout` | Clears tokens, redirects to `/` |
| `refreshTokens()` | `POST /api/auth/refresh` | Rotates tokens, returns bool |
| `forgotPassword(email)` | `POST /api/auth/forgot-password` | Shows success message regardless |
| `resetPassword(token, newPassword)` | `POST /api/auth/reset-password` | Redirects to login on success |
| `resendVerification()` | `POST /api/auth/resend-verification` | Rate-limited to 3/hour |
| `verifyEmail(token)` | `POST /api/auth/verify-email` | Called on verify-email.html load |

**Error Handling**

| Backend error code | UI action |
|---|---|
| `INVALID_CREDENTIALS` | Show "Incorrect email or password" under the form |
| `RATE_LIMITED` | Show "Too many attempts. Try again in X minutes." |
| `EMAIL_NOT_VERIFIED` | Show email verification banner, offer resend link |

---

### `nav.js` — Navbar State

Runs on every page (`<script src="...nav.js">` in every HTML file's `<body>`).

**Logged-out state (default)**
```html
<button id="login-trigger">Login / Sign Up</button>
```

**Logged-in state (injected by nav.js)**
```html
<div class="user-menu">
  <span>{user.name}</span>
  <a href="/my-list.html">My List</a>
  <a href="/recommendations.html">Get Recommendations</a>
  <a href="/profile.html">Profile</a>
  <button id="logout-btn">Logout</button>
</div>
```

**Email not verified banner** — shown below nav if `user.email_verified === false`:
```html
<div class="verify-banner">
  Your email is not verified.
  <button onclick="Auth.resendVerification()">Resend verification email</button>
</div>
```

---

### `movie.js` — Movie Card & Save (Rewrite)

Remove all direct TMDB calls. Data now comes from the backend.

**Card rendering** — same DOM structure as current, but data comes from:
- `GET /api/movies/my-list` (my list page)
- `POST /api/recommendations/generate` response (recommendations page)
- Home page: `GET /api/movies/my-list` is not right — home page shows trending. Backend should expose `GET /api/movies/trending` or the home page can keep calling TMDB via the backend. **See note below.**

> **Home page trending movies:** The backend plan does not include a trending endpoint. Two options:
> 1. Add `GET /api/movies/trending` to the backend (proxies TMDB trending — recommended)
> 2. Keep calling TMDB directly from the frontend only for the home page trending grid (acceptable since no auth or private data is involved)
> 
> **Recommended: option 2 for now** (trending is public read-only data, no auth needed, low risk). The existing `api.js` TMDB fetch stays for this one use case. Mark it clearly in code with a `// PUBLIC: direct TMDB call` comment so it's easy to replace later.

**Save / Unsave button**

```js
async function toggleSave(tmdb_id, btnEl) {
  if (!Auth.isLoggedIn()) {
    showLoginModal("Please login to save movies.");
    return;
  }
  if (!Auth.isEmailVerified()) {
    showToast("Please verify your email first.", "warning");
    return;
  }
  // call POST /api/movies/save
  await api.post('/api/movies/save', { movies: [{ tmdb_id }] });
  btnEl.classList.toggle('saved');
}
```

---

### `recommendations.js` — AI Form (New)

**Page:** `recommendations.html`

**Form fields (dropdowns — all values match backend allowlists)**

| Field | Options |
|---|---|
| Genre (multi-select, max 3) | Action, Drama, Comedy, Horror, Sci-Fi, Romance, Thriller, Animation |
| Mood | Feel good, Dark & intense, Thrilling, Emotional, Lighthearted |
| Era | Classic, 80s-90s, 2000s, 2010s, Recent, Any |
| Language | English, Korean, Spanish, French, Japanese, Any |
| Watching with | Solo, Partner, Friends, Family |

> All `<select>` / `<button>` values are hardcoded to the backend allowlist. No free-text inputs. This means injection is structurally impossible from the frontend side (the backend still validates server-side as the authoritative check).

**Flow**
1. User fills form → clicks "Get Recommendations"
2. Show loading state (spinner, disable submit button)
3. `POST /api/recommendations/generate` with 5 values
4. On success: render 10 movie cards with save buttons
5. On `EMAIL_NOT_VERIFIED` 403: show banner "Verify your email to use AI recommendations"
6. On `RATE_LIMITED` 429: show "You've used all 10 recommendations for today. Come back tomorrow."
7. On `AI_ERROR` / `TMDB_ERROR` 502: show "Something went wrong on our end. Try again."

**UI States**
- Empty: form centered, friendly prompt text
- Loading: skeleton cards or spinner overlay
- Results: 2-column or 3-column grid of cards (same component as movies page)
- Error: inline error message with retry button

**Save from results**

Each result card has a "+ Save" button. After saving, it changes to "✓ Saved". No page reload needed — update button state in-place.

---

### `my-list.js` — Saved Movies (New)

**Page:** `my-list.html`

**API calls**

| Action | Endpoint |
|---|---|
| Load list | `GET /api/movies/my-list` |
| Filter by genre | `GET /api/movies/my-list?genre=Action` |
| Filter by tag | `GET /api/movies/my-list?tag=Must+watch` |
| Sort | `GET /api/movies/my-list?sort=rating&order=desc` |
| Edit note/tag | `PATCH /api/movies/saved/{saved_id}` |
| Remove movie | `DELETE /api/movies/saved/{saved_id}` |

**UI**
- Filter bar: genre pills + tag dropdown + sort dropdown (same visual style as movies page)
- Cards show: poster, title, year, rating, user's note, user's tag
- Click card → go to `detail.html?id={tmdb_id}`
- Remove button on each card → confirm dialog → DELETE → remove card from DOM
- Empty state: "Your list is empty. Get recommendations to start saving movies."

**Pagination**
- Load more button (same pattern as movies page)
- Append results to grid on click

---

### `history.js` — Recommendation History (New)

**Page:** `history.html`

**API calls**

| Action | Endpoint |
|---|---|
| Load history | `GET /api/recommendations/history?page=1&limit=20` |

**UI**
- List of past sessions: date, preferences used (genre chips, mood badge, etc.), movie count
- Click session → expand inline to show the movies returned, OR navigate to a detail view
- Pagination: load more button

**Session card layout**
```
[Date & time]                          [X movies]
Genre: Action, Thriller  |  Mood: Thrilling  |  Era: 2010s
Language: Any  |  With: Friends
[Expand to see movies ▼]
```

---

### `profile.js` — Profile Page (New)

**Page:** `profile.html`

**Sections**

**1. Profile info**
- Load `GET /api/users/me` on page load
- Display: name, email, member since date
- Edit name inline: click pencil icon → input field → "Save" button → `PATCH /api/users/me`
- Email is read-only (display only, no edit)

**2. Email verification status**
- If not verified: yellow banner with "Resend verification email" button
- If verified: green checkmark badge next to email

**3. Change password**
- Form: current password + new password + confirm new password
- This flow is separate from reset-password. Backend needs `PATCH /api/users/me/password` endpoint.
- > **Note:** The backend plan does not include a "change password while logged in" endpoint. Add `PATCH /api/users/me/password` to the backend, requiring `current_password` + `new_password`. Until then, users can use "Forgot Password" flow.

**4. Delete account**
- Red "Delete Account" button at bottom
- Opens confirmation modal: "This will permanently delete your account and all saved movies."
- Requires typing current password in the modal
- On confirm: `DELETE /api/users/me` with `{ current_password }` in body
- On success: clear tokens, redirect to `/`

---

### `chat.js` — AI Chat (Update + Backend Spec)

Update the proxy endpoint and add auth header. Beyond that `chat.js` itself needs no structural changes.

```js
// Before (Django proxy)
const res = await fetch('/api/chat/', { ... });

// After (FastAPI proxy — sends auth token if logged in)
const res = await fetch(window.APP_CONFIG.API_BASE + '/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(Auth.getAccessToken() && { Authorization: `Bearer ${Auth.getAccessToken()}` }),
  },
  body: JSON.stringify({ messages: history }),
});
```

> **`/api/chat` must be specified before it is built — it is the highest-cost and most abuse-prone endpoint in the system.** It should not be added as an afterthought. The backend spec for this endpoint:
>
> **Model:** DeepSeek (current chat model — verify exact model ID at build time). Claude is used only for structured recommendation output; DeepSeek is lower-cost for open-ended chat.
>
> **System prompt (server-side, never sent to client)**
> ```
> You are a helpful movie assistant for the SJ MovieReview platform.
> You help users discover movies, explain plots, compare films, and answer
> movie-related questions. You do not discuss topics unrelated to film and
> entertainment. Keep responses concise (under 150 words unless asked to elaborate).
> ```
>
> **Rate limiting:** 20 messages per user per hour (keyed by `user_id` if logged in, by IP if guest). Chat is intentionally available to guests for discoverability — but guest requests must be IP-rate-limited more aggressively (10/hour) to prevent anonymous abuse.
>
> **Request body from client:** `{ messages: [{ role, content }] }` — user/assistant turns only, no system prompt in the array. The backend prepends the system prompt before forwarding to DeepSeek.
>
> **Response:** `{ reply: "..." }` — the assistant's text only.
>
> **Input validation:** Reject any `content` value exceeding 500 characters. Reject any `messages` array longer than 20 turns (trim oldest turns client-side before sending).
>
> Add this endpoint spec to the backend plan as `POST /api/chat`.

---

## Page-by-Page Specification

### `index.html` — Home

**Components**
- Navbar (nav.js)
- Hero banner (static content for now — can be replaced with a featured movie from backend later)
- "What to Watch" section — trending grid from TMDB (direct call, see movie.js note)
- Chat box (chat.js)
- Footer
- Auth modals

**Scripts loaded** (in order, at bottom of `<body>`)
```html
<script>window.APP_CONFIG = { API_BASE: 'http://localhost:8000' };</script>
<script src="Static/js/api.js" type="module"></script>
<script src="Static/js/auth.js" type="module"></script>
<script src="Static/js/nav.js" type="module"></script>
<script src="Static/js/movie.js" type="module"></script>
<script src="Static/js/chat.js" type="module"></script>
```

> Use ES modules (`type="module"`) so files can `import` from each other without a bundler.

---

### `movies.html` — Browse All

**Components**
- Navbar
- Genre filter pills (client-side filter against rendered cards, or re-fetch with `?genre=`)
- Movie grid (rendered by movie.js from TMDB trending/popular — same note as home)
- Load more button
- Chat box / Footer

**Improvements over current version**
- Genre filter buttons should filter by re-fetching, not just showing/hiding DOM nodes
- All genres from backend allowlist rendered dynamically (no hardcoded "Action", "Sci-Fi" only)

---

### `detail.html` — Movie Detail

**Data loading**
```js
const params = new URLSearchParams(location.search);
const tmdbId = params.get('id');
// Fetch from backend (if saved), or directly from TMDB for metadata display
```

> The backend has no public `GET /api/movies/{tmdb_id}` detail endpoint (only saved-list endpoints). For the detail page, either:
> 1. Fetch TMDB metadata directly (acceptable for read-only public data)
> 2. Add `GET /api/movies/{tmdb_id}` to the backend

**Components**
- Backdrop/poster hero (full-width)
- Title, year, rating, genres, language, runtime
- Overview text
- "+ Save to My List" button (calls `POST /api/movies/save`)
- "Already saved" state — see note below
- Note/tag input fields (shown after saving — call `PATCH /api/movies/saved/{saved_id}`)

> **"Already saved" check — avoid fetching the full list.** Fetching `GET /api/movies/my-list` just to check whether one movie is saved is wasteful and gets slower as the user's list grows. Two better options:
>
> **Option A (recommended): dedicated status endpoint** — add `GET /api/movies/saved/status?tmdb_ids=496243,27205` to the backend. Returns `{ "496243": { saved: true, saved_id: "uuid" }, "27205": { saved: false } }`. One call can resolve the save state for an entire page of cards at once (detail page, recommendations results, etc.).
>
> **Option B: client-side cache** — after loading `GET /api/movies/my-list` on the my-list page, store the set of saved `tmdb_id`s in a module-level `Set` in `movie.js`. Other pages check the cache. Invalidate on save/unsave. Works well if the my-list page is always visited before detail pages; breaks if the user navigates directly to a detail page on a fresh session.
>
> Option A is cleaner. Add `GET /api/movies/saved/status` to the backend gaps list.

---

### `recommendations.html` — AI Form

**Guard:** Redirect to `/?auth=required` if not logged in. Show email verification banner if `email_verified === false`.

**Layout**
```
[Header: "Get AI Movie Recommendations"]
[Subtext: "Tell us your preferences and Claude will curate 10 perfect picks for you"]
[Daily usage counter: "3 / 10 used today" — show remaining from response or track client-side]

[Form: 5 fields in a card]
  Genre: [multi-select chips]
  Mood: [dropdown]
  Era:  [dropdown]
  Language: [dropdown]
  Watching with: [dropdown]
  [Submit button: "Find My Movies"]

[Results: grid of movie cards with save buttons]
```

---

### `verify-email.html` — Email Verification

Auto-runs on load:
```js
const token = new URLSearchParams(location.search).get('token');
if (token) {
  Auth.verifyEmail(token)
    .then(() => showSuccess("Email verified! You can now use AI recommendations."))
    .catch(() => showError("This link has expired or is invalid."));
}
```

**States**
- Loading: spinner
- Success: green checkmark, "Back to Home" button
- Error: red message, "Request a new verification link" button (calls resend endpoint)

---

### `reset-password.html` — Password Reset

Auto-reads `?token=` from URL.

**Form**
```
New Password: [input]
Confirm Password: [input]
[Reset Password button]
```

On submit: `Auth.resetPassword(token, newPassword)`.
On success: redirect to `/?message=password_reset`.
On error (`INVALID_RESET_TOKEN`): "This reset link has expired. Request a new one."

---

## Auth Modal States

Replace the current two separate modal files (`login.html`, `signup.html`) with a single `auth_modals.html` partial containing all states, toggled by JS:

| State | Trigger |
|---|---|
| `login` | "Login / Sign Up" nav button, restricted action click, `?auth=required` param |
| `signup` | "Create an account" link in login state |
| `forgot-password` | "Forgot Password?" link in login state |
| `forgot-sent` | After submitting forgot-password form |
| `email-unverified` | After login when `email_verified === false` |

The modal controller in `auth.js`:
```js
Auth.showModal('login');      // open to login tab
Auth.showModal('signup');     // open to signup tab
Auth.showModal('forgot-password');
Auth.hideModal();
```

---

## Toast Notification System

A lightweight global toast (`toast.html` partial included in every page) replaces `alert()` calls.

```js
// Global function available everywhere
window.showToast(message, type = 'info');
// type: 'success' | 'error' | 'warning' | 'info'
```

**Toast HTML (appended to `<body>` via JS)**
```html
<div id="toast-container" class="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">
  <!-- Toasts injected here, auto-remove after 4s -->
</div>
```

---

## Error Handling

**API error codes → UI messages**

| Code | Page / Context | Message shown |
|---|---|---|
| `INVALID_CREDENTIALS` | Login modal | "Incorrect email or password" |
| `TOKEN_EXPIRED` | Any page | Transparent — auto-refreshed |
| `TOKEN_REVOKED` | Any page | Redirect to login with "Session expired" toast |
| `EMAIL_NOT_VERIFIED` | Recommendations page | "Verify your email to use AI recommendations" banner |
| `RATE_LIMITED` | Login modal | "Too many attempts. Please wait before trying again." |
| `RATE_LIMITED` | Recommendations page | "You've reached today's limit (10 recommendations). Come back tomorrow." |
| `AI_ERROR` | Recommendations page | "Our AI service is temporarily unavailable. Try again in a moment." |
| `TMDB_ERROR` | Recommendations page | "Could not load movie data. Try again." |
| `VALIDATION_ERROR` | Recommendations form | "Please select a valid option for each field." (shouldn't happen with dropdown-only UI) |
| `NOT_FOUND` | Detail page | "Movie not found." |
| Network error | Any | "Check your connection and try again." toast |

---

## Security Checklist

- [ ] No API keys in frontend JS (TMDB key for trending only — acceptable for read-only public data; consider moving to backend later)
- [ ] All recommendation form inputs are dropdowns with hardcoded allowlist values — no free-text injected into prompts
- [ ] Access token short-lived (30 min); auto-refreshed transparently
- [ ] Refresh token rotation handled correctly — old token discarded on each use
- [ ] Tokens cleared from `localStorage` on logout
- [ ] `DELETE /api/users/me` always requires password confirmation dialog — no one-click delete
- [ ] No sensitive data logged to `console` in production build
- [ ] CORS: frontend URL registered in backend `settings.FRONTEND_URL`
- [ ] No `eval()`, `innerHTML` with user data, or `document.write()`  — always use `textContent` or DOM API for user-supplied strings
- [ ] Email verification check before rendering Recommendations page — client-side guard (server enforces as authoritative)

---

## Backend Gaps to Address

These features are needed by the frontend but missing from the current backend plan. Add them before wiring the frontend:

| # | Missing endpoint | Needed by |
|---|---|---|
| 1 | `GET /api/movies/trending` | Home page, movies page (alternative to direct TMDB call) |
| 2 | `GET /api/movies/{tmdb_id}` | Detail page (public movie metadata) |
| 3 | `GET /api/movies/saved/status?tmdb_ids=...` | Detail page, recommendation results (save state without full list fetch) |
| 4 | `PATCH /api/users/me/password` | Profile page change-password section |
| 5 | `POST /api/chat` | Chat box — see full spec in `chat.js` section above |

---

## Implementation Order

Recommended build sequence — each step is independently testable:

1. **Static shell + auth modal HTML** — Convert all `.html` files, remove Django syntax, build the `auth_modals.html` partial as static HTML (all states present in DOM, hidden by default). Confirm pages open in browser with no template errors.
2. **`api.js` + `auth.js` + modal wiring** — Wire login/register/logout, confirm tokens stored, navbar updates, modal open/close/switch between states. Auth modals must be functional here because login/register depend on them.
3. **`nav.js`** — Guest vs logged-in state, email-verified banner
4. **`movie.js` + home/movies pages** — Trending grid working (TMDB direct call while backend trending endpoint is added)
5. **`recommendations.js`** — Form → backend → result cards rendering
6. **`my-list.js`** — Save/unsave from cards, load list page, edit/delete
7. **`detail.html`** — Full detail view with save button + saved/status check
8. **`profile.js`** — Profile page, edit name, delete account
9. **`history.js`** — History page
10. **Remaining auth flows** — Forgot password / reset password / email verification states (modal states built in step 1, logic wired here)
11. **`chat.js`** — Update endpoint after `/api/chat` is added to backend
12. **Polish** — Toasts, loading skeletons, empty states, error states
