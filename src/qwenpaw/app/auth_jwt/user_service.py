# -*- coding: utf-8 -*-
"""User CRUD service layer for JWT authentication.

All database operations are async and use SQLAlchemy sessions.
Password hashing uses passlib bcrypt.
"""
from __future__ import annotations

import logging
from typing import Optional

from passlib.context import CryptContext
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import User, Role, Permission, UserRole, RolePermission

logger = logging.getLogger(__name__)

# Passlib context for bcrypt hashing
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return _pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------


async def create_user(
    session: AsyncSession,
    username: str,
    password: str,
    role_names: list[str] | None = None,
) -> User:
    """Create a new user with the given roles.

    Args:
        session: Async DB session.
        username: Unique username.
        password: Plaintext password (will be hashed).
        role_names: List of role names to assign (default: ["user"]).

    Returns:
        The created User instance.

    Raises:
        ValueError: If username already exists or role not found.
    """
    if role_names is None:
        role_names = ["user"]

    # Check uniqueness
    existing = await session.execute(
        select(User).where(User.username == username),
    )
    if existing.scalar_one_or_none() is not None:
        raise ValueError(f"Username '{username}' already exists")

    pw_hash = hash_password(password)
    user = User(username=username, password_hash=pw_hash)
    session.add(user)
    await session.flush()

    # Assign roles
    roles_result = await session.execute(
        select(Role).where(Role.name.in_(role_names)),
    )
    roles = roles_result.scalars().all()
    found_names = {r.name for r in roles}
    missing = set(role_names) - found_names
    if missing:
        raise ValueError(f"Roles not found: {missing}")

    for role in roles:
        session.add(UserRole(user_id=user.id, role_id=role.id))

    await session.commit()
    await session.refresh(user)
    logger.info("User created: %s (roles=%s)", username, role_names)
    return user


async def authenticate_user(
    session: AsyncSession,
    username: str,
    password: str,
) -> Optional[User]:
    """Authenticate a user by username and password.

    Returns:
        User instance if valid, None otherwise.
    """
    result = await session.execute(
        select(User)
        .where(User.username == username, User.is_active.is_(True))
        .options(selectinload(User.user_roles).selectinload(UserRole.role)),
    )
    user = result.scalar_one_or_none()
    if user is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def get_user_by_id(
    session: AsyncSession,
    user_id: int,
) -> Optional[User]:
    """Get a user by their database ID."""
    result = await session.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.user_roles).selectinload(UserRole.role)),
    )
    return result.scalar_one_or_none()


async def get_user_by_username(
    session: AsyncSession,
    username: str,
) -> Optional[User]:
    """Get a user by their username."""
    result = await session.execute(
        select(User)
        .where(User.username == username)
        .options(selectinload(User.user_roles).selectinload(UserRole.role)),
    )
    return result.scalar_one_or_none()


async def list_users(session: AsyncSession) -> list[User]:
    """List all users with their roles eagerly loaded."""
    result = await session.execute(
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .order_by(User.id),
    )
    return list(result.scalars().all())


async def delete_user(session: AsyncSession, user_id: int) -> bool:
    """Delete a user by ID.

    Returns:
        True if a user was deleted.
    """
    user = await get_user_by_id(session, user_id)
    if user is None:
        return False
    # Cascade will handle UserRole deletions
    await session.delete(user)
    await session.commit()
    logger.info("User deleted: id=%d", user_id)
    return True


async def update_user_password(
    session: AsyncSession,
    user_id: int,
    old_password: str,
    new_password: str,
) -> bool:
    """Update a user's password after verifying the old one.

    Returns:
        True on success, False if old password is incorrect.
    """
    user = await get_user_by_id(session, user_id)
    if user is None:
        return False
    if not verify_password(old_password, user.password_hash):
        return False
    user.password_hash = hash_password(new_password)
    await session.commit()
    logger.info("Password updated for user id=%d", user_id)
    return True


# ---------------------------------------------------------------------------
# Role management
# ---------------------------------------------------------------------------


async def assign_roles(
    session: AsyncSession,
    user_id: int,
    role_ids: list[int],
) -> bool:
    """Assign roles to a user (adds new, keeps existing).

    Returns:
        True on success.
    """
    # Get existing role assignments
    result = await session.execute(
        select(UserRole).where(UserRole.user_id == user_id),
    )
    existing_role_ids = {ur.role_id for ur in result.scalars().all()}

    for rid in role_ids:
        if rid not in existing_role_ids:
            session.add(UserRole(user_id=user_id, role_id=rid))

    await session.commit()
    logger.info("Roles assigned: user_id=%d role_ids=%s", user_id, role_ids)
    return True


async def remove_roles(
    session: AsyncSession,
    user_id: int,
    role_ids: list[int],
) -> bool:
    """Remove specific roles from a user.

    Returns:
        True on success.
    """
    for rid in role_ids:
        await session.execute(
            delete(UserRole).where(
                UserRole.user_id == user_id,
                UserRole.role_id == rid,
            ),
        )
    await session.commit()
    logger.info("Roles removed: user_id=%d role_ids=%s", user_id, role_ids)
    return True


async def list_roles(session: AsyncSession) -> list[Role]:
    """List all roles."""
    result = await session.execute(
        select(Role).options(
            selectinload(Role.role_permissions).selectinload(
                RolePermission.permission,
            ),
        ),
    )
    return list(result.scalars().all())


async def list_permissions(session: AsyncSession) -> list[Permission]:
    """List all permissions."""
    result = await session.execute(select(Permission))
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Permission checking
# ---------------------------------------------------------------------------


async def check_permission(
    session: AsyncSession,
    user_id: int,
    permission_code: str,
) -> bool:
    """Check if a user has a specific permission through any of their roles.

    Args:
        session: Async DB session.
        user_id: The user's database ID.
        permission_code: Permission code string (e.g. "agent:chat").

    Returns:
        True if the user has the permission.
    """
    # Get the user's role IDs
    result = await session.execute(
        select(UserRole.role_id).where(UserRole.user_id == user_id),
    )
    role_ids = [row[0] for row in result.all()]
    if not role_ids:
        return False

    # Get permission ID
    perm_result = await session.execute(
        select(Permission.id).where(Permission.code == permission_code),
    )
    perm_id = perm_result.scalar_one_or_none()
    if perm_id is None:
        return False

    # Check if any of the user's roles have this permission
    rp_result = await session.execute(
        select(RolePermission).where(
            RolePermission.role_id.in_(role_ids),
            RolePermission.permission_id == perm_id,
        ),
    )
    return rp_result.scalar_one_or_none() is not None


def user_has_role(user: User, role_name: str) -> bool:
    """Check if a loaded User object has a specific role.

    Uses the in-memory user_roles relationship (no DB query).
    """
    return any(ur.role.name == role_name for ur in user.user_roles)
