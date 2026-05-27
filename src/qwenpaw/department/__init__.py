# -*- coding: utf-8 -*-
"""Enterprise department (organization structure) package."""

from __future__ import annotations

from .models import Department, SubJobNode, UserProfile
from .schemas import (
    AIEmpowermentLevel,
    DepartmentCreateRequest,
    DepartmentDeleteRequest,
    DepartmentNode,
    DepartmentResponse,
    DepartmentTreeResponse,
    DepartmentUpdateRequest,
    SubJobNodeSchema,
    SubJobNodeResponse,
)
from .service import (
    create_department,
    delete_department,
    get_department,
    get_full_tree,
    get_or_create_user_profile,
    get_user_department,
    get_user_department_id,
    get_user_department_names_map,
    get_user_profile,
    set_user_department,
    update_department,
)

__all__ = [
    "AIEmpowermentLevel",
    "Department",
    "SubJobNode",
    "UserProfile",
    "DepartmentCreateRequest",
    "DepartmentDeleteRequest",
    "DepartmentNode",
    "DepartmentResponse",
    "DepartmentTreeResponse",
    "DepartmentUpdateRequest",
    "SubJobNodeSchema",
    "SubJobNodeResponse",
    "create_department",
    "delete_department",
    "get_department",
    "get_full_tree",
    "get_or_create_user_profile",
    "get_user_department",
    "get_user_department_id",
    "get_user_department_names_map",
    "get_user_profile",
    "set_user_department",
    "update_department",
]
