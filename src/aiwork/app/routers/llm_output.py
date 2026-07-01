# -*- coding: utf-8 -*-
"""FastAPI router for LLM output file endpoints.

All routes are prefixed with ``/llm-outputs`` under the main ``/api`` router.

This router is conditionally registered — only when MinIO is configured
and the llm-output client is initialised at startup.
"""
from __future__ import annotations

import logging

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth_jwt.database import get_db
from ...llm_output.schemas import (
    BatchDeleteRequest,
    LlmOutputListResponse,
    LlmOutputResponse,
)
from ...llm_output.service import (
    batch_soft_delete_outputs,
    download_output_file,
    get_output_with_url,
    list_user_outputs,
    soft_delete_output,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm-outputs", tags=["llm-outputs"])


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def _get_current_user(request: Request) -> dict:
    """Extract current user info from request state (set by middleware)."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "username": user,
        "user_id": str(getattr(request.state, "user_id", "")),
        "roles": getattr(request.state, "roles", []),
    }


def _require_user_id(request: Request) -> str:
    """Return the current user's ID, or raise 401."""
    info = _get_current_user(request)
    user_id = info.get("user_id", "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=LlmOutputListResponse)
async def list_outputs(
    request: Request,
    session_id: str | None = Query(None, description="Filter by session ID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=200, description="Items per page"),
    db: AsyncSession = Depends(get_db),
):
    """List the current user's LLM output files (newest first)."""
    user_id = _require_user_id(request)
    return await list_user_outputs(
        user_id=user_id,
        session_id=session_id,
        page=page,
        page_size=page_size,
    )


@router.get("/{output_id}", response_model=LlmOutputResponse)
async def get_output(
    output_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get a single LLM output record with a refreshed download URL."""
    user_id = _require_user_id(request)
    result = await get_output_with_url(output_id, user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Output record not found")
    return result


@router.get("/{output_id}/download")
async def download_output(
    output_id: int,
    request: Request,
):
    """Download an LLM output file — streamed from MinIO through the backend.

    Returns file bytes with ``Content-Disposition: attachment`` so the
    browser always triggers a download instead of previewing plain text.
    """
    user_id = _require_user_id(request)
    result = await download_output_file(output_id, user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Output record not found")
    data, content_type, filename = result

    # RFC 5987 filename* for non-ASCII (e.g. Chinese) filenames
    safe_filename = filename.replace('"', "'")
    content_disposition = (
        f"attachment; filename*=UTF-8''{quote(safe_filename, safe='')}"
    )

    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Content-Disposition": content_disposition,
            "Content-Length": str(len(data)),
        },
    )


@router.delete("/{output_id}", status_code=204)
async def delete_output(
    output_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a single LLM output record."""
    user_id = _require_user_id(request)
    deleted = await soft_delete_output(output_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Output record not found")


@router.post("/batch-delete", status_code=200)
async def batch_delete_outputs(
    req: BatchDeleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Batch soft-delete LLM output records."""
    user_id = _require_user_id(request)
    count = await batch_soft_delete_outputs(req.ids, user_id)
    return {"deleted": count}
