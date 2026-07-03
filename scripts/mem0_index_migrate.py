#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Create performance indexes on the mem0 memory table.

This script is idempotent — it uses ``CREATE INDEX IF NOT EXISTS``
so it can be run safely at any time, even on a live production database.

Target indexes:
  - ``{collection}_user_id_idx`` — B-tree on ``payload->>'user_id'``
    (accelerates every query: search, list, dream, retrieve)
  - ``{collection}_category_idx`` — B-tree on ``payload->>'category'``
    (accelerates memory_list filtered by category)

Usage::

    python scripts/mem0_index_migrate.py

The script reads database connection parameters from environment variables,
using the same precedence as the mem0 MemoryManager:

    MEM0_PGVECTOR_DB_URL
    AIWORK_MEM0_DB_URL
    MEM0_PGVECTOR_HOST / PORT / DB / USER / PASSWORD
    MEM0_COLLECTION_NAME   (default: aiwork_memory)

For connection URL env vars that use the ``+asyncpg`` scheme, the script
strips the driver suffix automatically (mem0 uses psycopg2 internally).
"""

import logging
import os
import re
import sys
from urllib.parse import unquote

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def _get_env(key: str, default: str = "") -> str:
    """Read an environment variable, stripping quotes."""
    val = os.getenv(key, default)
    if val and len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
        val = val[1:-1]
    return val


def build_connection_string() -> str:
    """Build a psycopg2-compatible connection string from env vars.

    Priority: connection URL > individual host/port/db/user/password.
    """
    # 1. Try connection URL
    db_url = (
        _get_env("MEM0_PGVECTOR_DB_URL")
        or _get_env("AIWORK_MEM0_DB_URL")
        or ""
    )
    if db_url:
        # Strip asyncpg / psycopg driver prefix → plain postgresql://
        db_url = re.sub(
            r"^postgresql(\+[a-z]+)?://",
            "postgresql://",
            db_url,
        )
        # Ensure sslmode is set (required by some cloud providers)
        if "sslmode=" not in db_url:
            sep = "&" if "?" in db_url else "?"
            db_url += f"{sep}sslmode=prefer"
        return db_url

    # 2. Build from individual parameters
    host = _get_env("MEM0_PGVECTOR_HOST", "localhost")
    port = _get_env("MEM0_PGVECTOR_PORT", "5432")
    dbname = _get_env("MEM0_PGVECTOR_DB", "memory")
    user = _get_env("MEM0_PGVECTOR_USER", "")
    password = _get_env("MEM0_PGVECTOR_PASSWORD", "")

    if not user:
        logger.error(
            "No database connection info found. Set MEM0_PGVECTOR_DB_URL "
            "or MEM0_PGVECTOR_HOST/USER/etc."
        )
        sys.exit(1)

    # URL-encode password for connection string safety
    from urllib.parse import quote
    encoded_password = quote(password, safe="")

    return (
        f"postgresql://{user}:{encoded_password}"
        f"@{host}:{port}/{dbname}"
        f"?sslmode=prefer"
    )


def get_collection_name() -> str:
    """Return the mem0 collection (table) name."""
    return _get_env("MEM0_COLLECTION_NAME", "aiwork_memory")


def mask_password(url: str) -> str:
    """Mask the password in a connection URL for safe logging."""
    return re.sub(r"(://[^:]+):([^@]+)@", r"\1:***@", url)


def create_indexes(conn_string: str, collection: str) -> dict[str, bool]:
    """Create all performance indexes.

    Returns a dict mapping index name → created (True if newly created,
    False if already existed).
    """
    try:
        import psycopg2
    except ImportError:
        logger.error(
            "psycopg2 is required. Install it with: pip install psycopg2-binary"
        )
        sys.exit(1)

    indexes = {
        f"{collection}_user_id_idx": (
            f"CREATE INDEX IF NOT EXISTS {collection}_user_id_idx "
            f"ON {collection} ((payload->>'user_id'))"
        ),
        f"{collection}_category_idx": (
            f"CREATE INDEX IF NOT EXISTS {collection}_category_idx "
            f"ON {collection} ((payload->>'category'))"
        ),
    }

    results: dict[str, bool] = {}
    conn = None

    try:
        logger.info("Connecting to: %s", mask_password(conn_string))
        conn = psycopg2.connect(conn_string)
        conn.autocommit = True  # CREATE INDEX CONCURRENTLY requires autocommit
        cur = conn.cursor()

        # Verify the collection table exists
        cur.execute(
            "SELECT EXISTS ("
            "SELECT FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = %s"
            ")",
            (collection,),
        )
        table_exists = cur.fetchone()[0]
        if not table_exists:
            logger.warning(
                "Table '%s' does not exist yet. "
                "It will be auto-created by mem0 on first use. "
                "Re-run this script after the table is created.",
                collection,
            )
            return results

        # Check existing indexes
        cur.execute(
            "SELECT indexname FROM pg_indexes "
            "WHERE schemaname = 'public' AND tablename = %s",
            (collection,),
        )
        existing_indexes = {row[0] for row in cur.fetchall()}

        for idx_name, ddl in indexes.items():
            if idx_name in existing_indexes:
                logger.info("Index already exists: %s", idx_name)
                results[idx_name] = False
            else:
                logger.info("Creating index: %s ...", idx_name)
                cur.execute(ddl)
                logger.info("Index created: %s", idx_name)
                results[idx_name] = True

        cur.close()
    except Exception as e:
        logger.error("Failed to create indexes: %s", e)
        raise
    finally:
        if conn:
            conn.close()

    return results


def main() -> None:
    """Entry point."""
    logger.info("=" * 60)
    logger.info("mem0 Performance Index Migration")
    logger.info("=" * 60)

    conn_string = build_connection_string()
    collection = get_collection_name()

    logger.info("Collection (table): %s", collection)

    results = create_indexes(conn_string, collection)

    # Summary
    logger.info("-" * 60)
    created = [k for k, v in results.items() if v]
    skipped = [k for k, v in results.items() if not v]

    if created:
        logger.info("Newly created: %s", ", ".join(created))
    if skipped:
        logger.info("Already existed: %s", ", ".join(skipped))
    if not results:
        logger.info("No indexes created (table may not exist yet).")

    logger.info("Done.")
    logger.info(
        "Tip: indexes are also auto-created at startup by "
        "Mem0MemoryManager._ensure_performance_indexes()."
    )


if __name__ == "__main__":
    main()
