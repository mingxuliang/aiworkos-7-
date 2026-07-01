# -*- coding: utf-8 -*-
"""
Security framework for AiWork.

This package centralises all security-related mechanisms:

* **Prompt injection detection** (``aiwork.security.prompt_guard``)
  Runtime regex-based scan of user input before it reaches LLM prompts.
  Reuses the same signature rules as the skill scanner.
* **Tool-call guarding** (``aiwork.security.tool_guard``)
  Pre-execution parameter scanning to detect dangerous tool usage
  patterns (command injection, data exfiltration, etc.).
* **Skill scanning** (``aiwork.security.skill_scanner``)
  Static analysis of skill directories before install / activation.
* **Secret storage** (``aiwork.security.secret_store``)
  Transparent encryption layer for sensitive fields (API keys, tokens)
  stored on disk.  Uses Fernet (AES-128-CBC + HMAC-SHA256) with a
  master key backed by the OS keychain or a fallback file.

Sub-modules are kept independent so each concern can evolve (or be
disabled) without affecting the others.  Import-time cost is near-zero
because heavy dependencies are lazily loaded inside each sub-module.
"""
