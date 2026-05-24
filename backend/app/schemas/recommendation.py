from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.movie import MovieOut


# ── Recommendation ──────────────────────────────────────────────────────────

class RecommendationRequest(BaseModel):
    genre: str
    mood: str
    era: str
    language: str
    watching_with: str


class RecommendationOut(BaseModel):
    recommendation_id: str
    movies: list[MovieOut]


# ── History ─────────────────────────────────────────────────────────────────

class HistoryItem(BaseModel):
    id: str
    preferences: dict
    created_at: datetime
    movie_count: int

    model_config = {"from_attributes": True}


class HistoryResponse(BaseModel):
    items: list[HistoryItem]
    total: int
    page: int
    limit: int


# ── Presets ─────────────────────────────────────────────────────────────────

class PresetCreate(BaseModel):
    name: str
    preferences: dict


class PresetOut(BaseModel):
    id: str
    name: str
    preferences: dict
    created_at: datetime

    model_config = {"from_attributes": True}
