from pydantic import BaseModel
from typing import Optional


class MovieBase(BaseModel):
    title: str
    description: Optional[str] = None
    genre: Optional[str] = None
    release_year: Optional[int] = None
    rating: Optional[float] = 0.0
    poster_url: Optional[str] = None


class MovieCreate(MovieBase):
    pass


class MovieUpdate(MovieBase):
    title: Optional[str] = None


class MovieOut(MovieBase):
    id: int

    class Config:
        from_attributes = True
