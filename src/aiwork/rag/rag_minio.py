# -*- coding: utf-8 -*-
"""RAG-specific MinIO helper for managing multiple buckets.

The RAG module uses two MinIO buckets (separate from the main file library):
- ``aiwork-rag-originals`` (private) — original uploaded documents
- ``aiwork-rag-images`` (public-read) — extracted images for public access

Reuses the same MinIO endpoint/credentials as the main file library,
but operates on independent buckets.
"""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any, Callable

from minio import Minio  # type: ignore[import-untyped]
from minio.error import S3Error  # type: ignore[import-untyped]

from ..constant import EnvVarLoader

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Bucket name configuration
# ---------------------------------------------------------------------------

_DEFAULT_ORIGINALS_BUCKET = "aiwork-rag-originals"
_DEFAULT_IMAGE_BUCKET = "aiwork-rag-images"


def _get_minio_endpoint() -> str:
    endpoint = EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip()
    # Strip http:// / https:// prefix for Minio SDK constructor
    if endpoint.startswith("https://"):
        return endpoint[len("https://"):]
    elif endpoint.startswith("http://"):
        return endpoint[len("http://"):]
    return endpoint


def _get_minio_secure() -> bool:
    endpoint = EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip()
    return endpoint.startswith("https://")


# ---------------------------------------------------------------------------
# RAG MinIO client
# ---------------------------------------------------------------------------


class RagMinioClient:
    """Async wrapper for MinIO operations on RAG-specific buckets.

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
        self._originals_bucket = EnvVarLoader.get_str(
            "AIWORK_RAG_ORIGINALS_BUCKET", _DEFAULT_ORIGINALS_BUCKET,
        )
        self._image_bucket = EnvVarLoader.get_str(
            "AIWORK_RAG_IMAGE_BUCKET", _DEFAULT_IMAGE_BUCKET,
        )
        self._executor = ThreadPoolExecutor(max_workers=4)

        # Base public URL for images (without bucket prefix — added per-object).
        # AIWORK_RAG_IMAGE_PUBLIC_BASE overrides the direct MinIO URL so that
        # images can be served via an HTTPS proxy when the frontend is on HTTPS.
        # Example: AIWORK_RAG_IMAGE_PUBLIC_BASE=https://your-domain/api/rag/image-proxy
        custom_base = EnvVarLoader.get_str("AIWORK_RAG_IMAGE_PUBLIC_BASE", "").strip()
        if custom_base:
            self._minio_public_base = custom_base.rstrip("/")
        else:
            raw_endpoint = EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip()
            if raw_endpoint.startswith("https://"):
                self._minio_public_base = raw_endpoint
            elif raw_endpoint.startswith("http://"):
                self._minio_public_base = raw_endpoint
            else:
                self._minio_public_base = f"http://{raw_endpoint}"

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def originals_bucket(self) -> str:
        return self._originals_bucket

    @property
    def image_bucket(self) -> str:
        return self._image_bucket

    @property
    def minio_public_base(self) -> str:
        return self._minio_public_base

    def public_image_url(self, object_key: str) -> str:
        """Build the public URL for an image object."""
        base = self._minio_public_base.rstrip("/")
        return f"{base}/{self._image_bucket}/{object_key}"

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

    async def ensure_buckets(self) -> None:
        """Create both RAG buckets if they don't exist (idempotent)."""
        for bucket in (self._originals_bucket, self._image_bucket):
            exists = await self._run(self._client.bucket_exists, bucket)
            if not exists:
                await self._run(self._client.make_bucket, bucket)
                logger.info("Created MinIO bucket '%s'", bucket)
            else:
                logger.info("MinIO bucket '%s' already exists", bucket)

    # ------------------------------------------------------------------
    # Object operations — originals bucket (private)
    # ------------------------------------------------------------------

    async def put_original(
        self, object_key: str, data: bytes, content_type: str,
    ) -> None:
        """Upload original document to the originals bucket."""
        from io import BytesIO
        await self._run(
            self._client.put_object,
            self._originals_bucket,
            object_key,
            BytesIO(data),
            len(data),
            content_type=content_type,
        )

    async def get_original(self, object_key: str) -> bytes:
        """Download original document from the originals bucket."""
        try:
            response = await self._run(
                self._client.get_object,
                self._originals_bucket,
                object_key,
            )
            return response.read()
        finally:
            try:
                response.close()
                response.release_conn()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Object operations — image bucket (public-read)
    # ------------------------------------------------------------------

    async def put_image(
        self, object_key: str, data: bytes, content_type: str,
    ) -> str:
        """Upload an image to the image bucket. Returns the public URL."""
        from io import BytesIO
        await self._run(
            self._client.put_object,
            self._image_bucket,
            object_key,
            BytesIO(data),
            len(data),
            content_type=content_type,
        )
        return self.public_image_url(object_key)

    # ------------------------------------------------------------------
    # Common object operations
    # ------------------------------------------------------------------

    async def remove_object(self, bucket: str, object_key: str) -> None:
        """Delete an object from a specific bucket (best-effort)."""
        try:
            await self._run(
                self._client.remove_object,
                bucket,
                object_key,
            )
        except S3Error as exc:
            if exc.code == "NoSuchKey":
                return
            raise

    async def list_objects(
        self, bucket: str, prefix: str,
    ) -> list[str]:
        """List object keys under a prefix in a bucket."""
        objects = await self._run(
            self._client.list_objects,
            bucket,
            prefix=prefix,
            recursive=True,
        )
        return [obj.object_name for obj in objects]

    async def remove_objects_batch(
        self, bucket: str, object_keys: list[str],
    ) -> None:
        """Delete multiple objects (best-effort, swallows individual errors)."""
        for key in object_keys:
            await self.remove_object(bucket, key)

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    def shutdown(self) -> None:
        """Shut down the thread pool."""
        self._executor.shutdown(wait=True)
        logger.info("RAG MinIO client thread pool shut down")


# ---------------------------------------------------------------------------
# Singleton access
# ---------------------------------------------------------------------------

_rag_minio_client: RagMinioClient | None = None


def get_rag_minio_client() -> RagMinioClient | None:
    """Return the cached RagMinioClient singleton, or None if MinIO not configured."""
    return _rag_minio_client


async def init_rag_minio() -> RagMinioClient | None:
    """Initialize and cache the RagMinioClient singleton.

    Returns None if MinIO endpoint is not configured.
    """
    global _rag_minio_client
    if not EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip():
        logger.info("MinIO not configured — RAG file storage disabled")
        return None
    _rag_minio_client = RagMinioClient()
    await _rag_minio_client.ensure_buckets()
    logger.info(
        "RAG MinIO initialized (originals=%s, images=%s)",
        _rag_minio_client.originals_bucket,
        _rag_minio_client.image_bucket,
    )
    return _rag_minio_client


async def shutdown_rag_minio() -> None:
    """Shut down the cached RagMinioClient if it exists."""
    global _rag_minio_client
    if _rag_minio_client is not None:
        _rag_minio_client.shutdown()
        _rag_minio_client = None
