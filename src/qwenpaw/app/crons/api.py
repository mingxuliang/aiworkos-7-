# -*- coding: utf-8 -*-
from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends, HTTPException, Request

from ..routers.agents import _get_jwt_user_id
from .manager import CronManager
from .models import CronJobSpec, CronJobView

router = APIRouter(prefix="/cron", tags=["cron"])


# ---------------------------------------------------------------------------
# Cron job ownership helpers
# ---------------------------------------------------------------------------


def _check_cron_ownership(
    job: CronJobSpec,
    user_id: str | None,
    *,
    is_admin: bool = False,
) -> None:
    """Raise 403 if user does not own the cron job.

    Allow access if:
    - caller has admin role
    - job has no owner_user_id (shared/system job)
    - job's owner_user_id matches the current user
    """
    if is_admin:
        return
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
    is_admin = "admin" in getattr(request.state, "roles", [])
    # admin 看全部；非 admin 且已登录时，只展示自己的和共享的定时任务
    if is_admin or not current_user_id:
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
    is_admin = "admin" in getattr(request.state, "roles", [])
    _check_cron_ownership(job, current_user_id, is_admin=is_admin)
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
        is_admin = "admin" in getattr(request.state, "roles", [])
        _check_cron_ownership(existing, current_user_id, is_admin=is_admin)
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
    is_admin = "admin" in getattr(request.state, "roles", [])
    _check_cron_ownership(job, current_user_id, is_admin=is_admin)
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
    is_admin = "admin" in getattr(request.state, "roles", [])
    _check_cron_ownership(job, current_user_id, is_admin=is_admin)
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
    is_admin = "admin" in getattr(request.state, "roles", [])
    _check_cron_ownership(job, current_user_id, is_admin=is_admin)
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
    # 所有权检查
    job = await mgr.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    current_user_id = await _get_jwt_user_id(request)
    is_admin = "admin" in getattr(request.state, "roles", [])
    _check_cron_ownership(job, current_user_id, is_admin=is_admin)
    try:
        await mgr.run_job(job_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail="job not found") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"started": True}


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
    is_admin = "admin" in getattr(request.state, "roles", [])
    _check_cron_ownership(job, current_user_id, is_admin=is_admin)
    return mgr.get_state(job_id).model_dump(mode="json")
