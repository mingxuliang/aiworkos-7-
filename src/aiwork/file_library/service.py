# -*- coding: utf-8 -*-
"""Business logic for the file library module.

Covers:
- Directory tree CRUD (BFS-based, reusing department tree patterns).
- File upload: streaming auto-detect small vs multipart.
- File list / search / batch-read / batch-delete.
- File rename / move.

Permission rules (simplified, no RBAC codes):
- Users see & operate only their own files / folders.
- Admin role can see & operate all files / folders.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from typing import List

from ..config.timezone import get_user_now

from sqlalchemy import func, or_, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile as StarletteUploadFile

from ..constant import EnvVarLoader

from .minio_client import MinioClient, get_minio_client
from .models import FileFolder, FileRecord, UploadSession
from .schemas import (
    FileResponse,
    FolderTreeNode,
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

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class FileLibraryError(Exception):
    """Base exception for file library errors."""


class EmptyFileError(FileLibraryError):
    """Uploaded file has zero bytes."""


class FileTooLargeError(FileLibraryError):
    """Uploaded file exceeds the configured maximum size."""


class MimeTypeNotAllowedError(FileLibraryError):
    """MIME type is not in the allowed list."""


class DuplicateFolderNameError(FileLibraryError):
    """A folder with the same name already exists under the same parent."""


class DuplicateFileNameError(FileLibraryError):
    """A file with the same name already exists in the target directory."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def sanitize_filename(name: str) -> str:
    """Sanitise a filename: strip path separators, null bytes, and path
    traversal attempts.  Truncate to 256 characters."""
    safe = os.path.basename(name.strip("\x00"))
    safe = safe.replace("../", "").replace("..\\", "").replace("\x00", "")
    return safe[:256] or "unnamed"


def _check_mime_allowed(minio: MinioClient, mime_type: str | None) -> None:
    """Raise MimeTypeNotAllowedError if the MIME type is blocked."""
    allowed = minio.allowed_mime_types
    if allowed is None:
        return
    if mime_type is None or mime_type not in allowed:
        raise MimeTypeNotAllowedError(
            f"MIME type '{mime_type}' is not allowed",
        )


async def _check_duplicate_file_name(
    db: AsyncSession,
    folder_id: int | None,
    original_name: str,
    uploader_id: int,
    is_admin: bool = False,
) -> None:
    """Raise ``DuplicateFileNameError`` if a non-deleted file with the
    same sanitised name already exists in the target directory."""
    safe_name = sanitize_filename(original_name)
    where = [
        FileRecord.is_deleted == False,  # noqa: E712
        FileRecord.original_name == safe_name,
    ]
    if folder_id is None:
        where.append(FileRecord.folder_id.is_(None))
    else:
        where.append(FileRecord.folder_id == folder_id)
    if not is_admin:
        where.append(FileRecord.uploader_id == uploader_id)

    stmt = select(FileRecord.id).where(*where)
    result = await db.execute(stmt)
    if result.scalar_one_or_none() is not None:
        raise DuplicateFileNameError(
            f"File '{safe_name}' already exists in the target directory",
        )


async def _find_existing_by_hash(
    db: AsyncSession,
    file_hash: str,
    uploader_id: int,
) -> FileRecord | None:
    """Return an existing non-deleted FileRecord with the same hash for
    the same user, or None.  Used for content-based dedup (秒传)."""
    stmt = select(FileRecord).where(
        FileRecord.file_hash == file_hash,
        FileRecord.uploader_id == uploader_id,
        FileRecord.is_deleted == False,  # noqa: E712
    ).order_by(FileRecord.id).limit(1)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def _user_filter(is_admin: bool, user_id: int):
    """Return a WHERE filter for queries.

    Admin can see all non-deleted rows; regular users see only their own.
    """
    if is_admin:
        return FileRecord.is_deleted == False  # noqa: E712
    return (FileRecord.uploader_id == user_id) & (FileRecord.is_deleted == False)  # noqa: E712


# ---------------------------------------------------------------------------
# Folder helpers (tree building — BFS, mirroring department/service.py)
# ---------------------------------------------------------------------------


async def _collect_subfolder_ids(
    db: AsyncSession, folder_id: int,
) -> list[int]:
    """BFS-collect all descendant folder ids (including the root folder)."""
    stmt = select(FileFolder.id, FileFolder.parent_id).where(
        FileFolder.is_deleted == False  # noqa: E712
    )
    result = await db.execute(stmt)
    rows = result.all()

    children_map: dict[int | None, list[int]] = defaultdict(list)
    for row in rows:
        children_map[row.parent_id].append(row.id)

    ids: list[int] = []
    queue = [folder_id]
    while queue:
        current = queue.pop(0)
        ids.append(current)
        queue.extend(children_map.get(current, []))
    return ids


# ========================================================================
# FOLDER CRUD
# ========================================================================


async def _check_duplicate_folder_name(
    db: AsyncSession,
    parent_id: int | None,
    name: str,
    user_id: int,
    is_admin: bool = False,
    exclude_id: int | None = None,
) -> None:
    """Raise ``DuplicateFolderNameError`` if a non-deleted folder with the
    same name already exists under the same parent (within the user's scope).

    ``exclude_id`` is used during updates to skip the folder being renamed.
    """
    where = (
        FileFolder.is_deleted == False,  # noqa: E712
        FileFolder.name == name.strip(),
    )
    # Handle parent_id match (IS NULL / IS NOT NULL)
    if parent_id is None:
        where = (*where, FileFolder.parent_id.is_(None))
    else:
        where = (*where, FileFolder.parent_id == parent_id)

    if not is_admin:
        where = (*where, FileFolder.created_by == user_id)

    stmt = select(FileFolder.id).where(*where)
    if exclude_id is not None:
        stmt = stmt.where(FileFolder.id != exclude_id)

    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise DuplicateFolderNameError(
            f"Folder '{name.strip()}' already exists under the same parent",
        )


async def create_folder(
    db: AsyncSession,
    parent_id: int | None,
    name: str,
    user_id: int,
    is_admin: bool = False,
) -> FileFolder:
    """Create a new directory.

    Raises:
        DuplicateFolderNameError: if a folder with the same name already
            exists under the same parent.
    """
    await _check_duplicate_folder_name(
        db, parent_id, name, user_id, is_admin,
    )
    folder = FileFolder(
        parent_id=parent_id,
        name=name.strip(),
        created_by=user_id,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder


async def get_folder(
    db: AsyncSession, folder_id: int, user_id: int, is_admin: bool = False,
) -> FileFolder | None:
    """Get a single folder by id.  Returns None if not found or not owned."""
    stmt = select(FileFolder).where(
        FileFolder.id == folder_id,
        FileFolder.is_deleted == False,  # noqa: E712
    )
    result = await db.execute(stmt)
    folder = result.scalar_one_or_none()
    if folder is None:
        return None
    if not is_admin and folder.created_by != user_id:
        return None
    return folder


async def update_folder(
    db: AsyncSession,
    folder_id: int,
    user_id: int,
    name: str | None = None,
    parent_id: int | None = None,
    is_admin: bool = False,
) -> FileFolder:
    """Rename and/or move a folder.

    Raises:
        ValueError: if folder not found or access denied.
        DuplicateFolderNameError: if the new name (or name at the new
            parent) conflicts with an existing folder.
    """
    folder = await get_folder(db, folder_id, user_id, is_admin)
    if folder is None:
        raise ValueError(f"Folder id={folder_id} not found or access denied")

    new_name = name.strip() if name is not None else folder.name
    new_parent_id = parent_id if parent_id is not None else folder.parent_id

    # Check for duplicate only if name or parent changed
    if name is not None or parent_id is not None:
        await _check_duplicate_folder_name(
            db, new_parent_id, new_name, user_id, is_admin,
            exclude_id=folder_id,
        )

    folder.name = new_name
    folder.parent_id = new_parent_id
    await db.commit()
    await db.refresh(folder)
    return folder


async def delete_folder(
    db: AsyncSession,
    folder_id: int,
    user_id: int,
    is_admin: bool = False,
) -> None:
    """Soft-delete a folder and its descendant folders (BFS).

    Descendant files are NOT deleted — their ``folder_id`` is set to NULL
    so they become "orphan" files visible at the root level.
    """
    folder = await get_folder(db, folder_id, user_id, is_admin)
    if folder is None:
        raise ValueError(f"Folder id={folder_id} not found or access denied")

    # Collect all descendant folder ids
    descendant_ids = await _collect_subfolder_ids(db, folder_id)

    # Soft-delete all folders in the subtree
    await db.execute(
        sa_update(FileFolder)
        .where(FileFolder.id.in_(descendant_ids))
        .values(is_deleted=True, updated_at=get_user_now())
    )

    # Detach files from the deleted folders
    await db.execute(
        sa_update(FileRecord)
        .where(
            FileRecord.folder_id.in_(descendant_ids),
            FileRecord.is_deleted == False,  # noqa: E712
        )
        .values(folder_id=None)
    )

    await db.commit()


async def get_folder_tree(
    db: AsyncSession, user_id: int, is_admin: bool = False,
) -> list[FolderTreeNode]:
    """Build the full directory tree for the current user.

    Returns a list of top-level folders (parent_id IS NULL), each with
    nested children, sorted by id ascending.  If there are no top-level
    folders, returns an empty list.
    """
    where = (
        FileFolder.is_deleted == False  # noqa: E712
        if is_admin
        else (FileFolder.created_by == user_id) & (FileFolder.is_deleted == False)  # noqa: E712
    )
    stmt = select(FileFolder).where(where).order_by(FileFolder.id)
    result = await db.execute(stmt)
    all_folders: list[FileFolder] = list(result.scalars().all())

    if not all_folders:
        return []

    # Build children map
    children_map: dict[int | None, list[FileFolder]] = defaultdict(list)
    for f in all_folders:
        children_map[f.parent_id].append(f)

    # Count files per folder
    folder_ids = [f.id for f in all_folders]
    file_counts: dict[int, int] = {}
    if folder_ids:
        count_stmt = (
            select(FileRecord.folder_id, func.count(FileRecord.id))
            .where(
                FileRecord.folder_id.in_(folder_ids),
                FileRecord.is_deleted == False,  # noqa: E712
            )
            .group_by(FileRecord.folder_id)
        )
        count_result = await db.execute(count_stmt)
        file_counts = {row[0]: row[1] for row in count_result.all()}

    def _build_node(folder: FileFolder) -> FolderTreeNode:
        kids = children_map.get(folder.id, [])
        return FolderTreeNode(
            id=folder.id,
            parent_id=folder.parent_id,
            name=folder.name,
            created_by=folder.created_by,
            created_at=folder.created_at,
            updated_at=folder.updated_at,
            file_count=file_counts.get(folder.id, 0),
            children=[_build_node(c) for c in kids],
        )

    # Build top-level nodes from all root folders, sorted by id
    roots = children_map.get(None, [])
    roots.sort(key=lambda f: f.id)
    return [_build_node(r) for r in roots]


# ========================================================================
# FILE UPLOAD (streaming auto-detect small / multipart)
# ========================================================================


async def upload_file(
    db: AsyncSession,
    file: StarletteUploadFile,
    folder_id: int | None,
    uploader_id: int,
    minio: MinioClient,
) -> FileRecord:
    """Unified upload endpoint — streaming, auto path selection.

    Reads the file in chunks.  After the first chunk:
    - If the stream ends immediately → small file: direct ``put_object``.
    - If more data follows → large file: S3 Multipart Upload.

    Deduplication:
    - Filename dedup: rejected with 409 if same name exists in target folder.
    - Content dedup (秒传): after upload, if file_hash matches an existing
      record, the new MinIO object is deleted and the new FileRecord reuses
      the existing object_key — saving MinIO storage.

    Chunks are uploaded as they are read (no accumulation).
    """
    safe_name = sanitize_filename(file.filename or "unnamed")

    # --- filename dedup (before any I/O) ---
    await _check_duplicate_file_name(
        db, folder_id, safe_name, uploader_id,
    )

    object_key = uuid.uuid4().hex
    etags: list[dict] = []
    total_size = 0
    part_number = 0
    session: UploadSession | None = None
    file_hash = hashlib.sha256()

    # ---- read first chunk ----
    first_chunk = await file.read(_CHUNK_SIZE)
    if not first_chunk:
        raise EmptyFileError("Uploaded file is empty")
    total_size = len(first_chunk)
    file_hash.update(first_chunk)
    part_number = 1

    # ---- probe for more data (replaces non-existent peek()) ----
    probe_chunk = await file.read(1024)

    if probe_chunk == b"":  # stream ended → SMALL FILE
        _check_mime_allowed(minio, file.content_type)
        if total_size > minio.max_file_size:
            raise FileTooLargeError(
                f"File size {total_size} exceeds maximum {minio.max_file_size}",
            )

        await minio.put_object(
            object_key, first_chunk, total_size,
            content_type=file.content_type or "application/octet-stream",
        )

        final_hash = file_hash.hexdigest()
        final_key = await _resolve_object_key_for_dedup(
            db, minio, object_key, final_hash, uploader_id,
        )
        return await _create_file_record(
            db, final_key, safe_name,
            total_size, file.content_type or "application/octet-stream",
            final_hash, folder_id, uploader_id,
        )

    # ---- LARGE FILE: init multipart ----
    _check_mime_allowed(minio, file.content_type)
    if total_size > minio.max_file_size:
        raise FileTooLargeError(
            f"File size exceeds maximum {minio.max_file_size}",
        )

    upload_id = await minio.create_multipart_upload(
        object_key, file.content_type or "application/octet-stream",
    )

    # Create UploadSession in DB (DB first, then MinIO — compensation on failure)
    session = UploadSession(
        session_key=uuid.uuid4().hex,
        upload_id=upload_id,
        object_key=object_key,
        original_name=sanitize_filename(file.filename or "unnamed"),
        mime_type=file.content_type or "application/octet-stream",
        folder_id=folder_id,
        scope_type="user",
        scope_id=uploader_id,
        uploader_id=uploader_id,
        total_parts=0,
        total_size=0,
        uploaded_parts=None,
        status="uploading",
        expires_at=get_user_now() + timedelta(seconds=minio.session_ttl),
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
                if total_size > minio.max_file_size:
                    raise FileTooLargeError(
                        f"File size exceeds maximum {minio.max_file_size}",
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

    # Create FileRecord (with content dedup)
    final_hash = file_hash.hexdigest()
    final_key = await _resolve_object_key_for_dedup(
        db, minio, object_key, final_hash, uploader_id,
    )
    return await _create_file_record(
        db, final_key, safe_name,
        total_size, file.content_type or "application/octet-stream",
        final_hash, folder_id, uploader_id,
    )


async def _resolve_object_key_for_dedup(
    db: AsyncSession,
    minio: MinioClient,
    new_object_key: str,
    file_hash: str,
    uploader_id: int,
) -> str:
    """Check if a file with the same hash already exists for this user.

    If yes (秒传): delete the newly uploaded MinIO object and return the
    existing object_key.  This saves MinIO storage while still creating a
    new FileRecord row (so the file appears in the user's chosen folder).

    If no: return the new_object_key unchanged.
    """
    existing = await _find_existing_by_hash(db, file_hash, uploader_id)
    if existing is None:
        return new_object_key
    # Same content already exists — reuse its object_key, delete the new one
    logger.info(
        "Content dedup: file_hash=%s already exists (object_key=%s), "
        "reusing existing MinIO object and deleting %s",
        file_hash, existing.object_key, new_object_key,
    )
    try:
        await minio.remove_object(new_object_key)
    except Exception:
        logger.debug("Failed to delete duplicate MinIO object %s", new_object_key)
    return existing.object_key


async def _create_file_record(
    db: AsyncSession,
    object_key: str,
    original_name: str,
    file_size: int,
    mime_type: str,
    file_hash: str,
    folder_id: int | None,
    uploader_id: int,
) -> FileRecord:
    """Insert a FileRecord row.  On DB failure, compensate by deleting the
    MinIO object."""
    record = FileRecord(
        folder_id=folder_id,
        scope_type="user",
        scope_id=uploader_id,
        original_name=sanitize_filename(original_name),
        object_key=object_key,
        file_size=file_size,
        mime_type=mime_type,
        file_hash=file_hash,
        uploader_id=uploader_id,
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
# FILE QUERIES
# ========================================================================


async def list_files(
    db: AsyncSession,
    user_id: int,
    folder_id: int | None = None,
    recursive: bool = False,
    page: int = 1,
    page_size: int = 20,
    is_admin: bool = False,
) -> tuple[list[FileRecord], int]:
    """Paginated file list.  If ``recursive=True``, includes all descendant
    folders."""
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    base_where = _user_filter(is_admin, user_id)

    if recursive and folder_id is not None:
        sub_ids = await _collect_subfolder_ids(db, folder_id)
        folder_where = FileRecord.folder_id.in_(sub_ids)
    elif folder_id is not None:
        folder_where = FileRecord.folder_id == folder_id
    else:
        # folder_id=None means "root" — files without a folder
        folder_where = FileRecord.folder_id.is_(None)

    where_clause = base_where & folder_where

    # Count
    count_stmt = (
        select(func.count()).select_from(FileRecord).where(where_clause)
    )
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    # Query
    stmt = (
        select(FileRecord)
        .where(where_clause)
        .order_by(FileRecord.created_at.desc())
        .limit(page_size)
        .offset(offset)
    )
    result = await db.execute(stmt)
    records = list(result.scalars().all())

    return records, total


async def search_files(
    db: AsyncSession,
    user_id: int,
    q: str,
    mime_type: str | None = None,
    page: int = 1,
    page_size: int = 20,
    is_admin: bool = False,
) -> tuple[list[FileRecord], int]:
    """Global fuzzy search across all folders, filtered by filename and
    optional MIME type."""
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    where = _user_filter(is_admin, user_id)
    # LIKE with wildcards on both sides — B-tree index won't help, but
    # uploader_id filter narrows the scan to one user's files.
    where = where & FileRecord.original_name.like(f"%{q}%")

    if mime_type:
        if mime_type.endswith("/*"):
            # e.g. "image/*" → match prefix
            where = where & FileRecord.mime_type.like(
                f"{mime_type[:-1]}%"
            )
        else:
            where = where & FileRecord.mime_type == mime_type

    count_stmt = (
        select(func.count()).select_from(FileRecord).where(where)
    )
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    stmt = (
        select(FileRecord)
        .where(where)
        .order_by(FileRecord.created_at.desc())
        .limit(page_size)
        .offset(offset)
    )
    result = await db.execute(stmt)
    records = list(result.scalars().all())

    return records, total


async def get_file(
    db: AsyncSession,
    file_id: int,
    user_id: int,
    is_admin: bool = False,
) -> FileRecord | None:
    """Get a single file by id.  Returns None if not found or not owned."""
    stmt = select(FileRecord).where(
        FileRecord.id == file_id,
        FileRecord.is_deleted == False,  # noqa: E712
    )
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if record is None:
        return None
    if not is_admin and record.uploader_id != user_id:
        return None
    return record


async def get_files_batch(
    db: AsyncSession,
    file_ids: list[int],
    user_id: int,
    is_admin: bool = False,
) -> list[FileRecord]:
    """Batch-fetch multiple file records.  Silently skips inaccessible files."""
    stmt = select(FileRecord).where(
        FileRecord.id.in_(file_ids),
        FileRecord.is_deleted == False,  # noqa: E712
    )
    if not is_admin:
        stmt = stmt.where(FileRecord.uploader_id == user_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_file(
    db: AsyncSession,
    file_id: int,
    user_id: int,
    original_name: str | None = None,
    folder_id: int | None = None,
    is_admin: bool = False,
) -> FileRecord:
    """Rename and/or move a file.  Raises ValueError if not found/owned."""
    record = await get_file(db, file_id, user_id, is_admin)
    if record is None:
        raise ValueError(f"File id={file_id} not found or access denied")
    if original_name is not None:
        record.original_name = sanitize_filename(original_name)
    if folder_id is not None:
        record.folder_id = folder_id
    await db.commit()
    await db.refresh(record)
    return record


async def delete_file(
    db: AsyncSession,
    file_id: int,
    user_id: int,
    minio: MinioClient | None = None,
    is_admin: bool = False,
) -> bool:
    """Soft-delete a single file and remove its MinIO object (best-effort).

    Returns False if not found/owned.
    """
    record = await get_file(db, file_id, user_id, is_admin)
    if record is None:
        return False
    record.is_deleted = True
    await db.commit()

    # Immediately delete the MinIO blob (best-effort).  If MinIO deletion
    # fails, the periodic cleanup task in cleanup.py will handle it later.
    if minio is not None:
        try:
            await minio.remove_object(record.object_key)
        except Exception:
            logger.debug(
                "Failed to delete MinIO object %s for file id=%s — "
                "will be cleaned up by periodic task",
                record.object_key, file_id,
            )
    return True


async def batch_delete_files(
    db: AsyncSession,
    file_ids: list[int],
    user_id: int,
    minio: MinioClient | None = None,
    is_admin: bool = False,
) -> dict:
    """Soft-delete multiple files and remove their MinIO objects (best-effort).

    Each file is processed independently — one failure does not affect others.
    Returns ``{deleted: [...], failed: [{id, error}]}``.
    """
    records = await get_files_batch(db, file_ids, user_id, is_admin)
    record_map = {r.id: r for r in records}

    deleted: list[int] = []
    failed: list[dict] = []

    for fid in file_ids:
        rec = record_map.get(fid)
        if rec is None:
            failed.append({"id": fid, "error": "File not found or access denied"})
        else:
            rec.is_deleted = True
            deleted.append(fid)

    if deleted:
        await db.commit()

    # Delete MinIO objects (best-effort, after DB commit succeeds)
    if minio is not None:
        for fid in deleted:
            rec = record_map.get(fid)
            if rec is not None:
                try:
                    await minio.remove_object(rec.object_key)
                except Exception:
                    logger.debug(
                        "Failed to delete MinIO object %s for file id=%s",
                        rec.object_key, fid,
                    )

    return {"deleted": deleted, "failed": failed}


# ========================================================================
# FILE RESPONSE BUILDER
# ========================================================================


def _build_file_response(record: FileRecord) -> FileResponse:
    """Convert an ORM FileRecord to a Pydantic FileResponse."""
    return FileResponse(
        id=record.id,
        folder_id=record.folder_id,
        original_name=record.original_name,
        file_size=record.file_size,
        mime_type=record.mime_type,
        file_hash=record.file_hash,
        uploader_id=record.uploader_id,
        created_at=record.created_at,
        download_url=f"/api/files/{record.id}/download",
    )
