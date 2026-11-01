"""Brew Sheet render: the session report is separate from the frozen bundle."""

from __future__ import annotations

import shutil

import pytest

from app.services.report_render import render_session

TYPST = shutil.which("typst")

pytestmark = pytest.mark.skipif(
    TYPST is None, reason="typst binary not installed; render gates skipped"
)


def session_doc() -> dict:
    return {
        "id": "s1",
        "uid": "u1",
        "batch_id": "b1",
        "batch_name": "House Pale",
        "artifact_hash": "sha256:test",
        "frozen_at": 123.0,
        "level": "info",
        "status": "brewing",
        "started_at": 200.0,
        "ended_at": None,
        "finalized_at": None,
        "plan_snapshot": {
            "table": [
                {
                    "kind": {"text": "step"},
                    "step_id": {"text": "mash-ph"},
                    "phase": {"text": "Brew day"},
                    "section": {"text": "Mash"},
                    "title": {"text": "Mash pH"},
                    "text": {"text": "Target 5.4."},
                },
                {
                    "kind": {"text": "observation"},
                    "metric_id": {"text": "mash.ph"},
                    "step_id": {"text": "mash-ph"},
                    "phase": {"text": "Brew day"},
                    "section": {"text": "Mash"},
                    "title": {"text": "Mash pH"},
                    "expected": {"text": "5.4"},
                    "expected_number": {"text": "5.4"},
                    "unit": {"text": "pH"},
                    "method": {"text": "pH meter"},
                    "tolerance": {"text": '{"min":5.2,"max":5.6}'},
                },
            ]
        },
        "steps": {"mash-ph": {"done": True, "note": "5.3 at 20 C"}},
        "observations": [
            {
                "id": "o1",
                "metric_id": "mash.ph",
                "step_id": "mash-ph",
                "at": 210.0,
                "recorded_at": 211.0,
                "source": "live",
                "method": "pH meter",
                "raw": {"value": 5.3, "unit": "pH"},
                "corrected": None,
                "correction": None,
                "note": "",
                "supersedes": None,
                "void": False,
            }
        ],
        "notes": "Cleaner than expected.",
        "created_at": 200.0,
        "updated_at": 211.0,
    }


def test_the_brew_sheet_renders_a_pdf() -> None:
    rendered = render_session(session_doc())
    assert rendered.data.startswith(b"%PDF")
    assert rendered.media_type == "application/pdf"
    assert rendered.sections == ("session",)


def test_an_unknown_paper_is_a_spec_error() -> None:
    with pytest.raises(Exception) as exc:
        render_session(session_doc(), paper="legal")
    assert "paper" in str(exc.value)
