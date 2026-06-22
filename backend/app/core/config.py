import os
from typing import Literal

from pydantic_settings import BaseSettings

_ENV_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")


class Settings(BaseSettings):
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"

    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_JWT_SECRET: str
    SUPABASE_SERVICE_ROLE_KEY: str

    REDIS_URL: str = "redis://localhost:6379"
    TRUSTED_PROXY_IPS: str = ""

    TMDB_API_KEY: str = ""
    TMDB_BASE_URL: str = "https://api.themoviedb.org/3"
    TMDB_IMAGE_BASE_URL: str = "https://image.tmdb.org/t/p/w500"
    TMDB_CONCURRENCY: int = 4
    TMDB_CACHE_TTL: int = 3600
    TMDB_CACHE_MAX_ENTRIES: int = 1000

    DEEPSEEK_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    AI_CANDIDATE_COUNT: int = 15

    FRONTEND_URL: str = "http://localhost:5500"

    # Optional — leave blank for local dev; set in production (Render) for error tracking
    SENTRY_DSN: str = ""

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def frontend_origin(self) -> str:
        """CORS origin — accepts host-only values from Render blueprint linking."""
        url = self.FRONTEND_URL.strip().rstrip("/")
        if url.startswith("http://") or url.startswith("https://"):
            return url
        return f"https://{url}"

    class Config:
        env_file = _ENV_FILE
        extra = "ignore"


settings = Settings()
