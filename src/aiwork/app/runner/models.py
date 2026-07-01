# -*- coding: utf-8 -*-
"""Chat models for runner with UUID management."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator
from agentscope_runtime.engine.schemas.agent_schemas import Message

from ..channels.schema import DEFAULT_CHANNEL


class ChatType(str, Enum):
    """Chat type: group message (gm) or direct message (dm)."""

    GM = "gm"
    DM = "dm"


def _get_user_now() -> datetime:
    """Return the current datetime in the configured user timezone.

    Wraps ``get_user_now()`` with lazy import to avoid circular import
    issues at module-load time.
    """
    from ...config.timezone import get_user_now

    return get_user_now()


class ChatSpec(BaseModel):
    """Chat specification with UUID identifier.

    Stored in Redis and can be persisted in JSON file.
    """

    id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Chat UUID identifier",
    )
    name: str = Field(default="New Chat", description="Chat name")
    session_id: str = Field(
        ...,
        description="Session identifier (channel:user_id format)",
    )
    out_sender_id: str = Field(
        default="",
        description="External platform sender ID (e.g., WeCom userid, DingTalk userId)",
        exclude=True,
    )
    user_id: str = Field(
        default="",
        description="JWT user ID for per-user directory routing and isolation",
        exclude=True,
    )
    channel: str = Field(default=DEFAULT_CHANNEL, description="Channel name")
    chat_type: str = Field(
        default=ChatType.DM,
        description="Chat type: 'gm' (group message) or 'dm' (direct message)",
    )
    created_at: datetime = Field(
        default_factory=lambda: _get_user_now(),
        description="Chat creation timestamp (user timezone)",
    )
    updated_at: datetime = Field(
        default_factory=lambda: _get_user_now(),
        description="Chat last update timestamp (user timezone)",
    )
    meta: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata",
    )
    status: str = Field(
        default="idle",
        description="Conversation status: idle or running",
    )
    pinned: bool = Field(
        default=False,
        description="Whether the chat is pinned to the top",
    )

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_fields(cls, data: Any) -> Any:
        """Migrate old field names to current schema.

        Old schema (before 2026-06-17):
          - "user_id"      = platform sender_id (now out_sender_id)
          - "owner_user_id"= JWT user_id (now user_id)

        New schema:
          - "out_sender_id"= platform sender_id
          - "user_id"      = JWT user_id

        Detects old format by absence of "out_sender_id" key.
        """
        if not isinstance(data, dict):
            return data

        # If out_sender_id is missing but user_id is present, this is
        # old-format data where "user_id" held the platform sender_id.
        if "out_sender_id" not in data and "user_id" in data:
            data["out_sender_id"] = data.pop("user_id")

        # Migrate owner_user_id (old JWT field) → user_id (current JWT field).
        # Only applies when owner_user_id is explicitly present (old format)
        # and user_id is not already set by the block above or by new format.
        if "owner_user_id" in data:
            if "user_id" not in data:
                data["user_id"] = data.pop("owner_user_id")
            else:
                data.pop("owner_user_id")  # already have user_id from new format

        return data


class ChatUpdate(BaseModel):
    """Mutable chat fields accepted from external clients.

    Chat identity and system-managed fields stay read-only. The update API is
    currently used for renaming chats, so only externally mutable fields belong
    here.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, description="Chat name")
    pinned: bool | None = Field(
        default=None,
        description="Whether the chat is pinned to the top",
    )


class ChatHistory(BaseModel):
    """Complete chat view with spec and state."""

    messages: list[Message] = Field(default_factory=list)
    status: str = Field(
        default="idle",
        description="Conversation status: idle or running",
    )


class ChatsFile(BaseModel):
    """Chat registry file for JSON repository.

    Stores chat_id (UUID) -> session_id mappings for persistence.
    """

    version: int = 1
    chats: list[ChatSpec] = Field(default_factory=list)
