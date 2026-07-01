# -*- coding: utf-8 -*-
"""RAG document CRUD + metadata management business logic.

All functions take an ``AsyncSession`` (PG) and return Pydantic models.
No HTTP concerns here — that's the router's job.
"""
from __future__ import annotations

import logging
from typing import cast

from sqlalchemy import func, select, update as sa_update, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.timezone import get_user_now_naive

from .models import RagDocument, RagChunk, DocumentMetadata
from .schemas import (
    DocumentResponse,
    DocumentListResponse,
    DocumentStatusResponse,
    DocumentMetadataItem as MetadataItemSchema,
)

logger = logging.getLogger(__name__)


# ============================================================================
# Document CRUD
# ============================================================================


async def create_document(
    db: AsyncSession,
    original_name: str,
    file_size: int,
    mime_type: str,
    uploader_id: int,
    content_hash: str | None = None,
) -> RagDocument:
    """Create a new document record (status='pending')."""
    doc = RagDocument(
        original_name=original_name,
        file_size=file_size,
        mime_type=mime_type,
        uploader_id=uploader_id,
        status="pending",
        progress_stage=None,
        content_hash=content_hash,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def find_completed_by_hash(
    db: AsyncSession,
    content_hash: str,
    uploader_id: int,
) -> RagDocument | None:
    """Find a non-deleted, successfully indexed document by content hash.

    Used for upload deduplication ("秒传"): if the same user has already
    uploaded and indexed the same file content, return the existing
    document instead of re-indexing.

    Scoped to the same uploader to avoid cross-user information disclosure.
    """
    if not content_hash:
        return None
    stmt = select(RagDocument).where(
        RagDocument.content_hash == content_hash,
        RagDocument.uploader_id == uploader_id,
        RagDocument.is_deleted == False,  # noqa: E712
        RagDocument.status == "completed",
    ).order_by(RagDocument.created_at.desc()).limit(1)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_document(
    db: AsyncSession,
    document_id: int,
) -> RagDocument | None:
    """Get a non-deleted document by ID."""
    stmt = select(RagDocument).where(
        RagDocument.id == document_id,
        RagDocument.is_deleted == False,  # noqa: E712
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_document_with_metadata(
    db: AsyncSession,
    document_id: int,
) -> DocumentResponse | None:
    """Get a document with its metadata as a Pydantic response."""
    doc = await get_document(db, document_id)
    if doc is None:
        return None

    metadata_items = await _get_metadata_items(db, document_id)

    return DocumentResponse(
        id=doc.id,
        original_name=doc.original_name,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        uploader_id=doc.uploader_id,
        status=doc.status,
        progress_stage=doc.progress_stage,
        original_object_key=doc.original_object_key,
        chunk_count=doc.chunk_count,
        error_message=doc.error_message,
        is_deleted=doc.is_deleted,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        metadata=metadata_items,
    )


async def list_documents(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
) -> DocumentListResponse:
    """Paginated document list.

    Args:
        db: PG session.
        page: Page number (1-indexed).
        page_size: Items per page (max 100).
        status: Optional filter by status.
    """
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    where_clauses = [RagDocument.is_deleted == False]  # noqa: E712
    if status:
        where_clauses.append(RagDocument.status == status)

    # Count
    count_stmt = select(func.count()).select_from(RagDocument).where(*where_clauses)
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    # Query
    stmt = (
        select(RagDocument)
        .where(*where_clauses)
        .order_by(RagDocument.created_at.desc())
        .limit(page_size)
        .offset(offset)
    )
    result = await db.execute(stmt)
    docs = list(result.scalars().all())

    # Batch load metadata for all documents in one query (fix N+1)
    doc_ids = [doc.id for doc in docs]
    metadata_by_doc: dict[int, list[MetadataItemSchema]] = {}
    if doc_ids:
        meta_stmt = (
            select(DocumentMetadata)
            .where(DocumentMetadata.document_id.in_(doc_ids))
            .order_by(DocumentMetadata.document_id, DocumentMetadata.meta_key)
        )
        meta_result = await db.execute(meta_stmt)
        for item in meta_result.scalars().all():
            metadata_by_doc.setdefault(item.document_id, []).append(
                MetadataItemSchema(
                    id=item.id,
                    document_id=item.document_id,
                    meta_key=item.meta_key,
                    meta_value=item.meta_value,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                )
            )

    items: list[DocumentResponse] = []
    for doc in docs:
        items.append(DocumentResponse(
            id=doc.id,
            original_name=doc.original_name,
            file_size=doc.file_size,
            mime_type=doc.mime_type,
            uploader_id=doc.uploader_id,
            status=doc.status,
            progress_stage=doc.progress_stage,
            original_object_key=doc.original_object_key,
            chunk_count=doc.chunk_count,
            error_message=doc.error_message,
            is_deleted=doc.is_deleted,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            metadata=metadata_by_doc.get(doc.id, []),
        ))

    return DocumentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


async def get_document_status(
    db: AsyncSession,
    document_id: int,
) -> DocumentStatusResponse | None:
    """Get lightweight document status for polling."""
    doc = await get_document(db, document_id)
    if doc is None:
        return None
    return DocumentStatusResponse(
        id=doc.id,
        status=doc.status,
        progress_stage=doc.progress_stage,
        error_message=doc.error_message,
        chunk_count=doc.chunk_count,
    )


async def soft_delete_document(
    db: AsyncSession,
    document_id: int,
) -> bool:
    """Soft-delete a document and its chunks.

    Returns False if document not found.
    """
    doc = await get_document(db, document_id)
    if doc is None:
        return False

    # Soft-delete document
    doc.is_deleted = True
    doc.updated_at = get_user_now_naive()

    # Soft-delete all chunks for this document
    await db.execute(
        sa_update(RagChunk)
        .where(RagChunk.document_id == document_id)
        .values(is_deleted=True)
    )

    await db.commit()
    return True


async def set_document_pending(
    db: AsyncSession,
    document_id: int,
) -> RagDocument | None:
    """Reset document status to 'pending' for reindex.

    Returns None if document not found.
    """
    doc = await get_document(db, document_id)
    if doc is None:
        return None

    doc.status = "pending"
    doc.progress_stage = None
    doc.error_message = None
    doc.chunk_count = 0
    doc.updated_at = get_user_now_naive()

    # Delete existing chunks for this document
    await db.execute(
        sa_delete(RagChunk).where(RagChunk.document_id == document_id)
    )

    await db.commit()
    await db.refresh(doc)
    return doc


# ============================================================================
# Metadata management
# ============================================================================


async def _get_metadata_items(
    db: AsyncSession, document_id: int,
) -> list[MetadataItemSchema]:
    """Get all metadata items for a document."""
    stmt = (
        select(DocumentMetadata)
        .where(DocumentMetadata.document_id == document_id)
        .order_by(DocumentMetadata.meta_key)
    )
    result = await db.execute(stmt)
    items = result.scalars().all()
    return [
        MetadataItemSchema(
            id=item.id,
            document_id=item.document_id,
            meta_key=item.meta_key,
            meta_value=item.meta_value,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]


async def get_metadata(
    db: AsyncSession, document_id: int,
) -> dict[str, str]:
    """Get all metadata for a document as a dict."""
    items = await _get_metadata_items(db, document_id)
    return {item.meta_key: item.meta_value for item in items}


# ============================================================================
# New metadata management methods (single KV operations)
# ============================================================================


async def add_metadata_item(
    db: AsyncSession,
    document_id: int,
    meta_key: str,
    meta_value: str,
) -> DocumentMetadata | None:
    """Add a single metadata key:value pair to a document.

    Returns None if key already exists or document not found.
    """
    # Check if document exists
    doc = await get_document(db, document_id)
    if doc is None:
        return None

    # Check if key already exists
    stmt = select(DocumentMetadata).where(
        DocumentMetadata.document_id == document_id,
        DocumentMetadata.meta_key == meta_key,
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none() is not None:
        return None

    # Create new metadata item
    item = DocumentMetadata(
        document_id=document_id,
        meta_key=meta_key,
        meta_value=meta_value,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def get_metadata_item(
    db: AsyncSession,
    document_id: int,
    meta_key: str,
) -> DocumentMetadata | None:
    """Get a single metadata item by key."""
    stmt = select(DocumentMetadata).where(
        DocumentMetadata.document_id == document_id,
        DocumentMetadata.meta_key == meta_key,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_metadata_item(
    db: AsyncSession,
    document_id: int,
    meta_key: str,
    meta_value: str,
) -> DocumentMetadata | None:
    """Update a single metadata value.

    Returns None if not found.
    """
    item = await get_metadata_item(db, document_id, meta_key)
    if item is None:
        return None

    item.meta_value = meta_value
    item.updated_at = get_user_now_naive()
    await db.commit()
    await db.refresh(item)
    return item


async def delete_metadata_item(
    db: AsyncSession,
    document_id: int,
    meta_key: str,
) -> bool:
    """Delete a single metadata item.

    Returns True if deleted, False if not found.
    """
    stmt = sa_delete(DocumentMetadata).where(
        DocumentMetadata.document_id == document_id,
        DocumentMetadata.meta_key == meta_key,
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0


async def list_metadata_items(
    db: AsyncSession,
    document_id: int,
) -> list[MetadataItemSchema]:
    """List all metadata items for a document."""
    return await _get_metadata_items(db, document_id)
