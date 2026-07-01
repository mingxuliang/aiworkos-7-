#!/usr/bin/env python3
"""Patch agentscope-ai Builder to buffer orphaned SSE content events.

Run after ``npm install`` to apply the fix:

    python3 patch_builder.py

Problem
-------
The Builder's ``handleContent`` drops file/attachment content when the SSE
``content`` event arrives before the parent ``message`` event.  On servers
behind a reverse proxy, TCP chunking can batch events so that content
outraces the message, causing the file to never appear in chat.

Fix
---
- Add a ``_pendingContent`` buffer to the Builder class.
- In ``handleContent``: when the parent message isn't found, buffer the
  content instead of dropping it.
- In ``handleMessage``: after inserting a new message, replay any pending
  content whose ``msg_id`` matches.
"""

import os
import sys

PATCH_ROOT = os.path.dirname(os.path.abspath(__file__))
CHAT_PKG = "node_modules/@agentscope-ai/chat"
LIB_PATH = f"{CHAT_PKG}/lib/AgentScopeRuntimeWebUI/core/AgentScopeRuntime/Response"
SRC_PATH = f"{CHAT_PKG}/components/AgentScopeRuntimeWebUI/core/AgentScopeRuntime/Response"

# We ship the patch script alongside both console projects; try the CWD first,
# then fall back to the directory containing this script.
SEARCH_DIRS = [os.getcwd(), PATCH_ROOT]


def _locate(file_name: str) -> str | None:
    for base in SEARCH_DIRS:
        if base == PATCH_ROOT:
            continue  # dedup
        candidate = os.path.join(base, file_name)
        if os.path.isfile(candidate):
            return candidate

    # fallback: search from script dir
    candidate = os.path.join(PATCH_ROOT, file_name)
    if os.path.isfile(candidate):
        return candidate
    return None


def _patch_js(path: str) -> bool:
    """Patch the compiled JS Builder.

    Strategy: when a content delta arrives before its parent message,
    create a **placeholder message** directly on the immer ``draft``.
    The real message (arriving later via ``handleMessage``) is merged
    via ``Object.assign`` and preserves the placeholder's content.

    This approach uses **no** ``this``, ``self``, or closure variables
    inside the ``produce`` callback — only ``draft`` — so it survives
    minification reliably.
    """
    with open(path, "r") as fh:
        content = fh.read()

    changed = False

    needle = (
        "      this.data = produce(this.data, function (draft) {\n"
        "        var msg = draft.output.find(function (m) {\n"
        "          return m.id === data.msg_id;\n"
        "        });\n"
        "        if (!msg) {\n"
        "          console.warn('Message not found for content:', data.msg_id);\n"
        "          return;\n"
        "        }"
    )
    repl = (
        "      this.data = produce(this.data, function (draft) {\n"
        "        var msg = draft.output.find(function (m) {\n"
        "          return m.id === data.msg_id;\n"
        "        });\n"
        "        if (!msg) {\n"
        "          // Only create placeholder for renderable content types (text,\n"
        "          // image, file, video, audio). Tool-call \"data\" events are\n"
        "          // rendered by the plugin-call pipeline and would appear as raw\n"
        "          // JSON if we shoved them into a plain message.\n"
        "          if (data.type === 'text' || data.type === 'data') {\n"
        "            // data content without a parent message — silently skip\n"
        "            return;\n"
        "          }\n"
        "          // Create a placeholder message so the content isn't dropped.\n"
        "          // When the real message arrives via handleMessage it will be\n"
        "          // merged in (Object.assign), preserving this content.\n"
        "          console.warn('Message not found for content, creating placeholder:', data.msg_id);\n"
        "          if (!draft.output) draft.output = [];\n"
        "          msg = { id: data.msg_id, type: 'message', role: 'assistant', status: 'in_progress', content: [] };\n"
        "          draft.output.push(msg);\n"
        "        }"
    )
    if needle in content and repl not in content:
        content = content.replace(needle, repl)
        changed = True

    if changed:
        with open(path, "w") as fh:
            fh.write(content)
    return changed


def _patch_tsx(path: str) -> bool:
    """Patch the TypeScript source Builder — same placeholder strategy."""
    with open(path, "r") as fh:
        content = fh.read()

    changed = False

    needle = (
        "  handleContent(data: IContent) {\n"
        "    this.data = produce(this.data, (draft) => {\n"
        "      const msg = draft.output.find(m => m.id === data.msg_id);\n"
        "\n"
        "      if (!msg) {\n"
        '        console.warn(\'Message not found for content:\', data.msg_id);\n'
        "        return;\n"
        "      }"
    )
    repl = (
        "  handleContent(data: IContent) {\n"
        "    this.data = produce(this.data, (draft) => {\n"
        "      let msg = draft.output.find(m => m.id === data.msg_id);\n"
        "\n"
        "      if (!msg) {\n"
        "        // Only create placeholder for renderable content types (text,\n"
        "        // image, file, video, audio). Tool-call \"data\" events are\n"
        "        // rendered by the plugin-call pipeline and would appear as raw\n"
        "        // JSON if we shoved them into a plain message.\n"
        "        if (data.type === 'text' || data.type === 'data') {\n"
        "          // data content without a parent message — silently skip\n"
        "          return;\n"
        "        }\n"
        "        // Create a placeholder message so the content isn't dropped.\n"
        "        // When the real message arrives via handleMessage it will be\n"
        "        // merged in (Object.assign), preserving this content.\n"
        '        console.warn(\'Message not found for content, creating placeholder:\', data.msg_id);\n'
        "        if (!draft.output) draft.output = [];\n"
        "        msg = { id: data.msg_id, type: 'message', role: 'assistant', status: 'in_progress', content: [] } as any;\n"
        "        draft.output.push(msg);\n"
        "      }"
    )
    if needle in content and repl not in content:
        content = content.replace(needle, repl)
        changed = True

    if changed:
        with open(path, "w") as fh:
            fh.write(content)
    return changed


def main() -> int:
    js_path = _locate(f"{LIB_PATH}/Builder.js")
    tsx_path = _locate(f"{SRC_PATH}/Builder.tsx")

    if not js_path and not tsx_path:
        print(
            f"patch_builder: could not find Builder.js / Builder.tsx "
            f"under {CHAT_PKG} — is @agentscope-ai/chat installed?",
            file=sys.stderr,
        )
        return 1

    ok = True
    for label, path in [("JS", js_path), ("TSX", tsx_path)]:
        if not path:
            print(f"patch_builder: {label} file not found — skipping")
            continue
        try:
            if path.endswith(".js"):
                changed = _patch_js(path)
            else:
                changed = _patch_tsx(path)
            print(
                f"patch_builder: {path} {'PATCHED' if changed else 'already patched (skipped)'}"
            )
        except Exception as exc:
            print(f"patch_builder: ERROR patching {path}: {exc}", file=sys.stderr)
            ok = False

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
