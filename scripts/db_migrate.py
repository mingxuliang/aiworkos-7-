#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Standalone database migration script for JWT authentication.

Creates the QwenPaw database, tables, and seeds default roles/permissions.
Designed to be idempotent -- safe to run multiple times.

Usage:
    # Normal: create tables + seed data
    python scripts/db_migrate.py

    # Drop and recreate all tables (DANGEROUS - destroys data)
    python scripts/db_migrate.py --drop

    # Only insert seed data (skip table creation)
    python scripts/db_migrate.py --seed-only

Environment variables:
    QWENPAW_JWT_DB_URL  - MySQL connection URL (read from .env file)
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from urllib.parse import urlparse, urlunparse



# ---------------------------------------------------------------------------
# Ensure the project source is importable
# ---------------------------------------------------------------------------

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

# Read configuration from project root .env file
_env_file = os.path.join(PROJECT_ROOT, ".env")


def _parse_env(path: str) -> dict[str, str]:
    """Parse a simple .env file into a dict (no external dependencies)."""
    values: dict[str, str] = {}
    if not os.path.isfile(path):
        return values
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip()
            # Remove optional surrounding quotes
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
                val = val[1:-1]
            values[key] = val
    return values


_env = _parse_env(_env_file)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("db_migrate")


# ---------------------------------------------------------------------------
# Database URL helpers
# ---------------------------------------------------------------------------


def get_db_url() -> str:
    """Read the database URL from the .env file."""
    db_url = _env.get("QWENPAW_JWT_DB_URL")
    if not db_url:
        raise RuntimeError(
            "QWENPAW_JWT_DB_URL not found in .env file "
            f"({_env_file}). Please configure it before running migration."
        )
    return db_url


def _build_db_only_url(db_url: str) -> str:
    """Strip the database name from the URL to connect to the server only.

    Returns a URL like ``mysql+aiomysql://root:password@localhost:3306/``
    """
    parsed = urlparse(db_url)
    # Remove the path (database name)
    new_parsed = parsed._replace(path="")
    return urlunparse(new_parsed)


def _extract_db_name(db_url: str) -> str:
    """Extract the database name from the URL."""
    parsed = urlparse(db_url)
    path = parsed.path.lstrip("/")
    return path or "aiwork"


# ---------------------------------------------------------------------------
# Core migration logic
# ---------------------------------------------------------------------------


async def ensure_database(db_url: str) -> None:
    """Create the database if it does not exist."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    db_name = _extract_db_name(db_url)
    server_url = _build_db_only_url(db_url)

    logger.info("Ensuring database '%s' exists ...", db_name)
    engine = create_async_engine(server_url, echo=False, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA "
                    "WHERE SCHEMA_NAME = :name"
                ),
                {"name": db_name},
            )
            if result.scalar() is None:
                await conn.execute(
                    text(f"CREATE DATABASE `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                )
                logger.info("Database '%s' created.", db_name)
            else:
                logger.info("Database '%s' already exists.", db_name)
    finally:
        await engine.dispose()


async def create_tables(db_url: str, drop: bool = False) -> None:
    """Create (or recreate) all auth tables."""
    from sqlalchemy.ext.asyncio import create_async_engine
    from qwenpaw.app.auth_jwt.models import Base

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)

    try:
        if drop:
            logger.warning("Dropping ALL auth tables (data will be lost) ...")
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
            logger.info("All auth tables dropped.")

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Auth tables created / verified.")
    finally:
        await engine.dispose()


async def seed_data(db_url: str) -> None:
    """Insert default roles, permissions, and role-permission mappings."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )
    from qwenpaw.app.auth_jwt.models import (
        Role,
        Permission,
        RolePermission,
        DEFAULT_ROLES,
        DEFAULT_PERMISSIONS,
        ROLE_PERMISSION_MAP,
    )

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with factory() as session:
            # --- Permissions ---
            existing_perms = {
                p.code
                for p in (
                    await session.execute(select(Permission))
                ).scalars().all()
            }
            added_perms = 0
            for perm_def in DEFAULT_PERMISSIONS:
                if perm_def["code"] not in existing_perms:
                    session.add(Permission(**perm_def))
                    added_perms += 1
            await session.flush()
            if added_perms:
                logger.info("Added %d new permission(s).", added_perms)

            all_perms = {
                p.code: p.id
                for p in (
                    await session.execute(select(Permission))
                ).scalars().all()
            }

            # --- Roles ---
            existing_roles = {
                r.name
                for r in (await session.execute(select(Role))).scalars().all()
            }
            added_roles = 0
            for role_def in DEFAULT_ROLES:
                if role_def["name"] not in existing_roles:
                    session.add(Role(**role_def))
                    added_roles += 1
            await session.flush()
            if added_roles:
                logger.info("Added %d new role(s).", added_roles)

            all_roles = {
                r.name: r.id
                for r in (await session.execute(select(Role))).scalars().all()
            }

            # --- Role-Permission mappings ---
            existing_rp = {
                (rp.role_id, rp.permission_id)
                for rp in (
                    await session.execute(select(RolePermission))
                ).scalars().all()
            }
            added_rp = 0
            for role_name, perm_codes in ROLE_PERMISSION_MAP.items():
                rid = all_roles.get(role_name)
                if rid is None:
                    continue
                for code in perm_codes:
                    pid = all_perms.get(code)
                    if pid is None:
                        continue
                    if (rid, pid) not in existing_rp:
                        session.add(RolePermission(role_id=rid, permission_id=pid))
                        added_rp += 1
            if added_rp:
                logger.info("Added %d new role-permission mapping(s).", added_rp)

            await session.commit()
            logger.info("Seed data applied successfully.")
    finally:
        await engine.dispose()


async def run_migration(drop: bool = False, seed_only: bool = False) -> None:
    """Run the full migration pipeline."""
    db_url = get_db_url()
    logger.info("Using database URL: %s", db_url.replace(
        # Mask password in logs
        db_url.split("@")[0].rsplit(":", 1)[-1] if "@" in db_url else "***",
        "***",
    ) if "@" in db_url else db_url)

    if not seed_only:
        await ensure_database(db_url)
        await create_tables(db_url, drop=drop)

    await seed_data(db_url)
    logger.info("Migration complete!")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="QwenPaw JWT auth database migration script",
    )
    parser.add_argument(
        "--drop",
        action="store_true",
        help="Drop all auth tables before recreating them (DANGEROUS: destroys data)",
    )
    parser.add_argument(
        "--seed-only",
        action="store_true",
        help="Only insert seed data; skip table creation",
    )
    args = parser.parse_args()

    if args.drop:
        confirm = input(
            "WARNING: This will DELETE all auth tables and data. "
            "Type 'yes' to confirm: "
        )
        if confirm.strip().lower() != "yes":
            print("Aborted.")
            return

    asyncio.run(run_migration(drop=args.drop, seed_only=args.seed_only))


if __name__ == "__main__":
    main()
