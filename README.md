# Project UAS - MovieReview (AI Movie Recommendation)

Proyek ini menggunakan arsitektur modern dengan **FastAPI (Python)** sebagai Backend dan **Vanilla JS / HTML / Tailwind CSS** sebagai Frontend.

## Persyaratan (Prerequisites)

- Python 3.10+ (sudah terinstal dan ada di PATH)
- Akun Supabase (untuk Database & Auth)
- API Keys (DeepSeek AI & TMDB)
- Redis (for production rate limiting; optional for local dev via docker-compose)

### Frontend config (required)

`frontend/Static/js/config.js` is **gitignored** and must be created locally:

```bash
cp frontend/Static/js/config.example.js frontend/Static/js/config.js
```

Edit `config.js` with your Supabase URL and anon key (from `.env`). TMDB calls are proxied through the backend — no TMDB key in the frontend.

For production deploy, use `scripts/inject-config.sh` to substitute placeholders, or serve via nginx with same-origin `/api` proxy.

**Production (Render + Supabase):** see [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md).

---

## 🚀 Cara Menjalankan Proyek (Local Development)

Untuk menjalankan aplikasi ini secara lokal, Anda perlu menjalankan Backend dan Frontend secara bersamaan di dua terminal yang berbeda.

### 1. Menjalankan Backend (Terminal 1)

Backend dibangun menggunakan FastAPI. Ikuti langkah-langkah berikut di terminal pertama:

**Langkah-langkah (Windows):**
```powershell
# 1. Masuk ke direktori backend
cd backend

# 2. Buat virtual environment (jika belum ada)
python -m venv .venv

# 3. Aktifkan virtual environment
# Jika menggunakan PowerShell:
.\.venv\Scripts\Activate.ps1
# Jika menggunakan Command Prompt (CMD):
.\.venv\Scripts\activate

# 4. Instal semua dependensi yang dibutuhkan
pip install -r requirements.txt

# 5. Jalankan server FastAPI menggunakan Uvicorn
uvicorn app.main:app --reload --port 8000
```
*Backend API akan berjalan di: `http://localhost:8000`*
*Dokumentasi API (Swagger UI) dapat diakses di: `http://localhost:8000/docs`*


### 2. Menjalankan Frontend (Terminal 2)

Frontend terdiri dari file HTML, CSS, dan JavaScript statis. Ada beberapa cara untuk menjalankannya:

**Cara A: Menggunakan ekstensi "Live Server" di VS Code (Sangat Disarankan)**
1. Buka folder root proyek (`Project-UAS-web`) atau langsung buka folder `frontend` di VS Code.
2. Buka folder `frontend`, lalu cari file `index.html`.
3. Klik kanan pada file `index.html` dan pilih **"Open with Live Server"**.
4. Browser akan otomatis terbuka dan menampilkan web app Anda.

**Cara B: Menggunakan HTTP Server bawaan Python (Alternatif)**
Buka terminal kedua dan jalankan perintah berikut:
```powershell
# 1. Masuk ke direktori frontend
cd frontend

# 2. Jalankan server statis menggunakan Python
python -m http.server 5500
```
*Buka browser dan akses: `http://localhost:5500`*

---

## Troubleshooting Umum

- **`ImportError` atau "Module not found" saat menjalankan backend:**
  Pastikan virtual environment (`.venv`) sudah aktif (biasanya ditandai dengan tulisan `(.venv)` di awal baris terminal) sebelum menjalankan `pip install` dan perintah `uvicorn`.

- **CORS Error saat frontend mencoba memanggil API backend:**
  Pastikan backend berjalan di port `8000` dan pastikan file JavaScript di frontend sudah menunjuk URL yang benar ke `http://localhost:8000`.

- **Fitur rekomendasi atau autentikasi error / tidak bekerja:**
  Pastikan file `.env` di folder root atau `backend` sudah diatur dengan benar (berisi kredensial Supabase, TMDB API Key, dan AI API Key). Anda bisa menjadikan file `.env.example` sebagai referensi struktur key-nya.
