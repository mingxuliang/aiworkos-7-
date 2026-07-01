# -*- coding: utf-8 -*-
"""Periodic cleanup tasks for the RAG knowledge base module.

Two cleanup routines:
1. Soft-deleted document cleanup (every 1 hour):
   - Scan documents where is_deleted=true AND updated_at > 7 days ago
   - Physically delete RagDocument + RagChunk + DocumentMetadata
   - Clean up MinIO objects (originals + images)

2. Orphan file cleanup (every 6 hours):
   - List MinIO objects under each doc_id prefix
   - Check if RagDocument exists
   - Delete orphan files (no DB record, or failed + > 24h old)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.timezone import get_user_now_naive

from .models import RagDocument, RagChunk, DocumentMetadata
from .rag_minio import RagMinioClient, get_rag_minio_client

logger = logging.getLogger(__name__)

# Default cleanup intervals (seconds)
DEFAULT_SOFT_DELETE_INTERVAL = 3600   # 1 hour
DEFAULT_ORPHAN_INTERVAL = 21_600       # 6 hours

# Grace periods
SOFT_DELETE_GRACE_DAYS = 7
ORPHAN_GRACE_HOURS = 24


# ---------------------------------------------------------------------------
# Soft-deleted document cleanup
# ---------------------------------------------------------------------------


async def _cleanup_soft_deleted_documents(
    db: AsyncSession,
    rag_minio: RagMinioClient,
) -> int:
    """Physically delete soft-deleted documents past the grace period.

    Returns the count of documents cleaned.
    """
    cutoff = get_user_now_naive() - timedelta(days=SOFT_DELETE_GRACE_DAYS)

    stmt = select(RagDocument).where(
        RagDocument.is_deleted == True,  # noqa: E712
        RagDocument.updated_at < cutoff,
    ).limit(50)

    result = await db.execute(stmt)
    docs = list(result.scalars().all())

    if not docs:
        return 0

    cleaned = 0
    for doc in docs:
        doc_id = doc.id

        # Delete chunks
        await db.execute(
            sa_delete(RagChunk).where(RagChunk.document_id == doc_id)
        )

        # Delete metadata
        await db.execute(
            sa_delete(DocumentMetadata).where(DocumentMetadata.document_id == doc_id)
        )

        # Delete MinIO objects (originals + images)
        # Originals: {doc_id}/{original_name}
        if doc.original_object_key:
            await rag_minio.remove_object(
                rag_minio.originals_bucket, doc.original_object_key,
            )

        # Images: {doc_id}/*
        try:
            image_keys = await rag_minio.list_objects(
                rag_minio.image_bucket, f"{doc_id}/",
            )
            for key in image_keys:
                await rag_minio.remove_object(rag_minio.image_bucket, key)
        except Exception as exc:
            logger.warning(
                "Failed to clean up images for document %d: %s", doc_id, exc,
            )

        # Delete document
        await db.execute(
            sa_delete(RagDocument).where(RagDocument.id == doc_id)
        )
        cleaned += 1

    if cleaned:
        await db.commit()
        logger.info("Cleaned up %d soft-deleted document(s)", cleaned)

    return cleaned


# ---------------------------------------------------------------------------
# Orphan file cleanup
# ---------------------------------------------------------------------------


async def _cleanup_orphan_files(
    db: AsyncSession,
    rag_minio: RagMinioClient,
) -> int:
    """Clean up MinIO files with no corresponding DB document.

    Scenarios:
    - Indexing failed mid-way; files uploaded but chunks not committed.
    - Document hard-deleted but MinIO cleanup failed.

    Returns the count of orphan prefixes cleaned.
    """
    cutoff = get_user_now_naive() - timedelta(hours=ORPHAN_GRACE_HOURS)

    cleaned = 0

    # Check originals bucket
    for bucket in (rag_minio.originals_bucket, rag_minio.image_bucket):
        try:
            # List top-level "directories" (doc_id prefixes)
            objects = await rag_minio.list_objects(bucket, "")
        except Exception as exc:
            logger.warning("Failed to list objects in bucket '%s': %s", bucket, exc)
            continue

        # Extract unique doc_id prefixes
        doc_id_strs: set[str] = set()
        for obj_key in objects:
            parts = obj_key.split("/", 1)
            if parts[0].isdigit():
                doc_id_strs.add(parts[0])

        for doc_id_str in doc_id_strs:
            doc_id = int(doc_id_str)

            # Check if document exists in DB
            stmt = select(RagDocument).where(RagDocument.id == doc_id)
            result = await db.execute(stmt)
            doc = result.scalar_one_or_none()

            should_delete = False
            if doc is None:
                # No DB record at all → orphan
                should_delete = True
            elif doc.status == "failed" and doc.created_at < cutoff:
                # Failed indexing > 24h ago → clean up
                should_delete = True

            if should_delete:
                # Delete all objects under this doc_id prefix
                try:
                    prefix_objects = await rag_minio.list_objects(
                        bucket, f"{doc_id_str}/",
                    )
                    for key in prefix_objects:
                        await rag_minio.remove_object(bucket, key)
                    cleaned += 1
                    logger.info(
                        "Cleaned orphan files: bucket=%s doc_id=%s (%d files)",
                        bucket, doc_id_str, len(prefix_objects),
                    )
                except Exception as exc:
                    logger.warning(
                        "Failed to clean orphan files bucket=%s doc_id=%s: %s",
                        bucket, doc_id_str, exc,
                    )

    return cleaned


# ---------------------------------------------------------------------------
# Cleanup loop
# ---------------------------------------------------------------------------


async def run_rag_cleanup_loop(
    pg_session_factory,
    soft_delete_interval: int = DEFAULT_SOFT_DELETE_INTERVAL,
    orphan_interval: int = DEFAULT_ORPHAN_INTERVAL,
) -> None:
    """Long-running background task for RAG cleanup.

    Launched via ``asyncio.create_task()`` during startup.

    Two independent timers:
    - Soft-delete cleanup: every ``soft_delete_interval`` seconds (default 1h).
    - Orphan file cleanup: every ``orphan_interval`` seconds (default 6h).
    """
    logger.info(
        "RAG cleanup task started (soft_delete=%ds, orphan=%ds)",
        soft_delete_interval, orphan_interval,
    )

    last_soft_delete = 0.0
    last_orphan = 0.0

    # Check every 60 seconds
    while True:
        await asyncio.sleep(60)
        try:
            rag_minio = get_rag_minio_client()
            if rag_minio is None:
                continue

            now = asyncio.get_event_loop().time()

            # Soft-delete cleanup
            if now - last_soft_delete >= soft_delete_interval:
                last_soft_delete = now
                async with pg_session_factory() as db:
                    await _cleanup_soft_deleted_documents(db, rag_minio)

            # Orphan file cleanup
            if now - last_orphan >= orphan_interval:
                last_orphan = now
                async with pg_session_factory() as db:
                    await _cleanup_orphan_files(db, rag_minio)

        except Exception:
            logger.error("RAG cleanup tick failed", exc_info=True)
