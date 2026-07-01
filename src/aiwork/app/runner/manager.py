# -*- coding: utf-8 -*-
"""Chat manager for managing chat specifications."""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from ...config.timezone import get_user_now
from .models import ChatSpec, ChatUpdate
from .repo import BaseChatRepository
from ..channels.schema import DEFAULT_CHANNEL

logger = logging.getLogger(__name__)


class ChatManager:
    """Manages chat specifications in repository.

    Only handles ChatSpec CRUD operations.
    Does NOT manage Redis session state - that's handled by runner's session.

    Similar to CronManager's role in crons module.
    """

    def __init__(
        self,
        *,
        repo: BaseChatRepository,
    ):
        """Initialize chat manager.

        Args:
            repo: Chat spec repository for persistence
        """
        self._repo = repo
        self._lock = asyncio.Lock()
        logger.debug(
            f"ChatManager created with repo path: {repo.path}",
        )

    # ----- Read Operations -----

    async def list_chats(
        self,
        user_id: Optional[str] = None,
        channel: Optional[str] = None,
    ) -> list[ChatSpec]:
        """List chat specs with optional filters.

        Args:
            user_id: Optional user ID filter
            channel: Optional channel filter

        Returns:
            List of chat specifications
        """
        async with self._lock:
            logger.debug(
                f"list_chats: repo path={self._repo.path}, "
                f"filters: user_id={user_id}, channel={channel}",
            )
            return await self._repo.filter_chats(
                channel=channel,
                user_id=user_id,
            )

    async def get_chat(self, chat_id: str) -> Optional[ChatSpec]:
        """Get chat spec by chat_id (UUID).

        Args:
            chat_id: Chat UUID

        Returns:
            Chat spec or None if not found
        """
        async with self._lock:
            return await self._repo.get_chat(chat_id)

    async def get_or_create_chat(
        self,
        session_id: str,
        out_sender_id: str,
        channel: str = DEFAULT_CHANNEL,
        name: str = "New Chat",
        user_id: str = "",
        chat_type: str = "dm",
    ) -> ChatSpec:
        """Get existing chat or create new one.

        Useful for auto-registration when chats come from channels.

        Args:
            session_id: Session identifier (channel:user_id)
            out_sender_id: External platform sender ID (matching key)
            channel: Channel name
            name: Chat name
            user_id: JWT user ID for per-user directory routing
            chat_type: Chat type: 'gm' (group message) or 'dm' (direct message)

        Returns:
            Chat specification (existing or newly created)
        """
        async with self._lock:
            logger.debug(
                f"get_or_create_chat: Searching for existing chat: "
                f"session_id={session_id}, out_sender_id={out_sender_id}, "
                f"channel={channel}, user_id={user_id}",
            )

            # When user_id is known, first look for the user's canonical
            # chat by session_id + channel (ignoring out_sender_id).
            # This handles the console UI viewing a channel-initiated chat
            # where the JWT-authenticated web user differs from the
            # channel bot's out_sender_id.
            if user_id:
                existing = await self._repo.find_chat_by_session_id(
                    session_id, channel,
                )
                if existing and existing.user_id == user_id:
                    logger.debug(
                        "get_or_create_chat: Found user-owned chat by "
                        "session+channel: %s", existing.id,
                    )
                    return existing

            # Exact match by session_id + out_sender_id + channel.
            existing = await self._repo.get_chat_by_id(
                session_id,
                out_sender_id,
                channel,
                user_id=user_id,
            )
            if existing:
                logger.debug(
                    "get_or_create_chat: Found existing chat: %s",
                    existing.id,
                )
                return existing

            # Create new
            logger.debug(
                f"get_or_create_chat: Creating new chat for "
                f"session_id={session_id}",
            )
            spec = ChatSpec(
                session_id=session_id,
                out_sender_id=out_sender_id,
                channel=channel,
                name=name,
                user_id=user_id,
                chat_type=chat_type,
            )
            logger.debug(f"get_or_create_chat: created spec={spec.id}")
            # Call internal create without lock (already locked)
            await self._repo.upsert_chat(spec)
            logger.info(
                f"Auto-registered new chat: {spec.id} -> {session_id}",
            )
            return spec

    async def create_chat(self, spec: ChatSpec) -> ChatSpec:
        """Create a new chat.

        Args:
            spec: Chat specification (chat_id will be generated if not set)

        Returns:
            Chat spec
        """
        async with self._lock:
            await self._repo.upsert_chat(spec)
            return spec

    async def find_out_sender_id_by_session(
        self,
        session_id: str,
        channel: str = DEFAULT_CHANNEL,
    ) -> str:
        """Look up the ``out_sender_id`` from existing chats that share the
        same ``session_id`` and ``channel``.

        Args:
            session_id: Session identifier (e.g. ``"wecom:alice"``)
            channel: Channel identifier

        Returns:
            The existing ``out_sender_id``, or ``""`` if no matching chat
            exists or the matching chat has an empty ``out_sender_id``.
        """
        existing = await self._repo.find_chat_by_session_id(
            session_id, channel,
        )
        if existing and existing.out_sender_id:
            return existing.out_sender_id
        return ""

    async def patch_chat(
        self,
        chat_id: str,
        patch: ChatUpdate,
    ) -> Optional[ChatSpec]:
        """Merge a partial update into the latest persisted chat spec."""
        async with self._lock:
            return await self._patch_locked(chat_id, patch)

    async def patch_chat_if_name_matches(
        self,
        chat_id: str,
        expected_name: str,
        patch: ChatUpdate,
    ) -> Optional[ChatSpec]:
        """Atomic compare-and-set on ``ChatSpec.name``.

        Apply ``patch`` only when the persisted name still equals
        ``expected_name``. The read and write happen under a single lock
        acquisition so a concurrent rename cannot slip in between, which
        is what background tasks like async title generation rely on to
        avoid clobbering a user-chosen name.

        Returns the updated spec on success, ``None`` if the chat does
        not exist or its name no longer matches.
        """
        async with self._lock:
            existing = await self._repo.get_chat(chat_id)
            if existing is None or existing.name != expected_name:
                return None
            return await self._patch_locked(chat_id, patch, existing=existing)

    async def _patch_locked(
        self,
        chat_id: str,
        patch: ChatUpdate,
        *,
        existing: Optional[ChatSpec] = None,
    ) -> Optional[ChatSpec]:
        """Internal patch helper. Caller must hold ``self._lock``."""
        if existing is None:
            existing = await self._repo.get_chat(chat_id)
            if existing is None:
                return None

        updates = patch.model_dump(
            exclude_none=True,
            exclude_unset=True,
        )
        merged = existing.model_copy(update=updates)
        merged.updated_at = get_user_now()
        await self._repo.upsert_chat(merged)
        return merged

    async def touch_chat(self, chat_id: str) -> Optional[ChatSpec]:
        """Refresh updated_at without rewriting other chat fields."""
        return await self.patch_chat(chat_id, ChatUpdate())

    async def delete_chats(self, chat_ids: list[str]) -> bool:
        """Delete a chat spec.

        Note: This only deletes the spec. Redis session state is NOT deleted.

        Args:
            chat_ids: List of chat IDs

        Returns:
            True if deleted, False if not found
        """
        async with self._lock:
            deleted = await self._repo.delete_chats(chat_ids)

            if deleted:
                logger.debug(f"Deleted chats: {chat_ids}")

            return deleted

    async def count_chats(
        self,
        user_id: Optional[str] = None,
        channel: Optional[str] = None,
    ) -> int:
        """Count chats matching filters.

        Args:
            user_id: Optional user ID filter
            channel: Optional channel filter

        Returns:
            Number of matching chats
        """
        async with self._lock:
            chats = await self._repo.filter_chats(
                channel=channel,
                user_id=user_id,
            )
            return len(chats)

    async def get_chat_id_by_session(
        self,
        session_id: str,
        channel: str,
    ) -> str | None:
        """Get chat_id by session_id and channel.

        Args:
            session_id: Normalized session ID (e.g. "console:user1")
            channel: Channel name

        Returns:
            chat_id (UUID) of most recent chat if found, None otherwise

        Note:
            Returns most recently updated chat if multiple matches exist.
            O(N) scan of active chats. Future optimization: add index.
        """
        async with self._lock:
            chats = await self._repo.filter_chats(channel=channel)
            matching_chats = [
                chat for chat in chats if chat.session_id == session_id
            ]

            if not matching_chats:
                logger.debug(
                    f"No chat found for session={session_id[:30]} "
                    f"channel={channel}",
                )
                return None

            most_recent = max(matching_chats, key=lambda c: c.updated_at)
            logger.debug(
                f"Found chat_id={most_recent.id} "
                f"for session={session_id[:30]} "
                f"(from {len(matching_chats)} matches)",
            )
            return most_recent.id
