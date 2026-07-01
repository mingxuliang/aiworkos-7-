# -*- coding: utf-8 -*-
"""Multi-user job repository that aggregates per-user JSON files.

Each user's jobs are stored in workspace_dir/users/{user_id}/jobs.json.
All jobs must have an owner_user_id; there is no legacy fallback file.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from .base import BaseJobRepository
from .json_repo import JsonJobRepository
from ..models import CronJobSpec, JobsFile

logger = logging.getLogger(__name__)


class MultiUserJobRepository(BaseJobRepository):
    """Aggregates per-user JsonJobRepository files.

    The scheduler needs to see jobs across all users, so this composite
    repository merges per-user files while presenting a single
    BaseJobRepository interface.
    """

    def __init__(self, workspace_dir: Path | str):
        """Initialize multi-user job repository.

        Args:
            workspace_dir: Agent workspace directory
        """
        if isinstance(workspace_dir, str):
            workspace_dir = Path(workspace_dir)
        self._workspace_dir = workspace_dir.expanduser()

    @property
    def path(self) -> Path:
        """Return workspace directory (for logging compatibility)."""
        return self._workspace_dir

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_user_repo(self, user_id: str) -> JsonJobRepository:
        """Get per-user JsonJobRepository.

        Args:
            user_id: User ID

        Returns:
            JsonJobRepository scoped to users/{user_id}/jobs.json
        """
        return JsonJobRepository.for_user(self._workspace_dir, user_id)

    def _scan_user_repos(self) -> list[JsonJobRepository]:
        """Scan users/ directory for existing per-user jobs.json files.

        Returns:
            List of JsonJobRepository instances
        """
        repos: list[JsonJobRepository] = []
        users_dir = self._workspace_dir / "users"
        if not users_dir.is_dir():
            return repos
        for user_path in sorted(users_dir.iterdir()):
            if not user_path.is_dir():
                continue
            job_file = user_path / "jobs.json"
            if job_file.exists():
                repos.append(JsonJobRepository(job_file))
        return repos

    # ------------------------------------------------------------------
    # Core load/save
    # ------------------------------------------------------------------

    async def load(self) -> JobsFile:
        """Merge all per-user jobs into a single JobsFile.

        Used by the scheduler at startup to see all jobs across users.

        Returns:
            JobsFile with jobs from all per-user sources merged
        """
        all_jobs: list[CronJobSpec] = []

        for repo in self._scan_user_repos():
            try:
                user_jobs = await repo.load()
                all_jobs.extend(user_jobs.jobs)
            except Exception:
                logger.warning(
                    "Failed to load user jobs from %s",
                    repo.path,
                    exc_info=True,
                )

        return JobsFile(version=1, jobs=all_jobs)

    async def save(self, jobs_file: JobsFile) -> None:
        """Distribute jobs by owner_user_id to per-user files.

        Every job is written to users/{owner_user_id}/jobs.json.
        Jobs without an owner_user_id are logged as a warning and skipped
        — all jobs should carry an owner_user_id set by the API layer.

        Args:
            jobs_file: JobsFile whose jobs will be distributed
        """
        # Group jobs by owner_user_id
        by_user: dict[str, list[CronJobSpec]] = {}

        for job in jobs_file.jobs:
            oid = (job.owner_user_id or "").strip()
            if oid:
                by_user.setdefault(oid, []).append(job)
            else:
                logger.warning(
                    "Skipping job %s without owner_user_id — "
                    "all jobs should be user-scoped",
                    job.id,
                )

        # Save per-user files
        for uid, jobs in by_user.items():
            try:
                repo = self._get_user_repo(uid)
                await repo.save(JobsFile(version=1, jobs=jobs))
            except Exception:
                logger.warning(
                    "Failed to save user jobs for user=%s to %s",
                    uid,
                    self._get_user_repo(uid).path,
                    exc_info=True,
                )

    # ------------------------------------------------------------------
    # Delete (overridden to clean up now-empty per-user files)
    # ------------------------------------------------------------------

    async def delete_job(self, job_id: str) -> bool:
        """Delete a job by id and clean up now-empty per-user files.

        The base ``save()`` only overwrites per-user files for users that
        still have jobs.  When the last job of a user is deleted their
        ``users/{uid}/jobs.json`` is left untouched and would resurrect
        the deleted job on the next ``load()``.  This override explicitly
        writes an empty file for those now-empty user directories.
        """
        jf = await self.load()
        before = len(jf.jobs)
        jf.jobs = [j for j in jf.jobs if j.id != job_id]
        if len(jf.jobs) == before:
            return False

        await self.save(jf)

        # save() only touches per-user files for users with remaining
        # jobs.  Scan existing files and clear any whose jobs were all
        # among the deleted set.
        for repo in self._scan_user_repos():
            try:
                user_jobs = await repo.load()
                if not user_jobs.jobs:
                    continue  # already empty, nothing to do
                if all(j.id == job_id for j in user_jobs.jobs):
                    await repo.save(JobsFile(version=1, jobs=[]))
                    logger.info(
                        "Cleared now-empty per-user jobs file: %s",
                        repo.path,
                    )
            except Exception:
                logger.warning(
                    "Failed to clean up per-user jobs file: %s",
                    repo.path,
                    exc_info=True,
                )

        return True

    # ------------------------------------------------------------------
    # Optimised query operations
    # ------------------------------------------------------------------

    async def list_jobs(
        self,
        owner_user_id: Optional[str] = None,
    ) -> list[CronJobSpec]:
        """List jobs, optionally filtered by owner_user_id.

        When owner_user_id is provided, only loads the relevant per-user
        file.

        Args:
            owner_user_id: Optional owner user ID to filter by

        Returns:
            List of CronJobSpec matching the filter
        """
        if owner_user_id:
            # Optimised: only load the per-user file for this user
            try:
                user_repo = self._get_user_repo(owner_user_id)
                user_jobs = await user_repo.load()
                return user_jobs.jobs
            except Exception:
                logger.warning(
                    "Failed to load user jobs for user=%s",
                    owner_user_id,
                    exc_info=True,
                )
                return []

        # No filter — load all files
        return await super().list_jobs(owner_user_id=None)

    async def get_job(self, job_id: str) -> Optional[CronJobSpec]:
        """Get a job by ID, scanning all per-user repos.

        Args:
            job_id: Job UUID

        Returns:
            CronJobSpec or None if not found
        """
        for repo in self._scan_user_repos():
            try:
                user_jobs = await repo.load()
                for j in user_jobs.jobs:
                    if j.id == job_id:
                        return j
            except Exception:
                logger.warning(
                    "Failed to search user jobs in %s",
                    repo.path,
                    exc_info=True,
                )

        return None
