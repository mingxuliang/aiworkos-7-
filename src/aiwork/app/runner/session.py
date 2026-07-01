# -*- coding: utf-8 -*-
"""Safe JSON session with filename sanitization for cross-platform
compatibility.

Windows filenames cannot contain: \\ / : * ? " < > |
This module wraps agentscope's SessionBase so that session_id and user_id
are sanitized before being used as filenames.
"""
import os
import re
import json
import logging
import shutil

from typing import Union, Sequence

import aiofiles
from agentscope.session import SessionBase
from agentscope_runtime.engine.schemas.exception import ConfigurationException
from ...exceptions import AgentStateError

logger = logging.getLogger(__name__)


def _safe_json_loads(content: str, filepath: str = "") -> dict:
    """Parse JSON with corruption recovery.

    Attempts standard ``json.loads`` first.  If that fails due to
    trailing garbage (a common symptom of concurrent-write race
    conditions), falls back to ``raw_decode`` to extract the first
    valid JSON object.  If the file is completely unparseable, returns
    an empty dict and logs a warning so callers never crash.

    Args:
        content: Raw file content.
        filepath: Used only for log messages.

    Returns:
        Parsed dict, or ``{}`` when the content is beyond recovery.
    """
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Try to extract the first valid JSON object.
    try:
        result, _ = json.JSONDecoder().raw_decode(content)
        logger.warning(
            "Session file %s had corrupted JSON. "
            "Recovered first valid object via raw_decode.",
            filepath,
        )
        return result
    except json.JSONDecodeError:
        logger.warning(
            "Session file %s is completely corrupted and could not "
            "be recovered. Returning empty dict.",
            filepath,
        )
        return {}


# Characters forbidden in Windows filenames
_UNSAFE_FILENAME_RE = re.compile(r'[\\/:*?"<>|]')


def sanitize_filename(name: str) -> str:
    """Replace characters that are illegal in Windows filenames with ``--``.

    >>> sanitize_filename('discord:dm:12345')
    'discord--dm--12345'
    >>> sanitize_filename('normal-name')
    'normal-name'
    """
    return _UNSAFE_FILENAME_RE.sub("--", name)


class SafeJSONSession(SessionBase):
    """SessionBase subclass with filename sanitization and async file I/O.

    Overrides all file-reading/writing methods to use :mod:`aiofiles` so
    that disk I/O does not block the event loop.

    When ``user_id`` is provided, session files are stored under
    ``save_dir/users/{user_id}/`` for per-user data isolation.
    When ``user_id`` is empty, files go directly under ``save_dir/``.
    """

    def __init__(
        self,
        save_dir: str = "./",
    ) -> None:
        """Initialize the JSON session class.

        Args:
            save_dir (`str`, defaults to `"./"):
                The directory to save the session state.
        """
        self.save_dir = save_dir

    def _get_save_path(self, session_id: str, user_id: str) -> str:
        """Return a filesystem-safe save path.

        Always stores under ``save_dir/sessions/{session_id}.json``.
        User isolation is achieved by the caller setting ``save_dir``
        to the appropriate user directory (e.g.
        ``workspace_dir/users/{user_id}/``).

        Args:
            session_id: Session identifier.
            user_id: Unused here; kept for API compatibility.
        """
        safe_sid = sanitize_filename(session_id)
        session_dir = os.path.join(self.save_dir, "sessions")
        os.makedirs(session_dir, exist_ok=True)
        return os.path.join(session_dir, f"{safe_sid}.json")

    def _get_legacy_save_path(
        self,
        session_id: str,
        user_id: str,
    ) -> str | None:
        """Return the legacy flat-directory save path for migration.

        Old layout: ``{base}/sessions/{user_id}_{session_id}.json``
        where ``base`` is the agent workspace root (parent of users/).

        Returns ``None`` when ``user_id`` is empty (no legacy path).
        """
        if not user_id:
            return None
        safe_sid = sanitize_filename(session_id)
        safe_uid = sanitize_filename(user_id)
        # The legacy path is always under the agent workspace root,
        # not under a user-specific directory.
        base = self._agent_workspace_dir()
        return os.path.join(
            base, "sessions", f"{safe_uid}_{safe_sid}.json",
        )

    def _agent_workspace_dir(self) -> str:
        """Return the agent-level workspace directory.

        If ``save_dir`` contains ``/users/{uid}/``, strip that suffix
        to get the agent root.  Otherwise ``save_dir`` is already the
        agent root.
        """
        parts = self.save_dir.replace("\\", "/").split("/")
        try:
            idx = len(parts) - 1 - parts[::-1].index("users")
            if idx > 0 and idx < len(parts) - 1:
                return "/".join(parts[:idx])
        except ValueError:
            pass
        return self.save_dir

    def _migrate_legacy_file(
        self,
        session_id: str,
        user_id: str,
    ) -> str:
        """Resolve save path, migrating from legacy layout if needed.

        If the new user-scoped path does not exist but the legacy
        flat-directory path does, move the file to the new location.
        Always returns the new path.
        """
        new_path = self._get_save_path(session_id, user_id)
        if os.path.exists(new_path):
            return new_path
        legacy_path = self._get_legacy_save_path(session_id, user_id)
        if legacy_path and os.path.exists(legacy_path):
            os.makedirs(os.path.dirname(new_path), exist_ok=True)
            shutil.move(legacy_path, new_path)
            logger.info(
                "Migrated session file %s -> %s",
                legacy_path,
                new_path,
            )
        return new_path

    def _resolve_existing_path(
        self,
        session_id: str,
        user_id: str,
    ) -> str:
        """Resolve the path to an existing session file.

        Checks the user-scoped path first, then falls back to the
        legacy flat-directory path.  Returns the new user-scoped path
        regardless (for saving).
        """
        new_path = self._get_save_path(session_id, user_id)
        if os.path.exists(new_path):
            return new_path
        legacy_path = self._get_legacy_save_path(session_id, user_id)
        if legacy_path and os.path.exists(legacy_path):
            return legacy_path
        return new_path

    async def save_session_state(
        self,
        session_id: str,
        user_id: str = "",
        **state_modules_mapping,
    ) -> None:
        """Save state modules to a JSON file using async I/O."""
        state_dicts = {
            name: state_module.state_dict()
            for name, state_module in state_modules_mapping.items()
        }
        session_save_path = self._get_save_path(session_id, user_id=user_id)
        with open(
            session_save_path,
            "w",
            encoding="utf-8",
        ) as f:
            f.write(json.dumps(state_dicts, ensure_ascii=False))

        logger.info(
            "Saved session state to %s successfully.",
            session_save_path,
        )

    async def load_session_state(
        self,
        session_id: str,
        user_id: str = "",
        allow_not_exist: bool = True,
        **state_modules_mapping,
    ) -> None:
        """Load state modules from a JSON file using async I/O."""
        session_save_path = self._migrate_legacy_file(
            session_id, user_id,
        )
        if os.path.exists(session_save_path):
            async with aiofiles.open(
                session_save_path,
                "r",
                encoding="utf-8",
                errors="surrogatepass",
            ) as f:
                content = await f.read()
                states = _safe_json_loads(content, session_save_path)

            for name, state_module in state_modules_mapping.items():
                if name in states:
                    state_module.load_state_dict(states[name])
            logger.info(
                "Load session state from %s successfully.",
                session_save_path,
            )

        elif allow_not_exist:
            logger.info(
                "Session file %s does not exist. Skip loading session state.",
                session_save_path,
            )

        else:
            raise AgentStateError(
                session_id=session_id,
                message=(
                    f"Failed to load session state for file "
                    f"{session_save_path} because it does not exist"
                ),
            )

    async def update_session_state(
        self,
        session_id: str,
        key: Union[str, Sequence[str]],
        value,
        user_id: str = "",
        create_if_not_exist: bool = True,
    ) -> None:
        session_save_path = self._migrate_legacy_file(
            session_id, user_id,
        )

        if os.path.exists(session_save_path):
            async with aiofiles.open(
                session_save_path,
                "r",
                encoding="utf-8",
                errors="surrogatepass",
            ) as f:
                content = await f.read()
                states = _safe_json_loads(content, session_save_path)

        else:
            if not create_if_not_exist:
                raise AgentStateError(
                    session_id=session_id,
                    message=f"Session file {session_save_path} does not exist",
                )
            states = {}

        path = key.split(".") if isinstance(key, str) else list(key)
        if not path:
            raise ConfigurationException(
                message="key path is empty",
            )

        cur = states
        for k in path[:-1]:
            if k not in cur or not isinstance(cur[k], dict):
                cur[k] = {}
            cur = cur[k]

        cur[path[-1]] = value

        with open(
            session_save_path,
            "w",
            encoding="utf-8",
        ) as f:
            f.write(json.dumps(states, ensure_ascii=False))

        logger.info(
            "Updated session state key '%s' in %s successfully.",
            key,
            session_save_path,
        )

    async def get_session_state_dict(
        self,
        session_id: str,
        user_id: str = "",
        allow_not_exist: bool = True,
    ) -> dict:
        """Return the session state dict from the JSON file.

        Args:
            session_id (`str`):
                The session id.
            user_id (`str`, default to `""`):
                The user ID for the storage.
            allow_not_exist (`bool`, defaults to `True`):
                Whether to allow the session to not exist. If `False`, raises
                an error if the session does not exist.

        Returns:
            `dict`:
                The session state dict loaded from the JSON file. Returns an
                empty dict if the file does not exist and
                `allow_not_exist=True`.
        """
        session_save_path = self._migrate_legacy_file(
            session_id, user_id,
        )
        if os.path.exists(session_save_path):
            async with aiofiles.open(
                session_save_path,
                "r",
                encoding="utf-8",
                errors="surrogatepass",
            ) as file:
                content = await file.read()
                states = _safe_json_loads(content, session_save_path)

            logger.info(
                "Get session state dict from %s successfully.",
                session_save_path,
            )
            return states

        if allow_not_exist:
            logger.info(
                "Session file %s does not exist. Return empty state dict.",
                session_save_path,
            )
            return {}

        raise AgentStateError(
            session_id=session_id,
            message=(
                f"Failed to get session state for file {session_save_path} "
                f"because it does not exist"
            ),
        )
