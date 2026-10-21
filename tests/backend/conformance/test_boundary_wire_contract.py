"""The frontend wire contract must mirror the Pydantic boundary models exactly.

``tests/conformance/fixtures/boundary-wire-keys.json`` is produced from the
declarative field maps in ``frontend/src/adapters/boundaryRequest.js`` (the node
guard pins it there). Here the backend pins the same fixture to its models, so a
field added on one side without the other fails one of the two suites.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.boundary import BatchSolverRequest, IonProfile, WaterSolverRequest

FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "conformance"
        / "fixtures"
        / "boundary-wire-keys.json"
    ).read_text()
)


def top_level(keys: list[str]) -> set[str]:
    return {key.split(".")[0] for key in keys}


def test_batch_wire_keys_match_model_fields():
    assert set(FIXTURE["batch"]) == set(BatchSolverRequest.model_fields)


def test_water_wire_keys_match_model_fields():
    assert top_level(FIXTURE["water"]) == set(WaterSolverRequest.model_fields)


@pytest.mark.parametrize("profile", ["source", "target"])
def test_water_ion_fields_match_ion_profile(profile):
    prefix = f"{profile}."
    ions = {key.removeprefix(prefix) for key in FIXTURE["water"] if key.startswith(prefix)}
    assert ions == set(IonProfile.model_fields)
