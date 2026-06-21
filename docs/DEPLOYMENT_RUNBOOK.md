# Deployment Runbook

> **Render + Supabase:** See [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) for step-by-step Render deployment (recommended).

## Pre-go-live checklist

### 1. Secret rotation (P0)
- Rotate TMDB API key in TMDB dashboard
- Review Supabase anon key; rotate if repo was ever public
- Never commit `.env` or `frontend/Static/js/config.js`
- If git history contained secrets, run `git filter-repo` before force-push

### 2. Supabase Dashboard
- **Authentication → Rate Limits:** enable sign-in and sign-up rate limits
- **Authentication → URL Configuration:** add redirect URLs:
  - `https://yourdomain.com/auth-callback.html`
  - `https://yourdomain.com/reset-password.html`
- **Authentication → Providers:** Email + Google as intended
- **Email confirmation:** enabled for sensitive features

### 3. Database schema
```bash
SUPABASE_DB_PASSWORD='...' ./scripts/apply_supabase_schema.sh
```
Verify RLS policies match `supabase_schema.sql` and `supabase_migrations/002_movies_rls_lockdown.sql`.

### 3b. Data retention (pg_cron)
Migration `supabase_migrations/003_retention_cleanup.sql` creates `cleanup_old_recommendation_logs()` and schedules it monthly (requires **pg_cron** extension — Supabase Pro).

- **Dashboard:** Database → Extensions → enable `pg_cron`
- **Verify job:** Database → Cron Jobs (or `SELECT * FROM cron.job;`)
- **Manual fallback:** `SELECT public.cleanup_old_recommendation_logs();`
- **Free tier:** run the manual SQL monthly via SQL Editor

### 3c. CDN / SRI note
Font Awesome and Supabase JS are pinned with SRI hashes in HTML. Tailwind CDN (`cdn.tailwindcss.com`) is a JIT compiler — byte-unstable, so SRI is not applied. CSP allowlists the host. Self-hosting compiled Tailwind is optional future hardening, not required for staging or MVP.

### 4. Environment variables
Copy `.env.example` to `.env` and set:
- `ENVIRONMENT=production`
- `REDIS_URL=redis://redis:6379` (or managed Redis URL)
- `FRONTEND_URL=https://yourdomain.com`
- All Supabase and API keys
- `SENTRY_DSN` (optional) — create a project at [sentry.io](https://sentry.io), paste the DSN; leave unset locally

### 5. Frontend config
```bash
API_BASE=/api SUPABASE_URL=... SUPABASE_ANON_KEY=... ./scripts/inject-config.sh
```

### 6. TLS / HTTPS
- Use `deploy/nginx.conf` or equivalent
- Terminate TLS at reverse proxy
- HTTP → HTTPS redirect enabled
- HSTS header set (included in nginx config)

### 7. Health checks and monitoring
- **Liveness:** `GET /health` (Render uses this via `healthCheckPath`)
- **Readiness:** `GET /ready` (checks Redis + Supabase schema)
- **Error tracking (optional):** set `SENTRY_DSN` on the API service; backend initializes Sentry only when DSN is present
- **Uptime:** Render health checks cover basic availability; add an external ping (e.g. UptimeRobot) on `/health` if desired

### 8. Docker deploy
```bash
docker compose up -d --build
```

## Post-deploy verification
- [ ] OAuth login completes; URL hash cleared after callback
- [ ] Recommendations require verified email
- [ ] Rate limit returns 429 after daily quota
- [ ] `/ready` returns 200
- [ ] Privacy policy linked from footer
- [ ] IDOR smoke (manual): User A cannot delete User B's preference preset
- [ ] Account deletion (manual staging): delete test user; confirm rows gone from app tables
