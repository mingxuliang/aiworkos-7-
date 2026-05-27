# -*- coding: utf-8 -*-
"""Unit tests for unified authenticated user key helpers."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from qwenpaw.app.auth_identity import (
    get_authenticated_user_key,
    get_jwt_user_key,
    get_legacy_user_key_from_request,
)


@pytest.mark.asyncio
async def test_get_jwt_user_key_prefers_request_state_user_id() -> None:
    request = MagicMock()
    request.state.user_id = "117"
    assert await get_jwt_user_key(request) == "117"


@pytest.mark.asyncio
async def test_get_jwt_user_key_falls_back_to_jwt_sub(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = MagicMock()
    request.state.user_id = None

    with patch(
        "qwenpaw.app.auth_jwt.middleware.JWTAuthMiddleware._extract_token",
        return_value="token",
    ), patch(
        "qwenpaw.app.auth_jwt.jwt_utils.decode_token",
        new=AsyncMock(return_value={"sub": "118", "username": "bob"}),
    ), patch(
        "qwenpaw.app.auth_jwt.redis_client.get_session_user_info",
        new=AsyncMock(return_value=None),
    ):
        assert await get_jwt_user_key(request) == "118"


def test_get_legacy_user_key_from_request_valid_token() -> None:
    request = MagicMock()
    with patch(
        "qwenpaw.app.auth_jwt.middleware.JWTAuthMiddleware._extract_token",
        return_value="legacy-token",
    ), patch(
        "qwenpaw.app.auth_identity.verify_token",
        return_value="admin",
    ):
        assert get_legacy_user_key_from_request(request) == "admin"


@pytest.mark.asyncio
async def test_get_authenticated_user_key_jwt_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("qwenpaw.app.auth_identity.AUTH_MODE", "jwt")
    request = MagicMock()
    request.state.user_id = "117"
    assert await get_authenticated_user_key(request) == "117"


@pytest.mark.asyncio
async def test_get_authenticated_user_key_legacy_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("qwenpaw.app.auth_identity.AUTH_MODE", "legacy")
    request = MagicMock()
    with patch("qwenpaw.app.auth_identity.is_auth_enabled", return_value=True), patch(
        "qwenpaw.app.auth_identity.get_legacy_user_key_from_request",
        return_value="admin",
    ):
        assert await get_authenticated_user_key(request) == "admin"
