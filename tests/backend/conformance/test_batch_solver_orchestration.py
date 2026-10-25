"""Unit tests for the top-level ``solve_batch`` orchestrator (Stage 1.5)."""

import math

import pytest

from app.core.batch_solver import (
    GAMMA_METRIC,
    BatchSolverInput,
    GrainBillEntry,
    SolverValidationError,
    kettle_cold_volume,
    solve_batch,
)


@pytest.fixture
def standard_inputs():
    """A plausible 20 L batch: ~5 kg grist, 3:1 L:G, 75% conversion."""
    return BatchSolverInput(
        target_abv=5.0,
        apparent_attenuation=0.75,
        v_ferm=20.0,
        topology="r_l_to_g",
        intensive_value=3.0,
        grain_bill=[
            GrainBillEntry(w_i=0.80, yield_i=0.80, mc_i=0.04),
            GrainBillEntry(w_i=0.20, yield_i=0.70, mc_i=0.05),
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


def test_solve_batch_returns_finite_anchors(standard_inputs):
    result = solve_batch(standard_inputs)
    for value in (
        result.sg_post_boil,
        result.v_pre_boil,
        result.s_post_boil_target,
        result.m_grist,
        result.cascade.sg_pre_boil,
    ):
        assert math.isfinite(value)


def test_solve_batch_anchors_are_physically_plausible(standard_inputs):
    result = solve_batch(standard_inputs)
    assert 1.0 < result.sg_post_boil < 1.10
    assert result.v_pre_boil > standard_inputs.v_ferm
    assert result.s_post_boil_target > 0.0
    assert result.m_grist > 0.0
    assert 1.0 < result.cascade.sg_pre_boil < 1.10


def test_solve_batch_is_pure(standard_inputs):
    first = solve_batch(standard_inputs)
    second = solve_batch(standard_inputs)
    assert first == second


def assert_cascade_reproduces_target(inputs):
    result = solve_batch(inputs)
    cascade = result.cascade
    v_drain = result.v_pre_boil + inputs.mash_transfer_loss
    tun_extract = cascade.s_run1 + cascade.s_run2
    kettle_extract = (tun_extract * result.v_pre_boil / v_drain) + inputs.s_late_add

    assert kettle_extract == pytest.approx(result.s_post_boil_target)

    v_kettle_cold = kettle_cold_volume(
        inputs.v_ferm, inputs.v_kettle_dead, inputs.f_shrink
    )
    realized_sg = 1.0 + (kettle_extract * GAMMA_METRIC / (1000.0 * v_kettle_cold))
    assert realized_sg == pytest.approx(result.sg_post_boil)

    pre_boil_extract = tun_extract * result.v_pre_boil / v_drain
    assert cascade.sg_pre_boil == pytest.approx(
        1.0 + (pre_boil_extract * GAMMA_METRIC / (1000.0 * result.v_pre_boil))
    )
    return result


def test_cascade_reproduces_the_phase1_target(standard_inputs):
    assert_cascade_reproduces_target(standard_inputs)


def test_cascade_reproduces_the_target_in_runoff_topology(standard_inputs):
    inputs = BatchSolverInput(
        **{
            **standard_inputs.__dict__,
            "v_ferm": 10.0,
            "topology": "runoff_ratio",
            "intensive_value": 1.0,
        }
    )
    assert_cascade_reproduces_target(inputs)


def test_m_grist_responds_to_mash_transfer_loss(standard_inputs):
    no_loss = solve_batch(
        BatchSolverInput(**{**standard_inputs.__dict__, "mash_transfer_loss": 0.0})
    )
    result = solve_batch(standard_inputs)

    assert result.m_grist > no_loss.m_grist


def test_feasibility_bound_names_the_tun(standard_inputs):
    result = solve_batch(standard_inputs)

    assert result.max_feasible_abv < result.max_achievable_abv
    assert result.binding_constraint == "tun"


def test_bracket_failure_names_the_tun(standard_inputs):
    inputs = BatchSolverInput(**{**standard_inputs.__dict__, "target_abv": 9.0})

    with pytest.raises(SolverValidationError) as exc:
        solve_batch(inputs)

    assert exc.value.code == "MASH_TUN_TOO_SMALL"
    assert "40.0 L" in exc.value.message


def test_solve_batch_runoff_ratio_topology(standard_inputs):
    # The runoff_ratio topology statically splits V_pre_boil, so the sparge
    # volume must stay proportionate to the grist mass. A smaller fermenter
    # volume keeps the split in the physically reachable regime.
    inputs = BatchSolverInput(
        **{
            **standard_inputs.__dict__,
            "v_ferm": 10.0,
            "topology": "runoff_ratio",
            "intensive_value": 1.0,
        }
    )
    result = solve_batch(inputs)
    assert math.isfinite(result.m_grist)
    assert result.cascade.v_sparge == pytest.approx(result.cascade.v_run2)


def test_solve_batch_propagates_validation_errors(standard_inputs):
    inputs = BatchSolverInput(**{**standard_inputs.__dict__, "target_abv": 0.0})
    with pytest.raises(SolverValidationError) as exc:
        solve_batch(inputs)
    assert exc.value.code == "INVALID_TARGET_ABV"


def test_solve_batch_hlt_budget_is_consistent(standard_inputs):
    result = solve_batch(standard_inputs)
    hlt = result.hlt
    assert hlt.v_hlt_debt == pytest.approx(
        standard_inputs.hlt_dead_space_l + standard_inputs.hlt_transfer_loss_l
    )
    assert hlt.v_hlt_after_strike == pytest.approx(
        standard_inputs.hlt_starting_volume_l - result.cascade.v_strike
    )
    # Deliverable sparge must cover the cascade's sparge demand.
    assert hlt.v_sparge_deliverable >= result.cascade.v_sparge - 1e-6


def test_solve_batch_raises_hlt_too_small(standard_inputs):
    # A tiny HLT cannot hold enough liquor to cover the coil and sparge.
    inputs = BatchSolverInput(
        **{**standard_inputs.__dict__, "max_hlt_volume_l": 1.0}
    )
    with pytest.raises(SolverValidationError) as exc:
        solve_batch(inputs)
    assert exc.value.code == "HLT_TOO_SMALL"
