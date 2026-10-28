"""Extract-composition regimes (A4, A6, A11): the four cases the model must hold.

* pure grist — real-basis rows round-trip to their old display
* + sugar — the residue mass is flat, OE and attenuation rise, the cap cannot
  clamp sugar
* + STA1 — the malt residue is consumed, apparent extract may go negative and
  apparent attenuation may exceed 1
* + both — sugar adds fermentable extract only; ``d`` touches the malt residue
  only
"""

from __future__ import annotations

import pytest
from conftest import make_batch_request

from app.core.batch.composition import resolve_wort_composition
from app.core.batch.constants import GAMMA_METRIC
from app.core.batch.inputs import BatchSolverInput, GrainBillEntry
from app.core.batch.orchestration import solve_batch
from app.core.batch.volumetric import kettle_cold_volume, post_boil_extract_target
from app.core.errors import SolverValidationError
from app.core.utils import sg_to_plato
from app.schemas.boundary import GristBillRow
from app.services import solve_batch_request

MALT_F = 0.643
MALT_KG = 4.0
V_KETTLE_L = 20.0


def _oe_for_extract(extract_kg: float) -> float:
    sg = 1.0 + (extract_kg * GAMMA_METRIC) / (1000.0 * V_KETTLE_L)
    return sg_to_plato(sg)


def composition(
    *,
    sugar_kg: float = 0.0,
    malt_f: float = MALT_F,
    dextrin: float = 0.0,
    cap: float = 1.0,
    sugar_fermentability: float = 1.0,
):
    extract = MALT_KG + sugar_kg
    return resolve_wort_composition(
        oe_plato=_oe_for_extract(extract),
        extract_total_kg=extract,
        s_late_add=sugar_kg,
        malt_fermentability=malt_f,
        yeast_cap_apparent=cap,
        dextrin_consumption=dextrin,
        sugar_fermentability=sugar_fermentability,
    )


# --- regime 1: pure grist ---------------------------------------------------


def test_pure_grist_round_trips_to_the_old_display():
    result = resolve_wort_composition(
        oe_plato=12.0,
        extract_total_kg=MALT_KG,
        s_late_add=0.0,
        malt_fermentability=MALT_F,
        yeast_cap_apparent=1.0,
    )

    assert result.real_attenuation == pytest.approx(MALT_F, abs=1e-9)
    assert result.real_extract_kg == pytest.approx(MALT_KG * (1.0 - MALT_F))
    assert result.apparent_attenuation == pytest.approx(0.810, abs=5e-4)
    assert result.abv_pct > 0.0


# --- regime 2: sugar --------------------------------------------------------


def test_sugar_leaves_the_residue_mass_flat_and_raises_everything_else():
    base = composition()
    sweet = composition(sugar_kg=0.8)

    assert sweet.oe_plato > base.oe_plato
    assert sweet.real_extract_kg == pytest.approx(base.real_extract_kg)
    assert sweet.apparent_attenuation > base.apparent_attenuation
    assert sweet.abv_pct > base.abv_pct


def test_yeast_cap_cannot_suppress_sugar():
    # The cap binds the malt hard (70 % apparent is ~55 % real at this OE); the
    # sugar still carries the apparent attenuation past the cap.
    malt_only = composition(malt_f=0.95, cap=0.70)
    sweet = composition(malt_f=0.95, cap=0.70, sugar_kg=0.8)

    assert malt_only.apparent_attenuation == pytest.approx(0.70, abs=1e-6)
    assert sweet.apparent_attenuation > 0.70


# --- regime 3: diastaticus --------------------------------------------------


def test_dextrin_consumption_empties_the_residue_and_crosses_one():
    result = composition(malt_f=0.87, dextrin=1.0)

    assert result.real_extract_kg == pytest.approx(0.0, abs=1e-12)
    assert result.real_attenuation == pytest.approx(1.0)
    assert result.apparent_extract_plato < 0.0
    assert result.apparent_attenuation > 1.0
    assert result.apparent_attenuation > 1.05, "a 0.87 real malt displays >1.05"


# --- regime 4: sugar and diastaticus ----------------------------------------


def test_sugar_and_dextrin_only_interact_through_the_extract_share():
    plain = composition(dextrin=1.0)
    sweet = composition(sugar_kg=0.8, dextrin=1.0)

    # d acts on the malt residue only; the sugar contributes no residue at all.
    assert plain.real_extract_kg == pytest.approx(0.0, abs=1e-12)
    assert sweet.real_extract_kg == pytest.approx(0.0, abs=1e-12)
    assert sweet.abv_pct > plain.abv_pct
    assert sweet.oe_plato > plain.oe_plato


def test_a_non_fermentable_sugar_survives_dextrin_consumption():
    # A6: lactose stays unfermented; d never reaches the sugar fraction.
    lactose = composition(sugar_kg=0.8, dextrin=1.0, sugar_fermentability=0.0)
    fermentable = composition(sugar_kg=0.8, dextrin=1.0, sugar_fermentability=1.0)

    assert lactose.real_extract_kg == pytest.approx(0.8)
    assert lactose.real_attenuation < 1.0
    assert lactose.apparent_attenuation < fermentable.apparent_attenuation


# --- end-to-end: the composition reaches the sealed solver -------------------


def _solver_input(**overrides) -> BatchSolverInput:
    values = dict(
        target_abv=5.5,
        malt_attenuation_cap=1.0,
        v_ferm=20.0,
        topology="r_l_to_g",
        intensive_value=3.0,
        grain_bill=[GrainBillEntry(w_i=1.0, yield_i=0.80, mc_i=0.04, fermentability_i=0.643)],
        s_late_add=0.0,
        v_kettle_dead=1.0,
        v_kettle_transfer=0.5,
        v_trub=0.5,
        delta_v_evap=3.0,
        v_dead=1.0,
        mash_transfer_loss=0.5,
        eta_conv=0.9,
        hlt_starting_volume_l=30.0,
        hlt_dead_space_l=0.5,
        hlt_transfer_loss_l=0.5,
        hlt_coil_floor_l=4.0,
        max_hlt_volume_l=30.0,
        max_kettle_volume_l=40.0,
        max_mash_tun_volume_l=40.0,
    )
    values.update(overrides)
    return BatchSolverInput(**values)


def test_solver_reports_real_and_apparent_attenuation():
    result = solve_batch(_solver_input())

    assert result.real_attenuation == pytest.approx(0.643, abs=5e-4)
    assert result.apparent_attenuation == pytest.approx(0.810, abs=5e-3)
    assert result.apparent_attenuation > result.real_attenuation


def test_solver_sugar_raises_apparent_attenuation_past_the_malt_baseline():
    plain = solve_batch(_solver_input())
    sweet = solve_batch(_solver_input(s_late_add=0.5))

    assert sweet.real_attenuation > plain.real_attenuation
    assert sweet.apparent_attenuation > plain.apparent_attenuation


# --- D5: STA1 at the wire ---------------------------------------------------


def _wire(**overrides):
    return solve_batch_request(
        make_batch_request(
            grain_bill=[
                GristBillRow(w_i=1.0, yield_i=0.80, mc_i=0.04, fermentability_i=0.643)
            ],
            **overrides,
        )
    )


def test_wire_sta1_consumes_the_malt_residue():
    positive = _wire(sta1=True)
    negative = _wire(sta1=False)

    assert positive.real_attenuation == pytest.approx(1.0, abs=1e-9)
    assert positive.apparent_attenuation > 1.0
    assert positive.apparent_attenuation > negative.apparent_attenuation


def test_wire_unknown_sta1_is_not_diastaticus():
    unknown = _wire(sta1=None)
    negative = _wire(sta1=False)

    assert unknown.real_attenuation == pytest.approx(negative.real_attenuation)
    assert unknown.apparent_attenuation == pytest.approx(negative.apparent_attenuation)
    assert unknown.real_attenuation < 1.0


def test_wire_sugar_and_sta1_compose():
    plain = _wire(sta1=True)
    sweet = _wire(sta1=True, s_late_add=0.5)

    # d empties the malt residue; sugar then only adds fermentable extract, so
    # the fixed-ABV solve needs less malt.
    assert sweet.real_attenuation == pytest.approx(1.0, abs=1e-9)
    assert sweet.m_grist < plain.m_grist


# --- P3b: sugar-extract share ----------------------------------------------


def test_share_mode_resolves_the_sugar_mass_in_one_solve():
    share = 0.10
    inputs = _solver_input(sugar_extract_share=share)
    result = solve_batch(inputs)

    v_cold = kettle_cold_volume(inputs.v_ferm, inputs.v_kettle_dead, inputs.f_shrink)
    extract_total = post_boil_extract_target(result.sg_post_boil, v_cold, GAMMA_METRIC)
    sugar_extract = share * extract_total
    assert sugar_extract / extract_total == pytest.approx(share)

    composition = resolve_wort_composition(
        oe_plato=sg_to_plato(result.sg_post_boil),
        extract_total_kg=extract_total,
        s_late_add=sugar_extract,
        malt_fermentability=0.643,
        yeast_cap_apparent=1.0,
    )
    assert composition.abv_pct == pytest.approx(inputs.target_abv, abs=1e-3)


def test_share_mode_replaces_the_dose_with_less_malt():
    plain = solve_batch(_solver_input())
    shared = solve_batch(_solver_input(sugar_extract_share=0.10))

    # Sugar contributes fully fermentable extract, so the same ABV pin needs
    # less total extract and less malt.
    assert shared.m_grist < plain.m_grist
    assert shared.s_post_boil_target < plain.s_post_boil_target
    assert shared.sg_post_boil < plain.sg_post_boil


def test_share_mode_rejects_a_malt_free_share():
    with pytest.raises(SolverValidationError) as exc:
        solve_batch(_solver_input(sugar_extract_share=1.0))
    assert exc.value.code == "INVALID_SUGAR_SHARE"


def test_wire_share_mode_runs_in_one_boundary_call():
    plain = _wire()
    shared = _wire(sugar_extract_share=0.10)

    assert shared.m_grist < plain.m_grist
    assert shared.s_post_boil_target < plain.s_post_boil_target


# --- P1: effective sugar fermentability -------------------------------------


def test_effective_sugar_fermentability_carries_the_blend_residue():
    fully = solve_batch(_solver_input(s_late_add=0.5, sugar_fermentability=1.0))
    half = solve_batch(_solver_input(s_late_add=0.5, sugar_fermentability=0.5))
    none = solve_batch(_solver_input(s_late_add=0.5, sugar_fermentability=0.0))

    assert half.real_attenuation < fully.real_attenuation
    assert half.apparent_attenuation < fully.apparent_attenuation
    assert none.real_attenuation < half.real_attenuation
    assert none.apparent_attenuation < half.apparent_attenuation


def test_wire_effective_sugar_fermentability_is_a_single_scalar():
    fully = _wire(s_late_add=0.5, sugar_fermentability=1.0)
    mixed = _wire(s_late_add=0.5, sugar_fermentability=0.5)

    assert mixed.real_attenuation < fully.real_attenuation
    assert mixed.apparent_attenuation < fully.apparent_attenuation
