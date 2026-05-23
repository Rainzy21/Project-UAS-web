from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, movies

app = FastAPI(title="Project UAS API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(movies.router, prefix="/api/movies", tags=["movies"])


@app.get("/")
def root():
    return {"message": "Project UAS API is running"}
