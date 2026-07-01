# -*- coding: utf-8 -*-
"""FastAPI router for presale template endpoints.

Admin routes (require auth + admin role):
- POST   /presale-templates/upload       — Upload a PPT template.
- DELETE /presale-templates/{id}          — Soft-delete a template.
- PUT    /presale-templates/{id}          — Update template metadata.
- GET    /presale-templates/{id}          — Get template detail.
- GET    /presale-templates/list          — Paginated admin list.

Authenticated routes (login required):
- GET    /presale-templates/download/{id} — 302 redirect to MinIO presigned URL.

Public routes (no auth required):
- GET    /presale-templates/public/list   — All non-deleted templates with
                                            presigned download URLs.
"""
from __future__ import annotations

import logging

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth_jwt.database import get_db
from ...file_library.minio_client import get_minio_client, MinioClient
from ...presale_template.schemas import (
    TemplateCreateRequest,
    TemplateUpdateRequest,
    TemplateResponse,
    TemplateAdminListResponse,
    TemplatePublicItem,
    TemplatePublicListResponse,
)
from ...presale_template.service import (
    upload_template,
    get_template,
    update_template,
    delete_template,
    list_templates_admin,
    list_templates_public,
    get_template_download_url,
    _build_template_response,
    DuplicateTemplateNameError,
    EmptyFileError,
    FileTooLargeError,
    InvalidFileTypeError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/presale-templates", tags=["presale-templates"])


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
        "user_id": getattr(request.state, "user_id", ""),
        "roles": getattr(request.state, "roles", []),
    }


def _require_admin(request: Request) -> dict:
    """Require the current user to have the admin role."""
    info = _get_current_user(request)
    if "admin" not in info["roles"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return info


def _require_minio() -> MinioClient:
    """Return the MinIO client or raise 503 if not configured."""
    minio = get_minio_client()
    if minio is None:
        raise HTTPException(
            status_code=503,
            detail="Presale template library is not available — MinIO not configured",
        )
    return minio


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.post("/upload", response_model=TemplateResponse, status_code=201)
async def upload_template_endpoint(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(..., description="模板名称"),
    description: str = Form("", description="模板描述"),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PPT template (any size up to 500MB — backend auto-adapts
    small / multipart).

    Accepts ``multipart/form-data`` with:
    - ``file``: binary PPT/PPTX file data
    - ``name``: template display name
    - ``description``: optional description
    """
    info = _require_admin(request)
    minio = _require_minio()

    try:
        record = await upload_template(
            db, file, name, description, info["user_id"], minio,
        )
    except DuplicateTemplateNameError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except InvalidFileTypeError as exc:
        raise HTTPException(status_code=415, detail=str(exc))
    except EmptyFileError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc))

    return _build_template_response(record)


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template_endpoint(
    template_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get template detail by id (admin only)."""
    _require_admin(request)

    record = await get_template(db, template_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return _build_template_response(record)


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template_endpoint(
    template_id: int,
    req: TemplateUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update template name and/or description.  At least one field must
    be provided."""
    _require_admin(request)

    if req.name is None and req.description is None:
        raise HTTPException(
            status_code=400,
            detail="At least one of name or description must be provided",
        )
    try:
        record = await update_template(
            db, template_id,
            name=req.name,
            description=req.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except DuplicateTemplateNameError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return _build_template_response(record)


@router.delete("/{template_id}")
async def delete_template_endpoint(
    template_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a template and remove its MinIO object."""
    _require_admin(request)

    ok = await delete_template(
        db, template_id, minio=_require_minio(),
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}


@router.get("/list", response_model=TemplateAdminListResponse)
async def list_templates_admin_endpoint(
    request: Request,
    search: str | None = Query(None, description="Fuzzy search by name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Paginated template list for admin (includes soft-deleted).

    Use ``search`` for fuzzy name matching.
    """
    _require_admin(request)

    records, total = await list_templates_admin(
        db, search=search, page=page, page_size=page_size,
    )

    items = [_build_template_response(r) for r in records]
    return TemplateAdminListResponse(
        items=items, total=total, page=page, page_size=page_size,
    )


# ---------------------------------------------------------------------------
# Authenticated endpoints (login required)
# ---------------------------------------------------------------------------


@router.get("/download/{template_id}")
async def download_template_endpoint(
    template_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Download a template — 302 redirect to MinIO presigned URL.

    Requires authentication (any logged-in user).
    """
    _get_current_user(request)
    minio = _require_minio()
    url = await get_template_download_url(db, template_id, minio)
    if url is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return RedirectResponse(url=url, status_code=302)


# ---------------------------------------------------------------------------
# Public endpoints (no auth required)
# ---------------------------------------------------------------------------


@router.get("/public/list", response_model=TemplatePublicListResponse)
async def list_templates_public_endpoint(
    db: AsyncSession = Depends(get_db),
):
    """Return all non-deleted templates with presigned download URLs.

    Public endpoint — no authentication required.
    """
    minio = _require_minio()
    items = await list_templates_public(db, minio)
    return TemplatePublicListResponse(
        total=len(items),
        items=items,
    )

