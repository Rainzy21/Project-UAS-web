# SJ MovieReview — Rekomendasi Film Berbasis AI

Aplikasi rekomendasi film full-stack: backend **FastAPI**, frontend **HTML/JS/Tailwind** statis, **Supabase** untuk auth & database, **TMDB** untuk metadata film, dan **Gemini/DeepSeek** untuk rekomendasi AI.

| Lapisan | Teknologi |
|---------|-----------|
| Backend | FastAPI, rate limiting Redis, Sentry (opsional) |
| Frontend | Vanilla JS, Supabase Auth (PKCE), Tailwind CDN |
| Database | Supabase Postgres + RLS |
| Deploy | Docker, blueprint Render, nginx (lihat docs) |

---

## Prasyarat

- **Python 3.12+** (sama dengan CI)
- **Node.js 24+** (tes utils frontend di CI; opsional di lokal)
- Proyek **Supabase** (auth + database)
- **API key:** TMDB, Gemini dan/atau DeepSeek
- **Redis** — opsional di lokal; wajib untuk rate limit produksi (`docker compose up redis`)

---

## Mulai cepat (lokal)

### 1. Clone dan konfigurasi

```bash
cp .env.example .env
# Edit .env — Supabase, TMDB, key AI, FRONTEND_URL=http://localhost:5500

cp frontend/Static/js/config.example.js frontend/Static/js/config.js
# Edit config.js — SUPABASE_URL, SUPABASE_ANON_KEY (API_BASE default ke localhost:8000)
```

Terapkan skema database sekali:

```bash
SUPABASE_DB_PASSWORD='password-db-anda' ./scripts/apply_supabase_schema.sh
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
- Swagger (hanya dev): http://localhost:8000/docs  
- Health: http://localhost:8000/health  

### 3. Frontend (terminal 2)

Pakai **Live Server** di `frontend/index.html` (port **5500**), atau:

```bash
cd frontend && python -m http.server 5500
```

Buka http://localhost:5500 — pakai `localhost`, bukan `127.0.0.1` (OAuth PKCE).

### 4. Redis (opsional di lokal)

Rate limit produksi memakai Redis. Untuk tes lokal:

```bash
docker compose up redis -d
# REDIS_URL=redis://localhost:6379 di .env
```

Atau jalankan stack lengkap:

```bash
docker compose up --build
```

---

## Variabel lingkungan

Salin dari [`.env.example`](.env.example). Nilai penting:

| Variabel | Fungsi |
|----------|--------|
| `SUPABASE_*` | Auth + database (service role **hanya backend**) |
| `TMDB_API_KEY` | Metadata film (hanya backend — tidak di frontend) |
| `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` | Rekomendasi AI |
| `REDIS_URL` | Rate limiting |
| `FRONTEND_URL` | Origin CORS (mis. `http://localhost:5500`) |
| `ENVIRONMENT` | `development` \| `staging` \| `production` |
| `SENTRY_DSN` | Pelacakan error (opsional) |

**Jangan pernah commit** `.env` atau `frontend/Static/js/config.js`.

---

## Tes & CI

```bash
# Backend (dari root repo)
pip install -r backend/requirements.lock
pytest tests/ -v

# Utils frontend
node frontend/Static/js/utils.test.js

# Lint & audit
ruff check backend/app tests
pip-audit -r backend/requirements.lock
```

GitHub Actions (`.github/workflows/ci.yml`) menjalankan ruff, pytest, pip-audit, gitleaks, dan tes frontend saat push/PR.

---

## Deploy

| Panduan | Kapan dipakai |
|---------|---------------|
| [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md) | Deploy ke Render + Supabase (disarankan) |
| [docs/DEPLOYMENT_RUNBOOK.md](docs/DEPLOYMENT_RUNBOOK.md) | Checklist sebelum go-live (secret, skema, TLS, pg_cron) |
| [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) | Temuan keamanan & status perbaikan |

Config frontend produksi:

```bash
API_BASE=/api SUPABASE_URL=... SUPABASE_ANON_KEY=... ./scripts/inject-config.sh
```

Atau pakai `scripts/render-build-frontend.sh` di Render static site.

---

## Struktur proyek

```
backend/app/          Aplikasi FastAPI (router, service, auth, Redis)
frontend/             Halaman HTML statis + Static/js/
scripts/              Apply skema, inject config, build Render
supabase_migrations/  Lockdown RLS, retention cleanup (pg_cron)
tests/                Pytest (auth, export, hapus akun, rate limit)
deploy/nginx.conf     Referensi TLS + proxy API produksi
docker-compose.yml    Backend + Redis
render.yaml           Blueprint Render
```

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `Module not found` (backend) | Aktifkan `.venv`; install dari `requirements.lock` |
| Error CORS | Backend di `:8000`; `FRONTEND_URL` sesuai origin frontend |
| Auth / OAuth gagal | Pakai `localhost` bukan `127.0.0.1`; tambah redirect URL di Supabase Dashboard |
| Riwayat rekomendasi kosong | Jalankan `./scripts/apply_supabase_schema.sh` |
| Error rate limit / Redis | Jalankan Redis atau set `REDIS_URL` |
| Rekomendasi 403 | Verifikasi email di Supabase (wajib untuk `/generate`) |

---

## Catatan keamanan

- `config.js` **di-gitignore** — pakai `config.example.js` di lokal; inject saat deploy.
- Jika API key pernah ter-commit, **rotasi** key dan pertimbangkan scrub history git.
- Lihat [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) untuk audit lengkap & checklist operator.

---

## Lisensi

Penggunaan akademik / proyek — sesuaikan dengan ketentuan institusi Anda.
