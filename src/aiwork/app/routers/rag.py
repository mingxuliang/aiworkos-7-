# -*- coding: utf-8 -*-
"""FastAPI router for RAG knowledge base endpoints.

All routes are prefixed with ``/rag`` under the main ``/api`` router.

This router is conditionally registered - only when
``AIWORK_PGVECTOR_DB_URL`` is configured and the pgvector package
is importable.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi import Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...rag.database import get_pg_db
from ...rag.embedder import Embedder
from ...rag.indexer import index_document
from ...rag.schemas import (
    RAG_ALLOWED_MIME_TYPES,
    RagFileFormat,
    DocumentListResponse,
    DocumentMetadataItem,
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUploadResponse,
    MetadataItemCreateRequest,
    MetadataItemListResponse,
    MetadataItemUpdateRequest,
    RagSearchRequest,
    RagSearchResponse,
    ReindexResponse,
)
from ...rag.service import (
    add_metadata_item,
    create_document,
    delete_metadata_item,
    find_completed_by_hash,
    get_document_with_metadata,
    get_document_status,
    list_documents,
    list_metadata_items,
    set_document_pending,
    soft_delete_document,
    update_metadata_item,
)
from ...rag.rate_limit import check_rate_limit
from ...rag.search_service import search_rag, generate_answer, generate_answer_stream

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["rag-knowledge-base"])

# Maximum upload file size for RAG documents (100 MB)
_MAX_UPLOAD_SIZE = 104_857_600


# ---------------------------------------------------------------------------
# Auth helpers (following file_library.py pattern)
# ---------------------------------------------------------------------------


def _get_current_user(request: Request) -> dict:
    """Extract current user info from request state (set by middleware)."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    raw_uid = getattr(request.state, "user_id", "0")
    try:
        user_id = int(raw_uid)
    except (ValueError, TypeError):
        user_id = 0
    return {
        "username": user,
        "user_id": user_id,
        "roles": getattr(request.state, "roles", []),
    }


def _require_admin(request: Request) -> dict:
    """Require the current user to have the admin role."""
    info = _get_current_user(request)
    if "admin" not in info["roles"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return info


# ---------------------------------------------------------------------------
# Document endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/documents/upload",
    response_model=DocumentUploadResponse,
    status_code=201,
    summary="Upload a document to trigger RAG indexing",
)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_pg_db),
):
    """Upload a document for RAG indexing (admin only).

    The file is accepted immediately and indexing runs asynchronously.
    Poll ``GET /documents/{id}/status`` to track progress.

    Supported formats: PDF, DOCX, XLSX, TXT, MD, CSV
    Max file size: 100 MB
    """
    # Validate MIME type
    if file.content_type and file.content_type not in RAG_ALLOWED_MIME_TYPES:
        # Also check by extension for cases where content_type is generic
        if file.filename:
            ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
            fmt = RagFileFormat.from_extension(ext)
            if fmt is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type: {file.content_type or ext}. "
                           f"Supported: PDF, DOCX, XLSX, TXT, MD, CSV",
                )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file.content_type}",
            )

    # Read file into memory (with size check)
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > _MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {len(content)} bytes (max {_MAX_UPLOAD_SIZE})",
        )

    user_id = admin["user_id"]
    file_name = file.filename or "unnamed"
    content_type = file.content_type or "application/octet-stream"

    # Compute content hash for deduplication
    content_hash = hashlib.sha256(content).hexdigest()

    # Check for existing document with the same content hash
    existing = await find_completed_by_hash(db, content_hash, user_id)
    if existing is not None:
        logger.info(
            "Document %d: duplicate upload detected (hash=%s), returning existing doc %d",
            0, content_hash[:16], existing.id,
        )
        return DocumentUploadResponse(
            id=existing.id,
            original_name=existing.original_name,
            file_size=existing.file_size,
            mime_type=existing.mime_type,
            status=existing.status,
            progress_stage=existing.progress_stage,
            content_hash=content_hash,
            duplicate=True,
            created_at=existing.created_at,
        )

    # Create document record
    doc = await create_document(
        db=db,
        original_name=file_name,
        file_size=len(content),
        mime_type=content_type,
        uploader_id=user_id,
        content_hash=content_hash,
    )

    # Update status to processing
    doc.status = "processing"
    await db.commit()

    # Launch background indexing task (fire-and-forget)
    asyncio.create_task(
        index_document(
            document_id=doc.id,
            file_content=content,
            file_name=file_name,
            content_type=content_type,
        )
    )

    logger.info(
        "Document %d uploaded by user %d: '%s' (%d bytes, hash=%s)",
        doc.id, user_id, file_name, len(content), content_hash[:16],
    )

    return DocumentUploadResponse(
        id=doc.id,
        original_name=doc.original_name,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        status="processing",
        progress_stage=None,
        content_hash=content_hash,
        duplicate=False,
        created_at=doc.created_at,
    )


@router.get(
    "/documents",
    response_model=DocumentListResponse,
    summary="List all documents",
)
async def list_documents_endpoint(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None, description="Filter by status"),
    user: dict = Depends(_get_current_user),
    db: AsyncSession = Depends(get_pg_db),
):
    """List all knowledge base documents (paginated)."""
    return await list_documents(
        db=db,
        page=page,
        page_size=page_size,
        status=status,
    )


@router.get(
    "/documents/{document_id}",
    response_model=DocumentResponse,
    summary="Get document details",
)
async def get_document_endpoint(
    document_id: int,
    request: Request,
    user: dict = Depends(_get_current_user),
    db: AsyncSession = Depends(get_pg_db),
):
    """Get a single document with its metadata."""
    doc = await get_document_with_metadata(db, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get(
    "/documents/{document_id}/status",
    response_model=DocumentStatusResponse,
    summary="Poll document indexing status",
)
async def get_document_status_endpoint(
    document_id: int,
    request: Request,
    user: dict = Depends(_get_current_user),
    db: AsyncSession = Depends(get_pg_db),
):
    """Get lightweight document status - suitable for polling during indexing."""
    status = await get_document_status(db, document_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return status


@router.delete(
    "/documents/{document_id}",
    status_code=204,
    summary="Soft-delete a document",
)
async def delete_document_endpoint(
    document_id: int,
    request: Request,
    admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_pg_db),
):
    """Soft-delete a document and its chunks (admin only).

    The actual MinIO cleanup happens in the periodic cleanup task
    after a 7-day grace period.
    """
    deleted = await soft_delete_document(db, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return None


@router.post(
    "/documents/{document_id}/reindex",
    response_model=ReindexResponse,
    status_code=202,
    summary="Manually re-trigger document indexing",
)
async def reindex_document_endpoint(
    document_id: int,
    request: Request,
    admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_pg_db),
):
    """Reset document to 'pending' and re-trigger the indexing pipeline (admin only).

    The original file must still exist in MinIO (stored during initial upload).
    """
    from ...rag.rag_minio import get_rag_minio_client

    doc = await set_document_pending(db, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    # Update status to processing
    doc.status = "processing"
    await db.commit()

    # Fetch original file from MinIO
    rag_minio = get_rag_minio_client()
    if rag_minio is None or doc.original_object_key is None:
        raise HTTPException(
            status_code=500,
            detail="Original file not available - re-upload required",
        )

    try:
        file_content = await rag_minio.get_original(doc.original_object_key)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve original file: {exc}",
        )

    # Launch background indexing
    asyncio.create_task(
        index_document(
            document_id=doc.id,
            file_content=file_content,
            file_name=doc.original_name,
            content_type=doc.mime_type,
        )
    )

    logger.info("Document %d: reindex triggered by admin", document_id)

    return ReindexResponse(
        document_id=document_id,
        status="processing",
        message="Reindex scheduled",
    )


# ---------------------------------------------------------------------------
# Metadata endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/documents/{document_id}/metadata",
    response_model=MetadataItemListResponse,
    summary="List all metadata for a document",
)
async def list_metadata_endpoint(
    document_id: int,
    request: Request,
    user: dict = Depends(_get_current_user),
    db: AsyncSession = Depends(get_pg_db),
):
    """List all metadata key:value pairs for a document."""
    doc = await get_document_with_metadata(db, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    items = await list_metadata_items(db, document_id)
    return MetadataItemListResponse(items=items)


@router.post(
    "/documents/{document_id}/metadata",
    response_model=DocumentMetadataItem,
    status_code=201,
    summary="Add a single metadata key:value pair (admin only)",
)
async def add_metadata_endpoint(
    document_id: int,
    body: MetadataItemCreateRequest,
    request: Request,
    admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_pg_db),
):
    """Add a single metadata key:value pair to a document (admin only)."""
    doc = await get_document_with_metadata(db, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    item = await add_metadata_item(db, document_id, body.meta_key, body.meta_value)
    if item is None:
        raise HTTPException(status_code=409, detail="Metadata key already exists")

    return DocumentMetadataItem(
        id=item.id,
        document_id=item.document_id,
        meta_key=item.meta_key,
        meta_value=item.meta_value,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.put(
    "/documents/{document_id}/metadata/{meta_key:path}",
    response_model=DocumentMetadataItem,
    summary="Update a single metadata value (admin only)",
)
async def update_metadata_endpoint(
    document_id: int,
    meta_key: str,
    body: MetadataItemUpdateRequest,
    request: Request,
    admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_pg_db),
):
    """Update a single metadata value for a document (admin only)."""
    doc = await get_document_with_metadata(db, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    item = await update_metadata_item(db, document_id, meta_key, body.meta_value)
    if item is None:
        raise HTTPException(status_code=404, detail="Metadata key not found")

    return DocumentMetadataItem(
        id=item.id,
        document_id=item.document_id,
        meta_key=item.meta_key,
        meta_value=item.meta_value,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.delete(
    "/documents/{document_id}/metadata/{meta_key:path}",
    status_code=204,
    summary="Delete a single metadata key:value pair (admin only)",
)
async def delete_metadata_endpoint(
    document_id: int,
    meta_key: str,
    request: Request,
    admin: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_pg_db),
):
    """Delete a single metadata key:value pair from a document (admin only)."""
    doc = await get_document_with_metadata(db, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    deleted = await delete_metadata_item(db, document_id, meta_key)
    if not deleted:
        raise HTTPException(status_code=404, detail="Metadata key not found")

    return None


# ---------------------------------------------------------------------------
# Search / RAG Q&A endpoint
# ---------------------------------------------------------------------------


@router.post(
    "/search",
    response_model=RagSearchResponse,
    summary="RAG search (retrieve + answer generation)",
)
async def search_endpoint(
    body: RagSearchRequest,
    request: Request,
    user: dict = Depends(_get_current_user),
    db: AsyncSession = Depends(get_pg_db),
):
    """Search the knowledge base and generate an AI answer.

    - Embeds the query using BGE-M3
    - Performs HNSW vector search on document chunks
    - Retrieves parent context for each matched child chunk
    - Generates an answer using the configured LLM
    - Returns the answer with source citations
    """
    # Rate limit check (per-user sliding window)
    allowed, retry_after = await check_rate_limit(user["user_id"])
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"???????? {retry_after} ????",
            headers={"Retry-After": str(retry_after)},
        )

    t_start = time.perf_counter()
    embedder = Embedder()

    # Vector search
    context_chunks = await search_rag(
        db=db,
        embedder=embedder,
        query=body.query,
        top_k=body.top_k,
        metadata_filters=body.filters,
    )

    t_search = time.perf_counter() - t_start

    if body.stream:
        logger.info(
            "RAG /search (stream): query=%r, search=%.0fms",
            body.query[:80], t_search * 1000,
        )
        return StreamingResponse(
            generate_answer_stream(body.query, context_chunks),
            media_type="text/event-stream",
        )

    # Non-streaming
    t0 = time.perf_counter()
    result = await generate_answer(body.query, context_chunks)
    t_generate = time.perf_counter() - t0
    t_total = time.perf_counter() - t_start

    logger.info(
        "RAG /search: query=%r, total=%.0fms, search=%.0fms, generate=%.0fms",
        body.query[:80], t_total * 1000, t_search * 1000, t_generate * 1000,
    )

    return RagSearchResponse(
        answer=result["answer"],
        sources=result["sources"],
    )


# ---------------------------------------------------------------------------
# Image proxy - serves RAG-extracted images through the backend HTTPS endpoint
# so that HTTPS frontends are not blocked by Mixed Content restrictions when
# MinIO is on an internal HTTP endpoint.
#
# Usage: Set AIWORK_RAG_IMAGE_PUBLIC_BASE=https://<your-domain>/api/rag/image-proxy
# Then all image URLs generated by rag_minio.public_image_url() will go through
# this backend proxy instead of directly to MinIO's HTTP URL.
# ---------------------------------------------------------------------------

@router.get(
    "/image-proxy/{bucket}/{object_key:path}",
    summary="Proxy RAG image from MinIO (HTTPS-safe)",
    tags=["rag-knowledge-base"],
    include_in_schema=False,
)
async def rag_image_proxy(bucket: str, object_key: str) -> Response:
    """Stream a RAG-extracted image from MinIO through the backend."""
    import httpx

    from ...rag.rag_minio import RagMinioClient

    try:
        rag_minio = RagMinioClient()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="MinIO not configured") from exc

    # Build the direct (internal) MinIO URL - always HTTP on internal network
    raw_endpoint = rag_minio.minio_public_base
    # Strip any custom proxy prefix the user may have set; use the raw endpoint
    from ...constant import EnvVarLoader as _EV
    real_base = _EV.get_str("AIWORK_MINIO_ENDPOINT", "").strip()
    if not real_base:
        raise HTTPException(status_code=503, detail="MinIO endpoint not configured")
    if not real_base.startswith(("http://", "https://")):
        real_base = f"http://{real_base}"
    internal_url = f"{real_base.rstrip('/')}/{bucket}/{object_key}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(internal_url)
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Image not found")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="MinIO returned error")
        content_type = resp.headers.get("content-type", "image/jpeg")
        return Response(
            content=resp.content,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch image: {exc}") from exc
