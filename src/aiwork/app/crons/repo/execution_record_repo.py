# -*- coding: utf-8 -*-
"""Execution record repository — JSON registry + flat-file output storage.

Mirrors the ``chats.json`` + ``sessions/`` separation pattern:
- ``jobs_execution_records.json`` — lightweight metadata registry
- ``jobs_execution_outputs/{record_id}.txt`` — full-text output files
"""
from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Optional

from ..models import ExecutionRecord, ExecutionRecordFilter, ExecutionRecordsFile

logger = logging.getLogger(__name__)

_OUTPUT_DIR = "jobs_execution_outputs"
_RECORDS_FILE = "jobs_execution_records.json"


class ExecutionRecordRepository:
    """Manages execution records stored in per-user JSON files.

    File path: ``workspace_dir/users/{user_id}/jobs_execution_records.json``
    Output dir: ``workspace_dir/users/{user_id}/jobs_execution_outputs/``

    Atomic writes on the registry (``.tmp`` then ``shutil.move``).
    Retention limits are enforced on every append.
    """

    def __init__(
        self,
        workspace_dir: Path | str,
        *,
        max_records_per_job: int = 100,
        total_max_records: int = 10_000,
    ):
        if isinstance(workspace_dir, str):
            workspace_dir = Path(workspace_dir)
        self._workspace_dir = workspace_dir.expanduser()
        self._max_records_per_job = max_records_per_job
        self._total_max_records = total_max_records

    # ------------------------------------------------------------------
    # path helpers
    # ------------------------------------------------------------------

    def _user_dir(self, user_id: str) -> Path:
        return self._workspace_dir / "users" / str(user_id)

    def _records_path(self, user_id: str) -> Path:
        return self._user_dir(user_id) / _RECORDS_FILE

    def _output_dir(self, user_id: str) -> Path:
        return self._user_dir(user_id) / _OUTPUT_DIR

    def _output_path(self, user_id: str, record_id: str) -> Path:
        return self._output_dir(user_id) / f"{record_id}.txt"

    # ------------------------------------------------------------------
    # registry I/O
    # ------------------------------------------------------------------

    async def _load(self, user_id: str) -> ExecutionRecordsFile:
        path = self._records_path(user_id)
        if not path.exists():
            return ExecutionRecordsFile(version=1, records=[])
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return ExecutionRecordsFile.model_validate(data)
        except Exception:
            logger.warning(
                "Corrupted records file %s, starting fresh", path,
            )
            return ExecutionRecordsFile(version=1, records=[])

    async def _save(self, user_id: str, records_file: ExecutionRecordsFile) -> None:
        path = self._records_path(user_id)
        path.parent.mkdir(parents=True, exist_ok=True)

        tmp_path = path.with_suffix(path.suffix + ".tmp")
        payload = records_file.model_dump(mode="json")
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        shutil.move(str(tmp_path), str(path))

    # ------------------------------------------------------------------
    # output file I/O
    # ------------------------------------------------------------------

    def _write_output(self, user_id: str, record_id: str, text: str) -> str:
        """Write full output text to a file.

        Returns the relative path (from the user dir) to store in
        ``ExecutionRecord.output_file``.
        """
        out_dir = self._output_dir(user_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{record_id}.txt"
        out_path.write_text(text, encoding="utf-8")
        return f"{_OUTPUT_DIR}/{record_id}.txt"

    def _delete_output_file(self, user_id: str, record_id: str) -> None:
        """Delete a single output file if it exists."""
        out_path = self._output_path(user_id, record_id)
        if out_path.exists():
            out_path.unlink()

    def _delete_outputs_for_records(
        self, user_id: str, records: list[ExecutionRecord],
    ) -> None:
        """Delete output files for a batch of records."""
        for record in records:
            if record.output_file:
                self._delete_output_file(user_id, record.id)

    async def read_output(self, user_id: str, record_id: str) -> Optional[str]:
        """Read the full output text for a record."""
        out_path = self._output_path(user_id, record_id)
        if not out_path.exists():
            return None
        return out_path.read_text(encoding="utf-8")

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------

    async def append_record(
        self,
        record: ExecutionRecord,
        output_text: Optional[str] = None,
    ) -> None:
        """Append an execution record, optionally writing its output file.

        Retention limits are enforced after appending — oldest records
        (by *executed_at*) and their output files are removed.
        """
        owner_id = record.owner_user_id
        if not owner_id:
            logger.warning(
                "Skipping record append: no owner_user_id on record %s",
                record.id,
            )
            return

        # 1. Write output file if there is content
        if output_text:
            record.output_file = self._write_output(owner_id, record.id, output_text)

        # 2. Load registry & append
        records_file = await self._load(owner_id)
        records_file.records.append(record)

        # 3. Enforce retention limits
        removed = self._apply_retention(records_file.records)
        if removed:
            self._delete_outputs_for_records(owner_id, removed)

        # 4. Persist
        await self._save(owner_id, records_file)

    async def get_record(
        self, user_id: str, record_id: str,
    ) -> Optional[ExecutionRecord]:
        """Get a single execution record by id."""
        records_file = await self._load(user_id)
        for r in records_file.records:
            if r.id == record_id:
                return r
        return None

    async def list_records(
        self, user_id: str, filters: ExecutionRecordFilter,
    ) -> list[ExecutionRecord]:
        """List records for a user, applying filters."""
        records_file = await self._load(user_id)
        return self._apply_filters(records_file.records, filters)

    async def delete_record(
        self, user_id: str, record_id: str,
    ) -> bool:
        """Delete a single execution record by id.

        Output file is deleted alongside the record.

        Returns True if the record was found and deleted, False otherwise.
        """
        path = self._records_path(user_id)
        if not path.exists():
            return False

        rf = await self._load(user_id)
        for i, r in enumerate(rf.records):
            if r.id == record_id:
                removed = rf.records.pop(i)
                self._delete_outputs_for_records(user_id, [removed])
                await self._save(user_id, rf)
                return True
        return False

    async def delete_records(
        self, user_id: str, job_id: Optional[str] = None,
    ) -> int:
        """Delete execution records for a user.

        If *job_id* is given, only delete that job's records.
        Output files are deleted alongside the records.

        Returns the number of records deleted.
        """
        path = self._records_path(user_id)
        if not path.exists():
            return 0

        rf = await self._load(user_id)
        before = len(rf.records)

        if job_id:
            removed = [r for r in rf.records if r.job_id == job_id]
            rf.records = [r for r in rf.records if r.job_id != job_id]
        else:
            removed = list(rf.records)
            rf.records = []

        deleted = before - len(rf.records)
        if deleted:
            self._delete_outputs_for_records(user_id, removed)
            await self._save(user_id, rf)

        return deleted

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------

    def _apply_filters(
        self,
        records: list[ExecutionRecord],
        filters: ExecutionRecordFilter,
    ) -> list[ExecutionRecord]:
        """Filter, sort (newest first), and paginate records."""
        if filters.job_id:
            records = [r for r in records if r.job_id == filters.job_id]
        if filters.status:
            records = [r for r in records if r.status == filters.status]
        if filters.trigger_type:
            records = [r for r in records if r.trigger_type == filters.trigger_type]
        if filters.start_time:
            records = [r for r in records if r.executed_at >= filters.start_time]
        if filters.end_time:
            records = [r for r in records if r.executed_at <= filters.end_time]

        records.sort(key=lambda r: r.executed_at, reverse=True)
        return records[filters.offset : filters.offset + filters.limit]

    def _apply_retention(
        self, records: list[ExecutionRecord],
    ) -> list[ExecutionRecord]:
        """Enforce per-job and global retention caps.

        Returns the list of records that were removed (so their output
        files can be cleaned up).
        """
        removed: list[ExecutionRecord] = []

        # --- per-job cap ---
        by_job: dict[str, list[ExecutionRecord]] = {}
        for r in records:
            by_job.setdefault(r.job_id, []).append(r)

        for job_id, recs in by_job.items():
            if len(recs) > self._max_records_per_job:
                recs.sort(key=lambda r: r.executed_at)
                overflow = recs[: len(recs) - self._max_records_per_job]
                removed.extend(overflow)
                by_job[job_id] = recs[-self._max_records_per_job:]

        # Rebuild after per-job pruning
        kept_ids = {r.id for recs in by_job.values() for r in recs}
        records[:] = [r for r in records if r.id in kept_ids]

        # --- global cap ---
        if len(records) > self._total_max_records:
            records.sort(key=lambda r: r.executed_at)
            overflow = records[: len(records) - self._total_max_records]
            removed.extend(overflow)
            records[:] = records[-self._total_max_records:]

        return removed
