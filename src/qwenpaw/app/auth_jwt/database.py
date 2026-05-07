# -*- coding: utf-8 -*-
"""Async MySQL database engine, session factory, and initialization.

Reads ``QWENPAW_JWT_DB_URL`` from environment variables.  Provides
``get_db()`` as a FastAPI dependency and ``init_db()`` for startup.
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ...constant import JWT_DB_URL
from .models import (
    Base,
    Role,
    Permission,
    UserRole,
    RolePermission,
    DEFAULT_ROLES,
    DEFAULT_PERMISSIONS,
    ROLE_PERMISSION_MAP,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Engine & session factory (created lazily in init_db)
# ---------------------------------------------------------------------------

_engine = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine():
    """Return the async engine, creating it if necessary."""
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            JWT_DB_URL,
            echo=False,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the async session factory, creating it if necessary."""
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


async def init_db() -> None:
    """Create tables and seed default roles / permissions.

    Called once during application startup when ``QWENPAW_AUTH_MODE=jwt``.
    """
    engine = get_engine()

    # Create all tables (idempotent for existing tables)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("JWT auth database tables created / verified")

    # Seed default data
    factory = get_session_factory()
    async with factory() as session:
        await _seed_roles_and_permissions(session)
    logger.info("JWT auth default roles and permissions seeded")


async def _seed_roles_and_permissions(session: AsyncSession) -> None:
    """Insert default roles and permissions if they do not exist."""
    # --- Permissions ---
    existing_perms = {
        p.code for p in (await session.execute(select(Permission))).scalars().all()
    }
    for perm_def in DEFAULT_PERMISSIONS:
        if perm_def["code"] not in existing_perms:
            session.add(Permission(**perm_def))
    await session.flush()

    # Refresh permission map
    all_perms = {
        p.code: p.id
        for p in (await session.execute(select(Permission))).scalars().all()
    }

    # --- Roles ---
    existing_roles = {
        r.name for r in (await session.execute(select(Role))).scalars().all()
    }
    role_ids: dict[str, int] = {}
    for role_def in DEFAULT_ROLES:
        if role_def["name"] not in existing_roles:
            session.add(Role(**role_def))
    await session.flush()

    all_roles = {
        r.name: r.id
        for r in (await session.execute(select(Role))).scalars().all()
    }
    role_ids.update(all_roles)

    # --- Role-Permission mappings ---
    existing_rp = {
        (rp.role_id, rp.permission_id)
        for rp in (await session.execute(select(RolePermission))).scalars().all()
    }
    for role_name, perm_codes in ROLE_PERMISSION_MAP.items():
        rid = role_ids.get(role_name)
        if rid is None:
            continue
        for code in perm_codes:
            pid = all_perms.get(code)
            if pid is None:
                continue
            if (rid, pid) not in existing_rp:
                session.add(RolePermission(role_id=rid, permission_id=pid))

    await session.commit()


async def close_db() -> None:
    """Dispose of the async engine (called on shutdown)."""
    global _engine, _async_session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _async_session_factory = None
        logger.info("JWT auth database engine disposed")
