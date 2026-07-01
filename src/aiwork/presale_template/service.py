# -*- coding: utf-8 -*-
"""Business logic for the presale template module.

Covers:
- Template upload: streaming auto-detect small vs multipart (up to 500MB).
- Template CRUD (admin-only for write operations).
- Public list with presigned download URLs.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from datetime import timedelta

from sqlalchemy import func, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile as StarletteUploadFile

from ..config.timezone import get_user_now
from ..constant import EnvVarLoader

from ..file_library.minio_client import MinioClient, get_minio_client
from .models import (
    PresaleTemplate,
    PresaleUploadSession,
    ALLOWED_PPT_MIME_TYPES,
    ALLOWED_PPT_EXTENSIONS,
)
from .schemas import (
    TemplateResponse,
    TemplatePublicItem,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants (with env overrides)
# ---------------------------------------------------------------------------

_CHUNK_SIZE = EnvVarLoader.get_int(
    "AIWORK_MINIO_CHUNK_SIZE", 10_485_760, min_value=5_242_880,
)
_SESSION_TTL = EnvVarLoader.get_int(
    "AIWORK_MINIO_SESSION_TTL", 86_400, min_value=60,
)
_MAX_FILE_SIZE = EnvVarLoader.get_int(
    "AIWORK_PRESALE_MAX_FILE_SIZE", 524_288_000, min_value=1,
)  # 500 MB default

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class TemplateError(Exception):
    """Base exception for presale template errors."""


class EmptyFileError(TemplateError):
    """Uploaded file has zero bytes."""


class FileTooLargeError(TemplateError):
    """Uploaded file exceeds the configured maximum size."""


class InvalidFileTypeError(TemplateError):
    """File MIME type or extension is not allowed."""


class DuplicateTemplateNameError(TemplateError):
    """A template with the same name already exists."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def sanitize_filename(name: str) -> str:
    """Sanitise a filename: strip path separators, null bytes, and path
    traversal attempts.  Truncate to 256 characters."""
    safe = os.path.basename(name.strip("\x00"))
    safe = safe.replace("../", "").replace("..\\", "").replace("\x00", "")
    return safe[:256] or "unnamed"


def _validate_ppt_file(filename: str, content_type: str | None) -> None:
    """Validate that the file has an allowed PPT extension and MIME type.

    Raises:
        InvalidFileTypeError: if the file is not a PPT/PPTX.
    """
    _, ext = os.path.splitext(filename)
    ext_lower = ext.lower()
    if ext_lower not in ALLOWED_PPT_EXTENSIONS:
        raise InvalidFileTypeError(
            f"File extension '{ext}' is not allowed. "
            f"Only {', '.join(sorted(ALLOWED_PPT_EXTENSIONS))} are accepted.",
        )
    if content_type and content_type not in ALLOWED_PPT_MIME_TYPES:
        raise InvalidFileTypeError(
            f"MIME type '{content_type}' is not allowed. "
            f"Only PowerPoint formats are accepted.",
        )


async def _check_duplicate_name(
    db: AsyncSession,
    name: str,
    exclude_id: int | None = None,
) -> None:
    """Raise ``DuplicateTemplateNameError`` if a non-deleted template with
    the same name already exists."""
    stmt = select(PresaleTemplate.id).where(
        PresaleTemplate.is_deleted == 0,  # noqa: E712
        PresaleTemplate.name == name.strip(),
    )
    if exclude_id is not None:
        stmt = stmt.where(PresaleTemplate.id != exclude_id)
    result = await db.execute(stmt)
    if result.scalar_one_or_none() is not None:
        raise DuplicateTemplateNameError(
            f"Template '{name.strip()}' already exists",
        )


# ========================================================================
# TEMPLATE UPLOAD (streaming auto-detect small / multipart)
# ========================================================================


async def upload_template(
    db: AsyncSession,
    file: StarletteUploadFile,
    name: str,
    description: str,
    uploader_id: int,
    minio: MinioClient,
) -> PresaleTemplate:
    """Unified upload endpoint — streaming, auto path selection.

    Reads the file in chunks.  After the first chunk:
    - If the stream ends immediately → small file: direct ``put_object``.
    - If more data follows → large file: S3 Multipart Upload.

    PPT-only: validates extension (.ppt/.pptx) and MIME type before upload.
    Max file size is configurable (default 500MB).
    """
    safe_name = sanitize_filename(file.filename or "unnamed")
    template_name = name.strip()

    # --- validate file type ---
    _validate_ppt_file(safe_name, file.content_type)

    # --- duplicate name check ---
    await _check_duplicate_name(db, template_name)

    object_key = uuid.uuid4().hex
    etags: list[dict] = []
    total_size = 0
    part_number = 0
    session: PresaleUploadSession | None = None
    file_hash = hashlib.sha256()

    # ---- read first chunk ----
    first_chunk = await file.read(_CHUNK_SIZE)
    if not first_chunk:
        raise EmptyFileError("Uploaded file is empty")
    total_size = len(first_chunk)
    file_hash.update(first_chunk)
    part_number = 1

    # ---- probe for more data ----
    probe_chunk = await file.read(1024)

    if probe_chunk == b"":  # stream ended → SMALL FILE
        if total_size > _MAX_FILE_SIZE:
            raise FileTooLargeError(
                f"File size {total_size} exceeds maximum {_MAX_FILE_SIZE}",
            )

        await minio.put_object(
            object_key, first_chunk, total_size,
            content_type=file.content_type or "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )

        final_hash = file_hash.hexdigest()
        return await _create_template_record(
            db, object_key, template_name, description,
            safe_name, total_size,
            file.content_type or "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            final_hash, uploader_id,
        )

    # ---- LARGE FILE: init multipart ----
    if total_size > _MAX_FILE_SIZE:
        raise FileTooLargeError(
            f"File size exceeds maximum {_MAX_FILE_SIZE}",
        )

    upload_id = await minio.create_multipart_upload(
        object_key, file.content_type or "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )

    # Create UploadSession in DB (DB first, then MinIO — compensation on failure)
    session = PresaleUploadSession(
        session_key=uuid.uuid4().hex,
        upload_id=upload_id,
        object_key=object_key,
        original_name=safe_name,
        mime_type=file.content_type or "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        uploader_id=uploader_id,
        total_parts=0,
        total_size=0,
        uploaded_parts=None,
        status="uploading",
        expires_at=get_user_now() + timedelta(seconds=_SESSION_TTL),
    )
    db.add(session)
    await db.commit()

    try:
        # Upload first chunk (already in memory)
        etag = await minio.upload_part(object_key, upload_id, 1, first_chunk)
        etags.append({"PartNumber": 1, "ETag": etag})

        # Stream and upload remaining chunks
        pending = bytearray(probe_chunk)  # the 1KB probe we already read
        while True:
            chunk = await file.read(_CHUNK_SIZE)
            if not chunk and len(pending) == 0:
                break

            if chunk:
                pending.extend(chunk)

            # Flush a full chunk (or the final remainder)
            while len(pending) >= _CHUNK_SIZE or (
                not chunk and len(pending) > 0
            ):
                part_data = bytes(
                    pending[:_CHUNK_SIZE]
                    if len(pending) >= _CHUNK_SIZE
                    else pending
                )
                pending = pending[len(part_data):]

                total_size += len(part_data)
                file_hash.update(part_data)
                if total_size > _MAX_FILE_SIZE:
                    raise FileTooLargeError(
                        f"File size exceeds maximum {_MAX_FILE_SIZE}",
                    )
                part_number += 1

                etag = await minio.upload_part(
                    object_key, upload_id, part_number, part_data,
                )
                etags.append({"PartNumber": part_number, "ETag": etag})

                # Persist progress after each chunk
                session.uploaded_parts = json.dumps(etags)
                session.total_size = total_size
                await db.commit()

        # Complete multipart
        await minio.complete_multipart_upload(object_key, upload_id, etags)

        # Mark session completed
        session.status = "completed"
        session.total_parts = part_number
        session.total_size = total_size
        session.file_hash = file_hash.hexdigest()
        session.uploaded_parts = json.dumps(etags)
        await db.commit()

    except Exception:
        # Immediate compensation: abort MinIO multipart + mark session
        session.status = "aborted"
        await db.commit()
        try:
            await minio.abort_multipart_upload(object_key, upload_id)
        except Exception:
            pass
        raise

    # Create PresaleTemplate record
    final_hash = file_hash.hexdigest()
    return await _create_template_record(
        db, object_key, template_name, description,
        safe_name, total_size,
        file.content_type or "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        final_hash, uploader_id,
    )


async def _create_template_record(
    db: AsyncSession,
    object_key: str,
    name: str,
    description: str,
    original_name: str,
    file_size: int,
    mime_type: str,
    file_hash: str,
    uploader_id: int,
) -> PresaleTemplate:
    """Insert a PresaleTemplate row.  On DB failure, compensate by deleting
    the MinIO object."""
    record = PresaleTemplate(
        name=name,
        description=description,
        object_key=object_key,
        original_name=sanitize_filename(original_name),
        file_size=file_size,
        mime_type=mime_type,
        file_hash=file_hash,
        created_by=uploader_id,
    )
    db.add(record)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        minio = get_minio_client()
        if minio is not None:
            try:
                await minio.remove_object(object_key)
            except Exception:
                pass
        raise
    await db.refresh(record)
    return record


# ========================================================================
# TEMPLATE CRUD
# ========================================================================


async def get_template(
    db: AsyncSession, template_id: int,
) -> PresaleTemplate | None:
    """Get a single template by id.  Returns None if not found."""
    stmt = select(PresaleTemplate).where(
        PresaleTemplate.id == template_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_template(
    db: AsyncSession,
    template_id: int,
    name: str | None = None,
    description: str | None = None,
) -> PresaleTemplate:
    """Update template metadata.  Raises ValueError if not found."""
    record = await get_template(db, template_id)
    if record is None:
        raise ValueError(f"Template id={template_id} not found")

    if name is not None:
        await _check_duplicate_name(db, name, exclude_id=template_id)
        record.name = name.strip()
    if description is not None:
        record.description = description.strip()

    await db.commit()
    await db.refresh(record)
    return record


async def delete_template(
    db: AsyncSession,
    template_id: int,
    minio: MinioClient | None = None,
) -> bool:
    """Soft-delete a template and remove its MinIO object (best-effort).

    Returns False if not found.
    """
    record = await get_template(db, template_id)
    if record is None:
        return False
    record.is_deleted = 1
    await db.commit()

    # Immediately delete the MinIO blob (best-effort).  If MinIO deletion
    # fails, the periodic cleanup task will handle it later.
    if minio is not None:
        try:
            await minio.remove_object(record.object_key)
        except Exception:
            logger.debug(
                "Failed to delete MinIO object %s for template id=%s — "
                "will be cleaned up by periodic task",
                record.object_key, template_id,
            )
    return True


async def list_templates_admin(
    db: AsyncSession,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[PresaleTemplate], int]:
    """Paginated template list for admin (includes soft-deleted).

    Supports optional fuzzy search by name.
    """
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    where = True  # no filter by default — admin sees all

    if search:
        where = PresaleTemplate.name.like(f"%{search}%")

    # Count
    count_stmt = (
        select(func.count()).select_from(PresaleTemplate).where(where)
    )
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    # Query
    stmt = (
        select(PresaleTemplate)
        .where(where)
        .order_by(PresaleTemplate.created_at.desc())
        .limit(page_size)
        .offset(offset)
    )
    result = await db.execute(stmt)
    records = list(result.scalars().all())

    return records, total


async def list_templates_public(
    db: AsyncSession,
    minio: MinioClient,
) -> list[TemplatePublicItem]:
    """Return all non-deleted templates with presigned download URLs.

    This is the public endpoint — no pagination, no auth required.
    """
    stmt = (
        select(PresaleTemplate)
        .where(PresaleTemplate.is_deleted == 0)  # noqa: E712
        .order_by(PresaleTemplate.created_at.desc())
    )
    result = await db.execute(stmt)
    records = list(result.scalars().all())

    items: list[TemplatePublicItem] = []
    for record in records:
        try:
            url = await minio.presigned_get_url(record.object_key)
        except Exception:
            logger.debug(
                "Failed to generate presigned URL for template id=%s",
                record.id,
            )
            url = ""
        items.append(TemplatePublicItem(
            id=record.id,
            name=record.name,
            description=record.description,
            original_name=record.original_name,
            file_size=record.file_size,
            download_url=url,
            created_at=record.created_at,
        ))

    return items


async def get_template_download_url(
    db: AsyncSession,
    template_id: int,
    minio: MinioClient,
) -> str | None:
    """Get a presigned download URL for a template.  Returns None if not
    found or soft-deleted."""
    record = await get_template(db, template_id)
    if record is None or record.is_deleted == 1:
        return None
    return await minio.presigned_get_url(record.object_key)


# ========================================================================
# RESPONSE BUILDER
# ========================================================================


def _build_template_response(record: PresaleTemplate) -> TemplateResponse:
    """Convert an ORM PresaleTemplate to a Pydantic TemplateResponse."""
    return TemplateResponse(
        id=record.id,
        name=record.name,
        description=record.description,
        object_key=record.object_key,
        original_name=record.original_name,
        file_size=record.file_size,
        mime_type=record.mime_type,
        file_hash=record.file_hash,
        created_by=record.created_by,
        created_at=record.created_at,
        updated_at=record.updated_at,
        is_deleted=bool(record.is_deleted),
    )
