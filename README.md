# SJ MovieReview — AI Movie Recommendations

A full-stack movie recommendation app: **FastAPI** backend, **static HTML/JS/Tailwind** frontend, **Supabase** auth & database, **TMDB** metadata, and **Gemini/DeepSeek** for AI picks.

| Layer | Stack |
|-------|--------|
| Backend | FastAPI, Redis rate limiting, optional Sentry |
| Frontend | Vanilla JS, Supabase Auth (PKCE), Tailwind CDN |
| Data | Supabase Postgres + RLS |
| Deploy | Docker, Render blueprint, nginx (see docs) |

---

## Prerequisites

- **Python 3.12+** (matches CI)
- **Node.js 24+** (frontend utils tests in CI; optional locally)
- **Supabase** project (auth + database)
- **API keys:** TMDB, Gemini and/or DeepSeek
- **Redis** — optional locally; required for production rate limits (`docker compose up redis`)

---

## Quick start (local)

### 1. Clone and configure

```bash
cp .env.example .env
# Edit .env — Supabase, TMDB, AI keys, FRONTEND_URL=http://localhost:5500

cp frontend/Static/js/config.example.js frontend/Static/js/config.js
# Edit config.js — SUPABASE_URL, SUPABASE_ANON_KEY (API_BASE defaults to localhost:8000)
```

Apply the database schema once:

```bash
SUPABASE_DB_PASSWORD='your-db-password' ./scripts/apply_supabase_schema.sh
```

### 2. Backend (terminal 1)

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.lock
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000  
- Swagger (dev only): http://localhost:8000/docs  
- Health: http://localhost:8000/health  

### 3. Frontend (terminal 2)

Use **Live Server** on `frontend/index.html` (port **5500**), or:

```bash
cd frontend && python -m http.server 5500
```

Open http://localhost:5500 — use `localhost`, not `127.0.0.1` (OAuth PKCE).

### 4. Redis (optional locally)

Rate limits use Redis in production. For local testing:

```bash
docker compose up redis -d
# REDIS_URL=redis://localhost:6379 in .env
```

Or run the full stack:

```bash
docker compose up --build
```

---

## Environment variables

Copy from [`.env.example`](.env.example). Key values:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_*` | Auth + database (service role **backend only**) |
| `TMDB_API_KEY` | Movie metadata (backend only — not in frontend) |
| `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` | AI recommendations |
| `REDIS_URL` | Rate limiting |
| `FRONTEND_URL` | CORS origin (e.g. `http://localhost:5500`) |
| `ENVIRONMENT` | `development` \| `staging` \| `production` |
| `SENTRY_DSN` | Optional error tracking |

**Never commit** `.env` or `frontend/Static/js/config.js`.

---

## Testing & CI

```bash
# Backend (from repo root)
pip install -r backend/requirements.lock
pytest tests/ -v

# Frontend utils
node frontend/Static/js/utils.test.js

# Lint
ruff check backend/app tests
pip-audit -r backend/requirements.lock
```

GitHub Actions (`.github/workflows/ci.yml`) runs ruff, pytest, pip-audit, gitleaks, and frontend tests on push/PR.

---

## Deployment

| Guide | Use when |
|-------|----------|
| [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md) | Deploy to Render + Supabase (recommended) |
| [docs/DEPLOYMENT_RUNBOOK.md](docs/DEPLOYMENT_RUNBOOK.md) | Pre-go-live checklist (secrets, schema, TLS, pg_cron) |
| [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) | Security findings and remediation status |

Production frontend config:

```bash
API_BASE=/api SUPABASE_URL=... SUPABASE_ANON_KEY=... ./scripts/inject-config.sh
```

Or use `scripts/render-build-frontend.sh` on Render static sites.

---

## Project layout

```
backend/app/          FastAPI app (routers, services, auth, Redis)
frontend/             Static HTML pages + Static/js/
scripts/              Schema apply, config inject, Render build
supabase_migrations/  RLS lockdown, retention cleanup (pg_cron)
tests/                Pytest (auth, export, deletion, rate limits)
deploy/nginx.conf     Production TLS + API proxy reference
docker-compose.yml    Backend + Redis
render.yaml           Render blueprint
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Module not found` (backend) | Activate `.venv`; install from `requirements.lock` |
| CORS errors | Backend on `:8000`; `FRONTEND_URL` matches frontend origin |
| Auth / OAuth fails | Use `localhost` not `127.0.0.1`; add redirect URLs in Supabase Dashboard |
| Empty recommendation history | Run `./scripts/apply_supabase_schema.sh` |
| Rate limit / Redis errors | Start Redis or set `REDIS_URL` |
| Recommendations 403 | Verify email in Supabase (required for `/generate`) |

---

## Security notes

- `config.js` is **gitignored** — use `config.example.js` locally; inject at deploy.
- If API keys were ever committed, **rotate** them and consider scrubbing git history.
- See [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) for the full audit and operator checklist.

---

## License

Academic / project use — see course requirements for your institution.
