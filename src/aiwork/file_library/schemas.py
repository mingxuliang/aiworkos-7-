# -*- coding: utf-8 -*-
"""Pydantic schemas for the file library module."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Folder request schemas
# ---------------------------------------------------------------------------


class FolderCreateRequest(BaseModel):
    """Create a new directory."""

    parent_id: Optional[int] = Field(None, description="Parent directory ID; null = root level")
    name: str = Field(..., min_length=1, max_length=128, description="Directory name")


class FolderUpdateRequest(BaseModel):
    """Rename or move a directory."""

    name: Optional[str] = Field(None, min_length=1, max_length=128)
    parent_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Folder response schemas
# ---------------------------------------------------------------------------


class FolderResponse(BaseModel):
    """Flat response for a single directory."""

    id: int
    parent_id: Optional[int] = None
    name: str
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FolderTreeNode(BaseModel):
    """Recursive tree node (folder + children + file count)."""

    id: int
    parent_id: Optional[int] = None
    name: str
    created_by: int
    created_at: datetime
    updated_at: datetime
    file_count: int = 0
    children: list["FolderTreeNode"] = []

    class Config:
        from_attributes = True


class FolderTreeResponse(BaseModel):
    """Full directory tree response — top-level folders as a list."""

    folders: list[FolderTreeNode] = []


# ---------------------------------------------------------------------------
# File request schemas
# ---------------------------------------------------------------------------


class FileUpdateRequest(BaseModel):
    """Rename or move a file.  At least one field must be provided."""

    original_name: Optional[str] = Field(None, min_length=1, max_length=256)
    folder_id: Optional[int] = None


class BatchReadRequest(BaseModel):
    """Batch fetch files by id."""

    file_ids: list[int] = Field(..., min_length=1, max_length=50)
    mode: str = Field("url", pattern="^(url|content)$")


class BatchDeleteRequest(BaseModel):
    """Batch soft-delete files by id."""

    file_ids: list[int] = Field(..., min_length=1, max_length=200)


# ---------------------------------------------------------------------------
# File response schemas
# ---------------------------------------------------------------------------


class FileResponse(BaseModel):
    """Response for a single file record."""

    id: int
    folder_id: Optional[int] = None
    original_name: str
    file_size: int
    mime_type: str
    file_hash: Optional[str] = None
    uploader_id: int
    created_at: datetime
    download_url: str = ""

    class Config:
        from_attributes = True


class FileListResponse(BaseModel):
    """Paginated file list."""

    items: list[FileResponse] = []
    total: int = 0
    page: int = 1
    page_size: int = 20


class FileSearchResponse(BaseModel):
    """Search results (same shape as list, but from global search)."""

    items: list[FileResponse] = []
    total: int = 0
    page: int = 1
    page_size: int = 20


class BatchFileItem(BaseModel):
    """Single file entry in a batch response."""

    id: int
    original_name: str = ""
    mime_type: str | None = None
    url: str | None = None
    content: str | None = None
    error: str | None = None


class BatchReadResponse(BaseModel):
    """Response for batch file read."""

    files: list[BatchFileItem] = []


class BatchDeleteItem(BaseModel):
    """Single result in a batch delete response."""

    id: int
    error: str | None = None


class BatchDeleteResponse(BaseModel):
    """Response for batch delete."""

    deleted: list[int] = []
    failed: list[BatchDeleteItem] = []
