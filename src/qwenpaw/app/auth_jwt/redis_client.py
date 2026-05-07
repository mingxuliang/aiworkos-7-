# -*- coding: utf-8 -*-
"""Redis client for JWT session management and token blacklisting.

Reads ``QWENPAW_REDIS_URL`` from environment variables.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

import redis.asyncio as aioredis

from ...constant import REDIS_URL

logger = logging.getLogger(__name__)

# Key prefixes for Redis
_SESSION_PREFIX = "qwenpaw:session:"
_BLACKLIST_PREFIX = "qwenpaw:blacklist:"

# Singleton client
_redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Return the async Redis client, creating it if necessary."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
    return _redis_client


async def init_redis() -> None:
    """Verify Redis connectivity at startup."""
    client = await get_redis()
    try:
        await client.ping()
        logger.info("Redis connection verified: %s", REDIS_URL)
    except Exception as exc:
        logger.error("Redis connection failed: %s", exc)
        raise


async def close_redis() -> None:
    """Close the Redis connection on shutdown."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
        logger.info("Redis connection closed")


# ---------------------------------------------------------------------------
# Session management (login state)
# ---------------------------------------------------------------------------


async def store_session(
    user_id: int,
    jti: str,
    ttl_seconds: int,
) -> None:
    """Store a login session in Redis.

    Args:
        user_id: Database user ID.
        jti: JWT ID (unique token identifier).
        ttl_seconds: Time-to-live matching the JWT expiry.
    """
    client = await get_redis()
    key = f"{_SESSION_PREFIX}{jti}"
    await client.setex(
        key,
        ttl_seconds,
        json.dumps({"user_id": user_id, "jti": jti}),
    )
    logger.debug("Session stored: jti=%s ttl=%ds", jti[:8], ttl_seconds)


async def validate_session(jti: str) -> Optional[dict]:
    """Check if a session exists and is valid.

    Returns:
        Session data dict if found, None otherwise.
    """
    client = await get_redis()
    key = f"{_SESSION_PREFIX}{jti}"
    data = await client.get(key)
    if data is None:
        return None
    try:
        return json.loads(data)
    except (json.JSONDecodeError, TypeError):
        return None


async def delete_session(jti: str) -> bool:
    """Delete a session (logout).

    Returns:
        True if the session was found and deleted.
    """
    client = await get_redis()
    key = f"{_SESSION_PREFIX}{jti}"
    deleted = await client.delete(key)
    return deleted > 0


# ---------------------------------------------------------------------------
# Token blacklist (revocation)
# ---------------------------------------------------------------------------


async def add_to_blacklist(jti: str, ttl_seconds: int) -> None:
    """Add a token JTI to the blacklist.

    Args:
        jti: JWT ID to blacklist.
        ttl_seconds: Time remaining until the token expires.
    """
    client = await get_redis()
    key = f"{_BLACKLIST_PREFIX}{jti}"
    await client.setex(key, ttl_seconds, "1")
    logger.debug("Token blacklisted: jti=%s ttl=%ds", jti[:8], ttl_seconds)


async def is_blacklisted(jti: str) -> bool:
    """Check if a token JTI has been blacklisted."""
    client = await get_redis()
    key = f"{_BLACKLIST_PREFIX}{jti}"
    return await client.exists(key) > 0
