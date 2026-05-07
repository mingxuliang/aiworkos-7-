# -*- coding: utf-8 -*-
"""FastAPI router for JWT authentication endpoints.

All routes are prefixed with ``/auth/jwt`` under the main ``/api`` router.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .jwt_utils import create_access_token, decode_token, revoke_token
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
)
from ...constant import AUTH_MODE

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
    password: str = Field(..., min_length=6)
    role_names: list[str] = Field(default_factory=lambda: ["user"])


class JWTChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)


class JWTAssignRolesRequest(BaseModel):
    role_ids: list[int]


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

    class Config:
        from_attributes = True


class RoleOut(BaseModel):
    id: int
    name: str
    description: str
    permissions: list[str]

    class Config:
        from_attributes = True


class PermissionOut(BaseModel):
    id: int
    code: str
    description: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Helpers
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
    token = await create_access_token(
        user_id=user.id,
        username=user.username,
        roles=role_names,
    )
    return JWTLoginResponse(token=token, username=user.username, roles=role_names)


@router.post("/register", response_model=JWTLoginResponse)
async def jwt_register(
    req: JWTRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user (admin only, unless no users exist yet).

    If no users exist in the database, anyone can register the first
    user (who automatically gets the admin role).
    """
    # Check if any users exist — first user gets admin automatically
    existing_users = await list_users(db)
    if existing_users:
        # Subsequent registrations require admin
        _require_admin(request)
        # Override requested roles: non-admins can only create "user" role
        info = _get_current_user(request)
        if "admin" not in info["roles"]:
            req.role_names = ["user"]
    else:
        # First user is always admin
        req.role_names = ["admin"]

    try:
        user = await create_user(db, req.username, req.password, req.role_names)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    role_names = [ur.role.name for ur in user.user_roles]
    token = await create_access_token(
        user_id=user.id,
        username=user.username,
        roles=role_names,
    )
    return JWTLoginResponse(token=token, username=user.username, roles=role_names)


@router.get("/status", response_model=JWTStatusResponse)
async def jwt_status():
    """Check JWT authentication mode status."""
    return JWTStatusResponse(
        mode=AUTH_MODE,
        enabled=AUTH_MODE == "jwt",
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
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="No token provided")

    payload = await decode_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return JWTVerifyResponse(
        valid=True,
        username=payload.get("username", ""),
        roles=payload.get("roles", []),
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
    success = await update_user_password(db, user_id, req.old_password, req.new_password)
    if not success:
        raise HTTPException(status_code=401, detail="Current password is incorrect")
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
    return [
        UserOut(
            id=u.id,
            username=u.username,
            is_active=u.is_active,
            roles=[ur.role.name for ur in u.user_roles],
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
    """List all roles with their permissions (admin only)."""
    _require_admin(request)
    roles = await list_roles(db)
    return [
        RoleOut(
            id=r.id,
            name=r.name,
            description=r.description,
            permissions=[rp.permission.code for rp in r.role_permissions],
        )
        for r in roles
    ]


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
