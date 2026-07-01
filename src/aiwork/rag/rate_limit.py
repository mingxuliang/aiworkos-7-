# -*- coding: utf-8 -*-
"""Sliding-window rate limiter for RAG search endpoint.

Uses Redis sorted-set sliding window when Redis is available, falls back
to in-memory (single-process) limiting when Redis is not configured.

All errors are fail-open: if the rate-limit check itself fails, the
request is allowed through with a warning log.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque

from ..constant import EnvVarLoader

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_RAG_RATE_LIMIT = EnvVarLoader.get_int(
    "AIWORK_RAG_RATE_LIMIT", 30, min_value=1,
)
_RAG_RATE_WINDOW = EnvVarLoader.get_int(
    "AIWORK_RAG_RATE_WINDOW", 60, min_value=1,
)

# ---------------------------------------------------------------------------
# In-memory fallback storage (per-process, not shared across workers)
# ---------------------------------------------------------------------------

_memory_windows: dict[int, deque[float]] = defaultdict(deque)


def _check_memory(user_id: int) -> tuple[bool, int]:
    """In-memory sliding window check (no Redis dependency)."""
    now = time.monotonic()
    window_start = now - _RAG_RATE_WINDOW

    window = _memory_windows[user_id]

    # Purge expired timestamps
    while window and window[0] < window_start:
        window.popleft()

    if len(window) >= _RAG_RATE_LIMIT:
        retry_after = int(window[0] + _RAG_RATE_WINDOW - now) + 1
        return False, max(retry_after, 1)

    window.append(now)
    return True, 0


# ---------------------------------------------------------------------------
# Redis-based sliding window (shared across workers)
# ---------------------------------------------------------------------------

_redis_client = None
_redis_checked = False


async def _get_redis():
    """Lazily get the Redis client from the JWT auth module.

    Returns None if Redis is not available (wrong auth mode, not
    configured, or connection failed).
    """
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    try:
        from ..app.auth_jwt.redis_client import get_redis
        _redis_client = await get_redis()
        if _redis_client is not None:
            logger.info("RAG rate limiter: using Redis backend")
    except Exception:
        logger.debug("RAG rate limiter: Redis not available, using in-memory fallback")
    return _redis_client


async def _check_redis(user_id: int) -> tuple[bool, int]:
    """Redis sorted-set sliding window check."""
    redis = await _get_redis()
    if redis is None:
        return _check_memory(user_id)

    key = f"aiwork:ratelimit:rag_search:{user_id}"
    now = time.time()
    window_start = now - _RAG_RATE_WINDOW

    try:
        # Step 1: Remove expired entries + count current
        await redis.zremrangebyscore(key, 0, window_start)
        count = await redis.zcard(key)

        if count >= _RAG_RATE_LIMIT:
            # Get the oldest timestamp to compute Retry-After
            oldest = await redis.zrange(key, 0, 0, withscores=True)
            if oldest:
                retry_after = int(oldest[0][1] + _RAG_RATE_WINDOW - now) + 1
            else:
                retry_after = _RAG_RATE_WINDOW
            return False, max(retry_after, 1)

        # Step 2: Record this request
        await redis.zadd(key, {str(now): now})
        await redis.expire(key, _RAG_RATE_WINDOW + 1)
        return True, 0

    except Exception as exc:
        logger.warning(
            "RAG rate limiter: Redis error (%s), falling back to in-memory",
            exc,
        )
        return _check_memory(user_id)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def check_rate_limit(user_id: int) -> tuple[bool, int]:
    """Check if a search request from the given user should be allowed.

    Args:
        user_id: The authenticated user's ID.

    Returns:
        Tuple of (allowed, retry_after_seconds).
        - (True, 0): request is allowed.
        - (False, N): request is rate-limited; retry after N seconds.
    """
    # Avoid importing Redis at module level (circular import risk)
    return await _check_redis(user_id)
