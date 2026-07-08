# -*- coding: utf-8 -*-
"""Unit tests for security response headers."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from aiwork.app.security_headers import (
    SecurityHeadersMiddleware,
    build_security_headers,
)


def test_build_security_headers_includes_baseline() -> None:
    headers = build_security_headers(enable_hsts=False)
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "SAMEORIGIN"
    assert "Content-Security-Policy" in headers
    assert "Strict-Transport-Security" not in headers


def test_build_security_headers_hsts_when_enabled() -> None:
    headers = build_security_headers(enable_hsts=True)
    assert "max-age=31536000" in headers["Strict-Transport-Security"]


@pytest.mark.asyncio
async def test_middleware_attaches_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AIWORK_SECURITY_HEADERS", "1")

    request = MagicMock()
    request.url.scheme = "http"
    request.headers = {}

    inner_response = MagicMock()
    inner_response.headers = {}

    async def call_next(_req):
        return inner_response

    middleware = SecurityHeadersMiddleware(app=MagicMock())
    response = await middleware.dispatch(request, call_next)

    assert response.headers["X-Frame-Options"] == "SAMEORIGIN"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
