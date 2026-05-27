import os
from pydantic_settings import BaseSettings

_ENV_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_JWT_SECRET: str
    SUPABASE_SERVICE_ROLE_KEY: str

    TMDB_API_KEY: str = ""
    TMDB_BASE_URL: str = "https://api.themoviedb.org/3"
    TMDB_IMAGE_BASE_URL: str = "https://image.tmdb.org/t/p/w500"
    TMDB_CONCURRENCY: int = 4
    TMDB_CACHE_TTL: int = 3600

    DEEPSEEK_API_KEY: str = ""
    AI_CANDIDATE_COUNT: int = 15

    FRONTEND_URL: str = "http://localhost:5500"

    class Config:
        env_file = _ENV_FILE
        extra = "ignore"


settings = Settings()
