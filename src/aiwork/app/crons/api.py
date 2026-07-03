# -*- coding: utf-8 -*-
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from ..routers.agents import _get_jwt_user_id
from .manager import CronManager
from .models import (
    CronJobSpec,
    CronJobView,
    ExecutionRecord,
    ExecutionRecordFilter,
    ExecutionStatus,
    TriggerType,
)

router = APIRouter(prefix="/cron", tags=["cron"])


# ---------------------------------------------------------------------------
# Cron job ownership helpers
# ---------------------------------------------------------------------------


def _check_cron_ownership(
    job: CronJobSpec,
    user_id: str | None,
) -> None:
    """Raise 403 if user does not own the cron job.

    Allow access if:
    - job has no owner_user_id (shared/system job)
    - job's owner_user_id matches the current user
    """
    if job.owner_user_id is None:
        return  # 共享/系统任务，任何人可访问
    if job.owner_user_id == user_id:
        return  # 自己创建的任务
    raise HTTPException(
        status_code=403,
        detail="Not authorized to access this cron job",
    )


async def get_cron_manager(
    request: Request,
) -> CronManager:
    """Get cron manager for the active agent."""
    from ..agent_context import get_agent_for_request

    workspace = await get_agent_for_request(request)
    if workspace.cron_manager is None:
        raise HTTPException(
            status_code=500,
            detail="CronManager not initialized",
        )
    return workspace.cron_manager


@router.get("/jobs", response_model=list[CronJobSpec])
async def list_jobs(
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    current_user_id = await _get_jwt_user_id(request)
    if not current_user_id:
        return await mgr.list_jobs()
    return await mgr.list_jobs(owner_user_id=current_user_id)


@router.get("/jobs/{job_id}", response_model=CronJobView)
async def get_job(
    job_id: str,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    job = await mgr.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    current_user_id = await _get_jwt_user_id(request)
    _check_cron_ownership(job, current_user_id)
    return CronJobView(spec=job, state=mgr.get_state(job_id))


@router.post("/jobs", response_model=CronJobSpec)
async def create_job(
    spec: CronJobSpec,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    current_user_id = await _get_jwt_user_id(request)
    # server generates id; ignore client-provided spec.id
    job_id = str(uuid.uuid4())
    created = spec.model_copy(
        update={"id": job_id, "owner_user_id": current_user_id},
    )
    await mgr.create_or_replace_job(created)
    return created


@router.put("/jobs/{job_id}", response_model=CronJobSpec)
async def replace_job(
    job_id: str,
    spec: CronJobSpec,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    if spec.id is None:
        spec.id = job_id
    elif spec.id != job_id:
        raise HTTPException(status_code=400, detail="job_id mismatch")
    # 所有权检查
    existing = await mgr.get_job(job_id)
    if existing:
        current_user_id = await _get_jwt_user_id(request)
        _check_cron_ownership(existing, current_user_id)
        # Preserve owner_user_id from existing job if not provided in
        # the update, so the job stays routed to the correct per-user file.
        if not spec.owner_user_id:
            spec.owner_user_id = existing.owner_user_id
    await mgr.create_or_replace_job(spec)
    return spec


@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    # 所有权检查
    job = await mgr.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    current_user_id = await _get_jwt_user_id(request)
    _check_cron_ownership(job, current_user_id)
    ok = await mgr.delete_job(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="job not found")
    return {"deleted": True}


@router.post("/jobs/{job_id}/pause")
async def pause_job(
    job_id: str,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    # 所有权检查
    job = await mgr.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    current_user_id = await _get_jwt_user_id(request)
    _check_cron_ownership(job, current_user_id)
    try:
        await mgr.pause_job(job_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"paused": True}


@router.post("/jobs/{job_id}/resume")
async def resume_job(
    job_id: str,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    # 所有权检查
    job = await mgr.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    current_user_id = await _get_jwt_user_id(request)
    _check_cron_ownership(job, current_user_id)
    try:
        await mgr.resume_job(job_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"resumed": True}


@router.post("/jobs/{job_id}/run")
async def run_job(
    job_id: str,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    BUILTIN_JOB_IDS = {"_dream", "_heartbeat"}
    current_user_id = await _get_jwt_user_id(request)

    if job_id in BUILTIN_JOB_IDS:
        # Built-in jobs are agent-scoped (not user-scoped), so there is
        # no per-job owner to check.  Require the caller to be
        # authenticated — the agent identity is already resolved from
        # the request context.
        if not current_user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
    else:
        job = await mgr.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        _check_cron_ownership(job, current_user_id)
    try:
        await mgr.run_job(job_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail="job not found") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"started": True}


@router.get("/targets")
async def list_cron_targets(
    request: Request,
):
    """List unique (channel, session_id, user_id) targets for job creation.

    Reads from the current user's per-user chats.json and returns
    deduplicated dispatch targets.

    Returns:
        List of {channel, session_id, user_id} dicts
    """
    from ..agent_context import get_agent_for_request

    workspace = await get_agent_for_request(request)
    chat_mgr = workspace.chat_manager
    if chat_mgr is None:
        raise HTTPException(
            status_code=500,
            detail="ChatManager not initialized",
        )

    current_user_id = await _get_jwt_user_id(request)
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    chats = await chat_mgr.list_chats(user_id=current_user_id)

    # Deduplicate by (channel, session_id, out_sender_id).
    # out_sender_id is the platform sender_id needed for push routing.
    seen: set[tuple[str, str, str]] = set()
    targets: list[dict[str, str]] = []
    for chat in chats:
        key = (chat.channel, chat.session_id, chat.out_sender_id)
        if key not in seen:
            seen.add(key)
            targets.append({
                "name": chat.name,
                "channel": chat.channel,
                "session_id": chat.session_id,
                "out_sender_id": chat.out_sender_id,
                "user_id": chat.user_id,
                "chat_type": chat.chat_type,
            })

    return targets


@router.get("/jobs/{job_id}/state")
async def get_job_state(
    job_id: str,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    job = await mgr.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    current_user_id = await _get_jwt_user_id(request)
    _check_cron_ownership(job, current_user_id)
    return mgr.get_state(job_id).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Execution record endpoints
# ---------------------------------------------------------------------------


@router.get("/records", response_model=list[ExecutionRecord])
async def list_records(
    request: Request,
    job_id: Optional[str] = Query(default=None),
    status: Optional[ExecutionStatus] = Query(default=None),
    trigger_type: Optional[TriggerType] = Query(default=None),
    start_time: Optional[datetime] = Query(default=None),
    end_time: Optional[datetime] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    mgr: CronManager = Depends(get_cron_manager),
):
    current_user_id = await _get_jwt_user_id(request)
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    if mgr.record_repo is None:
        return []

    filters = ExecutionRecordFilter(
        job_id=job_id,
        status=status,
        trigger_type=trigger_type,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        offset=offset,
    )

    return await mgr.record_repo.list_records(current_user_id, filters)


@router.get("/jobs/{job_id}/records", response_model=list[ExecutionRecord])
async def list_job_records(
    job_id: str,
    request: Request,
    status: Optional[ExecutionStatus] = Query(default=None),
    trigger_type: Optional[TriggerType] = Query(default=None),
    start_time: Optional[datetime] = Query(default=None),
    end_time: Optional[datetime] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    mgr: CronManager = Depends(get_cron_manager),
):
    job = await mgr.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    current_user_id = await _get_jwt_user_id(request)
    _check_cron_ownership(job, current_user_id)

    if mgr.record_repo is None:
        return []

    target_user_id = job.owner_user_id or current_user_id or ""
    if not target_user_id:
        return []

    filters = ExecutionRecordFilter(
        job_id=job_id,
        status=status,
        trigger_type=trigger_type,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        offset=offset,
    )
    return await mgr.record_repo.list_records(target_user_id, filters)


@router.get("/records/{record_id}/output")
async def get_record_output(
    record_id: str,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    """Get the full output text for a single execution record."""
    current_user_id = await _get_jwt_user_id(request)
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    if mgr.record_repo is None:
        raise HTTPException(status_code=404, detail="record not found")

    record = await mgr.record_repo.get_record(current_user_id, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="record not found")

    output = await mgr.record_repo.read_output(current_user_id, record_id)
    if output is None:
        raise HTTPException(status_code=404, detail="output not found")
    return PlainTextResponse(content=output, media_type="text/plain; charset=utf-8")


@router.delete("/records/{record_id}")
async def delete_record(
    record_id: str,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    """Delete a single execution record and its output file."""
    current_user_id = await _get_jwt_user_id(request)
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    if mgr.record_repo is None:
        raise HTTPException(status_code=404, detail="record not found")

    record = await mgr.record_repo.get_record(current_user_id, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="record not found")

    deleted = await mgr.record_repo.delete_record(current_user_id, record_id)
    return {"deleted": deleted}


@router.delete("/jobs/{job_id}/records")
async def delete_job_records(
    job_id: str,
    request: Request,
    mgr: CronManager = Depends(get_cron_manager),
):
    job = await mgr.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    current_user_id = await _get_jwt_user_id(request)
    _check_cron_ownership(job, current_user_id)

    if mgr.record_repo is None:
        return {"deleted": 0}

    target_user_id = job.owner_user_id or current_user_id or ""
    deleted = await mgr.record_repo.delete_records(target_user_id, job_id=job_id)
    return {"deleted": deleted}
