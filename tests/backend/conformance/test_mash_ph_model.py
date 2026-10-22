"""Bounded buffer-capacity mash pH model (replaces the linear extrapolation)."""

from __future__ import annotations

import pytest

from app.core.water import (
    GrainEntry,
    WaterChemistryInput,
    predict_mash_ph,
    solve_water_chemistry,
)

V, T = 15.0, 3.0


def test_bounded_at_alkaline_extreme():
    # High residual alkalinity vs. low grist acidity: the old model diverged to
    # pH 10-55. The buffer-capacity ceiling must cap it.
    for ra in (200.0, 400.0, 1000.0):
        ph = predict_mash_ph(5.0, ra, V, T)
        assert 4.0 <= ph <= 6.0, (ra, ph)


def test_bounded_at_acid_extreme():
    ph = predict_mash_ph(500.0, 0.0, V, T)
    assert 4.0 <= ph <= 6.0


def test_monotonic_in_acidity_and_alkalinity():
    acids = [0.0, 10.0, 30.0, 80.0, 200.0]
    for i in range(len(acids) - 1):
        assert predict_mash_ph(acids[i + 1], 0.0, V, T) <= predict_mash_ph(acids[i], 0.0, V, T)

    ras = [0.0, 40.0, 100.0, 200.0]
    for i in range(len(ras) - 1):
        assert predict_mash_ph(10.0, ras[i + 1], V, T) >= predict_mash_ph(10.0, ras[i], V, T)


def test_vendored_anchor_still_in_band():
    # tests/backend/conformance/test_water_chemistry_core.py asserts
    # 4.0 < pH < 6.5 for this exact input; the new curve must satisfy it.
    assert 4.0 < predict_mash_ph(20.0, 0.0, V, T) < 6.5


def test_typical_base_malt_lands_in_window():
    # ~4.2 meq grist acidity, no RA: a pale mash should sit in the 5.0-5.8 band.
    assert 5.0 < predict_mash_ph(4.17, 0.0, V, T) < 5.8


def test_invalid_volume_still_raises():
    from app.core.water import SolverValidationError

    with pytest.raises(SolverValidationError) as exc:
        predict_mash_ph(20.0, 0.0, 0.0, T)
    assert exc.value.code == "INVALID_MASH_VOLUME"


def test_alkaline_buffer_target_stays_bounded_end_to_end():
    inp = WaterChemistryInput(
        grist=[GrainEntry(4.5, 1.5, "BASE")],
        source={"ca": 0.0, "mg": 0.0, "na": 0.0, "so4": 0.0, "cl": 0.0, "alk": 0.0},
        target={"so4": 50.0, "cl": 120.0, "alk": 300.0},
        v_mash_treat_l=V,
        v_hlt_treat_l=20.0,
        v_hlt_debt_l=1.0,
        v_sparge_demand_l=18.0,
        mash_thickness_l_per_kg=T,
        target_mash_ph=5.4,
        strategy="HYBRID",
    )
    out = solve_water_chemistry(inp)
    assert 3.5 < out.predicted_mash_ph < 7.5
    assert out.mash_acid_ml >= 0.0
