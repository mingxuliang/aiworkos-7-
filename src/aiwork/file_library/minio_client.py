# -*- coding: utf-8 -*-
"""MinIO async client wrapper.

Wraps the synchronous ``minio.Minio`` SDK via ``ThreadPoolExecutor`` so
that all I/O calls are non-blocking from the asyncio event loop.

Singleton pattern — ``get_minio_client()`` returns the cached instance
initialised during ``_background_startup()``.
"""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import timedelta
from functools import partial
from typing import Any, Callable

from minio import Minio  # type: ignore[import-untyped]
from minio.error import MinioException, S3Error  # type: ignore[import-untyped]

from ..constant import EnvVarLoader

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MinioConfig:
    """Immutable MinIO connection parameters loaded from env."""

    endpoint: str
    access_key: str
    secret_key: str
    bucket: str
    secure: bool
    presigned_expires: int
    chunk_size: int
    session_ttl: int
    max_file_size: int
    allowed_mime_types: list[str] | None  # None = allow all

    @classmethod
    def from_env(cls) -> MinioConfig | None:
        """Build config from environment variables.

        Returns None if ``AIWORK_MINIO_ENDPOINT`` is not set,
        signalling that the file library should remain disabled.
        """
        endpoint = EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip()
        if not endpoint:
            return None

        # Normalise endpoint: strip http:// / https:// prefix — the minio
        # SDK's Minio() constructor expects bare "host:port" format.
        if endpoint.startswith("https://"):
            endpoint = endpoint[len("https://"):]
            secure = True
        elif endpoint.startswith("http://"):
            endpoint = endpoint[len("http://"):]
            secure = False
        else:
            secure = EnvVarLoader.get_bool("AIWORK_MINIO_SECURE", False)

        # Remove trailing slash if present
        endpoint = endpoint.rstrip("/")
        allowed_raw = EnvVarLoader.get_str(
            "AIWORK_MINIO_ALLOWED_MIME_TYPES", "",
        ).strip()
        return cls(
            endpoint=endpoint,
            access_key=EnvVarLoader.get_str(
                "AIWORK_MINIO_ACCESS_KEY", "minioadmin",
            ),
            secret_key=EnvVarLoader.get_str(
                "AIWORK_MINIO_SECRET_KEY", "minioadmin",
            ),
            bucket=EnvVarLoader.get_str(
                "AIWORK_MINIO_BUCKET", "aiwork-files",
            ),
            secure=secure,
            presigned_expires=EnvVarLoader.get_int(
                "AIWORK_MINIO_PRESIGNED_EXPIRES", 3600, min_value=60,
            ),
            chunk_size=EnvVarLoader.get_int(
                "AIWORK_MINIO_CHUNK_SIZE", 10_485_760, min_value=5_242_880,
            ),  # ≥ 5MB per S3 spec
            session_ttl=EnvVarLoader.get_int(
                "AIWORK_MINIO_SESSION_TTL", 86_400, min_value=60,
            ),
            max_file_size=EnvVarLoader.get_int(
                "AIWORK_MINIO_MAX_FILE_SIZE",
                5_368_709_120,  # 5 GB
                min_value=1,
            ),
            allowed_mime_types=(
                [m.strip() for m in allowed_raw.split(",") if m.strip()]
                if allowed_raw else None
            ),
        )


# ---------------------------------------------------------------------------
# Client wrapper
# ---------------------------------------------------------------------------


class MinioClient:
    """Async wrapper around the synchronous ``minio.Minio`` SDK.

    All MinIO I/O methods are offloaded to a ``ThreadPoolExecutor`` so
    they do not block the asyncio event loop.
    """

    def __init__(self, config: MinioConfig) -> None:
        self._config = config
        self._client = Minio(
            endpoint=config.endpoint,
            access_key=config.access_key,
            secret_key=config.secret_key,
            secure=config.secure,
        )
        # IO-bound: workers = 4 is sufficient for typical workloads
        self._executor = ThreadPoolExecutor(max_workers=4)

    # -- config accessors ----------------------------------------------------

    @property
    def bucket(self) -> str:
        return self._config.bucket

    @property
    def chunk_size(self) -> int:
        return self._config.chunk_size

    @property
    def session_ttl(self) -> int:
        return self._config.session_ttl

    @property
    def max_file_size(self) -> int:
        return self._config.max_file_size

    @property
    def presigned_expires(self) -> int:
        return self._config.presigned_expires

    @property
    def allowed_mime_types(self) -> list[str] | None:
        return self._config.allowed_mime_types

    # -- internal ------------------------------------------------------------

    async def _run(self, method: Callable, *args: Any, **kwargs: Any) -> Any:
        """Run a synchronous SDK method in the thread pool."""
        loop = asyncio.get_running_loop()
        func = partial(method, *args, **kwargs) if args or kwargs else method
        return await loop.run_in_executor(self._executor, func)

    # -- bucket --------------------------------------------------------------

    async def ensure_bucket(self) -> None:
        """Create the bucket if it does not already exist (idempotent)."""
        exists = await self._run(self._client.bucket_exists, self._config.bucket)
        if not exists:
            await self._run(
                self._client.make_bucket, self._config.bucket,
            )
            logger.info("Created MinIO bucket '%s'", self._config.bucket)
        else:
            logger.info(
                "MinIO bucket '%s' already exists", self._config.bucket,
            )

    # -- objects -------------------------------------------------------------

    async def put_object(
        self,
        object_key: str,
        data: bytes,
        length: int,
        content_type: str = "application/octet-stream",
    ) -> None:
        """Upload an object from in-memory bytes."""
        from io import BytesIO
        await self._run(
            self._client.put_object,
            self._config.bucket,
            object_key,
            BytesIO(data),
            length,
            content_type=content_type,
        )

    async def get_object(self, object_key: str) -> bytes:
        """Download an object into memory.  Use for small files only."""
        try:
            response = await self._run(
                self._client.get_object,
                self._config.bucket,
                object_key,
            )
            return response.read()
        finally:
            try:
                response.close()
                response.release_conn()
            except Exception:
                pass

    async def stat_object(self, object_key: str) -> dict | None:
        """Return object metadata or None if not found."""
        try:
            stat = await self._run(
                self._client.stat_object,
                self._config.bucket,
                object_key,
            )
            return {
                "size": stat.size,
                "etag": stat.etag,
                "content_type": stat.content_type,
            }
        except S3Error as exc:
            if exc.code == "NoSuchKey":
                return None
            raise

    async def remove_object(self, object_key: str) -> None:
        """Delete an object (best-effort, swallows NotFound)."""
        try:
            await self._run(
                self._client.remove_object,
                self._config.bucket,
                object_key,
            )
        except S3Error as exc:
            if exc.code == "NoSuchKey":
                return
            raise

    # -- multipart upload ----------------------------------------------------

    async def create_multipart_upload(
        self, object_key: str, content_type: str = "application/octet-stream",
    ) -> str:
        """Initiate a multipart upload.  Returns the ``upload_id``."""
        result = await self._run(
            self._client._create_multipart_upload,
            self._config.bucket,
            object_key,
            {"Content-Type": content_type},
        )
        return result

    async def upload_part(
        self,
        object_key: str,
        upload_id: str,
        part_number: int,
        data: bytes,
    ) -> str:
        """Upload one part.  Returns the part's ETag."""
        result = await self._run(
            self._client._upload_part,
            self._config.bucket,   # bucket_name
            object_key,            # object_name
            data,                  # data
            None,                  # headers
            upload_id,             # upload_id
            part_number,           # part_number
        )
        return result

    async def complete_multipart_upload(
        self,
        object_key: str,
        upload_id: str,
        parts: list[dict],
    ) -> None:
        """Complete a multipart upload with the collected parts."""
        from minio.datatypes import Part

        part_objects = [
            Part(part_number=p["PartNumber"], etag=p["ETag"])
            for p in sorted(parts, key=lambda p: p["PartNumber"])
        ]

        await self._run(
            self._client._complete_multipart_upload,
            self._config.bucket,
            object_key,
            upload_id,
            part_objects,
        )

    async def abort_multipart_upload(
        self, object_key: str, upload_id: str,
    ) -> None:
        """Abort an in-progress multipart upload (best-effort)."""
        try:
            await self._run(
                self._client._abort_multipart_upload,
                self._config.bucket,
                object_key,
                upload_id,
            )
        except S3Error:
            # The upload may already be completed / aborted — ignore
            pass

    # -- presigned URLs ------------------------------------------------------

    async def presigned_get_url(
        self, object_key: str, expires: int | None = None,
    ) -> str:
        """Generate a presigned GET URL for downloading an object.

        ``expires`` is in seconds (default from config).  The minio SDK
        expects a ``timedelta`` — we convert accordingly.
        """
        if expires is None:
            expires = self._config.presigned_expires
        return await self._run(
            self._client.presigned_get_object,
            self._config.bucket,
            object_key,
            expires=timedelta(seconds=expires),
        )

    # -- cleanup -------------------------------------------------------------

    def shutdown(self) -> None:
        """Shut down the thread pool.  Call on app shutdown."""
        self._executor.shutdown(wait=True)
        logger.info("MinIO client thread pool shut down")


# ---------------------------------------------------------------------------
# Singleton access
# ---------------------------------------------------------------------------

_minio_client: MinioClient | None = None


def get_minio_client() -> MinioClient | None:
    """Return the cached MinioClient singleton, or None if not configured."""
    return _minio_client


async def init_minio_client() -> MinioClient | None:
    """Initialise and cache the MinioClient singleton.

    Called once during ``_background_startup()``.  Returns None if
    ``AIWORK_MINIO_ENDPOINT`` is not configured.
    """
    global _minio_client
    config = MinioConfig.from_env()
    if config is None:
        logger.info("MinIO not configured — file library disabled")
        return None
    _minio_client = MinioClient(config)
    await _minio_client.ensure_bucket()
    logger.info(
        "MinIO connected: %s (bucket=%s, secure=%s)",
        config.endpoint, config.bucket, config.secure,
    )
    return _minio_client


async def shutdown_minio_client() -> None:
    """Shut down the cached MinioClient if it exists."""
    global _minio_client
    if _minio_client is not None:
        _minio_client.shutdown()
        _minio_client = None
