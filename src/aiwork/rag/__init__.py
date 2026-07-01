# -*- coding: utf-8 -*-
"""RAG Knowledge Base module.

Provides:
- Document upload with automatic MinerU parsing & indexing
- Title-based chunking with parent-child splitting
- BGE-M3 vector embedding via 硅基流动 API
- pgvector HNSW vector search
- LLM answer generation with source attribution
- Document metadata management (admin)
- Periodic orphan file / soft-deleted document cleanup

This module is **optional** — if ``AIWORK_PGVECTOR_DB_URL`` is not set,
no routes are registered and no PG engine is created.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def is_rag_available() -> bool:
    """Return True if the ``pgvector`` and ``asyncpg`` packages are importable."""
    try:
        import pgvector  # noqa: F401
        import asyncpg  # noqa: F401
        return True
    except ImportError:
        logger.warning(
            "pgvector or asyncpg not installed — RAG knowledge base disabled. "
            "Install with: pip install pgvector asyncpg",
        )
        return False
