# -*- coding: utf-8 -*-
"""FastAPI router for department (organization structure) endpoints.

All routes are prefixed with ``/departments`` under the main ``/api`` router.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth_jwt.database import get_db
from ...department.schemas import (
    DepartmentCreateRequest,
    DepartmentDeleteRequest,
    DepartmentListItem,
    DepartmentListResponse,
    DepartmentResponse,
    DepartmentTreeResponse,
    DepartmentUpdateRequest,
    SubJobNodeResponse,
    UserDepartmentAssignRequest,
    UserDepartmentResponse,
)
from ...department.service import (
    create_department,
    delete_department,
    get_department,
    get_department_list,
    get_full_tree,
    get_user_department_id,
    set_user_department,
    update_department,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/departments", tags=["departments"])


# ---------------------------------------------------------------------------
# Helpers (replicate auth pattern from auth_jwt/router.py)
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


def _to_response(dept, sub_jobs=None) -> DepartmentResponse:
    """Convert a Department ORM object to a DepartmentResponse."""
    return DepartmentResponse(
        id=dept.id,
        parent_id=dept.parent_id,
        department_name=dept.department_name,
        position_title=dept.position_title,
        ai_empowerment_level=dept.ai_empowerment_level,
        efficiency_improvement_percent=dept.efficiency_improvement_percent,
        job_desc=dept.job_desc,
        sub_jobs=[
            SubJobNodeResponse.model_validate(sj) for sj in (sub_jobs or [])
        ],
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=DepartmentResponse)
async def create_department_endpoint(
    req: DepartmentCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new department node (admin only)."""
    _require_admin(request)
    try:
        dept, sub_jobs = await create_department(db, req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _to_response(dept, sub_jobs)


@router.put("", response_model=DepartmentResponse)
async def update_department_endpoint(
    req: DepartmentUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing department node (admin only)."""
    _require_admin(request)
    try:
        dept, sub_jobs = await update_department(db, req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _to_response(dept, sub_jobs)


@router.delete("/{dept_id}")
async def delete_department_endpoint(
    dept_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete a department node and its subtree (admin only)."""
    _require_admin(request)
    try:
        await delete_department(db, dept_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"message": "Department deleted"}


@router.get("/list", response_model=DepartmentListResponse)
async def list_departments_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get a flat list of all departments (id + name only, login required)."""
    _get_current_user(request)
    depts = await get_department_list(db)
    items = [DepartmentListItem(id=d.id, department_name=d.department_name) for d in depts]
    return DepartmentListResponse(departments=items)


@router.get("/tree", response_model=DepartmentTreeResponse)
async def get_department_tree(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get the full organization tree (login required)."""
    _get_current_user(request)
    tree = await get_full_tree(db)
    return DepartmentTreeResponse(root=tree)


@router.get("/{dept_id}", response_model=DepartmentResponse)
async def get_department_endpoint(
    dept_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get a single department node by id (login required)."""
    _get_current_user(request)
    dept, sub_jobs = await get_department(db, dept_id)
    if dept is None:
        raise HTTPException(status_code=404, detail="Department not found")
    return _to_response(dept, sub_jobs)


# ---------------------------------------------------------------------------
# User <-> Department assignment
# ---------------------------------------------------------------------------


@router.get("/users/{user_id}", response_model=UserDepartmentResponse)
async def get_user_department_endpoint(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Return the department assignment for a user (login required)."""
    _get_current_user(request)
    dept_id = await get_user_department_id(db, user_id)
    return UserDepartmentResponse(user_id=user_id, department_id=dept_id)


@router.put("/users/{user_id}", response_model=UserDepartmentResponse)
async def set_user_department_endpoint(
    user_id: int,
    req: UserDepartmentAssignRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Assign or clear the department for a user (admin only).

    Pass ``department_id=null`` (or omit) to clear the assignment.
    """
    _require_admin(request)
    try:
        profile = await set_user_department(db, user_id, req.department_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return UserDepartmentResponse(
        user_id=profile.user_id,
        department_id=profile.department_id,
    )
