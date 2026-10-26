"""Scale pins (ABV / OG / FG) and the preview block."""

from __future__ import annotations

import pytest

from app.core.batch_solver import (
    GAMMA_METRIC,
    BatchSolverInput,
    GrainBillEntry,
    SolverValidationError,
    kettle_cold_volume,
    post_boil_extract_target,
    solve_batch,
)
from app.core.utils import plato_to_sg, sg_to_plato


def _input(**overrides) -> BatchSolverInput:
    values = dict(
        target_abv=5.5,
        scale_pin="abv",
        target_og=1.052,
        target_fg=1.012,
        malt_attenuation_cap=1.0,
        v_ferm=20.0,
        topology="r_l_to_g",
        intensive_value=3.0,
        grain_bill=[
            GrainBillEntry(w_i=1.0, yield_i=0.80, mc_i=0.04, fermentability_i=0.643)
        ],
        s_late_add=0.0,
        sugar_extract_share=0.0,
        sugar_fermentability=1.0,
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


def _realized_fg(result) -> float:
    ae = sg_to_plato(result.sg_post_boil) * (1.0 - result.apparent_attenuation)
    return plato_to_sg(ae)


def test_abv_pin_is_the_default_and_unchanged():
    result = solve_batch(_input())
    assert result.sg_post_boil > 1.0
    assert result.real_attenuation == pytest.approx(0.643, abs=5e-4)


def test_og_pin_hits_the_gravity_target():
    result = solve_batch(_input(scale_pin="og", target_og=1.052))
    assert result.sg_post_boil == pytest.approx(1.052, abs=1e-12)
    assert result.real_attenuation > 0.0


def test_fg_pin_hits_the_apparent_extract_target():
    result = solve_batch(_input(scale_pin="fg", target_fg=1.012))
    assert _realized_fg(result) == pytest.approx(1.012, abs=1e-5)
    assert result.sg_post_boil > 1.012


def test_previews_are_empty_without_sugar():
    result = solve_batch(_input())
    assert result.previews == ()


def test_previews_are_three_rows_and_match_the_active_solve():
    result = solve_batch(_input(s_late_add=0.4))
    assert [row.pin for row in result.previews] == ["abv", "og", "fg"]
    assert all(row.ok for row in result.previews)

    by_pin = {row.pin: row for row in result.previews}
    assert by_pin["abv"].og == pytest.approx(result.sg_post_boil, abs=1e-9)
    assert by_pin["abv"].fg == pytest.approx(_realized_fg(result), abs=1e-6)


def test_preview_rows_hold_the_authored_composition():
    dose = solve_batch(_input(s_late_add=0.4))
    share = solve_batch(_input(sugar_extract_share=0.10))
    assert dose.previews[0].og != pytest.approx(share.previews[0].og, abs=1e-6)


def test_preview_rows_carry_the_share_they_actually_hold():
    inputs = _input(s_late_add=0.4)
    result = solve_batch(inputs)
    cold = kettle_cold_volume(inputs.v_ferm, inputs.v_kettle_dead, inputs.f_shrink)

    for row in result.previews:
        extract = post_boil_extract_target(row.og, cold, GAMMA_METRIC)
        assert row.sugar_extract_share == pytest.approx(0.4 / extract, rel=1e-9)

    shares = {round(row.sugar_extract_share, 9) for row in result.previews}
    assert len(shares) == 3, "a fixed dose is a different share at each gravity"


def test_share_mode_previews_report_the_authored_share():
    result = solve_batch(_input(sugar_extract_share=0.10))
    assert [row.sugar_extract_share for row in result.previews] == pytest.approx(
        [0.10, 0.10, 0.10], abs=1e-12
    )


def test_infeasible_preview_reports_no_share():
    result = solve_batch(_input(target_fg=1.10, s_late_add=0.4))
    by_pin = {row.pin: row for row in result.previews}
    assert by_pin["fg"].ok is False
    assert by_pin["fg"].sugar_extract_share == 0.0


def test_infeasible_preview_is_reported_not_raised():
    result = solve_batch(_input(target_fg=1.10, s_late_add=0.4))
    by_pin = {row.pin: row for row in result.previews}
    assert by_pin["abv"].ok is True
    assert by_pin["fg"].ok is False
    assert by_pin["fg"].reason == "FG_UNREACHABLE"


def test_fg_below_one_needs_diastaticus():
    with pytest.raises(SolverValidationError) as exc:
        solve_batch(_input(scale_pin="fg", target_fg=0.995))
    assert exc.value.code == "FG_BELOW_ZERO_WITHOUT_STA1"

    result = solve_batch(_input(scale_pin="fg", target_fg=0.995, sta1=True))
    assert _realized_fg(result) == pytest.approx(0.995, abs=1e-6)


def test_pin_targets_carry_the_effective_sugar_fermentability():
    fully = solve_batch(_input(scale_pin="fg", target_fg=1.012, s_late_add=0.4))
    mixed = solve_batch(
        _input(
            scale_pin="fg",
            target_fg=1.012,
            s_late_add=0.4,
            sugar_fermentability=0.5,
        )
    )
    assert mixed.sg_post_boil < fully.sg_post_boil
    assert mixed.real_attenuation < fully.real_attenuation
