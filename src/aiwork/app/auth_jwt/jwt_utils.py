# -*- coding: utf-8 -*-
"""JWT token creation, verification, and revocation.

Uses standard PyJWT (HS256) with Redis-backed session tracking
and blacklisting.
"""
from __future__ import annotations

import json
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from ...constant import JWT_SECRET, JWT_EXPIRE_MINUTES, SECRET_DIR
from .redis_client import (
    store_session,
    validate_session,
    add_to_blacklist,
    is_blacklisted,
)

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"

# File to persist the auto-generated JWT secret
_JWT_SECRET_FILE = SECRET_DIR / "jwt_secret.json"


def _get_or_create_jwt_secret() -> str:
    """Return the JWT signing secret.

    Priority:
    1. ``AIWORK_JWT_SECRET`` environment variable
    2. Persisted secret in ``SECRET_DIR/jwt_secret.json``
    3. Auto-generate and persist
    """
    if JWT_SECRET:
        return JWT_SECRET

    # Try loading from disk
    if _JWT_SECRET_FILE.is_file():
        try:
            with open(_JWT_SECRET_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            secret = data.get("secret", "")
            if secret:
                return secret
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to read JWT secret file: %s", exc)

    # Auto-generate and persist
    secret = secrets.token_hex(32)
    try:
        _JWT_SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(_JWT_SECRET_FILE, "w", encoding="utf-8") as f:
            json.dump({"secret": secret}, f)
        try:
            import os
            os.chmod(_JWT_SECRET_FILE, 0o600)
        except OSError:
            pass
        logger.info("Auto-generated JWT secret and saved to %s", _JWT_SECRET_FILE)
    except OSError as exc:
        logger.warning("Failed to persist JWT secret: %s", exc)

    return secret


# Module-level secret (resolved once)
_jwt_secret: str | None = None


def _secret() -> str:
    """Lazily resolve the JWT secret."""
    global _jwt_secret
    if _jwt_secret is None:
        _jwt_secret = _get_or_create_jwt_secret()
    return _jwt_secret


# ---------------------------------------------------------------------------
# Token creation
# ---------------------------------------------------------------------------


async def create_access_token(
    user_id: int,
    username: str,
    roles: list[str],
    expires_minutes: int | None = None,
) -> str:
    """Create a signed JWT and register the session in Redis.

    Args:
        user_id: Database user ID.
        username: Username string.
        roles: List of role names (e.g. ["admin"]).
        expires_minutes: Override token lifetime (default from env).

    Returns:
        Encoded JWT string.
    """
    if expires_minutes is None:
        expires_minutes = JWT_EXPIRE_MINUTES

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=expires_minutes)
    jti = secrets.token_hex(16)

    payload = {
        "sub": str(user_id),
        "username": username,
        "roles": roles,
        "jti": jti,
        "iat": now,
        "exp": exp,
    }

    token = jwt.encode(payload, _secret(), algorithm=_ALGORITHM)

    # Register session in Redis with the same TTL
    ttl_seconds = expires_minutes * 60
    await store_session(
        user_id=user_id,
        jti=jti,
        ttl_seconds=ttl_seconds,
        username=username,
        roles=roles,
    )

    logger.info(
        "JWT created: user=%s roles=%s expires_in=%dm",
        username, roles, expires_minutes,
    )
    return token


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------


async def decode_token(token: str) -> Optional[dict]:
    """Verify a JWT and return its payload if valid.

    Checks:
    1. Signature validity
    2. Expiration time
    3. Redis blacklist (revoked tokens)
    4. Redis session existence

    Returns:
        Payload dict on success, None on any failure.
    """
    try:
        payload = jwt.decode(
            token,
            _secret(),
            algorithms=[_ALGORITHM],
        )
    except jwt.ExpiredSignatureError:
        logger.debug("JWT expired")
        return None
    except jwt.InvalidTokenError as exc:
        logger.debug("JWT invalid: %s", exc)
        return None

    jti = payload.get("jti")
    if not jti:
        logger.debug("JWT missing jti")
        return None

    # Check blacklist
    if await is_blacklisted(jti):
        logger.debug("JWT blacklisted: jti=%s", jti[:8])
        return None

    # Check session exists in Redis
    session = await validate_session(jti)
    if session is None:
        logger.debug("JWT session not found in Redis: jti=%s", jti[:8])
        return None

    return payload


# ---------------------------------------------------------------------------
# Token revocation
# ---------------------------------------------------------------------------


async def revoke_token(jti: str) -> bool:
    """Revoke a specific token by adding its JTI to the blacklist.

    Also removes the session from Redis.

    Args:
        jti: The JWT ID to revoke.

    Returns:
        True on success.
    """
    # Calculate remaining TTL from current time to a generous cap
    # (the blacklist entry only needs to live as long as the token)
    ttl = JWT_EXPIRE_MINUTES * 60
    await add_to_blacklist(jti, ttl)
    await validate_session(jti)  # just access to ensure key exists
    # Delete the session so it can't be used again
    from .redis_client import delete_session
    await delete_session(jti)
    logger.info("Token revoked: jti=%s", jti[:8])
    return True
