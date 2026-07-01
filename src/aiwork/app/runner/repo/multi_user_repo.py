# -*- coding: utf-8 -*-
"""Multi-user chat repository that aggregates per-user JSON files.

Each user's chats are stored in workspace_dir/users/{user_id}/chats.json.
A legacy workspace_dir/chats.json file is also loaded for backward
compatibility with chats that have no user_id set.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from .base import BaseChatRepository
from .json_repo import JsonChatRepository
from ..models import ChatSpec, ChatsFile

logger = logging.getLogger(__name__)


class MultiUserChatRepository(BaseChatRepository):
    """Aggregates per-user JsonChatRepository + legacy chats.json.

    The scheduler / channel handlers need to see chats across all users,
    so this composite repository merges per-user files while presenting
    a single BaseChatRepository interface.
    """

    def __init__(self, workspace_dir: Path | str):
        """Initialize multi-user chat repository.

        Args:
            workspace_dir: Agent workspace directory
        """
        if isinstance(workspace_dir, str):
            workspace_dir = Path(workspace_dir)
        self._workspace_dir = workspace_dir.expanduser()
        self._legacy_repo = JsonChatRepository(
            self._workspace_dir / "chats.json",
        )

    @property
    def path(self) -> Path:
        """Return workspace directory (for logging compatibility)."""
        return self._workspace_dir

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_user_repo(self, user_id: str) -> JsonChatRepository:
        """Get per-user JsonChatRepository, creating parent dir if needed.

        Args:
            user_id: User ID

        Returns:
            JsonChatRepository scoped to users/{user_id}/chats.json
        """
        return JsonChatRepository.for_user(self._workspace_dir, user_id)

    def _scan_user_repos(self) -> list[JsonChatRepository]:
        """Scan users/ directory and return repos for existing chat files.

        Returns:
            List of JsonChatRepository instances for each per-user chats.json
        """
        repos: list[JsonChatRepository] = []
        users_dir = self._workspace_dir / "users"
        if not users_dir.is_dir():
            return repos
        for user_path in sorted(users_dir.iterdir()):
            if not user_path.is_dir():
                continue
            chat_file = user_path / "chats.json"
            if chat_file.exists():
                repos.append(JsonChatRepository(chat_file))
        return repos

    # ------------------------------------------------------------------
    # Core load/save
    # ------------------------------------------------------------------

    async def load(self) -> ChatsFile:
        """Merge all per-user + legacy chats into a single ChatsFile.

        Returns:
            ChatsFile with chats from all sources merged
        """
        all_chats: list[ChatSpec] = []

        # Legacy workspace-level file (backward compatibility)
        try:
            legacy = await self._legacy_repo.load()
            all_chats.extend(legacy.chats)
        except Exception:
            logger.warning(
                "Failed to load legacy chats from %s",
                self._legacy_repo.path,
                exc_info=True,
            )

        # Per-user files
        for repo in self._scan_user_repos():
            try:
                user_chats = await repo.load()
                all_chats.extend(user_chats.chats)
            except Exception:
                logger.warning(
                    "Failed to load user chats from %s",
                    repo.path,
                    exc_info=True,
                )

        return ChatsFile(version=1, chats=all_chats)

    async def save(self, chats_file: ChatsFile) -> None:
        """Distribute chats by user_id to per-user files.

        Chats with a user_id are written to users/{user_id}/chats.json.
        Chats without a user_id are written to the legacy workspace-level file.

        Args:
            chats_file: ChatsFile whose chats will be distributed
        """
        # Group chats by user_id
        by_user: dict[str, list[ChatSpec]] = {}
        legacy_chats: list[ChatSpec] = []

        for chat in chats_file.chats:
            # Route by JWT user_id first; fall back to out_sender_id
            # for backward-compatible records.
            uid = (chat.user_id or chat.out_sender_id or "").strip()
            if uid:
                by_user.setdefault(uid, []).append(chat)
            else:
                legacy_chats.append(chat)

        # Save legacy (shared / no-owner chats)
        try:
            await self._legacy_repo.save(
                ChatsFile(version=1, chats=legacy_chats),
            )
        except Exception:
            logger.warning(
                "Failed to save legacy chats to %s",
                self._legacy_repo.path,
                exc_info=True,
            )

        # Save per-user files
        for uid, chats in by_user.items():
            try:
                repo = self._get_user_repo(uid)
                await repo.save(ChatsFile(version=1, chats=chats))
            except Exception:
                logger.warning(
                    "Failed to save user chats for user=%s to %s",
                    uid,
                    self._get_user_repo(uid).path,
                    exc_info=True,
                )

    # ------------------------------------------------------------------
    # Delete (overridden to clean up now-empty per-user files)
    # ------------------------------------------------------------------

    async def delete_chats(self, chat_ids: list[str]) -> bool:
        """Delete chats by id and clean up now-empty per-user files.

        The base ``save()`` only overwrites per-user files for users that
        still have chats.  When the last chat of a user is deleted their
        ``users/{uid}/chats.json`` is left untouched and would resurrect
        the deleted chat on the next ``load()``.  This override explicitly
        writes an empty file for those now-empty user directories.
        """
        if not chat_ids:
            return False

        cf = await self.load()
        before = len(cf.chats)
        cf.chats = [c for c in cf.chats if c.id not in chat_ids]
        if len(cf.chats) == before:
            return False

        await self.save(cf)

        # save() only touches per-user files for users with remaining
        # chats.  Scan existing files and clear any whose chats were all
        # among the deleted set.
        chat_ids_set = set(chat_ids)
        for repo in self._scan_user_repos():
            try:
                user_chats = await repo.load()
                if not user_chats.chats:
                    continue  # already empty, nothing to do
                if all(c.id in chat_ids_set for c in user_chats.chats):
                    await repo.save(ChatsFile(version=1, chats=[]))
                    logger.info(
                        "Cleared now-empty per-user chats file: %s",
                        repo.path,
                    )
            except Exception:
                logger.warning(
                    "Failed to clean up per-user chats file: %s",
                    repo.path,
                    exc_info=True,
                )

        return True

    # ------------------------------------------------------------------
    # Optimised query operations
    # ------------------------------------------------------------------

    async def filter_chats(
        self,
        out_sender_id: Optional[str] = None,
        channel: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> list[ChatSpec]:
        """Filter chats by out_sender_id and/or channel.

        When user_id or out_sender_id is provided, only loads the
        relevant per-user file and the legacy file (for shared chats),
        avoiding a full scan.

        Args:
            out_sender_id: Optional external platform sender ID filter
            channel: Optional channel filter
            user_id: Optional JWT user ID for per-user directory routing

        Returns:
            Filtered list of chat specs
        """
        # Route lookup by JWT user_id first; fall back to out_sender_id.
        route_uid = user_id or out_sender_id
        if route_uid:
            # Optimised: only load the relevant per-user file + legacy
            chats: list[ChatSpec] = []

            # Legacy file may contain shared chats (out_sender_id="")
            try:
                legacy = await self._legacy_repo.load()
                for c in legacy.chats:
                    # Include shared chats (no owner) or chats owned by user
                    cu = (c.out_sender_id or "").strip()
                    if not cu or cu == out_sender_id:
                        if channel is None or c.channel == channel:
                            chats.append(c)
            except Exception:
                logger.warning(
                    "Failed to load legacy chats for filter",
                    exc_info=True,
                )

            # Per-user file for this specific user (route by JWT user_id)
            try:
                user_repo = self._get_user_repo(route_uid)
                user_chats = await user_repo.load()
                for c in user_chats.chats:
                    if channel is None or c.channel == channel:
                        chats.append(c)
            except Exception:
                logger.warning(
                    "Failed to load user chats for filter route_uid=%s",
                    route_uid,
                    exc_info=True,
                )

            return chats

        # No user filter — load all files
        return await super().filter_chats(
            out_sender_id=out_sender_id, channel=channel, user_id=user_id,
        )

    async def get_chat_by_id(
        self,
        session_id: str,
        out_sender_id: str,
        channel: str = "console",
        user_id: str = "",
    ) -> Optional[ChatSpec]:
        """Get chat spec by session_id and out_sender_id.

        When user_id or out_sender_id is provided, only searches the
        relevant per-user file and the legacy file.

        Args:
            session_id: Session identifier
            out_sender_id: External platform sender ID (matching key)
            channel: Channel identifier
            user_id: JWT user ID for per-user directory routing

        Returns:
            ChatSpec or None if not found
        """
        # Search legacy file first (may contain shared chats)
        try:
            legacy = await self._legacy_repo.load()
            for c in legacy.chats:
                if (
                    c.session_id == session_id
                    and c.out_sender_id == out_sender_id
                    and c.channel == channel
                ):
                    return c
        except Exception:
            logger.warning(
                "Failed to search legacy chats for session_id=%s",
                session_id,
                exc_info=True,
            )

        # Search per-user file — route by JWT user_id; fall back to
        # out_sender_id for backward-compatible records.
        route_uid = user_id or out_sender_id
        if route_uid:
            try:
                user_repo = self._get_user_repo(route_uid)
                return await user_repo.get_chat_by_id(
                    session_id, out_sender_id, channel,
                )
            except Exception:
                logger.warning(
                    "Failed to search user chats for route_uid=%s "
                    "session_id=%s out_sender_id=%s",
                    route_uid,
                    session_id,
                    out_sender_id,
                    exc_info=True,
                )

        return None
