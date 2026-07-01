# -*- coding: utf-8 -*-
"""Pydantic schemas for the RAG knowledge base module."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ============================================================================
# Document schemas
# ============================================================================


class DocumentUploadResponse(BaseModel):
    """Response returned immediately after document upload (indexing is async)."""

    id: int
    original_name: str
    file_size: int
    mime_type: str
    status: str
    progress_stage: str | None = None
    content_hash: str | None = None
    duplicate: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentResponse(BaseModel):
    """Full document detail response."""

    id: int
    original_name: str
    file_size: int
    mime_type: str
    uploader_id: int
    status: str
    progress_stage: str | None = None
    original_object_key: str | None = None
    chunk_count: int = 0
    error_message: str | None = None
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime
    metadata: list["DocumentMetadataItem"] = []

    model_config = ConfigDict(from_attributes=True)


class DocumentListResponse(BaseModel):
    """Paginated document list."""

    items: list[DocumentResponse] = []
    total: int = 0
    page: int = 1
    page_size: int = 20


class DocumentStatusResponse(BaseModel):
    """Lightweight status response for polling indexing progress."""

    id: int
    status: str
    progress_stage: str | None = None
    error_message: str | None = None
    chunk_count: int = 0


# ============================================================================
# Metadata schemas
# ============================================================================


class DocumentMetadataItem(BaseModel):
    """A single key:value metadata entry."""

    id: int
    document_id: int
    meta_key: str
    meta_value: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MetadataItemListResponse(BaseModel):
    """Response for listing all metadata items."""

    items: list[DocumentMetadataItem]


class MetadataItemCreateRequest(BaseModel):
    """Request to add a single metadata key:value pair."""

    meta_key: str = Field(..., description="Metadata key", max_length=128)
    meta_value: str = Field(..., description="Metadata value")


class MetadataItemUpdateRequest(BaseModel):
    """Request to update a single metadata value."""

    meta_value: str = Field(..., description="New metadata value")


# ============================================================================
# Search / RAG Q&A schemas
# ============================================================================


class RagSearchRequest(BaseModel):
    """RAG search request (retrieval + LLM generation)."""

    query: str = Field(..., min_length=1, max_length=4096, description="Search query")
    top_k: int = Field(5, ge=1, le=50, description="Number of chunks to retrieve")
    stream: bool = Field(True, description="Whether to stream the LLM answer")
    filters: dict[str, str] | None = Field(
        None, description="Metadata filters, e.g. {'category': '技术文档'}"
    )


class RetrievedSource(BaseModel):
    """A single source chunk used to generate the answer."""

    chunk_id: int
    document_id: int
    document_name: str
    section_title: str | None = None
    heading_path: str | None = None
    content_preview: str = ""
    similarity: float = 0.0


class RagSearchResponse(BaseModel):
    """RAG search response (non-streaming)."""

    answer: str
    sources: list[RetrievedSource] = []


# ============================================================================
# Chunk schemas
# ============================================================================


class ChunkResponse(BaseModel):
    """Response for a single chunk."""

    id: int
    document_id: int
    chunk_type: str
    parent_chunk_id: int | None = None
    chunk_index: int
    content: str
    section_title: str | None = None
    heading_path: str | None = None
    token_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChunkListResponse(BaseModel):
    """Paginated chunk list for a document."""

    items: list[ChunkResponse] = []
    total: int = 0
    page: int = 1
    page_size: int = 50


# ============================================================================
# Reindex response
# ============================================================================


class ReindexResponse(BaseModel):
    """Response for reindex request."""

    document_id: int
    status: str = "pending"
    message: str = "Reindex scheduled"


# ============================================================================
# File format enumeration (single source of truth for supported formats)
# ============================================================================


class RagFileFormat(str, Enum):
    """Supported file formats for RAG document upload.

    Each member's value is the canonical file extension (without dot).
    Use :meth:`mime_type` to get the primary MIME type and
    :meth:`is_direct_text` to check whether the format can be decoded
    directly without MinerU parsing.
    """

    PDF = "pdf"
    DOCX = "docx"
    XLSX = "xlsx"
    TXT = "txt"
    MD = "md"
    MARKDOWN = "markdown"
    CSV = "csv"
    PY = "py"

    # ------------------------------------------------------------------
    # MIME type mapping
    # ------------------------------------------------------------------

    @property
    def mime_type(self) -> str:
        """Primary MIME type for this file format."""
        return _FORMAT_TO_MIME[self]

    # ------------------------------------------------------------------
    # MinerU dispatch
    # ------------------------------------------------------------------

    @property
    def is_direct_text(self) -> bool:
        """True when this format can be decoded directly, skipping MinerU."""
        return self in _DIRECT_TEXT_FORMATS

    # ------------------------------------------------------------------
    # Lookup helpers
    # ------------------------------------------------------------------

    @classmethod
    def from_extension(cls, ext: str) -> RagFileFormat | None:
        """Look up a format by file extension (case-insensitive, without dot)."""
        ext_lower = ext.lower()
        for fmt in cls:
            if fmt.value == ext_lower:
                return fmt
        return None

    @classmethod
    def from_mime_type(cls, mime: str) -> RagFileFormat | None:
        """Look up a format by MIME type string."""
        for fmt in cls:
            if fmt.mime_type == mime:
                return fmt
        return None

    @classmethod
    def detect(cls, ext: str, content_type: str) -> RagFileFormat | None:
        """Detect file format using both MIME type and extension.

        Prefers MIME type when present and specific; falls back to extension.
        Returns ``None`` when neither can identify the format.
        """
        if content_type:
            fmt = cls.from_mime_type(content_type)
            if fmt is not None:
                return fmt
        if ext:
            return cls.from_extension(ext)
        return None

    @classmethod
    def allowed_mime_types(cls) -> frozenset[str]:
        """All supported MIME types (for upload validation)."""
        return frozenset(fmt.mime_type for fmt in cls)


# ---------------------------------------------------------------------------
# Internal lookup tables (derived from the enum — no magic strings)
# ---------------------------------------------------------------------------

_FORMAT_TO_MIME: dict[RagFileFormat, str] = {
    RagFileFormat.PDF: "application/pdf",
    RagFileFormat.DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    RagFileFormat.XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    RagFileFormat.TXT: "text/plain",
    RagFileFormat.MD: "text/markdown",
    RagFileFormat.MARKDOWN: "text/markdown",
    RagFileFormat.CSV: "text/csv",
    RagFileFormat.PY: "text/x-python",
}

_DIRECT_TEXT_FORMATS: frozenset[RagFileFormat] = frozenset({
    RagFileFormat.TXT,
    RagFileFormat.MD,
    RagFileFormat.MARKDOWN,
    RagFileFormat.CSV,
    RagFileFormat.PY,
})


# ============================================================================
# Legacy alias — kept for backward compatibility
# ============================================================================

RAG_ALLOWED_MIME_TYPES: frozenset[str] = RagFileFormat.allowed_mime_types()
