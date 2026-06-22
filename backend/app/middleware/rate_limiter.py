from __future__ import annotations

import logging
import time

from fastapi import HTTPException

from app.core.redis import get_redis

logger = logging.getLogger(__name__)


async def check_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    """Sliding-window rate limit using Redis sorted sets.

    Fails open (allows request) if Redis is unavailable — rate limiting is
    best-effort in development. In production, Redis should always be present.
    """
    now = time.time()
    window_start = now - window_seconds
    redis_key = f"rl:{key}"

    try:
        redis = await get_redis()
        pipe = redis.pipeline()
        pipe.zremrangebyscore(redis_key, 0, window_start)
        pipe.zadd(redis_key, {str(now): now})
        pipe.zcard(redis_key)
        pipe.expire(redis_key, window_seconds + 1)
        results = await pipe.execute()
        count = results[2]
        if count > limit:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Rate limiting unavailable (Redis unreachable): %s — allowing request", exc)
        # Fail-open: allow the request through when Redis is not available.
        # This is acceptable for local dev; production should always have Redis.

