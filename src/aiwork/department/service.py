# -*- coding: utf-8 -*-
"""CRUD service for the department module.

Manages two tables: ``departments`` (tree structure) and
``sub_job_nodes`` (sub-job tasks).
"""
from __future__ import annotations

import logging
from collections import defaultdict

from sqlalchemy import select, func, update as sa_update, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Department, SubJobNode, UserProfile
from .schemas import (
    DepartmentCreateRequest,
    DepartmentNode,
    DepartmentUpdateRequest,
    SubJobNodeSchema,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _get_sub_jobs(
    db: AsyncSession, department_id: int,
) -> list[SubJobNode]:
    """Query all sub-job nodes for a given department_id."""
    stmt = select(SubJobNode).where(SubJobNode.department_id == department_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _get_sub_jobs_map(
    db: AsyncSession,
) -> dict[int, list[SubJobNode]]:
    """Load all sub-job rows, keyed by department_id."""
    stmt = select(SubJobNode)
    result = await db.execute(stmt)
    mapping: dict[int, list[SubJobNode]] = defaultdict(list)
    for sj in result.scalars().all():
        mapping[sj.department_id].append(sj)
    return mapping


async def _upsert_sub_jobs(
    db: AsyncSession,
    department_id: int,
    sub_jobs: list[SubJobNodeSchema],
) -> list[SubJobNode]:
    """Create or update sub-job nodes for a department.

    Items with ``id=None`` are created; items with ``id`` set are updated.
    """
    result: list[SubJobNode] = []
    for sj in sub_jobs:
        if sj.id is not None:
            # Update existing
            existing = await db.get(SubJobNode, sj.id)
            if existing is None or existing.department_id != department_id:
                raise ValueError(f"SubJobNode with id={sj.id} not found for department {department_id}")
            existing.job_title = sj.job_title
            existing.job_desc = sj.job_desc
            existing.agent_id = sj.agent_id
            existing.manual_task = sj.manual_task
            existing.agent_task = sj.agent_task
            result.append(existing)
        else:
            # Create new
            node = SubJobNode(
                department_id=department_id,
                job_title=sj.job_title,
                job_desc=sj.job_desc,
                agent_id=sj.agent_id,
                manual_task=sj.manual_task,
                agent_task=sj.agent_task,
            )
            db.add(node)
            result.append(node)
    await db.flush()
    return result


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


async def create_department(
    db: AsyncSession,
    req: DepartmentCreateRequest,
) -> tuple[Department, list[SubJobNode]]:
    """Create a new department node with optional sub-job tasks.

    Raises:
        ValueError: If root node already exists (parent_id is None) or
                    parent node not found.
    """
    if req.parent_id is None:
        # Check uniqueness of root node
        count_stmt = select(func.count()).select_from(Department).where(
            Department.parent_id.is_(None),
        )
        result = await db.execute(count_stmt)
        root_count = result.scalar() or 0
        if root_count > 0:
            raise ValueError("Root node already exists")
    else:
        # Verify parent exists
        parent = await db.get(Department, req.parent_id)
        if parent is None:
            raise ValueError(f"Parent node with id={req.parent_id} not found")

    dept = Department(
        parent_id=req.parent_id,
        department_name=req.department_name,
        position_title=req.position_title,
        ai_empowerment_level=req.ai_empowerment_level,
        efficiency_improvement_percent=req.efficiency_improvement_percent,
        job_desc=req.job_desc,
    )
    db.add(dept)
    await db.flush()  # get dept.id

    sub_jobs: list[SubJobNode] = []
    if req.sub_jobs:
        sub_jobs = await _upsert_sub_jobs(db, dept.id, req.sub_jobs)

    await db.commit()
    await db.refresh(dept)
    return dept, sub_jobs


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


async def update_department(
    db: AsyncSession,
    req: DepartmentUpdateRequest,
) -> tuple[Department, list[SubJobNode]]:
    """Update an existing department node and its sub-job tasks.

    parent_id is immutable.

    If ``sub_jobs`` is None, existing sub-jobs are left unchanged.
    If ``sub_jobs`` is an empty list, all existing sub-jobs are deleted.
    If ``sub_jobs`` is a list, items are upserted (id=None creates, id set updates).

    Raises:
        ValueError: If node not found.
    """
    stmt = select(Department).where(Department.id == req.id)
    result = await db.execute(stmt)
    dept = result.scalar_one_or_none()
    if dept is None:
        raise ValueError(f"Department with id={req.id} not found")

    # Update basic fields
    dept.department_name = req.department_name
    dept.position_title = req.position_title
    dept.ai_empowerment_level = req.ai_empowerment_level
    dept.efficiency_improvement_percent = req.efficiency_improvement_percent
    dept.job_desc = req.job_desc

    # Handle sub-jobs
    sub_jobs: list[SubJobNode] = []
    if req.sub_jobs is not None:
        if len(req.sub_jobs) == 0:
            # Explicit empty list: delete all existing sub-jobs
            await db.execute(
                sa_delete(SubJobNode).where(SubJobNode.department_id == dept.id)
            )
        else:
            # Upsert: delete sub-jobs not in the request, then upsert the rest
            existing_ids = {sj.id for sj in req.sub_jobs if sj.id is not None}
            if existing_ids:
                await db.execute(
                    sa_delete(SubJobNode).where(
                        SubJobNode.department_id == dept.id,
                        SubJobNode.id.notin_(existing_ids),
                    )
                )
            else:
                await db.execute(
                    sa_delete(SubJobNode).where(SubJobNode.department_id == dept.id)
                )
            sub_jobs = await _upsert_sub_jobs(db, dept.id, req.sub_jobs)
    else:
        # sub_jobs is None: leave existing sub-jobs unchanged
        sub_jobs = await _get_sub_jobs(db, dept.id)

    await db.commit()
    await db.refresh(dept)
    return dept, sub_jobs


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def delete_department(db: AsyncSession, dept_id: int) -> bool:
    """Delete a department and all its descendants (recursive cascade via business logic).

    Since parent_id has no FK constraint, we manually collect the entire
    subtree and delete all nodes + their sub-jobs in one transaction.

    Raises:
        ValueError: If node not found.
    """
    dept = await db.get(Department, dept_id)
    if dept is None:
        raise ValueError(f"Department with id={dept_id} not found")

    # Collect all descendant ids (BFS)
    all_depts_stmt = select(Department.id, Department.parent_id)
    result = await db.execute(all_depts_stmt)
    rows = result.all()

    children_map: dict[int | None, list[int]] = defaultdict(list)
    for row in rows:
        children_map[row.parent_id].append(row.id)

    # BFS to find all nodes in the subtree
    ids_to_delete: list[int] = []
    queue = [dept_id]
    while queue:
        current = queue.pop(0)
        ids_to_delete.append(current)
        queue.extend(children_map.get(current, []))

    # Delete sub-jobs for all departments in the subtree
    await db.execute(
        sa_delete(SubJobNode).where(SubJobNode.department_id.in_(ids_to_delete))
    )

    # Detach any user profiles still pointing at the deleted subtree
    # (no FK constraint, so cleanup is the business layer's responsibility).
    await db.execute(
        sa_update(UserProfile)
        .where(UserProfile.department_id.in_(ids_to_delete))
        .values(department_id=None)
    )

    # Delete all department nodes in the subtree
    await db.execute(
        sa_delete(Department).where(Department.id.in_(ids_to_delete))
    )

    await db.commit()
    return True


# ---------------------------------------------------------------------------
# UserProfile (user <-> department assignment)
# ---------------------------------------------------------------------------


async def get_user_profile(
    db: AsyncSession, user_id: int,
) -> UserProfile | None:
    """Return the profile row for a user, or None if not yet created."""
    stmt = select(UserProfile).where(UserProfile.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_or_create_user_profile(
    db: AsyncSession, user_id: int,
) -> UserProfile:
    """Lazy-create a user profile row.

    Existing users have no profile until the first read/write touches them;
    this avoids any one-shot backfill on existing data.
    """
    profile = await get_user_profile(db, user_id)
    if profile is not None:
        return profile
    profile = UserProfile(user_id=user_id, department_id=None)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def get_user_department_id(
    db: AsyncSession, user_id: int,
) -> int | None:
    """Return the department_id assigned to a user, or None if unassigned."""
    profile = await get_user_profile(db, user_id)
    return profile.department_id if profile is not None else None


async def get_user_department(
    db: AsyncSession, user_id: int,
) -> Department | None:
    """Return the Department a user belongs to, or None.

    Cross-table lookup is done explicitly (no ORM relationship across the
    auth_jwt / department module boundary).
    """
    dept_id = await get_user_department_id(db, user_id)
    if dept_id is None:
        return None
    return await db.get(Department, dept_id)


async def set_user_department(
    db: AsyncSession,
    user_id: int,
    department_id: int | None,
) -> UserProfile:
    """Assign (or clear) the department for a user.

    Raises:
        ValueError: If department_id is provided but the department
                    does not exist.
    """
    if department_id is not None:
        dept = await db.get(Department, department_id)
        if dept is None:
            raise ValueError(
                f"Department with id={department_id} not found",
            )

    profile = await get_user_profile(db, user_id)
    if profile is None:
        profile = UserProfile(user_id=user_id, department_id=department_id)
        db.add(profile)
    else:
        profile.department_id = department_id

    await db.commit()
    await db.refresh(profile)
    return profile


async def get_user_department_names_map(
    db: AsyncSession, user_ids: list[int],
) -> dict[int, str | None]:
    """Bulk-load department_name for a list of users.

    Returns a dict mapping user_id -> department_name (or None if no profile,
    department_id is NULL, or the referenced department no longer exists).
    Users without a profile row are absent from the dict; callers should
    treat missing keys as None.
    """
    if not user_ids:
        return {}
    stmt = (
        select(UserProfile.user_id, Department.department_name)
        .outerjoin(Department, Department.id == UserProfile.department_id)
        .where(UserProfile.user_id.in_(user_ids))
    )
    result = await db.execute(stmt)
    return {row.user_id: row.department_name for row in result.all()}


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------


async def get_department_list(
    db: AsyncSession,
) -> list[Department]:
    """Return all departments (for simple id+name listing)."""
    stmt = select(Department).order_by(Department.id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_department(
    db: AsyncSession, dept_id: int,
) -> tuple[Department | None, list[SubJobNode]]:
    """Get a single department node by id with its sub-jobs.

    Returns (department, sub_jobs) tuple.
    """
    stmt = select(Department).where(Department.id == dept_id)
    result = await db.execute(stmt)
    dept = result.scalar_one_or_none()
    if dept is None:
        return None, []
    sub_jobs = await _get_sub_jobs(db, dept_id)
    return dept, sub_jobs


async def _get_employee_count_map(
    db: AsyncSession,
) -> dict[int, int]:
    """Count user profiles grouped by department_id."""
    stmt = (
        select(UserProfile.department_id, func.count(UserProfile.id))
        .where(UserProfile.department_id.isnot(None))
        .group_by(UserProfile.department_id)
    )
    result = await db.execute(stmt)
    return {row[0]: row[1] for row in result.all()}


async def get_full_tree(db: AsyncSession) -> DepartmentNode | None:
    """Load all departments and assemble into a tree in memory.

    Returns the root node with nested children, or None if no root exists.
    """
    stmt = select(Department)
    result = await db.execute(stmt)
    all_depts: list[Department] = list(result.scalars().all())

    if not all_depts:
        return None

    # Load all sub-jobs and employee counts in parallel
    sub_jobs_map = await _get_sub_jobs_map(db)
    employee_count_map = await _get_employee_count_map(db)

    # Build children map
    children_map: dict[int | None, list[Department]] = defaultdict(list)
    for d in all_depts:
        children_map[d.parent_id].append(d)

    # Find root (parent_id IS NULL)
    roots = children_map.get(None, [])
    if not roots:
        return None

    root = roots[0]

    def _build_node(dept: Department) -> DepartmentNode:
        kids = children_map.get(dept.id, [])
        sub_jobs = sub_jobs_map.get(dept.id, [])
        return DepartmentNode(
            id=dept.id,
            parent_id=dept.parent_id,
            department_name=dept.department_name,
            position_title=dept.position_title,
            ai_empowerment_level=dept.ai_empowerment_level,
            efficiency_improvement_percent=dept.efficiency_improvement_percent,
            job_desc=dept.job_desc,
            employee_count=employee_count_map.get(dept.id, 0),
            sub_jobs=sub_jobs,
            children=[_build_node(c) for c in kids],
        )

    return _build_node(root)
