"""Pin duplicated solver constants to the canonical artifact.

Every numeric constant the Python solvers restate must agree with
``data/artifact.json``. Changing either side alone fails this suite.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core import batch_solver, water
from app.schemas.boundary import BatchSolverRequest, WaterSolverRequest

ARTIFACT = json.loads(
    (Path(__file__).resolve().parents[3] / "data" / "artifact.json").read_text()
)
CONSTANTS = {key: spec["value"] for key, spec in ARTIFACT["constants"].items()}

BATCH_PINS = [
    ("GAMMA_METRIC", "sucrose_yield_ldk"),
    ("V_BAR_METRIC", "v_bar"),
    ("K_ABS_TRUE_METRIC", "k_abs_true"),
    ("RHO_WATER_METRIC", "rho_water"),
    ("F_SHRINK_DEFAULT", "default_shrinkage_fraction"),
]

WATER_PINS = [
    ("BICARBONATE_EQ_WEIGHT", "bicarbonate_eq_weight"),
    ("MASH_PH_OPTIMAL_LOW", "mash_ph_optimal_low"),
    ("MASH_PH_OPTIMAL_HIGH", "mash_ph_optimal_high"),
]


@pytest.mark.parametrize(("python_name", "artifact_name"), BATCH_PINS)
def test_batch_solver_constant_matches_artifact(python_name, artifact_name):
    assert getattr(batch_solver, python_name) == CONSTANTS[artifact_name]


@pytest.mark.parametrize(("python_name", "artifact_name"), WATER_PINS)
def test_water_constant_matches_artifact(python_name, artifact_name):
    assert getattr(water, python_name) == CONSTANTS[artifact_name]


def test_default_mash_ph_matches_artifact():
    field = WaterSolverRequest.model_fields["target_mash_ph"]
    assert field.default == CONSTANTS["default_target_mash_ph"]


def test_batch_request_absorption_default_matches_artifact():
    field = BatchSolverRequest.model_fields["k_abs_true"]
    assert field.default == CONSTANTS["k_abs_true"]
