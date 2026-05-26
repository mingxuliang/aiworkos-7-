# -*- coding: utf-8 -*-
"""Quick smoke test for execution sandbox path jail."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# Allow running from repo root without install step.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from qwenpaw.security.sandbox.context import set_current_sandbox_root  # noqa: E402
from qwenpaw.security.tool_guard.guardians.path_jail_guardian import (  # noqa: E402
    PathJailGuardian,
)


def main() -> int:
    os.environ["QWENPAW_EXECUTION_SANDBOX_ENABLED"] = "true"

    with tempfile.TemporaryDirectory(prefix="qwenpaw_sandbox_") as tmp:
        workspace = Path(tmp) / "workspace"
        workspace.mkdir()
        set_current_sandbox_root(workspace.resolve())

        guardian = PathJailGuardian()
        outside = "C:/Windows/win.ini" if os.name == "nt" else "/etc/passwd"
        blocked = guardian.guard("read_file", {"file_path": outside})
        allowed_file = workspace / "ok.txt"
        allowed_file.write_text("hello", encoding="utf-8")
        allowed = guardian.guard("read_file", {"file_path": "ok.txt"})

        print(f"workspace={workspace}")
        print(f"outside_target={outside}")
        print(f"blocked_findings={len(blocked)}")
        print(f"allowed_findings={len(allowed)}")

        if not blocked:
            print("FAIL: expected outside path to be blocked")
            return 1
        if allowed:
            print("FAIL: expected inside path to be allowed")
            return 1

        print("PASS: sandbox path jail smoke test")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
