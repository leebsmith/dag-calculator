"""Every code declared on ``solver.batch`` must be reachable by a trigger.

The artifact owns the error taxonomy; a code nobody can emit is vocabulary
nothing can speak. This suite pins the declared set to a trigger map, so adding
a code without a test (or deleting the last path to an existing one) fails here.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.batch_solver import (
    BatchSolverInput,
    GrainBillEntry,
    SolverValidationError,
    solve_batch,
    solve_grist_mass,
)

ARTIFACT = json.loads(
    (Path(__file__).resolve().parents[3] / "data" / "artifact.json").read_text()
)
DECLARED_CODES = set(ARTIFACT["nodes"]["solver.batch"]["domain"]["codes"])

BASE_INPUT = dict(
    target_abv=5.0,
    malt_attenuation_cap=0.75,
    v_ferm=20.0,
    topology="r_l_to_g",
    intensive_value=3.0,
    grain_bill=[
        GrainBillEntry(w_i=0.80, yield_i=0.80, mc_i=0.04, fermentability_i=0.81),
        GrainBillEntry(w_i=0.20, yield_i=0.70, mc_i=0.05, fermentability_i=0.50),
    ],
    s_late_add=0.0,
    v_kettle_dead=1.5,
    v_kettle_transfer=0.5,
    v_trub=0.5,
    delta_v_evap=3.0,
    v_dead=0.5,
    mash_transfer_loss=0.5,
    eta_conv=0.75,
    hlt_starting_volume_l=38.0,
    hlt_dead_space_l=0.946,
    hlt_transfer_loss_l=0.946,
    hlt_coil_floor_l=12.0,
    max_hlt_volume_l=38.0,
    max_kettle_volume_l=40.0,
    max_mash_tun_volume_l=40.0,
)

BASE_GRIST = dict(
    v_pre_boil=25.0,
    r_l_to_g=3.0,
    yield_fraction=0.7474,
    mc_bar=0.042,
    eta_conv=0.75,
    s_post_boil_target=2.7808,
    s_late_add=0.0,
    v_dead=0.5,
)


def _input(**overrides) -> BatchSolverInput:
    return BatchSolverInput(**{**BASE_INPUT, **overrides})


def _solve(**overrides):
    return solve_batch(_input(**overrides))


def _solve_grist(**overrides):
    return solve_grist_mass(**{**BASE_GRIST, **overrides})


TRIGGERS = {
    "INVALID_TARGET_ABV": lambda: _solve(target_abv=0.0),
    "INVALID_ATTENUATION": lambda: _solve(malt_attenuation_cap=0.0),
    "ABV_UNREACHABLE": lambda: _solve(target_abv=25.0),
    "INVALID_FERM_VOLUME": lambda: _solve(v_ferm=0.0),
    "INVALID_SHRINKAGE": lambda: _solve(f_shrink=1.0),
    "EXTRACT_TARGET_NON_POSITIVE": lambda: _solve(s_late_add=10.0),
    "INVALID_YIELD": lambda: _solve(
        grain_bill=[GrainBillEntry(w_i=1.0, yield_i=0.0, mc_i=0.0, fermentability_i=0.8)]
    ),
    # An unphysically small yield overflows the bracket arithmetic to [inf, inf].
    "DEGENERATE_BRACKET": lambda: _solve_grist(yield_fraction=1e-320),
    "BRACKET_NO_SIGN_CHANGE": lambda: _solve_grist(s_post_boil_target=5.0),
    "UNKNOWN_TOPOLOGY": lambda: _input(topology="bogus"),
    "INVALID_INTENSIVE_VALUE": lambda: _input(intensive_value=-1.0),
    "MASH_TOO_THIN": lambda: _solve_grist(r_l_to_g=1.0),
    "HLT_TOO_SMALL": lambda: _solve(max_hlt_volume_l=1.0),
    "KETTLE_TOO_SMALL": lambda: _solve(target_abv=12.0, max_kettle_volume_l=10.0),
    "MASH_TUN_TOO_SMALL": lambda: _solve(target_abv=12.0, max_mash_tun_volume_l=10.0),
    "INVALID_GRAIN_BILL_NORMALIZATION": lambda: _solve(
        grain_bill=[
            GrainBillEntry(w_i=0.6, yield_i=0.8, mc_i=0.0, fermentability_i=0.8),
            GrainBillEntry(w_i=0.5, yield_i=0.7, mc_i=0.0, fermentability_i=0.5),
        ]
    ),
}


def test_the_trigger_map_covers_every_declared_code():
    assert set(TRIGGERS) == DECLARED_CODES


@pytest.mark.parametrize("code", sorted(DECLARED_CODES))
def test_every_declared_code_can_be_emitted(code):
    with pytest.raises(SolverValidationError) as exc:
        TRIGGERS[code]()
    assert exc.value.code == code


@pytest.mark.parametrize(
    ("topology", "value"),
    [("runoff_ratio", -1.0), ("r_l_to_g", -3.0)],
)
def test_negative_intensive_values_are_rejected_before_division(topology, value):
    with pytest.raises(SolverValidationError) as exc:
        _input(topology=topology, intensive_value=value)
    assert exc.value.code == "INVALID_INTENSIVE_VALUE"

    with pytest.raises(SolverValidationError) as exc:
        _solve_grist(topology=topology, r_l_to_g=value)
    assert exc.value.code == "INVALID_INTENSIVE_VALUE"


def test_runoff_derived_thickness_below_the_floor_is_mash_too_thin():
    with pytest.raises(SolverValidationError) as exc:
        _solve(topology="runoff_ratio", intensive_value=0.001)
    assert exc.value.code == "MASH_TOO_THIN"
