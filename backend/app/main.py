from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routers import movies, recommendations, chat, users

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
app.include_router(chat.router, prefix="/api")
app.include_router(users.router, prefix="/api/users")


@app.get("/")
async def root():
    return {"message": "SJ MovieReview API is running"}
