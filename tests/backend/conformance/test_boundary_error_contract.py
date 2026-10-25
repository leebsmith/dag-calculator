"""Boundary error-code contract: the artifact's declared error surface must mirror
the Python error enums exactly. A code added to one side only is a contract drift:
the frontend/domain readers see one set, while the solver raises another.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path

import pytest

from app.schemas.boundary import (
    BatchSolverErrorCode,
    HopSolverErrorCode,
    WaterSolverErrorCode,
)

ARTIFACT = json.loads(
    (Path(__file__).resolve().parents[3] / "data" / "artifact.json").read_text()
)

CASES = [
    ("solver.batch", BatchSolverErrorCode, "batch_solver.py"),
    ("solver.water", WaterSolverErrorCode, "water.py"),
    ("solver.hops", HopSolverErrorCode, "hop_solver.py"),
]

CORE = Path(__file__).resolve().parents[3] / "backend" / "app" / "core"


def raised_codes(filename: str) -> set[str]:
    tree = ast.parse((CORE / filename).read_text())
    codes: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", None)
        if name != "SolverValidationError":
            continue
        arg = node.args[0] if node.args else None
        if not (isinstance(arg, ast.Constant) and isinstance(arg.value, str)):
            raise AssertionError(f"{filename}:{node.lineno}: non-literal error code")
        codes.add(arg.value)
    return codes


@pytest.mark.parametrize(("boundary_id", "enum", "filename"), CASES)
def test_boundary_error_codes_match_artifact_and_core(boundary_id, enum, filename):
    declared = set(ARTIFACT["nodes"][boundary_id]["domain"]["codes"])
    expected = {code.value for code in enum}
    raised = raised_codes(filename)
    assert declared == expected, (
        f"{boundary_id} domain codes drift from {enum.__name__}: "
        f"artifact-only={sorted(declared - expected)}, enum-only={sorted(expected - declared)}"
    )
    assert raised == declared, (
        f"{boundary_id} raised codes drift from the artifact domain: "
        f"raised-only={sorted(raised - declared)}, declared-only={sorted(declared - raised)}"
    )
