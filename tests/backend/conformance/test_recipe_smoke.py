"""D2 smoke test — a complete, error-free recipe end-to-end.

Drives the REAL frontend adapter (via node) to generate the product UI's default
`BatchSolverRequest` / `WaterSolverRequest` bodies, then runs the REAL sealed
solvers over them. Fails if the adapter emits an unrunnable body (the 422 case),
if either boundary reports an error, or if the returned recipe is incomplete or
non-finite. The node driver is `tests/conformance/emit-default-requests.mjs`.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

from app.core.water import GRAIN_ACIDITY
from app.schemas.boundary import BatchSolverRequest, WaterSolverRequest
from app.services.batch_solver_service import solve_batch_request
from app.services.water_solver_service import solve_water_request

REPO_ROOT = Path(__file__).resolve().parents[3]
DRIVER = REPO_ROOT / "tests" / "conformance" / "emit-default-requests.mjs"


def _default_requests() -> dict:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is required for the recipe smoke test")
    result = subprocess.run(
        [node, str(DRIVER)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def test_default_recipe_generates_end_to_end():
    emitted = _default_requests()

    # The adapter resolved both boundaries without error.
    assert emitted["boundaryError"] is None, emitted["boundaryError"]
    assert emitted["statuses"] == {"solver.batch": "ok", "solver.water": "ok"}

    bodies = {r["url"]: r["body"] for r in emitted["requests"]}
    assert set(bodies) == {"/solve/batch", "/solve/water"}

    # 1) Both bodies satisfy the deployed contracts (this is the 422 gate).
    batch_req = BatchSolverRequest(**bodies["/solve/batch"])
    water_req = WaterSolverRequest(**bodies["/solve/water"])

    # 2) The sealed solvers return a complete recipe.
    batch = solve_batch_request(batch_req)
    water = solve_water_request(water_req)

    scalars = [
        batch.sg_post_boil,
        batch.v_pre_boil,
        batch.s_post_boil_target,
        batch.m_grist,
        batch.cascade.v_strike,
        batch.cascade.v_run1,
        batch.cascade.v_run2,
        batch.cascade.v_sparge,
        batch.cascade.s_run1,
        batch.cascade.s_run2,
        batch.cascade.sg_pre_boil,
        batch.cascade.v_post_boil,
        batch.cascade.mash_thickness_l_per_kg,
        batch.max_achievable_abv,
        batch.hlt.v_hlt_debt,
        batch.hlt.v_hlt_after_strike,
        batch.hlt.v_hlt_top_up,
        batch.hlt.v_sparge_deliverable,
        batch.mash_thickness_l_per_kg,
        water.prescription.predicted_mash_ph,
        water.prescription.residual_hlt_water_l,
    ]
    assert all(math.isfinite(v) for v in scalars), "recipe contains non-finite values"
    assert batch.m_grist > 0.0 and batch.sg_post_boil > 1.0
    assert batch.cascade.v_strike > 0.0 and batch.v_pre_boil > 0.0
    assert batch.max_achievable_abv > 0.0
    assert 0.0 < water.prescription.predicted_mash_ph <= 14.0
    assert water.prescription.mash_ph_status in {"OPTIMAL", "LOW", "HIGH"}
    assert water.strategy == water_req.strategy

    additions = [
        water.mash_additions,
        water.sparge_additions,
    ]
    for dose in additions:
        assert all(value >= 0.0 for value in dose.model_dump().values())

    ions = water.post_salt_mash_ions.model_dump()
    assert all(math.isfinite(v) and v >= 0.0 for v in ions.values())
    assert set(water.grist_buckets_kg) == set(GRAIN_ACIDITY)
    assert sum(water.grist_buckets_kg.values()) > 0.0
