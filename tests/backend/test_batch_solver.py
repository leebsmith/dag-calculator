"""Offline tests for the sealed batch-sparge solver and its service adapter."""

from __future__ import annotations

import pytest
from conftest import make_batch_request

from app.core.batch_solver import (
    GrainBillEntry,
    SolverValidationError,
    composite_yield_fraction,
    max_achievable_abv,
    resolve_hlt_water_budget,
    resolve_volumetric_reversal,
    solve_grist_mass,
    solve_sg_post_boil_from_abv,
    validate_grain_bill_normalization,
)
from app.schemas.boundary import BatchSolverErrorCode
from app.services import SolverServiceError, solve_batch_request

# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def test_composite_yield_fraction():
    bill = [
        GrainBillEntry(w_i=0.5, yield_i=0.80, mc_i=0.00),
        GrainBillEntry(w_i=0.5, yield_i=0.70, mc_i=0.00),
    ]
    assert composite_yield_fraction(bill) == pytest.approx(0.75)


def test_grain_bill_normalization_gate():
    validate_grain_bill_normalization(
        [
            GrainBillEntry(w_i=0.5, yield_i=0.80, mc_i=0.00),
            GrainBillEntry(w_i=0.5, yield_i=0.70, mc_i=0.00),
        ]
    )

    with pytest.raises(SolverValidationError) as exc:
        validate_grain_bill_normalization(
            [
                GrainBillEntry(w_i=0.6, yield_i=0.80, mc_i=0.00),
                GrainBillEntry(w_i=0.5, yield_i=0.70, mc_i=0.00),
            ]
        )
    assert exc.value.code == "INVALID_GRAIN_BILL_NORMALIZATION"


# ---------------------------------------------------------------------------
# Phase 1 error taxonomy
# ---------------------------------------------------------------------------


def test_invalid_target_abv():
    with pytest.raises(SolverValidationError) as exc:
        solve_sg_post_boil_from_abv(0.0, 0.75)
    assert exc.value.code == "INVALID_TARGET_ABV"


def test_invalid_attenuation():
    with pytest.raises(SolverValidationError) as exc:
        solve_sg_post_boil_from_abv(5.5, 0.0)
    assert exc.value.code == "INVALID_ATTENUATION"


def test_abv_unreachable():
    with pytest.raises(SolverValidationError) as exc:
        solve_sg_post_boil_from_abv(25.0, 0.5)
    assert exc.value.code == "ABV_UNREACHABLE"


def test_max_achievable_abv_positive_and_guarded():
    assert max_achievable_abv(0.75) > 0.0
    with pytest.raises(SolverValidationError) as exc:
        max_achievable_abv(1.5)
    assert exc.value.code == "INVALID_ATTENUATION"


# ---------------------------------------------------------------------------
# Phase 2 error taxonomy
# ---------------------------------------------------------------------------


def test_invalid_ferm_volume():
    with pytest.raises(SolverValidationError) as exc:
        resolve_volumetric_reversal(
            v_ferm=0.0, sg_post_boil=1.05, v_kettle_dead=0.0,
            delta_v_evap=3.0, s_late_add=0.0,
        )
    assert exc.value.code == "INVALID_FERM_VOLUME"


def test_invalid_shrinkage():
    with pytest.raises(SolverValidationError) as exc:
        resolve_volumetric_reversal(
            v_ferm=20.0, sg_post_boil=1.05, v_kettle_dead=0.0,
            delta_v_evap=3.0, s_late_add=0.0, f_shrink=1.0,
        )
    assert exc.value.code == "INVALID_SHRINKAGE"


def test_pre_boil_volume_accounts_for_post_boil_losses():
    # V_pre_boil = (V_ferm + dead + transfer + trub) / (1 - shrink) + evap.
    result = resolve_volumetric_reversal(
        v_ferm=20.0, sg_post_boil=1.05, v_kettle_dead=1.0,
        delta_v_evap=3.0, s_late_add=0.0, v_kettle_transfer=0.5, v_trub=0.5,
    )
    assert result.v_pre_boil == pytest.approx(
        (20.0 + 1.0 + 0.5 + 0.5) / (1.0 - 0.04) + 3.0
    )


# ---------------------------------------------------------------------------
# Phase 3 error taxonomy
# ---------------------------------------------------------------------------


def test_invalid_yield():
    with pytest.raises(SolverValidationError) as exc:
        solve_grist_mass(
            v_pre_boil=25.0, r_l_to_g=3.0, yield_fraction=0.0, mc_bar=0.04,
            eta_conv=0.95, s_post_boil_target=2.0, s_late_add=0.0, v_dead=0.0,
        )
    assert exc.value.code == "INVALID_YIELD"


def test_extract_target_non_positive():
    with pytest.raises(SolverValidationError) as exc:
        solve_grist_mass(
            v_pre_boil=25.0, r_l_to_g=3.0, yield_fraction=0.8, mc_bar=0.04,
            eta_conv=0.95, s_post_boil_target=1.0, s_late_add=2.0, v_dead=0.0,
        )
    assert exc.value.code == "EXTRACT_TARGET_NON_POSITIVE"


def test_unknown_topology():
    with pytest.raises(SolverValidationError) as exc:
        solve_grist_mass(
            v_pre_boil=25.0, r_l_to_g=3.0, yield_fraction=0.8, mc_bar=0.04,
            eta_conv=0.95, s_post_boil_target=2.0, s_late_add=0.0, v_dead=0.0,
            topology="bogus",
        )
    assert exc.value.code == "UNKNOWN_TOPOLOGY"


def test_mash_too_thin():
    with pytest.raises(SolverValidationError) as exc:
        solve_grist_mass(
            v_pre_boil=25.0, r_l_to_g=1.0, yield_fraction=0.8, mc_bar=0.04,
            eta_conv=0.95, s_post_boil_target=2.0, s_late_add=0.0, v_dead=0.0,
        )
    assert exc.value.code == "MASH_TOO_THIN"


# ---------------------------------------------------------------------------
# HLT budget
# ---------------------------------------------------------------------------


def test_hlt_too_small():
    with pytest.raises(SolverValidationError) as exc:
        resolve_hlt_water_budget(
            hlt_starting_volume_l=20.0, v_strike_drawn=5.0, v_sparge_demand=10.0,
            hlt_dead_space_l=0.0, hlt_transfer_loss_l=0.0, hlt_coil_floor_l=0.0,
            max_hlt_volume_l=5.0,
        )
    assert exc.value.code == "HLT_TOO_SMALL"


# ---------------------------------------------------------------------------
# Feasibility surface (positive cases)
# ---------------------------------------------------------------------------


def test_solve_batch_end_to_end():
    resp = solve_batch_request(make_batch_request())
    assert resp.m_grist > 0.0
    assert resp.v_pre_boil > 0.0
    assert resp.sg_post_boil > 1.0
    assert resp.cascade.v_strike > 0.0
    assert resp.cascade.v_run1 > 0.0
    assert resp.cascade.sg_pre_boil > 1.0
    assert resp.cascade.v_post_boil > 0.0
    assert resp.mash_thickness_l_per_kg >= 1.67
    assert resp.hlt.v_hlt_top_up >= 0.0
    assert resp.max_achievable_abv > 0.0
    for v in resp.cascade.model_dump().values():
        if isinstance(v, float):
            assert v == v  # finite, not NaN
            assert v != float("inf")


def test_solve_batch_runoff_ratio_topology():
    resp = solve_batch_request(
        make_batch_request(topology="runoff_ratio", intensive_value=2.0)
    )
    assert resp.m_grist > 0.0
    assert resp.mash_thickness_l_per_kg > 0.0


def test_service_propagates_error():
    with pytest.raises(SolverServiceError) as exc:
        solve_batch_request(make_batch_request(target_abv=25.0, apparent_attenuation=0.5))
    assert exc.value.code == "ABV_UNREACHABLE"


# ---------------------------------------------------------------------------
# Error surface completeness
# ---------------------------------------------------------------------------


def test_error_surface_complete():
    declared = {c.value for c in BatchSolverErrorCode}
    expected = {
        "INVALID_TARGET_ABV", "INVALID_ATTENUATION", "ABV_UNREACHABLE",
        "INVALID_FERM_VOLUME", "INVALID_SHRINKAGE", "EXTRACT_TARGET_NON_POSITIVE",
        "INVALID_YIELD", "DEGENERATE_BRACKET", "BRACKET_NO_SIGN_CHANGE",
        "UNKNOWN_TOPOLOGY", "INVALID_INTENSIVE_VALUE", "MASH_TOO_THIN",
        "HLT_TOO_SMALL", "INVALID_GRAIN_BILL_NORMALIZATION",
    }
    assert declared == expected


def test_determinism():
    a = solve_batch_request(make_batch_request())
    b = solve_batch_request(make_batch_request())
    assert a == b
