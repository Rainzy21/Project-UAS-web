from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.core.config import settings
from app.core.redis import close_redis, ping_redis
from app.core.supabase_client import supabase_admin
from app.routers import movies, recommendations, users

logger = logging.getLogger(__name__)

if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1 if settings.is_production else 0.0,
    )

_docs_url = None if settings.is_production else "/docs"
_redoc_url = None if settings.is_production else "/redoc"

app = FastAPI(
    title="SJ MovieReview API",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
)

if settings.TRUSTED_PROXY_IPS:
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=settings.TRUSTED_PROXY_IPS.split(","))

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.include_router(movies.router, prefix="/api/movies")
app.include_router(recommendations.router, prefix="/api/recommendations")
app.include_router(users.router, prefix="/api/users")


@app.on_event("shutdown")
async def shutdown_event():
    await close_redis()


@app.get("/")
async def root():
    return {"message": "SJ MovieReview API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    checks = {"redis": False, "supabase": False, "schema": False}
    errors = []

    checks["redis"] = await ping_redis()
    if not checks["redis"]:
        errors.append("redis")

    try:
        result = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: supabase_admin.table("recommendation_logs").select("id").limit(1).execute(),
        )
        checks["supabase"] = True
        checks["schema"] = result is not None
    except Exception as exc:
        logger.warning("Readiness check failed: %s", exc)
        errors.append("supabase")

    if errors:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail={"ready": False, "checks": checks})

    return {"ready": True, "checks": checks}
