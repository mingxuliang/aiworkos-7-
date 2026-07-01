# -*- coding: utf-8 -*-
"""SQLAlchemy ORM model for LLM output records.

Stores the mapping between LLM-generated output files and users,
enabling users to look up their interaction result files later.

The actual file blobs are stored in the ``aiwork-llm-output`` MinIO bucket;
this table tracks metadata and the object key for retrieval.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..config.timezone import get_user_now_naive
from ..app.auth_jwt.models import Base


class LlmOutputRecord(Base):
    """Metadata record for an LLM interaction output file stored in MinIO."""

    __tablename__ = "llm_output_records"
    __table_args__ = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True,
        comment="User who triggered the file generation",
    )
    session_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True,
        comment="Chat session during which the file was generated",
    )
    agent_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True,
        comment="Agent workspace that generated the file",
    )
    object_key: Mapped[str] = mapped_column(
        String(512), nullable=False, unique=True,
        comment="MinIO object key in the aiwork-llm-output bucket",
    )
    original_filename: Mapped[str] = mapped_column(
        String(256), nullable=False,
        comment="Original filename as seen by the user",
    )
    file_size: Mapped[int] = mapped_column(
        Integer, nullable=False,
        comment="File size in bytes",
    )
    mime_type: Mapped[str] = mapped_column(
        String(128), nullable=False,
        comment="MIME type of the file",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=get_user_now_naive,
        comment="When the record was created",
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False,
        comment="Soft-delete flag",
    )
