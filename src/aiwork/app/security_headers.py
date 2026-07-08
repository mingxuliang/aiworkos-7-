# -*- coding: utf-8 -*-
"""HTTP security response headers middleware."""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..constant import EnvVarLoader

# Baseline CSP for the console SPA (fonts CDN + inline styles from UI libs).
_DEFAULT_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com "
    "https://cdn.jsdelivr.net; "
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; "
    "img-src 'self' data: blob: https:; "
    "connect-src 'self' https: wss:; "
    "frame-ancestors 'self'; "
    "object-src 'none'; "
    "base-uri 'self'"
)


def build_security_headers(
    *,
    enable_hsts: bool = False,
    csp: str | None = None,
) -> dict[str, str]:
    """Return security headers to attach to every HTTP response."""
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": (
            "camera=(), microphone=(), geolocation=(), payment=()"
        ),
        "Content-Security-Policy": csp or _DEFAULT_CSP,
    }
    if enable_hsts:
        headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return headers


def _is_https_request(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    forwarded = request.headers.get("x-forwarded-proto", "")
    return forwarded.split(",")[0].strip().lower() == "https"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach standard security headers to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        if not EnvVarLoader.get_bool("AIWORK_SECURITY_HEADERS", True):
            return response

        enable_hsts = EnvVarLoader.get_bool("AIWORK_ENABLE_HSTS", False)
        if not enable_hsts:
            enable_hsts = _is_https_request(request)

        custom_csp = EnvVarLoader.get_str("AIWORK_CSP", "").strip() or None
        for key, value in build_security_headers(
            enable_hsts=enable_hsts,
            csp=custom_csp,
        ).items():
            if key not in response.headers:
                response.headers[key] = value

        return response
