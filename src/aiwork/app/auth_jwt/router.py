# -*- coding: utf-8 -*-
"""FastAPI router for JWT authentication endpoints.

All routes are prefixed with ``/auth/jwt`` under the main ``/api`` router.
"""
from __future__ import annotations

import logging
import math
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .jwt_utils import create_access_token, revoke_token
from .user_service import (
    authenticate_user,
    check_permission,
    create_user,
    delete_user,
    get_user_by_id,
    list_users,
    list_roles,
    list_permissions,
    assign_roles,
    remove_roles,
    update_user_password,
    user_has_role,
    list_users_paginated,
    batch_delete_users,
    reset_user_password,
    import_users_from_excel,
    create_role,
    update_role,
    delete_role,
    get_role_by_id,
    count_users_with_role,
)
from ...department.service import (
    get_user_department_names_map,
    set_user_department,
    get_user_department,
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/jwt", tags=["auth-jwt"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class JWTLoginRequest(BaseModel):
    username: str
    password: str


class JWTLoginResponse(BaseModel):
    token: str
    username: str
    roles: list[str]


class JWTRegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, pattern=r'^\S+$')
    role_names: list[str] = Field(default_factory=lambda: ["user"])


class JWTChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, pattern=r'^\S+$')
    new_password_repeat: str = Field(..., min_length=6, pattern=r'^\S+$')


class JWTAssignRolesRequest(BaseModel):
    role_ids: list[int]


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, pattern=r'^\S+$')
    role_names: list[str] = Field(default_factory=lambda: ["user"])
    department_id: Optional[int] = None


class UserUpdateRequest(BaseModel):
    """Request body for updating user info."""
    department_id: Optional[int] = None
    role_ids: Optional[list[int]] = None


class BatchDeleteRequest(BaseModel):
    user_ids: list[int]


class ResetPasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError("密码长度不能少于6位")
        if re.search(r"\s", v):
            raise ValueError("密码不能包含空格")
        return v


class JWTChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, pattern=r'^\S+$')
    new_password_repeat: str = Field(..., min_length=6, pattern=r'^\S+$')


class JWTStatusResponse(BaseModel):
    mode: str
    enabled: bool


class JWTVerifyResponse(BaseModel):
    valid: bool
    username: str = ""
    roles: list[str] = []


class UserOut(BaseModel):
    id: int
    username: str
    is_active: bool
    roles: list[str]
    department_name: Optional[str] = None

    class Config:
        from_attributes = True


class RoleOut(BaseModel):
    id: int
    name: str
    description: str
    permissions: list[str]
    user_count: int = 0

    class Config:
        from_attributes = True


class RoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=32)
    description: str = Field(default="", max_length=256)


class RoleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=32)
    description: str | None = Field(default=None, max_length=256)


class PermissionOut(BaseModel):
    id: int
    code: str
    description: str

    class Config:
        from_attributes = True


class PaginatedUserOut(BaseModel):
    """Paginated user list response."""
    items: list[UserOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class ImportResultOut(BaseModel):
    """Result of Excel user import."""
    created: int
    errors: list[str]
    warnings: list[str] = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_current_user(request: Request) -> dict:
    """Extract current user info from request state (set by middleware)."""
    user = getattr(request.state, "user", None)
    if not user:
        logger.debug("Not authenticated: user not found in request state")
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "username": user,
        "user_id": getattr(request.state, "user_id", ""),
        "roles": getattr(request.state, "roles", []),
        "jti": getattr(request.state, "jti", ""),
    }


def _require_admin(request: Request) -> dict:
    """Require the current user to have the admin role."""
    info = _get_current_user(request)
    if "admin" not in info["roles"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return info


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/login", response_model=JWTLoginResponse)
async def jwt_login(
    req: JWTLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate and return a JWT access token."""
    user = await authenticate_user(db, req.username, req.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    role_names = [ur.role.name for ur in user.user_roles]
    try:
        token = await create_access_token(
            user_id=user.id,
            username=user.username,
            roles=role_names,
        )
    except Exception as exc:
        logger.error("Failed to create access token for %s: %s", user.username, exc)
        raise HTTPException(
            status_code=503,
            detail="Session service unavailable. Please try again later.",
        ) from exc
    return JWTLoginResponse(token=token, username=user.username, roles=role_names)


@router.post("/register", response_model=JWTLoginResponse)
async def jwt_register(
    req: JWTRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user.

    The register endpoint does **not** require authentication.
    - If no users exist yet, the first user automatically gets admin role.
    - If users already exist, unauthenticated callers can only create
      users with the "user" role; authenticated admins may assign any role.
    """
    # Check if any users exist — first user gets admin automatically
    existing_users = await list_users(db)
    if existing_users:
        # Check if the caller is authenticated
        caller = getattr(request.state, "user", None)
        if caller:
            # Authenticated: only admins may assign arbitrary roles
            info = _get_current_user(request)
            if "admin" not in info["roles"]:
                req.role_names = ["user"]
        else:
            # Unauthenticated: restrict to "user" role only
            req.role_names = ["user"]
    else:
        # First user is always admin
        req.role_names = ["admin"]

    try:
        user = await create_user(db, req.username, req.password, req.role_names)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    role_names = [ur.role.name for ur in user.user_roles]
    try:
        token = await create_access_token(
            user_id=user.id,
            username=user.username,
            roles=role_names,
        )
    except Exception as exc:
        logger.error("Failed to create access token for %s: %s", user.username, exc)
        raise HTTPException(
            status_code=503,
            detail="User created but session service unavailable. Please login again.",
        ) from exc
    return JWTLoginResponse(token=token, username=user.username, roles=role_names)


@router.get("/status", response_model=JWTStatusResponse)
async def jwt_status():
    """Check JWT authentication mode status."""
    return JWTStatusResponse(
        mode="jwt",
        enabled=True,
    )


@router.post("/logout")
async def jwt_logout(request: Request):
    """Logout by blacklisting the current token."""
    info = _get_current_user(request)
    jti = info.get("jti", "")
    if jti:
        await revoke_token(jti)
    return {"message": "Logged out successfully"}


@router.post("/verify", response_model=JWTVerifyResponse)
async def jwt_verify(request: Request):
    """Verify the current Bearer token is still valid."""
    info = _get_current_user(request)
    return JWTVerifyResponse(
        valid=True,
        username=info["username"],
        roles=info["roles"],
    )


@router.post("/change-password")
async def jwt_change_password(
    req: JWTChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's password."""
    info = _get_current_user(request)
    user_id = int(info["user_id"])
    success, message = await update_user_password(db, user_id, req.new_password, req.new_password_repeat)
    if not success:
        raise HTTPException(status_code=401, detail=message)
    return {"message": "Password changed successfully"}


# ---------------------------------------------------------------------------
# Admin-only endpoints
# ---------------------------------------------------------------------------


@router.get("/users", response_model=list[UserOut])
async def jwt_list_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only)."""
    _require_admin(request)
    users = await list_users(db)
    dept_map = await get_user_department_names_map(db, [u.id for u in users])
    return [
        UserOut(
            id=u.id,
            username=u.username,
            is_active=u.is_active,
            roles=[ur.role.name for ur in u.user_roles],
            department_name=dept_map.get(u.id),
        )
        for u in users
    ]


@router.delete("/users/{user_id}")
async def jwt_delete_user(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete a user (admin only)."""
    _require_admin(request)
    success = await delete_user(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


@router.put("/users/{user_id}/roles")
async def jwt_assign_user_roles(
    user_id: int,
    req: JWTAssignRolesRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Assign roles to a user (admin only). Replaces existing roles."""
    _require_admin(request)
    # Remove all existing roles first, then assign new ones
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    existing_role_ids = [ur.role_id for ur in user.user_roles]
    if existing_role_ids:
        await remove_roles(db, user_id, existing_role_ids)

    await assign_roles(db, user_id, req.role_ids)
    return {"message": "Roles updated"}


@router.get("/roles", response_model=list[RoleOut])
async def jwt_list_roles(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List all roles with their permissions and user count (admin only)."""
    _require_admin(request)
    roles = await list_roles(db)
    result = []
    for r in roles:
        user_count = await count_users_with_role(db, r.id)
        result.append(
            RoleOut(
                id=r.id,
                name=r.name,
                description=r.description,
                permissions=[rp.permission.code for rp in r.role_permissions],
                user_count=user_count,
            )
        )
    return result


@router.post("/roles/create", response_model=RoleOut)
async def jwt_create_role(
    req: RoleCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new role (admin only)."""
    _require_admin(request)
    try:
        role = await create_role(db, req.name, req.description)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return RoleOut(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=[rp.permission.code for rp in role.role_permissions],
        user_count=0,
    )


@router.put("/roles/{role_id}", response_model=RoleOut)
async def jwt_update_role(
    role_id: int,
    req: RoleUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update a role's name and/or description (admin only)."""
    _require_admin(request)
    try:
        role = await update_role(db, role_id, req.name, req.description)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    user_count = await count_users_with_role(db, role.id)
    return RoleOut(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=[rp.permission.code for rp in role.role_permissions],
        user_count=user_count,
    )


@router.delete("/roles/{role_id}")
async def jwt_delete_role(
    role_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete a role (admin only). Refuses if users are assigned to it."""
    _require_admin(request)
    success, message = await delete_role(db, role_id)
    if not success:
        raise HTTPException(status_code=409, detail=message)
    return {"message": message}


@router.get("/permissions", response_model=list[PermissionOut])
async def jwt_list_permissions(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List all permissions (admin only)."""
    _require_admin(request)
    perms = await list_permissions(db)
    return [
        PermissionOut(id=p.id, code=p.code, description=p.description)
        for p in perms
    ]


# ---------------------------------------------------------------------------
# Admin-only endpoints (user management page)
# ---------------------------------------------------------------------------


@router.get("/users/paginated", response_model=PaginatedUserOut)
async def jwt_list_users_paginated(
    page: int = 1,
    page_size: int = 10,
    username: Optional[str] = None,
    role: Optional[str] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Paginated user list with optional search/filter (admin only)."""
    _require_admin(request)
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 100:
        page_size = 10

    users, total = await list_users_paginated(
        db, page=page, page_size=page_size,
        username=username, role_name=role,
    )
    dept_map = await get_user_department_names_map(db, [u.id for u in users])
    total_pages = math.ceil(total / page_size) if total > 0 else 0
    return PaginatedUserOut(
        items=[
            UserOut(
                id=u.id,
                username=u.username,
                is_active=u.is_active,
                roles=[ur.role.name for ur in u.user_roles],
                department_name=dept_map.get(u.id),
            )
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/users/create", response_model=UserOut)
async def jwt_create_user(
    req: UserCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new user (admin only)."""
    _require_admin(request)
    
    dept = None
    # Validate department existence BEFORE creating user to ensure atomicity.
    # create_user() commits internally, so we must fail-fast if dept is invalid.
    if req.department_id is not None:
        from ...department.models import Department
        dept = await db.get(Department, req.department_id)
        if dept is None:
            raise HTTPException(
                status_code=400,
                detail=f"Department with id={req.department_id} not found",
            )

    try:
        user = await create_user(db, req.username, req.password, req.role_names)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Set department — already validated above, won't raise ValueError
    await set_user_department(db, user.id, req.department_id)

    return UserOut(
        id=user.id,
        username=user.username,
        is_active=user.is_active,
        roles=[ur.role.name for ur in user.user_roles],
        department_name=dept.department_name if dept else None,
    )


@router.put("/users/{user_id}", response_model=UserOut)
async def jwt_update_user(
    user_id: int,
    req: UserUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update user info (department, roles) (admin only)."""
    _require_admin(request)
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Update department if provided
    if req.department_id is not None:
        try:
            await set_user_department(db, user_id, req.department_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    elif "department_id" in (req.model_fields_set or set()):
        # Explicitly passed as null -> clear department
        await set_user_department(db, user_id, None)

    # Update roles if provided
    if req.role_ids is not None:
        existing_role_ids = [ur.role_id for ur in user.user_roles]
        if existing_role_ids:
            await remove_roles(db, user_id, existing_role_ids)
        await assign_roles(db, user_id, req.role_ids)
        # Re-fetch user to get updated roles
        user = await get_user_by_id(db, user_id)

    dept = await get_user_department(db, user_id)
    return UserOut(
        id=user.id,
        username=user.username,
        is_active=user.is_active,
        roles=[ur.role.name for ur in user.user_roles],
        department_name=dept.department_name if dept else None,
    )


@router.post("/users/batch-delete")
async def jwt_batch_delete_users(
    req: BatchDeleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple users by IDs (admin only)."""
    _require_admin(request)
    deleted = await batch_delete_users(db, req.user_ids)
    return {"message": f"Deleted {deleted} user(s)"}


@router.put("/users/{user_id}/reset-password")
async def jwt_reset_user_password(
    user_id: int,
    req: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Reset a user's password (admin only)."""
    _require_admin(request)
    success, message = await reset_user_password(db, user_id, req.new_password)
    if not success:
        raise HTTPException(status_code=404, detail=message)
    return {"message": message}


@router.post("/users/import", response_model=ImportResultOut)
async def jwt_import_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Import users from an Excel file (admin only).

    Expected columns: username, password, role (comma-separated, optional).
    """
    _require_admin(request)

    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type:
        raise HTTPException(
            status_code=400,
            detail="Content-Type must be multipart/form-data",
        )

    form = await request.form()
    file = form.get("file")
    if file is None:
        raise HTTPException(status_code=400, detail="No file uploaded")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    created, errors, warnings = await import_users_from_excel(db, file_bytes)
    return ImportResultOut(created=created, errors=errors, warnings=warnings)
