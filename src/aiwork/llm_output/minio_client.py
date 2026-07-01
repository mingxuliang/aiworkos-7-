# -*- coding: utf-8 -*-
"""LLM output MinIO client for the ``aiwork-llm-output`` bucket.

The LLM output module uses a dedicated MinIO bucket (separate from the
main file library and RAG buckets) to store agent interaction result files
generated during LLM sessions.

Reuses the same MinIO endpoint / credentials as the other MinIO clients,
but operates on an independent bucket.
"""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from functools import partial
from io import BytesIO
from typing import Any, Callable, Optional
from urllib.parse import quote

from minio import Minio  # type: ignore[import-untyped]
from minio.error import S3Error  # type: ignore[import-untyped]

from ..constant import EnvVarLoader

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Bucket name configuration
# ---------------------------------------------------------------------------

_DEFAULT_BUCKET = "aiwork-llm-output"


def _get_minio_endpoint() -> str:
    endpoint = EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip()
    if endpoint.startswith("https://"):
        return endpoint[len("https://"):]
    elif endpoint.startswith("http://"):
        return endpoint[len("http://"):]
    return endpoint


def _get_minio_secure() -> bool:
    endpoint = EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip()
    return endpoint.startswith("https://")


def _ascii_fallback(name: str) -> str:
    """Strip non-ASCII characters, keep the file extension readable."""
    import unicodedata
    # NFKD normalisation decomposes fullwidth / accented chars
    normalized = unicodedata.normalize("NFKD", name)
    # Keep only printable ASCII except `"` (header injection vector when
    # interpolated into a Content-Disposition header).
    result = "".join(
        ch for ch in normalized
        if 0x20 <= ord(ch) <= 0x7E and ch != '"'
    )
    result = result.strip()
    if not result:
        result = "file"
    return result[:200]


# ---------------------------------------------------------------------------
# LLM Output MinIO client
# ---------------------------------------------------------------------------


class LlmOutputMinioClient:
    """Async wrapper for MinIO operations on the llm-output bucket.

    All I/O is offloaded to a ``ThreadPoolExecutor`` for async compatibility.
    """

    def __init__(self) -> None:
        endpoint = _get_minio_endpoint()
        access_key = EnvVarLoader.get_str("AIWORK_MINIO_ACCESS_KEY", "minioadmin")
        secret_key = EnvVarLoader.get_str("AIWORK_MINIO_SECRET_KEY", "minioadmin")
        secure = _get_minio_secure()

        self._client = Minio(
            endpoint=endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        self._bucket = EnvVarLoader.get_str(
            "AIWORK_LLM_OUTPUT_BUCKET", _DEFAULT_BUCKET,
        )
        self._presigned_expires = EnvVarLoader.get_int(
            "AIWORK_MINIO_PRESIGNED_EXPIRES", 3600, min_value=60,
        )
        self._executor = ThreadPoolExecutor(max_workers=4)

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def bucket(self) -> str:
        return self._bucket

    @property
    def presigned_expires(self) -> int:
        return self._presigned_expires

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _run(self, method: Callable, *args: Any, **kwargs: Any) -> Any:
        loop = asyncio.get_running_loop()
        func = partial(method, *args, **kwargs) if args or kwargs else method
        return await loop.run_in_executor(self._executor, func)

    # ------------------------------------------------------------------
    # Bucket management
    # ------------------------------------------------------------------

    async def ensure_bucket(self) -> None:
        """Create the llm-output bucket if it doesn't exist (idempotent)."""
        exists = await self._run(self._client.bucket_exists, self._bucket)
        if not exists:
            await self._run(self._client.make_bucket, self._bucket)
            logger.info("Created MinIO bucket '%s'", self._bucket)
        else:
            logger.info("MinIO bucket '%s' already exists", self._bucket)

    # ------------------------------------------------------------------
    # Object operations
    # ------------------------------------------------------------------

    async def put_object(
        self, object_key: str, data: bytes, content_type: str,
    ) -> None:
        """Upload an object to the llm-output bucket."""
        await self._run(
            self._client.put_object,
            self._bucket,
            object_key,
            BytesIO(data),
            len(data),
            content_type=content_type,
        )

    async def get_object(
        self, object_key: str,
    ) -> tuple[bytes, str] | None:
        """Fetch object data and content type from MinIO.

        Returns ``(data, content_type)`` or ``None`` if the object doesn't
        exist.
        """
        try:
            response = await self._run(
                self._client.get_object,
                self._bucket,
                object_key,
            )
            # response is a urllib3 HTTPResponse — read all data
            try:
                data = await self._run(response.read)
                content_type = response.headers.get("Content-Type", "application/octet-stream")
                return data, content_type
            finally:
                await self._run(response.close)
                await self._run(response.release_conn)
        except S3Error as exc:
            if exc.code == "NoSuchKey":
                return None
            raise

    async def presigned_get_url(
        self,
        object_key: str,
        expires: int | None = None,
        filename: Optional[str] = None,
    ) -> str:
        """Generate a presigned GET URL for an object.

        When ``filename`` is provided, a ``Content-Disposition`` override is
        added so the browser uses the given filename on download (instead of
        the last path segment of the object key, which may be sanitized).

        ``expires`` is in seconds (default from config).
        """
        expires_seconds = expires if expires is not None else self._presigned_expires
        kwargs: dict[str, Any] = {}
        if filename:
            # RFC 5987 encoding for non-ASCII filenames
            safe_filename = filename.replace('"', "'")
            # Build both ASCII-fallback (using safe chars) and UTF-8 filename*
            content_disposition = (
                f"inline; "
                f'filename="{_ascii_fallback(filename)}"; '
                f"filename*=UTF-8''{quote(safe_filename, safe='')}"
            )
            kwargs["response_headers"] = {
                "Content-Disposition": content_disposition,
            }
        return await self._run(
            self._client.presigned_get_object,
            self._bucket,
            object_key,
            expires=timedelta(seconds=expires_seconds),
            **kwargs,
        )

    async def remove_object(self, object_key: str) -> None:
        """Delete an object from the bucket (best-effort)."""
        try:
            await self._run(
                self._client.remove_object,
                self._bucket,
                object_key,
            )
        except S3Error as exc:
            if exc.code == "NoSuchKey":
                return
            raise

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    def shutdown(self) -> None:
        """Shut down the thread pool."""
        self._executor.shutdown(wait=True)
        logger.info("LLM output MinIO client thread pool shut down")


# ---------------------------------------------------------------------------
# Singleton access
# ---------------------------------------------------------------------------

_llm_output_minio_client: LlmOutputMinioClient | None = None


def get_llm_output_minio_client() -> LlmOutputMinioClient | None:
    """Return the cached LlmOutputMinioClient singleton, or None."""
    return _llm_output_minio_client


async def init_llm_output_minio() -> LlmOutputMinioClient | None:
    """Initialize and cache the LlmOutputMinioClient singleton.

    Returns None if MinIO endpoint is not configured.
    """
    global _llm_output_minio_client
    if not EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip():
        logger.info("MinIO not configured — LLM output storage disabled")
        return None
    _llm_output_minio_client = LlmOutputMinioClient()
    await _llm_output_minio_client.ensure_bucket()
    logger.info(
        "LLM output MinIO initialized (bucket=%s)",
        _llm_output_minio_client.bucket,
    )
    return _llm_output_minio_client


async def shutdown_llm_output_minio() -> None:
    """Shut down the cached LlmOutputMinioClient if it exists."""
    global _llm_output_minio_client
    if _llm_output_minio_client is not None:
        _llm_output_minio_client.shutdown()
        _llm_output_minio_client = None
