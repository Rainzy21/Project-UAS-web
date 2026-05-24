from __future__ import annotations

"""FastAPI application — B10 + B45."""
import logging

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.redis import close_redis
from app.middleware.auth_middleware import AuthMiddleware
from app.routers import auth, movies, recommendations, users

logger = logging.getLogger(__name__)

app = FastAPI(title="Project UAS API", version="1.0.0")

# ── B10: ProxyHeaders + CORS ─────────────────────────────────────────────────

# Trusted proxy middleware (restricts which hosts are allowed)
if settings.TRUSTED_PROXY_IP:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=[settings.TRUSTED_PROXY_IP, "localhost", "127.0.0.1"])

# CORS — never use "*" with allow_credentials=True
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth middleware
app.add_middleware(AuthMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(recommendations.router, prefix="/api/recommendations", tags=["recommendations"])
app.include_router(movies.router, prefix="/api/movies", tags=["movies"])

# ── Lifespan ──────────────────────────────────────────────────────────────────

@app.on_event("shutdown")
async def shutdown_event():
    await close_redis()


# ── B45: Global Exception Handlers ───────────────────────────────────────────

def _err(code: str, message: str, http_status: int) -> JSONResponse:
    return JSONResponse(
        status_code=http_status,
        content={"error": True, "code": code, "message": message, "status": http_status},
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_handler(request: Request, exc: SQLAlchemyError):
    logger.exception("Database error", exc_info=exc)
    return _err("INTERNAL_ERROR", "A database error occurred", 500)


@app.exception_handler(httpx.HTTPStatusError)
async def httpx_status_handler(request: Request, exc: httpx.HTTPStatusError):
    if exc.response.status_code == 404:
        return _err("NOT_FOUND", "External resource not found", 404)
    return _err("TMDB_ERROR", "TMDB API error", 502)


@app.exception_handler(httpx.RequestError)
async def httpx_request_handler(request: Request, exc: httpx.RequestError):
    return _err("TMDB_ERROR", "Failed to reach TMDB", 502)


@app.exception_handler(Exception)
async def generic_handler(request: Request, exc: Exception):
    # Let HTTPException propagate normally — only catch unexpected errors
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        raise exc
    logger.exception("Unexpected error", exc_info=exc)
    return _err("INTERNAL_ERROR", "An unexpected error occurred", 500)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Project UAS API is running"}

