# -*- coding: utf-8 -*-
"""Internal CLI token for bypassing JWT authentication.

Auto-generates a persistent shared secret that the JWT middleware
recognises, allowing CLI commands to reach protected endpoints
without a full user JWT (no Redis / MySQL needed).
"""
from __future__ import annotations

import hmac
import json
import logging
import os
import secrets

from ...constant import SECRET_DIR, INTERNAL_TOKEN

logger = logging.getLogger(__name__)

_INTERNAL_TOKEN_FILE = SECRET_DIR / "internal_token.json"

# Module-level cache
_token: str | None = None


def _get_or_create_internal_token() -> str:
    """Return the internal CLI token.

    Priority:
    1. ``AIWORK_INTERNAL_TOKEN`` environment variable
    2. Persisted token in ``SECRET_DIR/internal_token.json``
    3. Auto-generate and persist
    """
    if INTERNAL_TOKEN:
        return INTERNAL_TOKEN

    # Try loading from disk
    if _INTERNAL_TOKEN_FILE.is_file():
        try:
            with open(_INTERNAL_TOKEN_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            token = data.get("token", "")
            if token:
                return token
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to read internal token file: %s", exc)

    # Auto-generate and persist
    token = secrets.token_hex(32)
    try:
        _INTERNAL_TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(_INTERNAL_TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump({"token": token}, f)
        try:
            os.chmod(_INTERNAL_TOKEN_FILE, 0o600)
        except OSError:
            pass
        logger.info(
            "Auto-generated internal CLI token and saved to %s",
            _INTERNAL_TOKEN_FILE,
        )
    except OSError as exc:
        logger.warning("Failed to persist internal token: %s", exc)

    return token


def get_internal_token() -> str:
    """Return the cached internal token (generates on first call)."""
    global _token
    if _token is None:
        _token = _get_or_create_internal_token()
    return _token


def is_internal_token(token: str) -> bool:
    """Constant-time comparison against the stored internal token."""
    expected = get_internal_token()
    return hmac.compare_digest(token, expected)
