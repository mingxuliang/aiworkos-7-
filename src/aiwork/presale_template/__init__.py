# -*- coding: utf-8 -*-
"""Presale Template module.

Provides:
- PPT template storage in MinIO (up to 500MB, streaming multipart upload).
- Admin CRUD endpoints for template management.
- Public (no-auth) endpoint for template list with presigned download URLs.
- Periodic cleanup of expired upload sessions and soft-deleted templates.

This module requires MinIO to be configured (``AIWORK_MINIO_ENDPOINT``).
"""
from __future__ import annotations
