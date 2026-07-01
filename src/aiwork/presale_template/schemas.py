# -*- coding: utf-8 -*-
"""Pydantic schemas for the presale template module."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Template request schemas
# ---------------------------------------------------------------------------


class TemplateCreateRequest(BaseModel):
    """Metadata submitted alongside the file upload (multipart/form-data)."""

    name: str = Field(..., min_length=1, max_length=256, description="模板名称")
    description: str = Field("", max_length=1024, description="模板描述")


class TemplateUpdateRequest(BaseModel):
    """Update template metadata.  At least one field must be provided."""

    name: Optional[str] = Field(None, min_length=1, max_length=256)
    description: Optional[str] = Field(None, max_length=1024)


# ---------------------------------------------------------------------------
# Template response schemas
# ---------------------------------------------------------------------------


class TemplateResponse(BaseModel):
    """Response for a single template record (admin view)."""

    id: int
    name: str
    description: str
    object_key: str
    original_name: str
    file_size: int
    mime_type: str
    file_hash: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False

    class Config:
        from_attributes = True


class TemplateAdminListResponse(BaseModel):
    """Paginated template list for admin (includes soft-deleted)."""

    items: list[TemplateResponse] = []
    total: int = 0
    page: int = 1
    page_size: int = 20


class TemplatePublicItem(BaseModel):
    """Single template entry in the public list (includes download URL)."""

    id: int
    name: str
    description: str
    original_name: str
    file_size: int
    download_url: str = ""
    created_at: datetime


class TemplatePublicListResponse(BaseModel):
    """Public template list (all non-deleted templates)."""

    total: int = 0
    items: list[TemplatePublicItem] = []
