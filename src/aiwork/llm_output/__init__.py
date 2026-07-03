# -*- coding: utf-8 -*-
"""LLM interaction output file management.

Stores agent-generated result files in a dedicated MinIO bucket
(``aiwork-llm-output``) and tracks user / session metadata in MySQL
for later lookup.

Public API:
- ``upload_and_record()`` — upload a local file + write DB record
- ``list_user_outputs()`` — paginated query of a user's files
- ``get_output_with_url()`` — single record with refreshed presigned URL
- ``soft_delete_output()`` / ``batch_soft_delete_outputs()`` — soft-delete
"""
from __future__ import annotations

from .service import (
    upload_and_record,
    list_user_outputs,
    get_output_with_url,
    download_to_local,
    soft_delete_output,
    batch_soft_delete_outputs,
)

__all__ = [
    "upload_and_record",
    "list_user_outputs",
    "get_output_with_url",
    "download_to_local",
    "soft_delete_output",
    "batch_soft_delete_outputs",
]
