# -*- coding: utf-8 -*-
"""MinIO File Library module.

Provides:
- Directory tree management (FileFolder)
- File upload (streaming auto-detect small / multipart)
- File listing, search, batch-read, batch-delete
- MinIO async client wrapper
- Periodic upload session cleanup

This module is **optional** — if ``AIWORK_MINIO_ENDPOINT`` is not set,
no routes are registered and no MinIO client is created.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def is_minio_available() -> bool:
    """Return True if the ``minio`` SDK is importable."""
    try:
        import minio  # noqa: F401
        return True
    except ImportError:
        logger.warning(
            "minio SDK not installed — file library will be disabled. "
            "Install with: pip install minio",
        )
        return False
