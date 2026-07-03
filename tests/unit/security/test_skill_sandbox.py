# -*- coding: utf-8 -*-
"""Unit tests for skill sandbox metadata and scanner linkage."""
from __future__ import annotations

from aiwork.agents.skills_manager import (
    SkillRequirements,
    _extract_requirements,
    _parse_requires_sandbox,
    _skill_entry_requires_sandbox,
)
from aiwork.security.skill_scanner import should_recommend_sandbox
from aiwork.security.skill_scanner.models import (
    Finding,
    ScanResult,
    Severity,
    ThreatCategory,
)


def test_parse_requires_sandbox_from_dict() -> None:
    assert _parse_requires_sandbox({"sandbox": True}) is True
    assert _parse_requires_sandbox({"sandbox": "yes"}) is True
    assert _parse_requires_sandbox({"sandbox": False}) is False


def test_extract_requirements_reads_sandbox_flag() -> None:
    post = {
        "metadata": {
            "aiwork": {
                "requires": {
                    "bins": ["python"],
                    "sandbox": True,
                },
            },
        },
    }
    requirements = _extract_requirements(post)
    assert requirements.requires_sandbox is True
    assert requirements.require_bins == ["python"]


def test_skill_entry_requires_sandbox() -> None:
    assert _skill_entry_requires_sandbox({"requires_sandbox": True}) is True
    assert _skill_entry_requires_sandbox(
        {"requirements": {"requires_sandbox": True}},
    ) is True
    assert _skill_entry_requires_sandbox({}) is False


def test_should_recommend_sandbox_for_command_injection() -> None:
    result = ScanResult(
        skill_name="risky",
        skill_directory="/tmp/risky",
        findings=[
            Finding(
                id="finding-1",
                rule_id="COMMAND_INJECTION_EVAL",
                title="Dangerous exec",
                description="exec()",
                severity=Severity.HIGH,
                category=ThreatCategory.COMMAND_INJECTION,
                file_path="SKILL.md",
                line_number=1,
            ),
        ],
    )
    assert result.recommend_sandbox is True
    assert should_recommend_sandbox(result) is True


def test_skill_requirements_model_dump_includes_sandbox() -> None:
    dumped = SkillRequirements(requires_sandbox=True).model_dump()
    assert dumped["requires_sandbox"] is True
