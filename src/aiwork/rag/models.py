# -*- coding: utf-8 -*-
"""SQLAlchemy ORM models for the RAG knowledge base module.

Three tables (all in PostgreSQL + pgvector):
- ``rag_documents``: knowledge base documents
- ``rag_chunks``: document chunks with vector embeddings (HNSW index)
- ``rag_document_metadata``: admin-managed document metadata (key:value)

Uses an **independent** DeclarativeBase ``RagBase`` — not the MySQL Base.
"""
from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector  # type: ignore[import-untyped]
from sqlalchemy import (
    Boolean,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from ..config.timezone import get_user_now_naive


# ---------------------------------------------------------------------------
# Independent DeclarativeBase for RAG (PG only)
# ---------------------------------------------------------------------------


class RagBase(DeclarativeBase):
    """Independent base for all RAG models — bound to PG, not MySQL."""
    pass


# ---------------------------------------------------------------------------
# RagDocument — knowledge base document
# ---------------------------------------------------------------------------


class RagDocument(RagBase):
    """Document metadata row.  Blob is stored in MinIO under original_object_key.

    Status lifecycle: pending → processing → completed | failed
    """

    __tablename__ = "rag_documents"
    __table_args__ = (
        Index("idx_rd_status_created", "status", "created_at"),
        Index("idx_rd_uploader", "uploader_id", "is_deleted"),
        Index("idx_rd_deleted_created", "is_deleted", "created_at"),
        Index("idx_rd_content_hash", "content_hash"),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    original_name: Mapped[str] = mapped_column(
        String(256), nullable=False,
    )
    file_size: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    mime_type: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    uploader_id: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending",
    )
    progress_stage: Mapped[str | None] = mapped_column(
        String(32), nullable=True,
    )
    original_object_key: Mapped[str | None] = mapped_column(
        String(512), nullable=True,
    )
    chunk_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
    )
    error_message: Mapped[str | None] = mapped_column(
        String(1024), nullable=True,
    )
    content_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True,
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive, onupdate=get_user_now_naive,
    )


# ---------------------------------------------------------------------------
# RagChunk — document chunk (with vector embedding)
# ---------------------------------------------------------------------------


class RagChunk(RagBase):
    """Document chunk with optional vector embedding.

    - Parent chunks: ``chunk_type='parent'``, ``embedding=NULL``
    - Child chunks:  ``chunk_type='child'``,  ``embedding=vector``

    HNSW index is created manually in ``database.py`` (``create_all``
    does not create vector indexes).
    """

    __tablename__ = "rag_chunks"
    __table_args__ = (
        Index("idx_rc_doc", "document_id"),
        Index("idx_rc_parent", "parent_chunk_id"),
        Index("idx_rc_type_doc", "chunk_type", "document_id", "is_deleted"),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    document_id: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    chunk_type: Mapped[str] = mapped_column(
        String(8), nullable=False, default="parent",
    )
    parent_chunk_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
    )
    chunk_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
    )
    content: Mapped[str] = mapped_column(
        Text, nullable=False,
    )
    content_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True,
    )
    section_title: Mapped[str | None] = mapped_column(
        String(256), nullable=True,
    )
    heading_path: Mapped[str | None] = mapped_column(
        String(512), nullable=True,
    )
    token_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
    )
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(1024), nullable=True,
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive, onupdate=get_user_now_naive,
    )


# ---------------------------------------------------------------------------
# DocumentMetadata — admin-managed key:value metadata
# ---------------------------------------------------------------------------


class DocumentMetadata(RagBase):
    """Key-value metadata attached to a document (admin-managed).

    Unique constraint on (document_id, meta_key) prevents duplicate keys.
    """

    __tablename__ = "rag_document_metadata"
    __table_args__ = (
        UniqueConstraint("document_id", "meta_key", name="uq_rdm_doc_key"),
        Index("idx_rdm_doc", "document_id"),
        Index("idx_rdm_key_value", "meta_key", "meta_value"),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    document_id: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    meta_key: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    meta_value: Mapped[str] = mapped_column(
        Text, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive, onupdate=get_user_now_naive,
    )
