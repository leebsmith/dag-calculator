"""Boundary error-code contract: the artifact's declared error surface must mirror
the Python error enums exactly. A code added to one side only is a contract drift:
the frontend/domain readers see one set, while the solver raises another.
"""

from __future__ import annotations

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
    ("solver.batch", BatchSolverErrorCode),
    ("solver.water", WaterSolverErrorCode),
    ("solver.hops", HopSolverErrorCode),
]


@pytest.mark.parametrize(("boundary_id", "enum"), CASES)
def test_boundary_error_codes_match_artifact_domain(boundary_id, enum):
    declared = set(ARTIFACT["nodes"][boundary_id]["domain"]["codes"])
    expected = {code.value for code in enum}
    assert declared == expected, (
        f"{boundary_id} domain codes drift from {enum.__name__}: "
        f"artifact-only={sorted(declared - expected)}, enum-only={sorted(expected - declared)}"
    )
