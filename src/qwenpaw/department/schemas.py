# -*- coding: utf-8 -*-
"""Pydantic schemas for the department module."""
from __future__ import annotations

from enum import IntEnum
from typing import Optional

from pydantic import BaseModel, Field


class AIEmpowermentLevel(IntEnum):
    """AI赋能等级."""

    DIGITAL = 0
    AI_ASSIST = 1
    AI_DEEP = 2


# ---------------------------------------------------------------------------
# Sub-job schemas
# ---------------------------------------------------------------------------


class SubJobNodeSchema(BaseModel):
    """Request schema for a sub-job node (create/update)."""

    id: Optional[int] = None
    job_title: str = Field(..., max_length=256)
    job_desc: Optional[str] = Field(None, max_length=512)
    agent_id: Optional[str] = Field(None, max_length=128)
    manual_task: str = Field("", max_length=1024)
    agent_task: str = Field("", max_length=1024)


class SubJobNodeResponse(BaseModel):
    """Response schema for a sub-job node."""

    id: int
    department_id: int
    job_title: str
    job_desc: Optional[str] = None
    agent_id: Optional[str] = None
    manual_task: str
    agent_task: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class DepartmentCreateRequest(BaseModel):
    """Create a new department node."""

    parent_id: Optional[int] = None
    department_name: str = Field(..., max_length=128)
    position_title: str = Field(..., max_length=128)
    ai_empowerment_level: int = Field(..., ge=0, le=2)
    efficiency_improvement_percent: int = Field(..., ge=0, le=100)
    job_desc: Optional[str] = Field(None, max_length=512)
    sub_jobs: Optional[list[SubJobNodeSchema]] = None


class DepartmentUpdateRequest(BaseModel):
    """Update an existing department node (parent_id is immutable)."""

    id: int
    department_name: str = Field(..., max_length=128)
    position_title: str = Field(..., max_length=128)
    ai_empowerment_level: int = Field(..., ge=0, le=2)
    efficiency_improvement_percent: int = Field(..., ge=0, le=100)
    job_desc: Optional[str] = Field(None, max_length=512)
    sub_jobs: Optional[list[SubJobNodeSchema]] = None


class DepartmentDeleteRequest(BaseModel):
    """Delete a department node (and cascade children)."""

    id: int


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class DepartmentResponse(BaseModel):
    """Flat response for a single department node."""

    id: int
    parent_id: Optional[int] = None
    department_name: str
    position_title: str
    ai_empowerment_level: int
    efficiency_improvement_percent: int
    job_desc: Optional[str] = None
    sub_jobs: list[SubJobNodeResponse] = []

    class Config:
        from_attributes = True


class DepartmentNode(BaseModel):
    """Recursive tree node (DepartmentResponse + children)."""

    id: int
    parent_id: Optional[int] = None
    department_name: str
    position_title: str
    ai_empowerment_level: int
    efficiency_improvement_percent: int
    # 员工数量字段
    employee_count: int
    job_desc: Optional[str] = None
    sub_jobs: list[SubJobNodeResponse] = []
    children: list["DepartmentNode"] = []

    class Config:
        from_attributes = True


class DepartmentTreeResponse(BaseModel):
    """Full organization tree response."""

    root: Optional[DepartmentNode] = None


class DepartmentListItem(BaseModel):
    """Minimal department info: id + name."""

    id: int
    department_name: str

    class Config:
        from_attributes = True


class DepartmentListResponse(BaseModel):
    """Response for department list (id + name only)."""

    departments: list[DepartmentListItem] = []


# ---------------------------------------------------------------------------
# UserProfile (user <-> department assignment) schemas
# ---------------------------------------------------------------------------


class UserDepartmentAssignRequest(BaseModel):
    """Assign or clear the department for a user."""

    department_id: Optional[int] = None


class UserDepartmentResponse(BaseModel):
    """Response payload for a user's department assignment."""

    user_id: int
    department_id: Optional[int] = None

    class Config:
        from_attributes = True
