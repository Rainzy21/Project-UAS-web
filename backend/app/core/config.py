from __future__ import annotations

import os
from pydantic_settings import BaseSettings

# Resolve .env relative to this file (backend/.env), not the CWD
_ENV_FILE = os.path.join(os.path.dirname(__file__), "..", "..", ".env")


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./database.db"
    SECRET_KEY: str = "change-this-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # DeepSeek
    DEEPSEEK_API_KEY: str = ""

    # TMDB
    TMDB_API_KEY: str = ""
    TMDB_BASE_URL: str = "https://api.themoviedb.org/3"
    TMDB_IMAGE_BASE_URL: str = "https://image.tmdb.org/t/p/w500"
    TMDB_CONCURRENCY: int = 4          # max concurrent TMDB requests (requires server restart to apply)
    TMDB_CACHE_TTL: int = 3600         # Redis TTL for movie lookups (seconds)

    # AI recommendations
    AI_CANDIDATE_COUNT: int = 15       # movies requested from DeepSeek per call

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = ""

    # Frontend
    FRONTEND_URL: str = "http://localhost:5500"

    # Trusted proxy
    TRUSTED_PROXY_IP: str = ""

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}


settings = Settings()
