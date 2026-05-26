# -*- coding: utf-8 -*-
"""Guardian that blocks tool paths outside the execution sandbox root."""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any

from ....config.context import get_current_workspace_dir
from ....constant import WORKING_DIR
from ....security.sandbox.path_jail import is_path_in_jail, is_sandbox_enabled
from ..models import GuardFinding, GuardSeverity, GuardThreatCategory
from . import BaseToolGuardian
from .file_guardian import (
    _TOOL_FILE_PARAMS,
    _extract_paths_from_shell_command,
    _is_windows_style_path,
    _looks_like_path_token,
)

_PATH_JAIL_GUARDIAN_NAME = "path_jail_guardian"


def _resolve_abs_path_for_jail(raw_value: str, sandbox_root: Path) -> str:
    """Resolve a tool path parameter against the sandbox root."""
    raw = raw_value.strip()
    if not raw:
        return ""
    if os.name == "nt" or _is_windows_style_path(raw):
        # Reuse Windows normalization but with sandbox as relative base.
        import ntpath

        expanded = os.path.expanduser(raw) if raw.startswith("~") else raw
        if not ntpath.isabs(expanded):
            expanded = ntpath.join(str(sandbox_root), expanded)
        normalized = ntpath.normpath(expanded)
        return normalized.replace("\\", "/").lower()

    path = Path(raw).expanduser()
    if path.is_absolute():
        return str(path.resolve(strict=False))
    return str((sandbox_root / path).resolve(strict=False))


class PathJailGuardian(BaseToolGuardian):
    """Block file/shell paths that escape the current sandbox root."""

    def __init__(self) -> None:
        super().__init__(name=_PATH_JAIL_GUARDIAN_NAME, always_run=True)

    def _sandbox_root(self) -> Path | None:
        from ....security.sandbox.context import get_current_sandbox_root

        root = get_current_sandbox_root()
        if root is not None:
            return root.resolve()
        workspace = get_current_workspace_dir() or WORKING_DIR
        return Path(workspace).resolve()

    def _make_finding(
        self,
        tool_name: str,
        param_name: str,
        raw_value: str,
        abs_path: str,
        *,
        snippet: str | None = None,
    ) -> GuardFinding:
        root = self._sandbox_root()
        return GuardFinding(
            id=f"GUARD-{uuid.uuid4().hex}",
            rule_id="SANDBOX_PATH_JAIL",
            category=GuardThreatCategory.PATH_TRAVERSAL,
            severity=GuardSeverity.HIGH,
            title="[HIGH] Path is outside sandbox boundary",
            description=(
                f"Tool '{tool_name}' attempted to access '{abs_path}' "
                f"which is outside sandbox root '{root}'."
            ),
            tool_name=tool_name,
            param_name=param_name,
            matched_value=raw_value,
            matched_pattern=str(root) if root else None,
            snippet=snippet or raw_value,
            remediation=(
                "Use a path inside the agent sandbox workspace only."
            ),
            guardian=self.name,
            metadata={
                "resolved_path": abs_path,
                "sandbox_root": str(root) if root else None,
            },
        )

    def _check_value(
        self,
        tool_name: str,
        param_name: str,
        raw_value: str,
        findings: list[GuardFinding],
        *,
        snippet: str | None = None,
    ) -> None:
        root = self._sandbox_root()
        if root is None:
            return

        abs_path = _resolve_abs_path_for_jail(raw_value, root)
        if not abs_path:
            return
        if is_path_in_jail(abs_path, root):
            return
        findings.append(
            self._make_finding(
                tool_name,
                param_name,
                raw_value,
                abs_path,
                snippet=snippet,
            ),
        )

    def guard(
        self,
        tool_name: str,
        params: dict[str, Any],
    ) -> list[GuardFinding]:
        if not is_sandbox_enabled():
            return []

        findings: list[GuardFinding] = []

        if tool_name == "execute_shell_command":
            command = params.get("command")
            if not isinstance(command, str) or not command.strip():
                return findings
            for raw_path in _extract_paths_from_shell_command(command):
                self._check_value(
                    tool_name,
                    "command",
                    raw_path,
                    findings,
                    snippet=command,
                )
            return findings

        known_params = _TOOL_FILE_PARAMS.get(tool_name)
        if known_params:
            for param_name in known_params:
                raw_value = params.get(param_name)
                if not isinstance(raw_value, str) or not raw_value.strip():
                    continue
                self._check_value(tool_name, param_name, raw_value, findings)
            return findings

        for param_name, param_value in params.items():
            if not isinstance(param_value, str) or not param_value.strip():
                continue
            if not _looks_like_path_token(param_value):
                continue
            self._check_value(tool_name, param_name, param_value, findings)

        return findings
