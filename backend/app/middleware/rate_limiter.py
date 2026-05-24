"""B12 — Async sliding-window rate limiter backed by Redis.

Usage:
    await rate_limit(redis, key="ip:1.2.3.4", limit=5, window=60)  # 5/min

Raises HTTP 429 with code RATE_LIMITED on excess.
"""
import time

from fastapi import HTTPException
from redis.asyncio import Redis


async def rate_limit(
    redis: Redis,
    key: str,
    limit: int,
    window: int,  # seconds
) -> None:
    """Sliding-window rate limit using a sorted set in Redis."""
    now = time.time()
    window_start = now - window

    pipe = redis.pipeline()
    # Remove entries older than the window
    pipe.zremrangebyscore(key, "-inf", window_start)
    # Count remaining entries in window
    pipe.zcard(key)
    # Add current request timestamp
    pipe.zadd(key, {str(now): now})
    # Set TTL so keys expire automatically
    pipe.expire(key, window)
    results = await pipe.execute()

    count: int = results[1]
    if count >= limit:
        raise HTTPException(
            status_code=429,
            detail={"error": True, "code": "RATE_LIMITED", "message": "Too many requests", "status": 429},
        )
