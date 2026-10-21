"""Unit tests for the shared pure helpers in ``backend/app/core/batch_solver.py``.

Stage 1.0 scope: composite constants and stage-volume helpers only.
"""

import math

import pytest

from app.core.batch_solver import (
    F_SHRINK_DEFAULT,
    GAMMA_METRIC,
    K_ABS_TRUE_METRIC,
    RHO_WATER_METRIC,
    V_BAR_METRIC,
    GrainBillEntry,
    SolverValidationError,
    composite_moisture_fraction,
    composite_volumetric_expansion,
    composite_yield_fraction,
    converted_extract,
    moisture_volume,
    retained_volume,
    solute_displacement_volume,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def simple_bill():
    """A two-malt bill: 80% base (DBFG 0.80, MC 0.04), 20% specialty (DBFG 0.70, MC 0.05)."""
    return [
        GrainBillEntry(w_i=0.80, yield_i=0.80, mc_i=0.04),
        GrainBillEntry(w_i=0.20, yield_i=0.70, mc_i=0.05),
    ]


# ---------------------------------------------------------------------------
# Physical constants
# ---------------------------------------------------------------------------


def test_metric_constants_match_documented_standards():
    assert GAMMA_METRIC == 385.641
    assert V_BAR_METRIC == 0.625
    assert K_ABS_TRUE_METRIC == 1.67
    assert RHO_WATER_METRIC == 1.00
    assert F_SHRINK_DEFAULT == 0.04


# ---------------------------------------------------------------------------
# composite_yield_fraction
# ---------------------------------------------------------------------------


def test_composite_yield_fraction_known_value(simple_bill):
    # 0.80 * 0.80 * 0.96 + 0.20 * 0.70 * 0.95
    # = 0.6144 + 0.1330 = 0.7474
    assert composite_yield_fraction(simple_bill) == pytest.approx(0.7474)


def test_composite_yield_fraction_single_malt():
    bill = [GrainBillEntry(w_i=1.0, yield_i=0.80, mc_i=0.04)]
    assert composite_yield_fraction(bill) == pytest.approx(0.80 * 0.96)


def test_composite_yield_fraction_empty_bill():
    assert composite_yield_fraction([]) == 0.0


def test_composite_yield_fraction_is_pure(simple_bill):
    first = composite_yield_fraction(simple_bill)
    second = composite_yield_fraction(simple_bill)
    assert first == second
    # Inputs are not mutated.
    assert simple_bill[0].w_i == 0.80


# ---------------------------------------------------------------------------
# composite_moisture_fraction
# ---------------------------------------------------------------------------


def test_composite_moisture_fraction_known_value(simple_bill):
    # 0.80 * 0.04 + 0.20 * 0.05 = 0.032 + 0.010 = 0.042
    assert composite_moisture_fraction(simple_bill) == pytest.approx(0.042)


def test_composite_moisture_fraction_empty_bill():
    assert composite_moisture_fraction([]) == 0.0


# ---------------------------------------------------------------------------
# composite_volumetric_expansion
# ---------------------------------------------------------------------------


def test_composite_volumetric_expansion_known_value():
    # mc_bar=0.042, v_bar=0.625, eta_conv=0.75, E=0.7474
    # c_vol = 0.042 / 1.00 + 0.625 * 0.75 * 0.7474
    #       = 0.042 + 0.35034375 = 0.39234375
    result = composite_volumetric_expansion(
        mc_bar=0.042, v_bar=0.625, eta_conv=0.75, yield_fraction=0.7474
    )
    assert result == pytest.approx(0.39234375)


def test_composite_volumetric_expansion_zero_efficiency():
    # With eta_conv = 0, only the moisture term survives.
    result = composite_volumetric_expansion(
        mc_bar=0.042, v_bar=0.625, eta_conv=0.0, yield_fraction=0.7474
    )
    assert result == pytest.approx(0.042)


# ---------------------------------------------------------------------------
# retained_volume
# ---------------------------------------------------------------------------


def test_retained_volume_known_value():
    # 1.67 * 5.0 + 0.5 = 8.35 + 0.5 = 8.85
    assert retained_volume(m_grist=5.0, k_abs_true=1.67, v_dead=0.5) == pytest.approx(8.85)


def test_retained_volume_zero_mass():
    assert retained_volume(m_grist=0.0, k_abs_true=1.67, v_dead=0.5) == pytest.approx(0.5)


def test_retained_volume_zero_dead_space():
    assert retained_volume(m_grist=5.0, k_abs_true=1.67, v_dead=0.0) == pytest.approx(8.35)


# ---------------------------------------------------------------------------
# moisture_volume
# ---------------------------------------------------------------------------


def test_moisture_volume_known_value():
    # 5.0 * 0.042 / 1.00 = 0.21
    assert moisture_volume(m_grist=5.0, mc_bar=0.042) == pytest.approx(0.21)


def test_moisture_volume_zero_mass():
    assert moisture_volume(m_grist=0.0, mc_bar=0.042) == 0.0


# ---------------------------------------------------------------------------
# solute_displacement_volume
# ---------------------------------------------------------------------------


def test_solute_displacement_volume_known_value():
    # 0.625 * 2.8 = 1.75
    assert solute_displacement_volume(s_conv=2.8, v_bar=0.625) == pytest.approx(1.75)


def test_solute_displacement_volume_zero_extract():
    assert solute_displacement_volume(s_conv=0.0, v_bar=0.625) == 0.0


# ---------------------------------------------------------------------------
# converted_extract
# ---------------------------------------------------------------------------


def test_converted_extract_known_value():
    # 0.75 * 0.7474 * 5.0 = 2.80275
    assert converted_extract(
        m_grist=5.0, yield_fraction=0.7474, eta_conv=0.75
    ) == pytest.approx(2.80275)


def test_converted_extract_zero_mass():
    assert converted_extract(m_grist=0.0, yield_fraction=0.7474, eta_conv=0.75) == 0.0


def test_converted_extract_zero_efficiency():
    assert converted_extract(m_grist=5.0, yield_fraction=0.7474, eta_conv=0.0) == 0.0


# ---------------------------------------------------------------------------
# SolverValidationError
# ---------------------------------------------------------------------------


def test_solver_validation_error_carries_code_and_message():
    err = SolverValidationError("GATE_FAILED", "target extract below late additions")
    assert err.code == "GATE_FAILED"
    assert err.message == "target extract below late additions"
    assert isinstance(err, ValueError)
    assert str(err) == "target extract below late additions"


# ---------------------------------------------------------------------------
# Cross-helper consistency
# ---------------------------------------------------------------------------


def test_helpers_compose_consistently(simple_bill):
    """The helpers compose without re-deriving shared quantities."""
    E = composite_yield_fraction(simple_bill)
    mc_bar = composite_moisture_fraction(simple_bill)
    c_vol = composite_volumetric_expansion(
        mc_bar=mc_bar, v_bar=V_BAR_METRIC, eta_conv=0.75, yield_fraction=E
    )
    s_conv = converted_extract(m_grist=5.0, yield_fraction=E, eta_conv=0.75)
    v_sol = solute_displacement_volume(s_conv=s_conv, v_bar=V_BAR_METRIC)
    v_mc = moisture_volume(m_grist=5.0, mc_bar=mc_bar)
    v_ret = retained_volume(m_grist=5.0, k_abs_true=K_ABS_TRUE_METRIC, v_dead=0.5)

    # c_vol * M_grist should equal V_mc + V_sol (the definitional identity).
    assert c_vol * 5.0 == pytest.approx(v_mc + v_sol)
    # V_ret is strictly positive for positive mass.
    assert v_ret > 0.0
    # No NaN or inf leaked out.
    for value in (E, mc_bar, c_vol, s_conv, v_sol, v_mc, v_ret):
        assert math.isfinite(value)
