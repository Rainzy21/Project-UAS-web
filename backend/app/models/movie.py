from sqlalchemy import Column, Integer, String, Float, Text

from app.core.database import Base


class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text)
    genre = Column(String)
    release_year = Column(Integer)
    rating = Column(Float, default=0.0)
    poster_url = Column(String)
