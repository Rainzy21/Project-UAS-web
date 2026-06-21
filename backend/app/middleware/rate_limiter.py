from __future__ import annotations

import time

from fastapi import HTTPException

from app.core.redis import get_redis


async def check_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    """Sliding-window rate limit using Redis sorted sets."""
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
    except Exception:
        raise HTTPException(status_code=503, detail="Rate limiting unavailable")
