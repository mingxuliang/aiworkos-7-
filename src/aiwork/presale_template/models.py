# -*- coding: utf-8 -*-
"""SQLAlchemy ORM models for the presale template module.

Two tables:
- ``presale_templates``: PPT template metadata (blob stored in MinIO).
- ``presale_upload_sessions``: internal tracking for multipart uploads.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from ..config.timezone import get_user_now_naive

from ..app.auth_jwt.models import Base


# ---------------------------------------------------------------------------
# PresaleTemplate
# ---------------------------------------------------------------------------

# Allowed MIME types for PPT templates
ALLOWED_PPT_MIME_TYPES: frozenset[str] = frozenset({
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
})

ALLOWED_PPT_EXTENSIONS: frozenset[str] = frozenset({".ppt", ".pptx"})


class PresaleTemplate(Base):
    """PPT template metadata — blob is stored in MinIO under object_key."""

    __tablename__ = "presale_templates"
    __table_args__ = (
        Index("idx_pt_deleted_created", "is_deleted", "created_at"),
        Index("idx_pt_object_key", "object_key", unique=True),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    name: Mapped[str] = mapped_column(
        String(256), nullable=False, comment="模板名称",
    )
    description: Mapped[str] = mapped_column(
        String(1024), nullable=False, default="", comment="模板描述/适用场景",
    )
    object_key: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="MinIO 存储路径",
    )
    original_name: Mapped[str] = mapped_column(
        String(256), nullable=False, comment="原始文件名",
    )
    file_size: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="文件大小(字节)",
    )
    mime_type: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="MIME 类型",
    )
    file_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="SHA256 哈希",
    )
    created_by: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="上传者用户ID",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive, comment="创建时间",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=get_user_now_naive, onupdate=get_user_now_naive, comment="更新时间",
    )
    is_deleted: Mapped[bool] = mapped_column(
        Integer, default=0, nullable=False, comment="软删除标记",
    )


# ---------------------------------------------------------------------------
# PresaleUploadSession (internal — not exposed to callers)
# ---------------------------------------------------------------------------


class PresaleUploadSession(Base):
    """Internal tracking for in-progress multipart uploads.

    Created automatically by the upload endpoint when the file exceeds
    the chunk threshold.  Converted to a PresaleTemplate on successful
    completion.  Expired sessions are cleaned by a periodic task.
    """

    __tablename__ = "presale_upload_sessions"
    __table_args__ = (
        Index("idx_pus_session_key", "session_key", unique=True),
        Index("idx_pus_expires_cleanup", "status", "expires_at"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    session_key: Mapped[str] = mapped_column(
        String(64), nullable=False,
    )
    upload_id: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="MinIO multipart upload_id",
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
        Text, nullable=True, comment="JSON: [{PartNumber, ETag}]",
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
