# -*- coding: utf-8 -*-
"""Integration check for sandbox via ToolGuardEngine."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from qwenpaw.security.sandbox import is_sandbox_enabled, set_current_sandbox_root
from qwenpaw.security.tool_guard.engine import ToolGuardEngine


def main() -> int:
    os.environ["QWENPAW_EXECUTION_SANDBOX_ENABLED"] = "true"
    assert is_sandbox_enabled(), "sandbox should be enabled"

    with tempfile.TemporaryDirectory() as tmp:
        ws = Path(tmp) / "workspace"
        ws.mkdir()
        set_current_sandbox_root(ws.resolve())

        outside = "C:/Windows/win.ini" if os.name == "nt" else "/etc/passwd"
        engine = ToolGuardEngine()
        result = engine.guard("read_file", {"file_path": outside})
        assert result.findings, "expected path jail finding for outside file"
        assert result.findings[0].guardian == "path_jail_guardian"

        inside = ws / "ok.txt"
        inside.write_text("ok", encoding="utf-8")
        ok = engine.guard("read_file", {"file_path": "ok.txt"})
        assert not ok.findings, "expected inside file to pass"

    print("PASS: ToolGuardEngine sandbox integration check")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
