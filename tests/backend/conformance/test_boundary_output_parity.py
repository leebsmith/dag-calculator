"""Boundary output parity: every declared artifact output maps to a response field.

The wire-contract suite pins *request* keys to the Pydantic models. This pins the
*response* side: a boundary output declared in ``data/artifact.json`` that the
backend never returns would resolve to ``None`` in the frontend and silently blank
a readout. ``warnings`` / ``notes`` are intentionally not outputs (the artifact
output grammar admits only dimension/taxonomy/boolean), so they are allow-listed.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.boundary import BatchSolverResponse, WaterSolverResponse

ARTIFACT = json.loads(
    (Path(__file__).resolve().parents[3] / "data" / "artifact.json").read_text()
)

# Response fields that are deliberately not declared as artifact outputs.
ALLOW = {
    "solver.batch": set(),
    "solver.water": {"warnings", "notes", "telemetry"},
}

CASES = [
    ("solver.batch", BatchSolverResponse),
    ("solver.water", WaterSolverResponse),
]


@pytest.mark.parametrize(("boundary_id", "model"), CASES)
def test_boundary_outputs_match_response_fields(boundary_id, model):
    outputs = ARTIFACT["nodes"][boundary_id]["outputs"]
    declared = {key.split(".")[0] for key in outputs}
    expected = set(model.model_fields) - ALLOW[boundary_id]
    assert declared == expected, (
        f"{boundary_id} outputs drift from {model.__name__}: "
        f"declared={sorted(declared)}, expected={sorted(expected)}"
    )
