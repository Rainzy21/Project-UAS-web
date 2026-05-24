from fastapi import APIRouter, HTTPException
from app.services import tmdb_service

router = APIRouter()


@router.get("/trending")
async def trending():
    return await tmdb_service.get_trending()


@router.get("/{tmdb_id}")
async def movie_detail(tmdb_id: int):
    movie = await tmdb_service.fetch_movie(tmdb_id)
    if not movie:
        raise HTTPException(status_code=404, detail="Not found")
    return movie
