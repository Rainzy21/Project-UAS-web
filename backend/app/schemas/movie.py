from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── Movie ───────────────────────────────────────────────────────────────────

class MovieOut(BaseModel):
    tmdb_id: int
    title: str
    overview: Optional[str] = None
    poster_url: Optional[str] = None
    rating: Optional[float] = None
    year: Optional[int] = None
    language: Optional[str] = None
    genres: Optional[list] = None

    model_config = {"from_attributes": True}


# ── Saved Movie ─────────────────────────────────────────────────────────────

class SavedMovieCreate(BaseModel):
    """Single item within a batch save request."""
    tmdb_id: int
    note: Optional[str] = None
    tag: Optional[str] = None


class SavedMovieListCreate(BaseModel):
    """Request body for POST /api/movies/save."""
    movies: list[SavedMovieCreate]


class SavedMovieOut(BaseModel):
    id: str
    tmdb_id: int
    note: Optional[str] = None
    tag: Optional[str] = None
    saved_at: datetime
    movie: Optional[MovieOut] = None

    model_config = {"from_attributes": True}


class SavedMovieUpdate(BaseModel):
    note: Optional[str] = None
    tag: Optional[str] = None


# ── Saved Status ─────────────────────────────────────────────────────────────

class SavedStatusItem(BaseModel):
    saved: bool
    saved_id: Optional[str] = None


class SavedStatusResponse(BaseModel):
    """Dict[tmdb_id_str, SavedStatusItem] — returned by GET /saved/status."""
    pass  # actual response is dict[str, SavedStatusItem]

