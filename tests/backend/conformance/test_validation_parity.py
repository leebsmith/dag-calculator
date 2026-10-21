"""Parity tests: the Python component validator must match the shared corpus.

The corpus is the single source of truth for component validation, shared with
the frontend runner (``tests/conformance/validation-parity.test.js``), so the
two implementations cannot silently diverge.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.artifact import validate_component

FIXTURE = Path(__file__).resolve().parents[2] / "conformance" / "fixtures" / "validation-cases.json"


def _materialize(component: dict) -> dict:
    out = {}
    for field, value in component.items():
        if isinstance(value, dict) and value.get("__nan__") is True:
            out[field] = float("nan")
        else:
            out[field] = value
    return out


def _flagged(kind: str, component: dict) -> set[str]:
    return {error.split(":", 1)[0].strip() for error in validate_component(kind, component)}


def test_component_validation_matches_the_shared_corpus():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for case in data["cases"]:
        kind = case["catalog"]
        component = _materialize(case["component"])
        assert _flagged(kind, component) == set(case["expected"]), (
            f"catalog={kind} component={component}"
        )
