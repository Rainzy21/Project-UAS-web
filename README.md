Project UAS - MovieReview
=========================

Quick setup and run instructions for development (Windows)

Prerequisites
- Python 3.10+ installed and on PATH
- Git (optional)

Recommended structure note
This repository contains two similar top-level folders with a `backend/manage.py` and
`Project-UAS-web/backend/manage.py`. Use the `manage.py` inside the `backend` folder
you intend to run. The README examples assume you run the one at `backend/manage.py`.

Steps (PowerShell)
1. Open PowerShell and change to the backend folder:

```powershell
cd 'C:\Users\Lenovo\Documents\GitHub\Project-UAS-web\backend'
```

2. Create and activate a virtual environment:

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force   # if activation blocked
.\.venv\Scripts\Activate.ps1
```

3. Upgrade pip and install dependencies:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

4. Apply database migrations:

```powershell
python manage.py migrate
```

5. Run the dev server:

```powershell
python manage.py runserver
```

6. Open browser to `http://127.0.0.1:8000/`

Steps (Cmd.exe)
1. From project root:

```cmd
cd C:\Users\Lenovo\Documents\GitHub\Project-UAS-web\backend
python -m venv .venv
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Troubleshooting
- "No module named 'django'": ensure venv is activated and `pip install -r requirements.txt` completed successfully.
- Template tags displayed raw (e.g. `{% load static %}`): you are probably opening the HTML file directly in the browser or serving it as a static file; run the Django dev server and access via `http://127.0.0.1:8000/` instead.
- `staticfiles.W004` warnings: the settings now include candidate `templates`/`static` paths only when they exist. If you still see warnings check the `STATICFILES_DIRS` and `TEMPLATES['DIRS']` values in `backend/core/settings.py`.
- `NoReverseMatch` for named URL: ensure the name used in `{% url %}` exists in `backend/core/urls.py`.

Next steps you might want
- Standardize template filenames to lowercase (e.g., `Base.html` → `base.html`) to avoid case-sensitivity issues on different OS.
- Remove duplicate `frontend` folders and keep a single source of truth.
- Create a small `Makefile` or PowerShell script to automate venv creation and migrations.

If you want, I can: commit these README changes, or rename/standardize templates now.