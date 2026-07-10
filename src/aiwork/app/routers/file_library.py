# -*- coding: utf-8 -*-
"""FastAPI router for file library endpoints.

All routes are prefixed with ``/files`` under the main ``/api`` router.

This router is conditionally registered — only when MinIO is configured
and reachable at startup.
"""
from __future__ import annotations

import logging
from urllib.parse import quote

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
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth_jwt.database import get_db
from ...file_library.minio_client import get_minio_client, MinioClient
from ...file_library.schemas import (
    BatchDeleteRequest,
    BatchDeleteResponse,
    BatchFileItem,
    BatchReadRequest,
    BatchReadResponse,
    FileListResponse,
    FileResponse,
    FileSearchResponse,
    FileUpdateRequest,
    FolderCreateRequest,
    FolderResponse,
    FolderTreeResponse,
    FolderUpdateRequest,
)
from ...file_library.service import (
    batch_delete_files,
    create_folder,
    delete_file,
    delete_folder,
    get_file,
    get_files_batch,
    get_folder,
    get_folder_tree,
    list_files,
    search_files,
    update_file,
    update_folder,
    upload_file,
    _build_file_response,
    DuplicateFileNameError,
    DuplicateFolderNameError,
    EmptyFileError,
    FileTooLargeError,
    MimeTypeNotAllowedError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["file-library"])


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def _get_current_user(request: Request) -> dict:
    """Extract current user info from request state (set by middleware)."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    raw_uid = getattr(request.state, "user_id", "")
    try:
        user_id = int(raw_uid)
    except (TypeError, ValueError):
        user_id = raw_uid
    return {
        "username": user,
        "user_id": user_id,
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
            detail="File library is not available — MinIO not configured",
        )
    return minio


# ---------------------------------------------------------------------------
# Folder endpoints
# ---------------------------------------------------------------------------


@router.post("/folders", response_model=FolderResponse, status_code=201)
async def create_folder_endpoint(
    req: FolderCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new directory."""
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]
    try:
        folder = await create_folder(
            db, req.parent_id, req.name, info["user_id"], is_admin=is_admin,
        )
    except DuplicateFolderNameError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return FolderResponse.model_validate(folder)


@router.get("/folders/tree", response_model=FolderTreeResponse)
async def get_folder_tree_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's directory tree as a list of top-level folders."""
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]
    folders = await get_folder_tree(db, info["user_id"], is_admin)
    return FolderTreeResponse(folders=folders)


@router.get("/folders/{folder_id}", response_model=FolderResponse)
async def get_folder_endpoint(
    folder_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get a single directory by id."""
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]
    folder = await get_folder(db, folder_id, info["user_id"], is_admin)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    return FolderResponse.model_validate(folder)


@router.put("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder_endpoint(
    folder_id: int,
    req: FolderUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Rename or move a directory.  Only the creator can modify it."""
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]
    try:
        folder = await update_folder(
            db, folder_id, info["user_id"],
            name=req.name, parent_id=req.parent_id, is_admin=is_admin,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except DuplicateFolderNameError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return FolderResponse.model_validate(folder)


@router.delete("/folders/{folder_id}")
async def delete_folder_endpoint(
    folder_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete a directory and its subdirectories (soft delete).

    Files in deleted folders become orphan files (folder_id = NULL).
    """
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]
    try:
        await delete_folder(db, folder_id, info["user_id"], is_admin)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"message": "Folder deleted"}


# ---------------------------------------------------------------------------
# File endpoints
# ---------------------------------------------------------------------------


@router.post("/upload", response_model=FileResponse)
async def upload_file_endpoint(
    request: Request,
    file: UploadFile = File(...),
    folder_id: int | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file (any size — backend auto-adapts small / multipart).

    Accepts ``multipart/form-data`` with:
    - ``file``: binary file data
    - ``folder_id``: optional target directory id
    """
    info = _get_current_user(request)
    minio = _require_minio()

    try:
        record = await upload_file(
            db, file, folder_id, info["user_id"], minio,
        )
    except DuplicateFileNameError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except EmptyFileError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc))
    except MimeTypeNotAllowedError as exc:
        raise HTTPException(status_code=415, detail=str(exc))

    return _build_file_response(record)


@router.get("/list", response_model=FileListResponse)
async def list_files_endpoint(
    request: Request,
    folder_id: int | None = Query(None, description="Filter by folder; null = root"),
    recursive: bool = Query(False, description="Include descendant folders"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Paginated file list.  Use ``recursive=true`` to include files in
    descendant folders."""
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]

    records, total = await list_files(
        db, info["user_id"],
        folder_id=folder_id,
        recursive=recursive,
        page=page,
        page_size=page_size,
        is_admin=is_admin,
    )

    items = [_build_file_response(r) for r in records]
    return FileListResponse(
        items=items, total=total, page=page, page_size=page_size,
    )


@router.get("/search", response_model=FileSearchResponse)
async def search_files_endpoint(
    request: Request,
    file_name: str = Query(..., min_length=1, description="Search keyword"),
    mime_type: str | None = Query(None, description="Optional MIME type filter"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Global fuzzy search across all files, filtered by filename and
    optional MIME type."""
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]

    records, total = await search_files(
        db, info["user_id"],
        q=file_name,
        mime_type=mime_type,
        page=page,
        page_size=page_size,
        is_admin=is_admin,
    )

    items = [_build_file_response(r) for r in records]
    return FileSearchResponse(
        items=items, total=total, page=page, page_size=page_size,
    )


@router.post("/batch-read", response_model=BatchReadResponse)
async def batch_read_endpoint(
    req: BatchReadRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Batch-fetch files: return presigned URLs or base64 content."""
    info = _get_current_user(request)
    minio = _require_minio()
    is_admin = "admin" in info["roles"]

    records = await get_files_batch(
        db, req.file_ids, info["user_id"], is_admin,
    )
    record_map = {r.id: r for r in records}

    files: list[BatchFileItem] = []
    for fid in req.file_ids:
        rec = record_map.get(fid)
        if rec is None:
            files.append(BatchFileItem(
                id=fid,
                error="File not found or access denied",
            ))
            continue

        if req.mode == "url":
            try:
                url = await minio.presigned_get_url(rec.object_key)
                files.append(BatchFileItem(
                    id=fid,
                    original_name=rec.original_name,
                    url=url,
                ))
            except Exception as exc:
                files.append(BatchFileItem(
                    id=fid,
                    original_name=rec.original_name,
                    error=str(exc),
                ))
        else:  # mode == "content"
            # Size guard: refuse files > 50MB in content mode
            max_content_size = 50 * 1024 * 1024
            if rec.file_size > max_content_size:
                files.append(BatchFileItem(
                    id=fid,
                    original_name=rec.original_name,
                    error="File exceeds 50MB limit, use mode=url instead",
                ))
                continue
            try:
                import base64
                data = await minio.get_object(rec.object_key)
                content_b64 = base64.b64encode(data).decode("ascii")
                files.append(BatchFileItem(
                    id=fid,
                    original_name=rec.original_name,
                    mime_type=rec.mime_type,
                    content=content_b64,
                ))
            except Exception as exc:
                files.append(BatchFileItem(
                    id=fid,
                    original_name=rec.original_name,
                    error=str(exc),
                ))

    return BatchReadResponse(files=files)


@router.post("/batch-delete", response_model=BatchDeleteResponse)
async def batch_delete_endpoint(
    req: BatchDeleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Batch soft-delete files."""
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]

    result = await batch_delete_files(
        db, req.file_ids, info["user_id"],
        minio=_require_minio(), is_admin=is_admin,
    )
    return BatchDeleteResponse(**result)


@router.get("/{file_id}", response_model=FileResponse)
async def get_file_endpoint(
    file_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get file metadata by id."""
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]

    record = await get_file(db, file_id, info["user_id"], is_admin)
    if record is None:
        raise HTTPException(status_code=404, detail="File not found")
    return _build_file_response(record)


@router.put("/{file_id}", response_model=FileResponse)
async def update_file_endpoint(
    file_id: int,
    req: FileUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Rename and/or move a file.  At least one field must be provided."""
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]

    if req.original_name is None and req.folder_id is None:
        raise HTTPException(
            status_code=400,
            detail="At least one of original_name or folder_id must be provided",
        )
    try:
        record = await update_file(
            db, file_id, info["user_id"],
            original_name=req.original_name,
            folder_id=req.folder_id,
            is_admin=is_admin,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _build_file_response(record)


@router.get("/{file_id}/download")
async def download_file_endpoint(
    file_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Download a file by streaming MinIO bytes through the backend.

    Keeping the browser on the same HTTPS origin avoids mixed-content blocks
    when MinIO is only reachable through an internal HTTP endpoint.
    """
    info = _get_current_user(request)
    minio = _require_minio()
    is_admin = "admin" in info["roles"]

    record = await get_file(db, file_id, info["user_id"], is_admin)
    if record is None:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        data = await minio.get_object(record.object_key)
    except Exception:
        logger.warning(
            "Failed to fetch MinIO object for file download: %s",
            record.object_key,
            exc_info=True,
        )
        raise HTTPException(status_code=404, detail="File object not found")

    safe_filename = record.original_name.replace('"', "'")
    content_disposition = (
        f"attachment; filename*=UTF-8''{quote(safe_filename, safe='')}"
    )
    return Response(
        content=data,
        media_type=record.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": content_disposition,
            "Content-Length": str(len(data)),
        },
    )


@router.delete("/{file_id}")
async def delete_file_endpoint(
    file_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a single file."""
    info = _get_current_user(request)
    is_admin = "admin" in info["roles"]

    ok = await delete_file(db, file_id, info["user_id"],
        minio=_require_minio(), is_admin=is_admin)
    if not ok:
        raise HTTPException(status_code=404, detail="File not found")
    return {"message": "File deleted"}
