# -*- coding: utf-8 -*-
"""RAG indexing orchestrator.

The full indexing pipeline for a single document upload:

  storing_original → parsing → uploading_images → chunking → embedding → storing

Runs as a fire-and-forget background task.  Any exception sets
``document.status='failed'`` with an error message — no exception
escapes to the caller.
"""
from __future__ import annotations

import asyncio
import io
import logging
import re
import uuid
import zipfile
from typing import cast

from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from ..constant import EnvVarLoader

from .chunker import DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE, chunk_markdown
from .database import get_pg_session_factory
from .embedder import Embedder
from .mineru_client import MinerUClient
from .models import RagDocument, RagChunk
from .rag_minio import RagMinioClient, get_rag_minio_client
from .schemas import RagFileFormat

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MinerU concurrency control
# ---------------------------------------------------------------------------

_mineru_semaphore = asyncio.Semaphore(
    EnvVarLoader.get_int("AIWORK_MINERU_MAX_CONCURRENT", 2, min_value=1)
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Image reference pattern in Markdown: ![alt](images/xxx.png)
_IMAGE_REF_RE = re.compile(r'!\[([^\]]*)\]\(images/([^)]+)\)')


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def index_document(
    document_id: int,
    file_content: bytes,
    file_name: str,
    content_type: str,
) -> None:
    """Full indexing pipeline for a single document.

    This is the entry point for fire-and-forget background tasks.
    Creates its own PG session — does NOT use request-scoped sessions.

    On failure: sets ``document.status='failed'`` with error message.
    Does NOT raise exceptions to the caller.
    """
    rag_minio = get_rag_minio_client()
    if rag_minio is None:
        await _fail_document(document_id, "RAG MinIO client not available")
        return

    mineru = MinerUClient()
    embedder = Embedder()

    session_factory = get_pg_session_factory()

    async with session_factory() as db:
        try:
            # --- Stage 1: Store original in MinIO ---
            await _update_stage(db, document_id, "storing_original")
            object_key = f"{document_id}/{file_name}"
            await rag_minio.put_original(object_key, file_content, content_type)

            # Update document with object_key
            await db.execute(
                sa_update(RagDocument)
                .where(RagDocument.id == document_id)
                .values(original_object_key=object_key)
            )
            await db.commit()
            logger.info(
                "Document %d: original stored at %s/%s",
                document_id, rag_minio.originals_bucket, object_key,
            )

            # --- Stage 2-3: Parse content (MinerU or direct decode) ---
            ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""

            if _is_direct_text_file(ext, content_type):
                # Plain text / Markdown: decode directly without MinerU
                await _update_stage(db, document_id, "parsing")
                try:
                    markdown_content = file_content.decode("utf-8")
                except UnicodeDecodeError:
                    # Fallback: try common encodings
                    for enc in ("gbk", "gb2312", "latin-1"):
                        try:
                            markdown_content = file_content.decode(enc)
                            break
                        except UnicodeDecodeError:
                            continue
                    else:
                        raise ValueError(f"Unable to decode text file: {file_name}")
                markdown_content = _sanitize_text(markdown_content)
                logger.info(
                    "Document %d: direct text decode (%s), length=%d",
                    document_id, ext, len(markdown_content),
                )
            else:
                # PDF / DOCX / XLSX: use MinerU for parsing
                await _update_stage(db, document_id, "parsing")
                async with _mineru_semaphore:
                    zip_bytes = await mineru.parse(file_content, file_name, content_type)
                logger.info("Document %d: MinerU parse complete (%d bytes)", document_id, len(zip_bytes))

                await _update_stage(db, document_id, "uploading_images")
                markdown_content = await _process_zip_and_images(
                    rag_minio, zip_bytes, document_id,
                )
                logger.info("Document %d: images processed, markdown length=%d", document_id, len(markdown_content))

            # --- Stage 4: Chunking ---
            await _update_stage(db, document_id, "chunking")
            chunks = chunk_markdown(
                markdown_content,
                chunk_size=DEFAULT_CHUNK_SIZE,
                chunk_overlap=DEFAULT_CHUNK_OVERLAP,
            )
            logger.info("Document %d: chunked into %d chunks", document_id, len(chunks))

            if not chunks:
                raise IndexError("No chunks generated — document may be empty")

            # --- Stage 5: Embedding ---
            await _update_stage(db, document_id, "embedding")
            child_chunks = [c for c in chunks if c.chunk_type == "child"]
            child_texts = [c.content for c in child_chunks]

            if child_texts:
                embeddings = await embedder.embed_texts(child_texts)
                for chunk, vec in zip(child_chunks, embeddings):
                    chunk._embedding = vec  # temporary attr for storage
            logger.info("Document %d: %d child chunks embedded", document_id, len(child_texts))

            # --- Stage 6: Store in PG ---
            await _update_stage(db, document_id, "storing")
            await _store_chunks(db, document_id, chunks)
            await db.execute(
                sa_update(RagDocument)
                .where(RagDocument.id == document_id)
                .values(
                    status="completed",
                    progress_stage=None,
                    chunk_count=len(chunks),
                    error_message=None,
                )
            )
            await db.commit()
            logger.info("Document %d: indexing complete (%d chunks)", document_id, len(chunks))

        except Exception as exc:
            await db.rollback()
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.error(
                "Document %d: indexing failed at stage — %s",
                document_id, error_msg, exc_info=True,
            )
            await _fail_document(document_id, error_msg[:1024])


# ---------------------------------------------------------------------------
# Direct-text detection (skip MinerU for plain-text / markdown files)
# ---------------------------------------------------------------------------

# Formats that can be decoded directly — no MinerU parsing needed.
_DIRECT_TEXT_FORMATS: frozenset[RagFileFormat] = frozenset({
    RagFileFormat.TXT,
    RagFileFormat.MD,
    RagFileFormat.MARKDOWN,
    RagFileFormat.CSV,
    RagFileFormat.PY,
})


def _is_direct_text_file(ext: str, content_type: str) -> bool:
    """Determine whether a file can be decoded directly, skipping MinerU.

    Checks MIME type first (``text/*``), then falls back to extension
    lookup via :class:`RagFileFormat`.
    """
    if content_type.startswith("text/"):
        return True

    fmt = RagFileFormat.detect(ext, content_type)
    return fmt is not None and fmt in _DIRECT_TEXT_FORMATS


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _update_stage(db: AsyncSession, doc_id: int, stage: str) -> None:
    """Update the document's progress_stage and commit."""
    await db.execute(
        sa_update(RagDocument)
        .where(RagDocument.id == doc_id)
        .values(progress_stage=stage)
    )
    await db.commit()


async def _fail_document(doc_id: int, error_message: str) -> None:
    """Set a document's status to 'failed' with an error message."""
    session_factory = get_pg_session_factory()
    async with session_factory() as db:
        try:
            await db.execute(
                sa_update(RagDocument)
                .where(RagDocument.id == doc_id)
                .values(
                    status="failed",
                    error_message=error_message[:1024],
                    progress_stage=None,
                )
            )
            await db.commit()
        except Exception as exc:
            logger.error(
                "Failed to update document %d status to 'failed': %s",
                doc_id, exc,
            )


async def _process_zip_and_images(
    rag_minio: RagMinioClient,
    zip_bytes: bytes,
    document_id: int,
) -> str:
    """Extract MinerU zip, upload images to MinIO, replace image references.

    Images are uploaded concurrently (semaphore-limited) to reduce total
    processing time for image-heavy documents.

    Returns the full markdown content with image URLs replaced.
    """
    markdown_content = ""
    image_mapping: dict[str, str] = {}  # original_name → public_url

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        all_entries = zf.namelist()
        logger.debug("Document %d: MinerU zip contains %d entries: %s", document_id, len(all_entries), all_entries[:20])

        # First pass: read markdown + collect image data (zip must be read
        # synchronously — ZipFile is not thread-safe)
        image_tasks: list[dict] = []  # Each: {original_name, image_data, ext, object_key}

        for entry in all_entries:
            if entry.endswith("/"):
                continue  # skip directory entries

            basename = entry.rsplit("/", 1)[-1] if "/" in entry else entry

            # MinerU 3.2.3 may output:
            #   - full.md (older versions)
            #   - {filename}/auto/{filename}.md (auto-engine mode)
            #   - {filename}/{filename}.md (pipeline mode)
            if basename.endswith(".md") or basename == "full.md":
                if not markdown_content:  # Take the first .md file (usually the main one)
                    markdown_content = zf.read(entry).decode("utf-8")
                    logger.debug("Document %d: found markdown file: %s", document_id, entry)

            elif "images/" in entry and not entry.endswith("/"):
                image_data = zf.read(entry)
                if not image_data:
                    continue
                # Extract filename from path (handle both "images/x.png" and "dir/images/x.png")
                original_name = entry.rsplit("/", 1)[-1] if "/" in entry else entry
                # Strip any "images/" prefix segment
                if "/images/" in entry:
                    original_name = entry.rsplit("/images/", 1)[-1]
                ext = original_name.rsplit(".", 1)[-1] if "." in original_name else "png"
                unique_name = f"{uuid.uuid4().hex}.{ext}"
                object_key = f"{document_id}/{unique_name}"

                image_tasks.append({
                    "original_name": original_name,
                    "image_data": image_data,
                    "ext": ext,
                    "object_key": object_key,
                })

    # Second pass: upload images concurrently (semaphore-limited to avoid
    # overwhelming MinIO connections)
    if image_tasks:
        _upload_semaphore = asyncio.Semaphore(5)

        async def _upload_one(task: dict) -> tuple[str, str]:
            async with _upload_semaphore:
                content_type = _guess_image_content_type(task["ext"])
                public_url = await rag_minio.put_image(
                    task["object_key"], task["image_data"], content_type,
                )
                logger.debug(
                    "Document %d: uploaded image %s → %s",
                    document_id, task["original_name"], public_url,
                )
                return task["original_name"], public_url

        results = await asyncio.gather(*[_upload_one(t) for t in image_tasks])
        for original_name, public_url in results:
            image_mapping[original_name] = public_url

    # Replace image references in markdown
    for original_name, public_url in image_mapping.items():
        # Replace ![alt](images/xxx.png) with ![alt](https://public-url/...)
        markdown_content = re.sub(
            r'!\[([^\]]*)\]\(' + re.escape(f"images/{original_name}") + r'\)',
            f'![\\1]({public_url})',
            markdown_content,
        )

    # Sanitize: remove null bytes and other characters invalid for UTF-8
    markdown_content = _sanitize_text(markdown_content)

    return markdown_content


def _sanitize_text(text: str) -> str:
    """Remove null bytes and other characters invalid for PostgreSQL UTF-8."""
    if not text:
        return text
    # Remove null bytes (\x00)
    text = text.replace("\x00", "")
    # Remove other control characters except common ones (\n, \r, \t)
    text = re.sub(r"[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", text)
    return text


def _guess_image_content_type(ext: str) -> str:
    """Map file extension to MIME type."""
    mapping = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
        "bmp": "image/bmp",
        "svg": "image/svg+xml",
        "tiff": "image/tiff",
        "tif": "image/tiff",
    }
    return mapping.get(ext.lower(), "application/octet-stream")


async def _store_chunks(
    db: AsyncSession,
    document_id: int,
    chunks,  # list[Chunk] from chunker
) -> None:
    """Insert all chunks (parents + children) with embeddings.

    Strategy:
    1. Batch-INSERT all parent chunks (without embeddings) in a single flush.
    2. Batch-INSERT all child chunks (with embeddings), linking to parents via
       the temporary ``parent_chunk_idx`` index → actual DB id.
    """
    # Map chunk index → DB id for parent → child linking
    idx_to_db_id: dict[int, int] = {}

    # --- Batch-insert all parent chunks in a single flush ---
    parent_refs: list[tuple[int, RagChunk]] = []  # (chunk_index, orm_obj)
    for chunk in chunks:
        if chunk.chunk_type == "parent":
            db_chunk = RagChunk(
                document_id=document_id,
                chunk_type="parent",
                parent_chunk_id=None,
                chunk_index=chunk.chunk_index,
                content=_sanitize_text(chunk.content),
                content_hash=chunk.content_hash,
                section_title=chunk.section_title,
                heading_path=chunk.heading_path,
                token_count=chunk.token_count,
                embedding=None,  # Parent has no embedding
                is_deleted=False,
            )
            db.add(db_chunk)
            parent_refs.append((chunk.chunk_index, db_chunk))

    if parent_refs:
        await db.flush()  # Single flush for all parents
        for chunk_index, db_chunk in parent_refs:
            idx_to_db_id[chunk_index] = db_chunk.id

    # --- Batch-insert all child chunks ---
    for chunk in chunks:
        if chunk.chunk_type == "child":
            parent_db_id = None
            if chunk.parent_chunk_idx is not None:
                parent_db_id = idx_to_db_id.get(chunk.parent_chunk_idx)

            # Get embedding from temporary attribute
            embedding = getattr(chunk, "_embedding", None)

            db_chunk = RagChunk(
                document_id=document_id,
                chunk_type="child",
                parent_chunk_id=parent_db_id,
                chunk_index=chunk.chunk_index,
                content=_sanitize_text(chunk.content),
                content_hash=chunk.content_hash,
                section_title=chunk.section_title,
                heading_path=chunk.heading_path,
                token_count=chunk.token_count,
                embedding=embedding,
                is_deleted=False,
            )
            db.add(db_chunk)

    await db.flush()


# ---------------------------------------------------------------------------
# Startup recovery
# ---------------------------------------------------------------------------


async def recover_stale_documents(db: AsyncSession) -> int:
    """Mark documents stuck in 'pending'/'processing' as 'failed'.

    Called on startup.  If the service crashed mid-index, these documents
    would remain stuck forever.  This marks them as failed so users can
    manually trigger a reindex.
    """
    result = await db.execute(
        sa_update(RagDocument)
        .where(RagDocument.status.in_(["pending", "processing"]))
        .values(
            status="failed",
            error_message="服务重启导致索引中断，请手动重新触发索引",
            progress_stage=None,
        )
    )
    await db.commit()
    count = result.rowcount
    if count:
        logger.info("Recovered %d stale document(s) marked as 'failed'", count)
    return cast(int, count or 0)
