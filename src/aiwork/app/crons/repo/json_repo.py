# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import shutil
from pathlib import Path

from .base import BaseJobRepository
from ..models import JobsFile


class JsonJobRepository(BaseJobRepository):
    """jobs.json repository (single-file storage).

    Notes:
    - Single-machine, no cross-process lock.
    - Atomic write: write tmp then replace.
    """

    def __init__(self, path: Path | str):
        if isinstance(path, str):
            path = Path(path)
        self._path = path.expanduser()

    @property
    def path(self) -> Path:
        return self._path

    @classmethod
    def for_user(
        cls, workspace_dir: Path | str, user_id: str,
    ) -> "JsonJobRepository":
        """Create a per-user job repository.

        Constructs path: workspace_dir/users/{user_id}/jobs.json

        Args:
            workspace_dir: Agent workspace directory
            user_id: User ID for per-user isolation

        Returns:
            JsonJobRepository scoped to the user's jobs.json
        """
        if isinstance(workspace_dir, str):
            workspace_dir = Path(workspace_dir)
        user_dir = workspace_dir.expanduser() / "users" / str(user_id)
        return cls(user_dir / "jobs.json")

    async def load(self) -> JobsFile:
        if not self._path.exists():
            return JobsFile(version=1, jobs=[])

        data = json.loads(self._path.read_text(encoding="utf-8"))
        return JobsFile.model_validate(data)

    async def save(self, jobs_file: JobsFile) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)

        tmp_path = self._path.with_suffix(self._path.suffix + ".tmp")
        payload = jobs_file.model_dump(mode="json")

        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        shutil.move(str(tmp_path), str(self._path))
