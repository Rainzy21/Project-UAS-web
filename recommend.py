#!/usr/bin/env python3
"""
Interactive terminal movie recommendation CLI.
Usage:
    python recommend.py
"""
from __future__ import annotations
import getpass
import json
import sqlite3
import sys

import httpx

BASE = "http://localhost:8000"
DB   = "backend/database.db"

# ── ANSI colours ─────────────────────────────────────────────────────────────
R  = "\033[0m"       # reset
B  = "\033[1m"       # bold
DIM = "\033[2m"      # dim
CY  = "\033[96m"     # cyan
GR  = "\033[92m"     # green
YL  = "\033[93m"     # yellow
RD  = "\033[91m"     # red
MG  = "\033[95m"     # magenta
BL  = "\033[94m"     # blue

# ── Options (must match backend allowlists) ───────────────────────────────────
GENRES = ["Action", "Drama", "Comedy", "Horror", "Sci-fi",
          "Romance", "Thriller", "Animation"]
MOODS  = ["Feel good", "Dark & intense", "Thrilling", "Emotional", "Lighthearted"]
ERAS   = ["Classic", "80s-90s", "2000s", "2010s", "Recent", "Any"]
LANGS  = ["English", "Korean", "Spanish", "French", "Japanese", "Any"]
WITH   = ["Solo", "Partner", "Friends", "Family"]

# ── helpers ───────────────────────────────────────────────────────────────────

def clear():
    print("\033[2J\033[H", end="")


def header():
    print(f"{CY}{B}")
    print("  ╔══════════════════════════════════════╗")
    print("  ║   🎬  Movie Recommendation CLI        ║")
    print("  ╚══════════════════════════════════════╝")
    print(f"{R}")


def pick(prompt: str, options: list[str], multi: bool = False) -> list[str] | str:
    """Numbered menu. multi=True returns a list, False returns a single value."""
    print(f"\n{B}{CY}  {prompt}{R}")
    for i, opt in enumerate(options, 1):
        print(f"  {DIM}{i:2}.{R}  {opt}")
    if multi:
        print(f"\n  {DIM}Enter numbers separated by commas (e.g. 1,3):{R} ", end="")
    else:
        print(f"\n  {DIM}Enter number:{R} ", end="")

    while True:
        raw = input().strip()
        try:
            if multi:
                indices = [int(x.strip()) for x in raw.split(",") if x.strip()]
                chosen = [options[i - 1] for i in indices if 1 <= i <= len(options)]
                if chosen:
                    return chosen
            else:
                idx = int(raw)
                if 1 <= idx <= len(options):
                    return options[idx - 1]
        except (ValueError, IndexError):
            pass
        print(f"  {RD}Invalid choice. Try again:{R} ", end="")


def stars(rating) -> str:
    if rating is None:
        return "n/a"
    filled = round(rating / 2)
    return "★" * filled + "☆" * (5 - filled) + f"  {rating:.1f}"


def print_movie(i: int, m: dict):
    title   = m.get("title", "Unknown")
    year    = m.get("year", "")
    rating  = m.get("rating")
    lang    = m.get("language", "")
    genres  = ", ".join(m.get("genres") or [])
    overview = (m.get("overview") or "")[:140]
    if len(m.get("overview") or "") > 140:
        overview += "…"

    print(f"\n  {B}{YL}{i:2}. {title}{R}  {DIM}({year})  {lang}{R}")
    print(f"      {GR}{stars(rating)}{R}")
    if genres:
        print(f"      {MG}{genres}{R}")
    if overview:
        print(f"      {DIM}{overview}{R}")


# ── auth flow ─────────────────────────────────────────────────────────────────

def do_auth() -> tuple[str, str]:
    """Returns (access_token, user_id). Loops until success."""
    print(f"\n{B}  Authentication{R}")
    print(f"  {DIM}1.  Login{R}")
    print(f"  {DIM}2.  Register new account{R}")
    print(f"\n  {DIM}Enter number:{R} ", end="")

    choice = input().strip()

    if choice == "2":
        print(f"\n  {CY}Name:{R} ", end="")
        name = input().strip() or "Movie Fan"
        print(f"  {CY}Email:{R} ", end="")
        email = input().strip()
        password = getpass.getpass(f"  Password: ")

        r = httpx.post(f"{BASE}/api/auth/register",
                       json={"name": name, "email": email, "password": password},
                       timeout=10)
        if r.status_code == 201:
            data = r.json()
            user_id = data["user"]["id"]
            # Auto-verify in dev (SMTP not configured)
            conn = sqlite3.connect(DB)
            conn.execute("UPDATE users SET email_verified=1 WHERE id=?", (user_id,))
            conn.commit()
            conn.close()
            print(f"\n  {GR}✓  Registered & email verified (dev mode){R}")
            return data["access_token"], user_id
        else:
            msg = r.json().get("message", r.text)
            print(f"\n  {RD}✗  {msg}{R}")
            return do_auth()
    else:
        print(f"\n  {CY}Email:{R} ", end="")
        email = input().strip()
        password = getpass.getpass(f"  Password: ")

        r = httpx.post(f"{BASE}/api/auth/login",
                       json={"email": email, "password": password},
                       timeout=10)
        if r.status_code == 200:
            data = r.json()
            user = data["user"]
            if not user.get("email_verified"):
                # Auto-verify in dev
                conn = sqlite3.connect(DB)
                conn.execute("UPDATE users SET email_verified=1 WHERE id=?", (user["id"],))
                conn.commit()
                conn.close()
                print(f"  {YL}  (email auto-verified for dev){R}")
            print(f"\n  {GR}✓  Logged in as {user['name']}{R}")
            return data["access_token"], user["id"]
        else:
            msg = r.json().get("message", r.text)
            print(f"\n  {RD}✗  {msg}{R}")
            return do_auth()


# ── recommendation form ───────────────────────────────────────────────────────

def run_form(token: str) -> dict | None:
    headers = {"Authorization": f"Bearer {token}"}

    print(f"\n{B}{CY}  ━━━  Tell us what you want to watch  ━━━{R}")

    genre        = pick("What genre?  (pick one)", GENRES)
    mood         = pick("What's your mood?", MOODS)
    era          = pick("What era?", ERAS)
    language     = pick("Language preference?", LANGS)
    watching_with = pick("Watching with?", WITH)

    prefs = {
        "genre": genre,
        "mood": mood,
        "era": era,
        "language": language,
        "watching_with": watching_with,
    }

    print(f"\n  {DIM}Your choices:{R}")
    for k, v in prefs.items():
        print(f"    {BL}{k:<15}{R}  {v}")

    print(f"\n  {YL}⏳  Asking DeepSeek AI for recommendations…{R}", flush=True)

    r = httpx.post(f"{BASE}/api/recommendations/generate",
                   headers=headers, json=prefs, timeout=60)

    if r.status_code == 200:
        return r.json()
    elif r.status_code == 403:
        print(f"\n  {RD}✗  Email not verified. Please verify your email first.{R}")
    elif r.status_code == 429:
        print(f"\n  {RD}✗  Daily limit reached (10 requests/day).{R}")
    else:
        print(f"\n  {RD}✗  API error {r.status_code}: {r.json().get('message', r.text)}{R}")
    return None


# ── save flow ─────────────────────────────────────────────────────────────────

def offer_save(token: str, movies: list[dict]):
    headers = {"Authorization": f"Bearer {token}"}

    print(f"\n{B}  Save movies to your list?{R}")
    print(f"  {DIM}Enter movie numbers to save (e.g. 1,3,5)  or press Enter to skip:{R} ", end="")
    raw = input().strip()
    if not raw:
        return

    try:
        indices = [int(x.strip()) for x in raw.split(",") if x.strip()]
    except ValueError:
        return

    to_save = []
    for idx in indices:
        if 1 <= idx <= len(movies):
            m = movies[idx - 1]
            to_save.append({"tmdb_id": m["tmdb_id"], "note": "saved from CLI", "tag": "cli"})

    if not to_save:
        return

    r = httpx.post(f"{BASE}/api/movies/save",
                   headers=headers, json={"movies": to_save}, timeout=30)
    if r.status_code == 200:
        body = r.json()
        print(f"\n  {GR}✓  {body.get('message', 'Saved')}{R}")
    else:
        print(f"\n  {RD}✗  Save failed: {r.text}{R}")


# ── main loop ─────────────────────────────────────────────────────────────────

def main():
    clear()
    header()

    # Check server health first
    try:
        health = httpx.get(f"{BASE}/", timeout=5)
        if health.status_code != 200:
            raise Exception()
        print(f"  {GR}✓  Server is running{R}")
    except Exception:
        print(f"  {RD}✗  Cannot reach server at {BASE}{R}")
        print(f"  {DIM}Start it with:{R}")
        print(f"  {DIM}  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend{R}")
        sys.exit(1)

    token, user_id = do_auth()

    while True:
        result = run_form(token)

        if result:
            movies = result.get("movies", [])
            rec_id = result.get("recommendation_id", "")

            print(f"\n\n{B}{CY}  ━━━  {len(movies)} Movies Recommended  ━━━{R}")
            print(f"  {DIM}Recommendation ID: {rec_id}{R}")

            for i, m in enumerate(movies, 1):
                print_movie(i, m)

            offer_save(token, movies)

        # Ask to go again
        print(f"\n\n  {DIM}─────────────────────────────────{R}")
        print(f"  {B}What next?{R}")
        print(f"  {DIM}1.  Get new recommendations{R}")
        print(f"  {DIM}2.  Exit{R}")
        print(f"\n  {DIM}Enter number:{R} ", end="")
        choice = input().strip()
        if choice != "1":
            print(f"\n  {GR}Bye! 🎬{R}\n")
            break
        clear()
        header()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n  {GR}Bye!{R}\n")
