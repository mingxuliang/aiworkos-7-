# -*- coding: utf-8 -*-
"""MinerU 3.2.3 HTTP API client.

MinerU is deployed as an independent Docker container, accepting files via
the ``/file_parse`` endpoint and returning a parsed zip package.

zip contents:
  - full.md          ← complete Markdown document
  - images/*.png     ← extracted image files
  - layout.json      ← layout analysis result
  - model.json       ← model output
  - content_list.json ← content list
"""
from __future__ import annotations

import asyncio
import logging
from io import BytesIO

import httpx

from ..constant import EnvVarLoader

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_DEFAULT_BASE_URL = "http://localhost:8000"
_DEFAULT_TIMEOUT = 1800  # seconds (30 min) — large PDFs need significant time
_DEFAULT_MAX_RETRIES = 1  # MinerU is computation-heavy; don't auto-retry

# File-size-based timeout scaling: each MB adds this many seconds.
_PER_MB_TIMEOUT = 60  # seconds per MB
# Upper bound to prevent indefinite hangs on genuinely stuck requests.
_MAX_TIMEOUT = 7200  # seconds (2 hours)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class MinerUError(Exception):
    """Base exception for MinerU API errors."""


class MinerUApiError(MinerUError):
    """MinerU returned a non-2xx response."""

    def __init__(self, status_code: int, detail: str = ""):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"MinerU API error {status_code}: {detail}")


class MinerUTimeoutError(MinerUError):
    """MinerU request timed out."""


# ---------------------------------------------------------------------------
# Shared httpx client (connection pooling)
# ---------------------------------------------------------------------------

_mineru_http_client: httpx.AsyncClient | None = None


def get_mineru_http_client() -> httpx.AsyncClient:
    """Return a module-level httpx.AsyncClient for MinerU API calls.

    Uses connection pooling (``max_keepalive_connections=5``,
    ``max_connections=10``) to avoid TCP handshake on every request.
    MinerU is typically a local service, so we use smaller limits.
    """
    global _mineru_http_client
    if _mineru_http_client is None:
        _mineru_http_client = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )
    return _mineru_http_client


async def close_mineru_client() -> None:
    """Close the shared MinerU httpx client (called on app shutdown)."""
    global _mineru_http_client
    if _mineru_http_client is not None:
        await _mineru_http_client.aclose()
        _mineru_http_client = None


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------


class MinerUClient:
    """Async HTTP client for MinerU 3.2.3 /file_parse endpoint.

    Usage::

        client = MinerUClient()
        zip_bytes = await client.parse(file_content, file_name, content_type)
    """

    def __init__(
        self,
        base_url: str | None = None,
        timeout: int | None = None,
    ) -> None:
        self._base_url = (
            base_url
            or EnvVarLoader.get_str("AIWORK_MINERU_API_URL", _DEFAULT_BASE_URL)
        ).rstrip("/")
        self._timeout = timeout or EnvVarLoader.get_int(
            "AIWORK_MINERU_TIMEOUT", _DEFAULT_TIMEOUT, min_value=10,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def parse(
        self,
        file_content: bytes,
        file_name: str,
        content_type: str,
        lang: str = "ch",
    ) -> bytes:
        """Send file to MinerU /file_parse and return zip bytes.

        Args:
            file_content: Raw file bytes.
            file_name: Original filename (used for extension detection).
            content_type: MIME type of the file.
            lang: Language hint (default "ch").

        Returns:
            Raw zip bytes containing full.md, images/, layout.json, etc.

        Raises:
            MinerUApiError: Non-2xx response from MinerU.
            MinerUTimeoutError: Request timed out.
        """
        url = f"{self._base_url}/file_parse"

        # Build multipart form data
        # Default backend is "pipeline" (CPU-safe). Use env var to override
        # for GPU-accelerated backends (e.g. "hybrid-auto-engine").
        backend = EnvVarLoader.get_str(
            "AIWORK_MINERU_BACKEND", "pipeline",
        )
        form_data = {
            "backend": backend,
            "response_format_zip": "true",
            "lang_list": lang,
            "return_md": "true",
            "return_images": "true",  # Include images as separate files in zip
        }

        # We need to use httpx for async multipart upload
        files = {
            "files": (file_name, BytesIO(file_content), content_type),
        }

        # Adaptive timeout: scale with file size so large PDFs don't
        # consistently time out.  Floor = configured base timeout;
        # ceiling = _MAX_TIMEOUT (2 h) to avoid indefinite hangs.
        file_size_mb = len(file_content) / (1024 * 1024)
        effective_timeout = min(
            max(self._timeout, int(file_size_mb * _PER_MB_TIMEOUT)),
            _MAX_TIMEOUT,
        )
        timeout = httpx.Timeout(effective_timeout, connect=30.0)

        client = get_mineru_http_client()
        try:
            response = await client.post(
                url,
                data=form_data,
                files=files,
                timeout=timeout,
            )
            response.raise_for_status()
            return response.content
        except httpx.TimeoutException:
            logger.error(
                "MinerU request timed out after %ds (effective) for file '%s' (%.1f MB)",
                effective_timeout, file_name, file_size_mb,
            )
            raise MinerUTimeoutError(
                f"MinerU request timed out after {effective_timeout}s "
                f"for file '{file_name}' ({file_size_mb:.1f} MB)"
            )
        except httpx.HTTPStatusError as exc:
            detail = ""
            try:
                detail = exc.response.text[:500]
            except Exception:
                pass
            logger.error(
                "MinerU API error %d for file '%s': %s",
                exc.response.status_code, file_name, detail,
            )
            raise MinerUApiError(exc.response.status_code, detail)
        except httpx.RequestError as exc:
            logger.error(
                "MinerU request failed for file '%s': %s",
                file_name, exc,
            )
            raise MinerUError(f"MinerU request failed: {exc}")
