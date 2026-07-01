# -*- coding: utf-8 -*-
"""SQLAlchemy ORM models for the file library module.

Three tables:
- ``file_folders``: directory tree via parent_id self-reference.
- ``file_records``: file metadata (blob stored in MinIO).
- ``upload_sessions``: internal tracking for multipart uploads.

All relationships are logical only — no database-level FK constraints,
consistent with the department module convention.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from ..config.timezone import get_user_now_naive

from ..app.auth_jwt.models import Base


# ---------------------------------------------------------------------------
# FileFolder
# ---------------------------------------------------------------------------


class FileFolder(Base):
    """Directory node (self-referential tree via parent_id).

    All relationships are logical only — no FK constraints.
    Referential integrity is maintained in the service layer.
    """

    __tablename__ = "file_folders"
    __table_args__ = (
        Index("idx_ff_parent_deleted", "parent_id", "is_deleted"),
        Index("idx_ff_created_by", "created_by", "is_deleted"),
        UniqueConstraint(
            "parent_id", "name",
            name="uq_ff_parent_name",
        ),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    parent_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True,
    )
    name: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    created_by: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive, onupdate=get_user_now_naive,
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
    )


# ---------------------------------------------------------------------------
# FileRecord
# ---------------------------------------------------------------------------


class FileRecord(Base):
    """File metadata row — blob is stored in MinIO under object_key.

    All association fields are logical (no FK constraints).
    """

    __tablename__ = "file_records"
    __table_args__ = (
        Index("idx_fr_object_key", "object_key", unique=True),
        Index("idx_fr_uploader_list", "uploader_id", "is_deleted", "created_at"),
        Index("idx_fr_folder_uploader", "folder_id", "uploader_id", "is_deleted"),
        Index("idx_fr_hash", "file_hash"),
        Index("idx_fr_mime_uploader", "uploader_id", "is_deleted", "mime_type"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    folder_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True,
    )
    scope_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="user",
    )
    scope_id: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    original_name: Mapped[str] = mapped_column(
        String(256), nullable=False,
    )
    object_key: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    file_size: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    mime_type: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    file_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True,
    )
    uploader_id: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive,
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
    )


# ---------------------------------------------------------------------------
# UploadSession (internal — not exposed to callers)
# ---------------------------------------------------------------------------


class UploadSession(Base):
    """Internal tracking for in-progress multipart uploads.

    Created automatically by the upload endpoint when the file exceeds
    the chunk threshold.  Converted to a FileRecord on successful
    completion.  Expired sessions are cleaned by a periodic task.
    """

    __tablename__ = "upload_sessions"
    __table_args__ = (
        Index("idx_us_session_key", "session_key", unique=True),
        Index("idx_us_expires_cleanup", "status", "expires_at"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    session_key: Mapped[str] = mapped_column(
        String(64), nullable=False,
    )
    upload_id: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    object_key: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    original_name: Mapped[str] = mapped_column(
        String(256), nullable=False,
    )
    mime_type: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    file_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True,
    )
    folder_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
    )
    scope_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="user",
    )
    scope_id: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    uploader_id: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    total_parts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
    )
    total_size: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
    )
    uploaded_parts: Mapped[str | None] = mapped_column(
        Text, nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="uploading",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False,
    )
