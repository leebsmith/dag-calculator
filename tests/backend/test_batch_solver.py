"""Offline tests for the sealed batch-sparge solver and its service adapter."""

from __future__ import annotations

import pytest
from conftest import make_batch_request

from app.core.batch_solver import (
    GrainBillEntry,
    SolverValidationError,
    composite_fermentability_fraction,
    composite_yield_fraction,
    max_achievable_abv,
    resolve_hlt_water_budget,
    resolve_volumetric_reversal,
    solve_grist_mass,
    solve_sg_post_boil_from_abv,
    validate_grain_bill_normalization,
)
from app.core.utils import apparent_to_real_attenuation, sg_to_plato
from app.schemas.boundary import BatchSolverErrorCode, GristBillRow
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


def test_composite_fermentability_is_extract_weighted():
    bill = [
        GrainBillEntry(w_i=0.5, yield_i=0.80, mc_i=0.00, fermentability_i=0.80),
        GrainBillEntry(w_i=0.5, yield_i=0.40, mc_i=0.00, fermentability_i=0.20),
    ]
    assert composite_fermentability_fraction(bill) == pytest.approx(0.60)


def test_composite_fermentability_requires_every_row():
    bill = [
        GrainBillEntry(w_i=0.5, yield_i=0.80, mc_i=0.00, fermentability_i=0.80),
        GrainBillEntry(w_i=0.5, yield_i=0.70, mc_i=0.00),
    ]
    assert composite_fermentability_fraction(bill) is None


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
    assert 0.0 < resp.max_feasible_abv <= resp.max_achievable_abv
    assert resp.binding_constraint in {"fermentation", "volume", "tun", "kettle", "hlt"}
    for v in resp.cascade.model_dump().values():
        if isinstance(v, float):
            assert v == v  # finite, not NaN
            assert v != float("inf")


def _fermentable_bill(f: float = 0.80) -> list[GristBillRow]:
    return [GristBillRow(w_i=1.0, yield_i=0.80, mc_i=0.04, fermentability_i=f)]


def _oe_plato(resp) -> float:
    return sg_to_plato(resp.sg_post_boil)


def test_all_malt_wort_real_attenuation_is_the_malt_baseline():
    resp = solve_batch_request(
        make_batch_request(grain_bill=_fermentable_bill(0.50), apparent_attenuation=1.0)
    )
    assert resp.aa_wort == pytest.approx(0.50)
    assert resp.aa_batch > resp.aa_wort, "apparent attenuation exceeds the real fraction"
    assert apparent_to_real_attenuation(_oe_plato(resp), resp.aa_batch) == pytest.approx(
        0.50, abs=1e-5
    )


def test_yeast_cap_binds_in_real_space():
    capped = solve_batch_request(
        make_batch_request(grain_bill=_fermentable_bill(0.95), apparent_attenuation=0.70)
    )
    assert capped.aa_batch == pytest.approx(0.70)
    assert capped.aa_wort == pytest.approx(
        apparent_to_real_attenuation(_oe_plato(capped), 0.70), abs=1e-5
    )
    assert capped.aa_wort < capped.aa_batch


def test_cap_above_the_baseline_leaves_the_malt_untouched():
    resp = solve_batch_request(
        make_batch_request(grain_bill=_fermentable_bill(0.50), apparent_attenuation=0.90)
    )
    assert resp.aa_wort == pytest.approx(0.50)
    assert apparent_to_real_attenuation(_oe_plato(resp), resp.aa_batch) == pytest.approx(
        0.50, abs=1e-5
    )
    assert resp.max_achievable_abv > 0.0


def test_sugar_raises_the_apparent_attenuation_past_the_cap():
    cap = 0.90
    malt_only = solve_batch_request(
        make_batch_request(grain_bill=_fermentable_bill(0.85), apparent_attenuation=cap)
    )
    sweet = solve_batch_request(
        make_batch_request(
            grain_bill=_fermentable_bill(0.85),
            apparent_attenuation=cap,
            s_late_add=0.4,
        )
    )
    assert malt_only.aa_batch == pytest.approx(cap)
    assert sweet.aa_wort > malt_only.aa_wort
    assert sweet.aa_batch > cap, "the cap applies to malt only; sugar is uncapped"


def test_sugar_blend_matches_the_extract_share():
    resp = solve_batch_request(
        make_batch_request(
            grain_bill=_fermentable_bill(0.50),
            apparent_attenuation=1.0,
            s_late_add=0.4,
        )
    )
    malt_extract = resp.s_post_boil_target - 0.4
    expected = (malt_extract * 0.50 + 0.4) / resp.s_post_boil_target
    assert resp.aa_wort == pytest.approx(expected, rel=1e-9)


def test_derated_cap_changes_the_batch_apparent_attenuation():
    full = solve_batch_request(
        make_batch_request(grain_bill=_fermentable_bill(0.50), apparent_attenuation=0.90)
    )
    derated = solve_batch_request(
        make_batch_request(grain_bill=_fermentable_bill(0.50), apparent_attenuation=0.855)
    )
    assert full.aa_wort == pytest.approx(0.50)
    assert derated.aa_wort == pytest.approx(0.50)
    capped = solve_batch_request(
        make_batch_request(grain_bill=_fermentable_bill(0.90), apparent_attenuation=0.855)
    )
    assert capped.aa_batch == pytest.approx(0.855)


def test_legacy_rows_without_fermentability_fall_back_to_the_cap():
    resp = solve_batch_request(make_batch_request(apparent_attenuation=0.75))
    assert resp.aa_wort == pytest.approx(0.75)
    assert resp.aa_batch == pytest.approx(0.75)


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
        "HLT_TOO_SMALL", "KETTLE_TOO_SMALL", "MASH_TUN_TOO_SMALL",
        "INVALID_GRAIN_BILL_NORMALIZATION",
    }
    assert declared == expected


def test_determinism():
    a = solve_batch_request(make_batch_request())
    b = solve_batch_request(make_batch_request())
    assert a == b
