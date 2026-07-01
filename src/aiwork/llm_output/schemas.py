# -*- coding: utf-8 -*-
"""Pydantic schemas for the llm_output module API."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LlmOutputResponse(BaseModel):
    """Single LLM output record returned to the client."""

    id: int
    session_id: Optional[str] = None
    agent_id: Optional[str] = None
    original_filename: str
    file_size: int
    mime_type: str
    download_url: str = Field(
        description="Presigned URL refreshed on each request",
    )
    created_at: datetime

    model_config = {"from_attributes": True}


class LlmOutputListResponse(BaseModel):
    """Paginated list of LLM output records."""

    items: list[LlmOutputResponse]
    total: int
    page: int
    page_size: int


class BatchDeleteRequest(BaseModel):
    """Request body for batch-delete."""

    ids: list[int] = Field(min_length=1, max_length=200)
