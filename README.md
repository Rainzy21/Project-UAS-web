# SJ MovieReview

Aplikasi rekomendasi film full-stack berbasis AI. Mendukung pencarian film cerdas dengan menganalisis genre, mood, era, dan bahasa menggunakan AI, serta fitur wishlist untuk menyimpan film favorit Anda.

![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)
![Frontend](https://img.shields.io/badge/Frontend-Tailwind%20CSS-38BDF8?style=flat-square&logo=tailwindcss)
![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?style=flat-square&logo=python)
![Database](https://img.shields.io/badge/Database-Supabase-3ECF8E?style=flat-square&logo=supabase)

---

## Fitur

| Fitur | Deskripsi |
|---|---|
| **Rekomendasi Cerdas AI** | Mencari rekomendasi film yang sangat spesifik berdasarkan preferensi mood, genre, bahasa, dan era |
| **Integrasi TMDB Live** | Mengambil data metadata film yang sedang tren secara *real-time* langsung dari TMDB API |
| **Autentikasi Aman** | Sistem login dan pendaftaran pengguna menggunakan Supabase Auth (PKCE) |
| **Wishlist (My List)** | Menyimpan film-film hasil rekomendasi atau trending ke dalam daftar tontonan pribadi |

- Pilihan model AI: **Google Gemini** atau **DeepSeek**
- Rate limiting menggunakan Redis untuk keamanan produksi
- Antarmuka responsif dengan carousel dinamis dan dark mode premium

---

## Tech Stack

- **Backend**: FastAPI + Uvicorn
- **Frontend**: HTML, Tailwind CSS (CDN), Vanilla JavaScript
- **Database & Auth**: Supabase (PostgreSQL + RLS)
- **External APIs**: TMDB API, Gemini API / DeepSeek API
- **Caching/Rate Limit**: Redis

---

## Instalasi

### 1. Clone repository

```bash
git clone https://github.com/Rainzy21/Project-UAS-web.git
cd Project-UAS-web
```

### 2. Konfigurasi Lingkungan (Environment)

Salin file `.env.example` menjadi `.env`, lalu isi dengan kredensial Supabase, TMDB, dan API Key AI Anda.

```bash
cp .env.example .env
```

Salin file konfigurasi frontend:

```bash
cp frontend/Static/js/config.example.js frontend/Static/js/config.js
```
*(Jangan lupa untuk memasukkan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` Anda di dalam `config.js`)*

Terapkan skema database (jalankan sekali):

```bash
SUPABASE_DB_PASSWORD='password-db-anda' ./scripts/apply_supabase_schema.sh
```

### 3. Jalankan Backend

Buka terminal pertama untuk menyalakan server API:

```bash
cd backend
python -m venv .venv

# Windows
.\.venv\Scripts\activate

# Linux/Mac
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 4. Jalankan Frontend

Buka terminal kedua untuk menyalakan server web statis:

```bash
cd frontend
python -m http.server 5500
```
Buka browser dan kunjungi `http://localhost:5500`. *(Pastikan mengakses menggunakan `localhost`, bukan `127.0.0.1`)*

---

## Deploy (Produksi)

Untuk panduan deployment ke Render (Backend) dan Vercel (Frontend), silakan baca dokumentasi khusus berikut:
- [Deploy ke Render (Panduan Lengkap)](docs/DEPLOY_RENDER.md)
- [Checklist Deployment & Keamanan](docs/DEPLOYMENT_RUNBOOK.md)

---

## Lisensi

Penggunaan akademik / proyek — sesuaikan dengan ketentuan institusi Anda.
