# -*- coding: utf-8 -*-
"""SQLAlchemy ORM models for the department module.

Two tables:
- ``departments``: basic info and self-referential tree structure.
- ``sub_job_nodes``: sub-job tasks linked via department_id.

Uses the same Base as auth_jwt so that init_db() creates these tables
alongside the auth tables.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..app.auth_jwt.models import Base


class Department(Base):
    """Organization-structure node (self-referential tree)."""

    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    parent_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        index=True,
    )
    department_name: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    position_title: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    ai_empowerment_level: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    efficiency_improvement_percent: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    job_desc: Mapped[str | None] = mapped_column(
        String(512), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )


class SubJobNode(Base):
    """Sub-job task node linked to a department (many per department)."""

    __tablename__ = "sub_job_nodes"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    department_id: Mapped[int] = mapped_column(
        Integer, nullable=False, index=True,
    )
    job_title: Mapped[str] = mapped_column(
        String(256), nullable=False,
    )
    job_desc: Mapped[str | None] = mapped_column(
        String(512), nullable=True,
    )
    agent_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True,
    )
    manual_task: Mapped[str] = mapped_column(
        String(1024), nullable=False, default="",
    )
    agent_task: Mapped[str] = mapped_column(
        String(1024), nullable=False, default="",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )


class UserProfile(Base):
    """User extension profile (currently carries department assignment).

    Decoupled from the ``users`` table so that introducing per-user business
    attributes (department, future fields) does not require ALTER TABLE on
    the live ``users`` table. Records are created lazily on first access.
    """

    __tablename__ = "user_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_profiles_user"),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer, nullable=False, index=True,
    )
    department_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )
