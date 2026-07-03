# -*- coding: utf-8 -*-
"""Business logic for the llm_output module.

Provides functions to upload interaction result files to MinIO,
persist metadata in MySQL, and query / delete records.
"""
from __future__ import annotations

import asyncio
import logging
import mimetypes
import os
import re
from typing import Optional

from sqlalchemy import select, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .minio_client import get_llm_output_minio_client
from .models import LlmOutputRecord
from .schemas import LlmOutputResponse, LlmOutputListResponse

logger = logging.getLogger(__name__)

def _get_max_file_size() -> int:
    """Read max file size from env, default 100 MB."""
    from ..constant import EnvVarLoader as _EvLoader
    return _EvLoader.get_int("AIWORK_LLM_OUTPUT_MAX_FILE_SIZE", 100 * 1024 * 1024, min_value=1)


_BROWSER_PREVIEWABLE_MIME_PREFIXES: tuple[str, ...] = (
    "text/",
    "application/json",
    "application/javascript",
    "application/xml",
    "application/x-yaml",
    "image/svg+xml",
)


def _is_browser_previewable(mime_type: str) -> bool:
    """Return True if browsers typically render this MIME type inline."""
    return any(
        mime_type.startswith(prefix)
        for prefix in _BROWSER_PREVIEWABLE_MIME_PREFIXES
    )


def _sanitize_filename(name: str) -> str:
    """Replace dangerous chars in object key segment, preserving Unicode.

    Path separators are collapsed to ``-`` to prevent directory traversal.
    Control characters and characters forbidden in S3 keys (``*``, ``?``)
    are replaced with ``_``.  Unicode letters (Chinese, etc.) are kept intact
    so the object key remains human-readable.
    """
    name = name.replace("\\", "-").replace("/", "-")
    # Replace control chars (0x00-0x1F, 0x7F) and S3-incompatible chars
    name = re.sub(r"[\x00-\x1f\x7f\"*:<>?|]", "_", name)
    return name[:200] or "file"


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


async def upload_and_record(
    local_path: str,
    user_id: str,
    session_id: Optional[str] = None,
    agent_id: Optional[str] = None,
) -> Optional[str]:
    """Upload a local file to MinIO and create a DB record.

    Returns a backend proxy download URL (``/api/llm-outputs/{id}/download``)
    on success, or ``None`` on any failure.  Callers MUST fall back to a local
    ``file://`` URL when ``None`` is returned (fail-open strategy).

    The proxy URL keeps MinIO internal — the browser downloads through the
    backend, which streams from MinIO via :func:`download_output_file`.
    """
    minio = get_llm_output_minio_client()
    if minio is None:
        logger.debug("LLM output MinIO client not available, skipping upload")
        return None

    try:
        # 1. Check file size
        max_size = _get_max_file_size()
        file_size = os.path.getsize(local_path)
        if file_size > max_size:
            logger.warning(
                "File too large for LLM output upload: %d > %d (%s)",
                file_size, max_size, local_path,
            )
            return None

        # 2. Read file bytes (offloaded to thread)
        def _read() -> bytes:
            with open(local_path, "rb") as f:
                return f.read()

        data = await asyncio.to_thread(_read)

        # 3. Build object key: {user_id}/{session_id}/{safe_name}
        #    Session-scoped grouping avoids the "one UUID dir per file" problem.
        filename = os.path.basename(local_path)
        safe_name = _sanitize_filename(filename)
        session_prefix = _sanitize_filename(session_id) if session_id else "_"
        base_name, ext = os.path.splitext(safe_name)

        # 4. Detect content type.  Text-based types (text/plain, text/html,
        #    application/json, …) are coerced to application/octet-stream so
        #    browsers download them instead of rendering inline — this applies
        #    to both chat FileBlock clicks and the API download_url endpoint.
        mime_type, _ = mimetypes.guess_type(local_path)
        if mime_type is None or _is_browser_previewable(mime_type):
            mime_type = "application/octet-stream"

        # 5. Upload + DB record with collision retry.
        #    Within the same session, same-name files get a ``_1``, ``_2``
        #    suffix rather than each living in its own UUID directory.
        object_key = f"{user_id}/{session_prefix}/{safe_name}"
        max_retries = 10

        for attempt in range(max_retries):
            await minio.put_object(
                object_key=object_key,
                data=data,
                content_type=mime_type,
            )

            try:
                record = await _create_record(
                    user_id=user_id,
                    session_id=session_id,
                    agent_id=agent_id,
                    object_key=object_key,
                    original_filename=filename,
                    file_size=file_size,
                    mime_type=mime_type,
                )
                break  # success — exit retry loop
            except IntegrityError:
                # Duplicate object_key — clean up MinIO copy and retry with
                # an incrementing suffix on the filename segment.
                try:
                    await minio.remove_object(object_key)
                except Exception:
                    logger.debug(
                        "Failed to clean up MinIO object after unique-key "
                        "collision: %s", object_key,
                    )
                suffix = f"_{attempt + 1}"
                object_key = f"{user_id}/{session_prefix}/{base_name}{suffix}{ext}"
                continue
            except Exception:
                # Other DB error — clean up MinIO and fail
                logger.warning(
                    "Failed to write LLM output DB record, "
                    "cleaning up MinIO object: %s",
                    object_key,
                    exc_info=True,
                )
                try:
                    await minio.remove_object(object_key)
                except Exception:
                    logger.debug(
                        "Failed to clean up MinIO object after DB write failure: %s",
                        object_key,
                    )
                return None
        else:
            # Exhausted retries
            logger.warning(
                "Failed to find unique object_key after %d attempts "
                "for user=%s session=%s file=%s",
                max_retries, user_id, session_id, filename,
            )
            return None

        logger.info(
            "Uploaded LLM output file: %s (%d bytes, user=%s, session=%s)",
            object_key, file_size, user_id, session_id,
        )
        # Return backend proxy URL — keeps MinIO internal, browser downloads
        # through the backend which streams from MinIO via download_output_file.
        return f"/api/llm-outputs/{record.id}/download"

    except Exception:
        logger.warning(
            "Failed to upload LLM output file to MinIO, "
            "falling back to local file URL: %s",
            local_path,
            exc_info=True,
        )
        return None


async def _create_record(
    user_id: str,
    session_id: Optional[str],
    agent_id: Optional[str],
    object_key: str,
    original_filename: str,
    file_size: int,
    mime_type: str,
) -> LlmOutputRecord:
    """Insert a new LlmOutputRecord into the database."""
    from ..app.auth_jwt.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        record = LlmOutputRecord(
            user_id=user_id,
            session_id=session_id,
            agent_id=agent_id,
            object_key=object_key,
            original_filename=original_filename,
            file_size=file_size,
            mime_type=mime_type,
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)
        return record


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------


async def list_user_outputs(
    user_id: str,
    session_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> LlmOutputListResponse:
    """Paginated query of the current user's LLM output records."""
    from ..app.auth_jwt.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        # Base query: current user, not deleted
        conditions = [
            LlmOutputRecord.user_id == user_id,
            LlmOutputRecord.is_deleted == False,  # noqa: E712
        ]
        if session_id:
            conditions.append(LlmOutputRecord.session_id == session_id)

        # Count total
        count_q = select(func.count()).where(*conditions)
        total = (await db.execute(count_q)).scalar() or 0

        # Fetch page (newest first)
        q = (
            select(LlmOutputRecord)
            .where(*conditions)
            .order_by(LlmOutputRecord.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        records = (await db.execute(q)).scalars().all()

        # Build response items
        items = []
        for r in records:
            items.append(await _record_to_response(r))

        return LlmOutputListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
        )


async def get_output_with_url(
    output_id: int,
    user_id: str,
) -> Optional[LlmOutputResponse]:
    """Get a single record with a refreshed download URL."""
    from ..app.auth_jwt.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        q = select(LlmOutputRecord).where(
            LlmOutputRecord.id == output_id,
            LlmOutputRecord.user_id == user_id,
            LlmOutputRecord.is_deleted == False,  # noqa: E712
        )
        record = (await db.execute(q)).scalar_one_or_none()
        if record is None:
            return None
        return await _record_to_response(record)


async def _record_to_response(record: LlmOutputRecord) -> LlmOutputResponse:
    """Convert an ORM record to a response.

    ``download_url`` points to the backend proxy endpoint so the file is
    streamed through the same origin with ``Content-Disposition: attachment``
    — avoiding cross-origin issues that cause plain-text files to be
    previewed instead of downloaded.
    """
    return LlmOutputResponse(
        id=record.id,
        session_id=record.session_id,
        agent_id=record.agent_id,
        original_filename=record.original_filename,
        file_size=record.file_size,
        mime_type=record.mime_type,
        download_url=f"/api/llm-outputs/{record.id}/download",
        created_at=record.created_at,
    )


# ---------------------------------------------------------------------------
# Download (stream from MinIO through backend)
# ---------------------------------------------------------------------------


async def download_output_file(
    output_id: int,
    user_id: str,
) -> tuple[bytes, str, str] | None:
    """Fetch file data from MinIO for download proxy.

    Returns ``(data, content_type, filename)`` or ``None`` if the record
    or object doesn't exist.
    """
    from ..app.auth_jwt.database import get_session_factory

    minio = get_llm_output_minio_client()
    if minio is None:
        logger.warning("LLM output MinIO client not available for download")
        return None

    factory = get_session_factory()
    async with factory() as db:
        q = select(LlmOutputRecord).where(
            LlmOutputRecord.id == output_id,
            LlmOutputRecord.user_id == user_id,
            LlmOutputRecord.is_deleted == False,  # noqa: E712
        )
        record = (await db.execute(q)).scalar_one_or_none()
        if record is None:
            return None

        try:
            result = await minio.get_object(record.object_key)
        except Exception:
            logger.warning(
                "Failed to fetch MinIO object for download: %s",
                record.object_key,
                exc_info=True,
            )
            return None

        if result is None:
            logger.warning(
                "MinIO object not found for download: %s",
                record.object_key,
            )
            return None

        data, content_type = result
        return data, content_type, record.original_filename


# ---------------------------------------------------------------------------
# Download to local (for chat URL resolution)
# ---------------------------------------------------------------------------


async def download_to_local(
    output_id: int,
    user_id: str,
    dest_dir: str,
) -> Optional[str]:
    """Download an LLM output file from MinIO to a local directory.

    Looks up the record (checks ``user_id`` + ``is_deleted=False``),
    fetches the object from MinIO, and writes it to ``dest_dir`` with
    the naming pattern ``{output_id}_{original_filename}``.

    Returns the absolute local path on success, or ``None`` if the
    record doesn't exist / is inaccessible / download fails.
    """
    import os as _os

    from ..app.auth_jwt.database import get_session_factory

    minio = get_llm_output_minio_client()
    if minio is None:
        logger.warning("LLM output MinIO client not available for download")
        return None

    factory = get_session_factory()
    async with factory() as db:
        # Step 1: check existence (without user_id, to distinguish
        # "not found" from "permission denied").
        q = select(LlmOutputRecord).where(
            LlmOutputRecord.id == output_id,
            LlmOutputRecord.is_deleted == False,  # noqa: E712
        )
        record = (await db.execute(q)).scalar_one_or_none()
        if record is None:
            return None  # not found / already deleted

        # Step 2: check ownership
        if record.user_id != user_id:
            raise PermissionError(
                f"User {user_id} does not own output {output_id}",
            )

        # Build local path: {dest_dir}/{filename}_{output_id}
        _os.makedirs(dest_dir, exist_ok=True)
        safe_name = _sanitize_filename(record.original_filename)
        # Split stem and extension so the suffix stays after output_id
        stem, ext = _os.path.splitext(safe_name)
        local_path = _os.path.join(
            dest_dir, f"{stem}_{output_id}{ext}",
        )

        # Already cached on disk — skip download
        if _os.path.isfile(local_path):
            logger.debug(
                "LLM output file already cached: %s", local_path,
            )
            return _os.path.abspath(local_path)

        try:
            result = await minio.get_object(record.object_key)
        except Exception:
            logger.warning(
                "Failed to fetch MinIO object for local download: %s",
                record.object_key,
                exc_info=True,
            )
            return None

        if result is None:
            logger.warning(
                "MinIO object not found for local download: %s",
                record.object_key,
            )
            return None

        data, _content_type = result
        try:
            await asyncio.to_thread(
                lambda: __write_file(local_path, data),
            )
        except Exception:
            logger.warning(
                "Failed to write LLM output file to disk: %s",
                local_path,
                exc_info=True,
            )
            return None

        logger.info(
            "Downloaded LLM output file to local: %s (%d bytes)",
            local_path, len(data),
        )
        return _os.path.abspath(local_path)


def __write_file(path: str, data: bytes) -> None:
    """Synchronous helper — writes bytes to a file path."""
    with open(path, "wb") as f:
        f.write(data)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def soft_delete_output(output_id: int, user_id: str) -> bool:
    """Soft-delete a single record (does not remove MinIO object)."""
    from ..app.auth_jwt.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            update(LlmOutputRecord)
            .where(
                LlmOutputRecord.id == output_id,
                LlmOutputRecord.user_id == user_id,
                LlmOutputRecord.is_deleted == False,  # noqa: E712
            )
            .values(is_deleted=True)
        )
        await db.commit()
        return result.rowcount > 0


async def batch_soft_delete_outputs(
    ids: list[int], user_id: str,
) -> int:
    """Batch soft-delete records. Returns the count of deleted records."""
    from ..app.auth_jwt.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            update(LlmOutputRecord)
            .where(
                LlmOutputRecord.id.in_(ids),
                LlmOutputRecord.user_id == user_id,
                LlmOutputRecord.is_deleted == False,  # noqa: E712
            )
            .values(is_deleted=True)
        )
        await db.commit()
        return result.rowcount
