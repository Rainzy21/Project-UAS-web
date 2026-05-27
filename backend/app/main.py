from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routers import movies, recommendations, chat

app = FastAPI(title="SJ MovieReview API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(movies.router, prefix="/api/movies")
app.include_router(recommendations.router, prefix="/api/recommendations")
# Chat router tetap dipertahankan karena frontend index.html masih menggunakan chat.js
app.include_router(chat.router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "SJ MovieReview API is running"}
