from fastapi import APIRouter, HTTPException, Query
from app.services import tmdb_service

router = APIRouter()


@router.get("/trending")
async def trending():
    return await tmdb_service.get_trending()


@router.get("/top-rated")
async def top_rated():
    results = await tmdb_service.get_top_rated()
    return {"results": results}


@router.get("/discover")
async def discover(genre_id: int = Query(..., description="TMDB genre ID")):
    results = await tmdb_service.discover_by_genre(genre_id)
    return {"results": results}


@router.get("/{tmdb_id}/full")
async def movie_detail_full(tmdb_id: int):
    movie = await tmdb_service.fetch_movie_full(tmdb_id)
    if not movie:
        raise HTTPException(status_code=404, detail="Not found")
    return movie


@router.get("/{tmdb_id}")
async def movie_detail(tmdb_id: int):
    movie = await tmdb_service.fetch_movie(tmdb_id)
    if not movie:
        raise HTTPException(status_code=404, detail="Not found")
    return movie
