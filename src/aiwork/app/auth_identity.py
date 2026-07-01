# -*- coding: utf-8 -*-
"""Unified authenticated user key for chat, sandbox, and ownership checks."""
from __future__ import annotations

import logging

from fastapi import Request

from ..constant import AUTH_MODE
from .auth import is_auth_enabled, verify_token

logger = logging.getLogger(__name__)


def get_legacy_registered_username() -> str | None:
    """Return the legacy single-user username when registered."""
    from .auth import _load_auth_data

    user = _load_auth_data().get("user") or {}
    username = str(user.get("username") or "").strip()
    return username or None


async def get_jwt_user_key(request: Request) -> str | None:
    """Return stable JWT user key (numeric user id preferred).

    Tries ``request.state.user_id`` first (set by middleware).  Falls back to
    decoding the ``Authorization`` header directly when the middleware's
    ``request.state`` did not propagate (known Starlette BaseHTTPMiddleware
    issue with ``call_next`` and ``_CachedRequest``).
    """
    jwt_user = getattr(request.state, "user_id", None)
    if jwt_user:
        return str(jwt_user)

    from .auth_jwt.jwt_utils import decode_token as jwt_decode_token
    from .auth_jwt.middleware import JWTAuthMiddleware
    from .auth_jwt.redis_client import get_session_user_info

    token = JWTAuthMiddleware._extract_token(request)
    if not token:
        return None
    try:
        payload = await jwt_decode_token(token)
    except Exception:
        logger.debug("JWT decode failed in get_jwt_user_key", exc_info=True)
        return None
    if not payload:
        return None

    jti = payload.get("jti", "")
    if jti:
        user_info = await get_session_user_info(jti)
        if user_info:
            user_id = str(user_info.get("user_id", "")).strip()
            if user_id:
                return user_id
            username = str(user_info.get("username") or "").strip()
            if username:
                return username

    sub = str(payload.get("sub") or "").strip()
    if sub:
        return sub
    username = str(payload.get("username") or "").strip()
    return username or None


def get_legacy_user_key_from_request(request: Request) -> str | None:
    """Return legacy auth username from Bearer token, if valid."""
    from .auth_jwt.middleware import JWTAuthMiddleware

    token = JWTAuthMiddleware._extract_token(request)
    if not token:
        return None
    username = verify_token(token)
    return username or None


async def get_authenticated_user_key(request: Request) -> str | None:
    """Return stable sandbox/chat user key for the current request.

    JWT mode: numeric user id from Redis session / JWT sub.
    Legacy mode: registered username from valid legacy token.
    Returns ``None`` when auth is disabled or caller is unauthenticated.
    """
    auth_mode = (AUTH_MODE or "legacy").strip().lower()
    if auth_mode == "jwt":
        return await get_jwt_user_key(request)

    if not is_auth_enabled():
        return None

    return get_legacy_user_key_from_request(request)
