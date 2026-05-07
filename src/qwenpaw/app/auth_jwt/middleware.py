# -*- coding: utf-8 -*-
"""JWT authentication middleware for FastAPI.

Validates Bearer tokens on protected routes.  Shares the same public-path
whitelist as the legacy auth middleware.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from ...constant import EnvVarLoader
from .jwt_utils import decode_token

logger = logging.getLogger(__name__)

# Paths that do NOT require authentication (same as legacy auth.py)
_PUBLIC_PATHS: frozenset[str] = frozenset(
    {
        "/api/auth/login",
        "/api/auth/status",
        "/api/auth/register",
        "/api/auth/jwt/login",
        "/api/auth/jwt/status",
        "/api/auth/jwt/register",
        "/api/version",
        "/api/settings/language",
        "/api/plugins",
    },
)

_PUBLIC_PREFIXES: tuple[str, ...] = (
    "/assets/",
    "/logo.png",
    "/qwenpaw-symbol.svg",
    "/api/plugins/",
)


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """Middleware that validates JWT Bearer tokens on protected routes."""

    async def dispatch(
        self,
        request: Request,
        call_next,
    ) -> Response:
        """Validate JWT on protected API routes; skip public paths."""
        if self._should_skip_auth(request):
            return await call_next(request)

        token = self._extract_token(request)
        print(f"token: {token}")
        if not token:
            print("Not authenticated, 无token")
            return Response(
                content=json.dumps({"detail": "Not authenticated"}),
                status_code=401,
                media_type="application/json",
            )

        payload = await decode_token(token)
        if payload is None:
            return Response(
                content=json.dumps(
                    {"detail": "Invalid or expired token"},
                ),
                status_code=401,
                media_type="application/json",
            )

        # Attach user info to request state for downstream handlers
        request.state.user = payload.get("username", "")
        request.state.user_id = payload.get("sub", "")
        request.state.roles = payload.get("roles", [])
        request.state.jti = payload.get("jti", "")

        return await call_next(request)

    # ------------------------------------------------------------------
    # Static entry-point so AuthMiddleware can delegate without
    # instantiating a BaseHTTPMiddleware subclass (which requires `app`).
    # ------------------------------------------------------------------
    @staticmethod
    async def dispatch_static(
        request: Request,
        call_next,
    ) -> Response:
        """Validate JWT on protected API routes; skip public paths.

        This is the same logic as :meth:`dispatch` but can be called
        without instantiating the middleware (avoids the ``app`` argument
        required by :class:`BaseHTTPMiddleware`).
        """
        if JWTAuthMiddleware._should_skip_auth(request):
            return await call_next(request)

        token = JWTAuthMiddleware._extract_token(request)
        if not token:
            print("Not authenticated, 无token")
            return Response(
                content=json.dumps({"detail": "Not authenticated"}),
                status_code=401,
                media_type="application/json",
            )

        payload = await decode_token(token)
        if payload is None:
            return Response(
                content=json.dumps(
                    {"detail": "Invalid or expired token"},
                ),
                status_code=401,
                media_type="application/json",
            )

        # Attach user info to request state for downstream handlers
        request.state.user = payload.get("username", "")
        request.state.user_id = payload.get("sub", "")
        request.state.roles = payload.get("roles", [])
        request.state.jti = payload.get("jti", "")

        return await call_next(request)

    @staticmethod
    def _should_skip_auth(request: Request) -> bool:
        """Return True when the request does not require auth.

        In JWT mode every protected endpoint requires a valid token;
        the ``allow_no_auth_hosts`` whitelist from legacy mode is NOT
        applied here because JWT authentication is identity-based
        (username / roles / permissions), not host-based.
        """
        path = request.url.path

        if request.method == "OPTIONS":
            return True

        if path in _PUBLIC_PATHS or any(
            path.startswith(p) for p in _PUBLIC_PREFIXES
        ):
            return True

        # Only protect /api/ routes
        if not path.startswith("/api/"):
            return True

        return False

    @staticmethod
    def _extract_token(request: Request) -> Optional[str]:
        """Extract Bearer token from header or WebSocket query param.

        Accepts both ``Authorization: Bearer <token>`` and
        ``Authorization: <token>`` formats.
        """
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]

        # Bare JWT in Authorization header (no Bearer prefix)
        if auth_header and auth_header.count(".") >= 2:
            return auth_header

        # WebSocket upgrade
        if "upgrade" in request.headers.get("connection", "").lower():
            return request.query_params.get("token")

        # Fallback: query param
        token = request.query_params.get("token")
        if token:
            return token

        return None
