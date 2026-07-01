# -*- coding: utf-8 -*-
"""Periodic cleanup tasks for the file library module.

Two cleanup routines (both run every 30 minutes):
1. Expired UploadSession → abort MinIO multipart + mark aborted.
2. Soft-deleted FileRecord → delete orphan MinIO objects, then hard-delete
   the DB row after a grace period (7 days).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select, delete as sa_delete, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.timezone import get_user_now

from .minio_client import MinioClient, get_minio_client
from .models import FileRecord, UploadSession

logger = logging.getLogger(__name__)

# Default cleanup interval in seconds
DEFAULT_CLEANUP_INTERVAL = 1800  # 30 minutes

# Soft-deleted files: MinIO object is removed after this grace period.
# Within the grace period, an admin could manually restore the file
# by flipping is_deleted back to False (the MinIO object still exists).
ORPHAN_OBJECT_GRACE_SECONDS = 7 * 86_400  # 7 days


async def _cleanup_expired_sessions(
    db: AsyncSession, minio: MinioClient,
) -> int:
    """Find and clean up expired upload sessions.  Returns the count."""
    now = get_user_now()

    stmt = select(UploadSession).where(
        UploadSession.status == "uploading",
        UploadSession.expires_at < now,
    )
    result = await db.execute(stmt)
    expired_sessions = list(result.scalars().all())

    if not expired_sessions:
        return 0

    cleaned = 0
    for session in expired_sessions:
        try:
            await minio.abort_multipart_upload(
                session.object_key, session.upload_id,
            )
        except Exception:
            logger.debug(
                "Failed to abort MinIO multipart upload %s (object=%s) — "
                "may already be cleaned on MinIO side",
                session.upload_id, session.object_key,
                exc_info=True,
            )

        session.status = "aborted"
        cleaned += 1

    if cleaned:
        await db.commit()
        logger.info("Cleaned up %d expired upload session(s)", cleaned)

    return cleaned


async def _cleanup_orphan_objects(
    db: AsyncSession, minio: MinioClient,
) -> int:
    """Delete MinIO objects for soft-deleted FileRecords past the grace
    period, then hard-delete the DB rows.  Returns the count cleaned."""
    cutoff = get_user_now() - timedelta(
        seconds=ORPHAN_OBJECT_GRACE_SECONDS,
    )

    stmt = select(FileRecord).where(
        FileRecord.is_deleted == True,  # noqa: E712
        FileRecord.created_at < cutoff,
    ).limit(200)  # batch size to avoid long-running transactions
    result = await db.execute(stmt)
    orphan_records = list(result.scalars().all())

    if not orphan_records:
        return 0

    cleaned = 0
    for record in orphan_records:
        try:
            await minio.remove_object(record.object_key)
        except Exception:
            logger.debug(
                "Failed to delete orphan MinIO object %s (file id=%s)",
                record.object_key, record.id,
                exc_info=True,
            )
        cleaned += 1

    if cleaned:
        # Hard-delete the DB rows whose MinIO objects we attempted to clean
        ids_to_delete = [r.id for r in orphan_records]
        await db.execute(
            sa_delete(FileRecord).where(FileRecord.id.in_(ids_to_delete))
        )
        await db.commit()
        logger.info(
            "Cleaned up %d orphan MinIO object(s) + hard-deleted DB rows",
            cleaned,
        )

    return cleaned


async def run_cleanup_loop(
    db_session_factory,
    interval: int = DEFAULT_CLEANUP_INTERVAL,
) -> None:
    """Long-running background task that periodically:

    1. Cleans up expired upload sessions (abort multipart + mark aborted).
    2. Cleans up orphan MinIO objects for soft-deleted files past the
       grace period (7 days).

    Intended to be launched via ``asyncio.create_task()`` during startup.
    """
    logger.info(
        "File library cleanup task started (interval=%ds)", interval,
    )
    while True:
        await asyncio.sleep(interval)
        try:
            minio = get_minio_client()
            if minio is None:
                continue
            async with db_session_factory() as db:
                await _cleanup_expired_sessions(db, minio)
                await _cleanup_orphan_objects(db, minio)
        except Exception:
            logger.error(
                "File library cleanup tick failed", exc_info=True,
            )
