# Deploy on Render + Supabase

This project uses **Supabase** for auth/database and **Render** for hosting:

| Service | Render type | URL example |
|---------|-------------|-------------|
| Frontend (static HTML/JS) | Static Site | `https://sj-moviereview-web.onrender.com` |
| Backend (FastAPI) | Web Service (Docker) | `https://sj-moviereview-api.onrender.com` |
| Rate-limit store | Redis (Key Value) | internal `REDIS_URL` |

---

## Before you deploy

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply schema (local machine, once):

   ```bash
   cp .env.example .env
   # Fill SUPABASE_URL and SUPABASE_DB_PASSWORD in .env

   SUPABASE_DB_PASSWORD='your-db-password' ./scripts/apply_supabase_schema.sh
   ```

3. In **Authentication → URL Configuration**, add redirect URLs (update after Render deploy):

   - `https://YOUR-FRONTEND.onrender.com/auth-callback.html`
   - `https://YOUR-FRONTEND.onrender.com/reset-password.html`

4. Enable **Email** provider, **Confirm email**, and **Rate limits**.

5. Copy from **Project Settings → API**:

   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - JWT secret from **JWT Settings** → `SUPABASE_JWT_SECRET`

### 2. API keys

- TMDB API key (rotate if it was ever committed to git)
- Gemini and/or DeepSeek key for recommendations

---

## Option A — Blueprint (recommended)

1. Push this repo to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect the repo — Render reads [`render.yaml`](../render.yaml) and creates 3 services.
4. When prompted, enter **secret env vars** for both `sj-moviereview-api` and `sj-moviereview-web`:

   | Variable | Used by |
   |----------|---------|
   | `SUPABASE_URL` | API + frontend build |
   | `SUPABASE_ANON_KEY` | API + frontend build |
   | `SUPABASE_JWT_SECRET` | API only |
   | `SUPABASE_SERVICE_ROLE_KEY` | API only |
   | `TMDB_API_KEY` | API only |
   | `GEMINI_API_KEY` | API only |
   | `DEEPSEEK_API_KEY` | API only (optional fallback) |

5. Wait for all services to deploy (API builds Docker image; frontend runs `render-build-frontend.sh`).
6. Copy your **frontend URL** (e.g. `https://sj-moviereview-web.onrender.com`).
7. Update **Supabase Auth redirect URLs** with that exact domain.
8. Verify:
   - `https://YOUR-API.onrender.com/health` → `{"status":"ok"}`
   - `https://YOUR-API.onrender.com/ready` → `{"ready":true,...}`
   - Open frontend → sign in → generate recommendations (verified email required)

---

## Option B — Manual setup

### Backend (Web Service)

| Setting | Value |
|---------|-------|
| Environment | Docker |
| Dockerfile | `./Dockerfile` |
| Health check | `/health` |
| Plan | Free or Starter |

**Environment variables:**

```
ENVIRONMENT=production
TRUSTED_PROXY_IPS=*
REDIS_URL=<from Render Redis service → Internal Redis URL>
FRONTEND_URL=https://your-frontend.onrender.com
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_JWT_SECRET=...
SUPABASE_SERVICE_ROLE_KEY=...
TMDB_API_KEY=...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
```

### Redis (Key Value)

Create a **Redis** instance on Render (free tier available). Paste its **Internal Connection URL** into the API service as `REDIS_URL`.

### Frontend (Static Site)

| Setting | Value |
|---------|-------|
| Root directory | (repo root) |
| Build command | `chmod +x scripts/render-build-frontend.sh && ./scripts/render-build-frontend.sh` |
| Publish directory | `frontend` |

**Build environment variables:**

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
API_BASE=https://your-api.onrender.com
```

(`API_BASE` must be the full HTTPS URL of your API service.)

---

## Free tier notes

- **Web services spin down** after ~15 min idle; first request may take 30–60s (cold start).
- **Redis free** has limited memory — fine for rate-limit keys.
- AI recommendation calls can take 15–30s; if you hit timeouts, upgrade API plan or increase request timeout in Render settings.

---

## Custom domain (optional)

1. Render → Static Site → **Custom Domains** → add `www.yourdomain.com`.
2. Render → API → **Custom Domains** → add `api.yourdomain.com`.
3. Update Supabase redirect URLs to use your custom domain.
4. Set `FRONTEND_URL=https://www.yourdomain.com` on the API service.
5. Rebuild frontend with `API_BASE=https://api.yourdomain.com`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| CORS error in browser | `FRONTEND_URL` on API must exactly match frontend origin (scheme + host, no trailing slash). |
| `Rate limiting unavailable` | Check `REDIS_URL` on API; `/ready` should show `"redis": true`. |
| OAuth redirect fails | Add exact callback URL in Supabase; use `localhost` not `127.0.0.1` for local dev only. |
| `503` on `/ready` | Run `apply_supabase_schema.sh`; tables missing in Supabase. |
| Recommendations 403 | Verify email in Supabase Auth before generating. |

---

## Local dev (unchanged)

```bash
docker compose up -d redis
cd backend && uvicorn app.main:app --reload --port 8000
cd frontend && python -m http.server 5500
```

Use `config.js` with `API_BASE: 'http://localhost:8000'` for local testing.
