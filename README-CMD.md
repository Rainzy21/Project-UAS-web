# Panduan Menjalankan Proyek di Windows (CMD / PowerShell)

Dokumen ini berisi panduan spesifik untuk menjalankan proyek rekomendasi film ini pada sistem operasi Windows menggunakan Command Prompt (CMD) atau PowerShell.

## 1. Persiapan Awal

1. Pastikan Anda sudah menginstal **Python 3.12+** dan sudah ditambahkan ke `PATH`.
2. Pastikan file `.env` sudah diisi dengan benar (seperti `SUPABASE_URL`, `TMDB_API_KEY`, dll).
3. Pastikan file `frontend\Static\js\config.js` sudah ada dan memiliki kredensial Supabase.

---

## 2. Menjalankan Backend (Buka Terminal/CMD ke-1)

Buka CMD atau PowerShell, arahkan ke folder proyek Anda, lalu jalankan perintah berikut baris demi baris:

```cmd
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

> **Catatan:** Jangan gunakan `requirements.lock` di Windows karena dapat menyebabkan error pada instalasi `uvloop`. Gunakan `requirements.txt`.

Jika berhasil, Anda akan melihat pesan:
`INFO:     Application startup complete.`

Backend dapat diakses di:
- API: http://localhost:8000
- Swagger/Docs: http://localhost:8000/docs

---

## 3. Menjalankan Frontend (Buka Terminal/CMD ke-2)

Buka jendela CMD atau PowerShell **baru**, arahkan ke folder proyek Anda, lalu jalankan perintah:

```cmd
cd frontend
python -m http.server 5500
```

Jika berhasil, biarkan terminal ini terbuka dan aplikasi web siap digunakan.
Buka browser dan kunjungi: **http://localhost:5500**

---

## 4. Menghentikan Server

Untuk menghentikan masing-masing server, tekan `Ctrl + C` pada masing-masing jendela CMD/PowerShell.
