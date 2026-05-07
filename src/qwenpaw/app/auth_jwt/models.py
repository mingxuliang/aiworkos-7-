# -*- coding: utf-8 -*-
"""SQLAlchemy ORM models for JWT authentication.

Three-table RBAC: User, Role, Permission with association tables.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Boolean, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    """Declarative base for all auth models."""
    pass


# ---------------------------------------------------------------------------
# Association tables (many-to-many)
# ---------------------------------------------------------------------------


class UserRole(Base):
    """User-Role association table."""

    __tablename__ = "user_roles"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), primary_key=True,
    )
    role_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("roles.id"), primary_key=True,
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="user_roles")
    role: Mapped["Role"] = relationship(back_populates="role_users")


class RolePermission(Base):
    """Role-Permission association table."""

    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("roles.id"), primary_key=True,
    )
    permission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("permissions.id"), primary_key=True,
    )

    # Relationships
    role: Mapped["Role"] = relationship(back_populates="role_permissions")
    permission: Mapped["Permission"] = relationship(
        back_populates="permission_roles",
    )


# ---------------------------------------------------------------------------
# Core entities
# ---------------------------------------------------------------------------


class User(Base):
    """User account stored in MySQL."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False,
    )
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    # Relationships
    user_roles: Mapped[list["UserRole"]] = relationship(
        back_populates="user", cascade="all, delete-orphan",
    )

    @property
    def roles(self) -> list["Role"]:
        """Convenience: return Role objects from user_roles."""
        return [ur.role for ur in self.user_roles]


class Role(Base):
    """Role definition (e.g. admin, user, guest)."""

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(256), default="")

    # Relationships
    role_users: Mapped[list["UserRole"]] = relationship(
        back_populates="role", cascade="all, delete-orphan",
    )
    role_permissions: Mapped[list["RolePermission"]] = relationship(
        back_populates="role", cascade="all, delete-orphan",
    )

    @property
    def permissions(self) -> list["Permission"]:
        """Convenience: return Permission objects from role_permissions."""
        return [rp.permission for rp in self.role_permissions]


class Permission(Base):
    """Permission definition (e.g. agent:chat, settings:write)."""

    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(256), default="")

    # Relationships
    permission_roles: Mapped[list["RolePermission"]] = relationship(
        back_populates="permission", cascade="all, delete-orphan",
    )


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

DEFAULT_ROLES: list[dict] = [
    {"name": "admin", "description": "Full system access"},
    {"name": "user", "description": "Standard user access"},
    {"name": "guest", "description": "Read-only / limited access"},
]

DEFAULT_PERMISSIONS: list[dict] = [
    {"code": "agent:chat", "description": "Chat with agents"},
    {"code": "agent:manage", "description": "Create/delete agents"},
    {"code": "settings:read", "description": "View settings"},
    {"code": "settings:write", "description": "Modify settings"},
    {"code": "skills:manage", "description": "Install/remove skills"},
    {"code": "providers:manage", "description": "Configure model providers"},
    {"code": "channels:manage", "description": "Configure channels"},
    {"code": "users:manage", "description": "Manage users and roles"},
    {"code": "system:admin", "description": "Full system administration"},
]

# admin gets all permissions; user gets chat + settings:read; guest gets chat only
ROLE_PERMISSION_MAP: dict[str, list[str]] = {
    "admin": [p["code"] for p in DEFAULT_PERMISSIONS],
    "user": ["agent:chat", "settings:read"],
    "guest": ["agent:chat"],
}
