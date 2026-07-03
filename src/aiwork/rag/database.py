# -*- coding: utf-8 -*-
"""Async PostgreSQL + pgvector engine, session factory, and initialization.

Reads ``AIWORK_PGVECTOR_DB_URL`` from environment variables.  Provides
``get_pg_db()`` as a FastAPI dependency and ``init_pg_db()`` for startup.

Uses an **independent** DeclarativeBase ``RagBase`` — not the MySQL Base.
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ..constant import EnvVarLoader

# Ensure RAG ORM models are registered against RagBase.metadata
from . import models as _rag_models  # noqa: F401

from .models import RagBase

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Engine & session factory (created lazily)
# ---------------------------------------------------------------------------

_engine = None
_pg_session_factory: async_sessionmaker[AsyncSession] | None = None


def _get_pg_db_url() -> str:
    return EnvVarLoader.get_str("AIWORK_PGVECTOR_DB_URL", "").strip()


def get_pg_engine():
    """Return the async PG engine, creating it if necessary."""
    global _engine
    if _engine is None:
        db_url = _get_pg_db_url()
        if not db_url:
            raise RuntimeError("AIWORK_PGVECTOR_DB_URL is not configured")
        _engine = create_async_engine(
            db_url,
            echo=False,
            pool_pre_ping=True,
            pool_size=20,
            max_overflow=30,
        )
    return _engine


def get_pg_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the async PG session factory, creating it if necessary."""
    global _pg_session_factory
    if _pg_session_factory is None:
        _pg_session_factory = async_sessionmaker(
            get_pg_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _pg_session_factory


async def get_pg_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async PG database session."""
    factory = get_pg_session_factory()
    async with factory() as session:
        try:
            yield session
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


async def _create_hnsw_index_if_not_exists(conn) -> None:
    """Create the HNSW index on rag_chunks.embedding if it doesn't exist.

    pgvector's ``create_all`` does NOT create vector indexes — we must
    create the HNSW index manually.
    """
    try:
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding "
            "ON rag_chunks "
            "USING hnsw (embedding vector_cosine_ops)"
        ))
        await conn.commit()
        logger.info("HNSW index on rag_chunks.embedding created / verified")
    except Exception as exc:
        logger.warning(
            "Failed to create HNSW index (pgvector may not be installed): %s",
            exc,
        )


async def _create_performance_indexes(conn) -> None:
    """Create performance-optimization indexes that can't be expressed
    as SQLAlchemy declarative ``Index`` (partial indexes, etc.).
    """
    indexes = [
        # Partial index: only index soft-deleted documents for cleanup queries
        "CREATE INDEX IF NOT EXISTS idx_rd_deleted_updated "
        "ON rag_documents (updated_at) WHERE is_deleted = true",
    ]
    for ddl in indexes:
        try:
            await conn.execute(text(ddl))
            await conn.commit()
            logger.info("Performance index created / verified: %s", ddl[:60])
        except Exception as exc:
            logger.warning("Failed to create performance index: %s", exc)


async def _ensure_schema_migrations(conn) -> None:
    """Idempotent schema migrations for columns added after initial release.

    ``RagBase.metadata.create_all`` only creates new tables — it does not
    add columns to existing tables.  Use ``ALTER TABLE ... ADD COLUMN
    IF NOT EXISTS`` to fill the gap without a full migration framework.
    """
    migrations = [
        # P2-17: upload deduplication
        "ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)",
    ]
    for ddl in migrations:
        try:
            await conn.execute(text(ddl))
            await conn.commit()
            logger.info("Schema migration applied: %s", ddl[:80])
        except Exception as exc:
            logger.warning("Schema migration skipped: %s", exc)


async def init_pg_db() -> None:
    """Create tables and HNSW vector index.

    Called once during application startup when
    ``AIWORK_PGVECTOR_DB_URL`` is configured.
    """
    engine = get_pg_engine()

    # Create all tables (idempotent for existing tables)
    async with engine.begin() as conn:
        await conn.run_sync(RagBase.metadata.create_all)
    logger.info("RAG pgvector database tables created / verified")

    # Apply schema migrations for columns added after initial release
    async with engine.begin() as conn:
        await _ensure_schema_migrations(conn)

    # Create HNSW vector index (not created by create_all)
    async with engine.begin() as conn:
        await _create_hnsw_index_if_not_exists(conn)

    # Create performance-optimization indexes
    async with engine.begin() as conn:
        await _create_performance_indexes(conn)


async def close_pg_db() -> None:
    """Dispose of the async PG engine (called on shutdown)."""
    global _engine, _pg_session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _pg_session_factory = None
        logger.info("RAG pgvector database engine disposed")
