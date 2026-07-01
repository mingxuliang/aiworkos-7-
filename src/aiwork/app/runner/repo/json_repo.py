# -*- coding: utf-8 -*-
"""JSON-based chat repository."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from .base import BaseChatRepository
from ..models import ChatsFile


class JsonChatRepository(BaseChatRepository):
    """chats.json repository (single-file storage).

    Stores chat_id (UUID) -> session_id mappings in a JSON file.
    Similar to JsonJobRepository pattern from crons.

    Notes:
    - Single-machine, no cross-process lock.
    - Atomic write: write tmp then replace.
    """

    def __init__(self, path: Path | str):
        """Initialize JSON chat repository.

        Args:
            path: Path to chats.json file
        """
        if isinstance(path, str):
            path = Path(path)
        self._path = path.expanduser()

    @property
    def path(self) -> Path:
        """Get the repository file path."""
        return self._path

    @classmethod
    def for_user(cls, workspace_dir: Path | str, user_id: str) -> "JsonChatRepository":
        """Create a per-user chat repository.

        Constructs path: workspace_dir/users/{user_id}/chats.json

        Args:
            workspace_dir: Agent workspace directory
            user_id: User ID for per-user isolation

        Returns:
            JsonChatRepository scoped to the user's chats.json
        """
        if isinstance(workspace_dir, str):
            workspace_dir = Path(workspace_dir)
        user_dir = workspace_dir.expanduser() / "users" / str(user_id)
        return cls(user_dir / "chats.json")

    async def load(self) -> ChatsFile:
        """Load chat specs from JSON file.

        Returns:
            ChatsFile with all chat specs
        """
        if not self._path.exists():
            return ChatsFile(version=1, chats=[])

        data = json.loads(self._path.read_text(encoding="utf-8"))
        return ChatsFile.model_validate(data)

    async def save(self, chats_file: ChatsFile) -> None:
        """Save chat specs to JSON file atomically.

        Args:
            chats_file: ChatsFile to persist
        """
        # Create parent directory if needed
        self._path.parent.mkdir(parents=True, exist_ok=True)

        # Write to temp file first (atomic write)
        tmp_path = self._path.with_suffix(self._path.suffix + ".tmp")
        payload = chats_file.model_dump(mode="json")

        # out_sender_id and user_id have exclude=True to hide them from API
        # responses, but they MUST be persisted in JSON for query filtering
        # and per-user directory routing.
        # model_dump() skips excluded fields, so we re-inject here.
        chats_payload = payload.get("chats", [])
        for i, chat_spec in enumerate(chats_file.chats):
            if i < len(chats_payload):
                chats_payload[i]["out_sender_id"] = chat_spec.out_sender_id
                chats_payload[i]["user_id"] = chat_spec.user_id

        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )

        # Atomic replace (shutil.move handles cross-disk on Windows)
        shutil.move(str(tmp_path), str(self._path))
