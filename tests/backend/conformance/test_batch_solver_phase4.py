"""Unit tests for Phase 4 (stage volume & gravity cascade).

Stage 1.4 scope: ``first_runnings_volume``, ``second_runnings_volume``,
``stage_extract_split``, ``calculate_sg_pre_boil``, and the
``resolve_stage_cascade`` orchestrator for both constraint topologies.
"""

import math

import pytest

from app.core.batch_solver import (
    GAMMA_METRIC,
    K_ABS_TRUE_METRIC,
    V_BAR_METRIC,
    SolverValidationError,
    calculate_sg_pre_boil,
    first_runnings_volume,
    resolve_stage_cascade,
    second_runnings_volume,
    stage_extract_split,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def cascade_case():
    """A plausible 20 L batch: ~5 kg grist, 75% conversion."""
    return dict(
        m_grist=5.0,
        v_pre_boil=25.0,
        yield_fraction=0.7474,
        mc_bar=0.042,
        eta_conv=0.75,
        v_dead=0.5,
        delta_v_evap=3.0,
    )


# ---------------------------------------------------------------------------
# first_runnings_volume / second_runnings_volume
# ---------------------------------------------------------------------------


def test_first_runnings_volume_known_value():
    # 15.0 + 0.21 + 1.75 - 8.85 = 8.11
    assert first_runnings_volume(15.0, 0.21, 1.75, 8.85) == pytest.approx(8.11)


def test_second_runnings_volume_known_value():
    assert second_runnings_volume(25.0, 8.11) == pytest.approx(16.89)


def test_runnings_volumes_sum_to_pre_boil():
    v_run1 = first_runnings_volume(15.0, 0.21, 1.75, 8.85)
    v_run2 = second_runnings_volume(25.0, v_run1)
    assert v_run1 + v_run2 == pytest.approx(25.0)


# ---------------------------------------------------------------------------
# stage_extract_split
# ---------------------------------------------------------------------------


def test_stage_extract_split_is_finite():
    s_run1, s_run2 = stage_extract_split(
        s_conv=2.80275,
        v_ret=8.85,
        v_strike=15.0,
        v_mc=0.21,
        v_sol=1.75,
        v_sparge=16.89,
    )
    assert math.isfinite(s_run1)
    assert math.isfinite(s_run2)


def test_stage_extract_split_never_exceeds_converted_extract():
    s_conv = 2.80275
    s_run1, s_run2 = stage_extract_split(
        s_conv=s_conv,
        v_ret=8.85,
        v_strike=15.0,
        v_mc=0.21,
        v_sol=1.75,
        v_sparge=16.89,
    )
    assert 0.0 <= s_run1 <= s_conv
    assert 0.0 <= s_run2 <= s_conv
    assert s_run1 + s_run2 <= s_conv


# ---------------------------------------------------------------------------
# calculate_sg_pre_boil
# ---------------------------------------------------------------------------


def test_calculate_sg_pre_boil_known_value():
    # 1 + ((2.0 + 0.5) * 385.641) / (1000 * 25.0) = 1 + 964.1025 / 25000 = 1.0385641
    result = calculate_sg_pre_boil(2.0, 0.5, 25.0, GAMMA_METRIC)
    assert result == pytest.approx(1.0385641, abs=1e-5)


def test_calculate_sg_pre_boil_zero_extract_is_water():
    assert calculate_sg_pre_boil(0.0, 0.0, 25.0, GAMMA_METRIC) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# resolve_stage_cascade: {V_pre_boil, R_L:G} topology
# ---------------------------------------------------------------------------


def test_resolve_stage_cascade_r_l_to_g_returns_consistent_volumes(cascade_case):
    result = resolve_stage_cascade(
        **cascade_case, topology="r_l_to_g", intensive_value=3.0
    )
    assert result.v_strike == pytest.approx(15.0)
    assert result.v_run1 + result.v_run2 == pytest.approx(cascade_case["v_pre_boil"])
    assert result.v_sparge == pytest.approx(result.v_run2)


def test_resolve_stage_cascade_v_post_boil_is_kettle_balance(cascade_case):
    result = resolve_stage_cascade(
        **cascade_case, topology="r_l_to_g", intensive_value=3.0
    )
    assert result.v_post_boil == pytest.approx(
        cascade_case["v_pre_boil"] - cascade_case["delta_v_evap"]
    )


def test_resolve_stage_cascade_r_l_to_g_is_pure(cascade_case):
    kwargs = dict(**cascade_case, topology="r_l_to_g", intensive_value=3.0)
    first = resolve_stage_cascade(**kwargs)
    second = resolve_stage_cascade(**kwargs)
    assert first == second


# ---------------------------------------------------------------------------
# resolve_stage_cascade: {V_pre_boil, r} topology
# ---------------------------------------------------------------------------


def test_resolve_stage_cascade_runoff_ratio_static_split(cascade_case):
    # r = 1.0 -> V_sparge = V_run2 = V_pre_boil / 2 = 12.5
    result = resolve_stage_cascade(
        **cascade_case, topology="runoff_ratio", intensive_value=1.0
    )
    assert result.v_sparge == pytest.approx(12.5)
    assert result.v_run2 == pytest.approx(12.5)
    assert result.v_run1 == pytest.approx(12.5)


def test_resolve_stage_cascade_runoff_ratio_reverses_strike(cascade_case):
    result = resolve_stage_cascade(
        **cascade_case, topology="runoff_ratio", intensive_value=1.0
    )
    # V_strike = V_run1 + V_ret - V_mc - V_sol
    v_mc = 5.0 * 0.042
    s_conv = 0.75 * 0.7474 * 5.0
    v_sol = V_BAR_METRIC * s_conv
    v_ret = K_ABS_TRUE_METRIC * 5.0 + 0.5
    expected = 12.5 + v_ret - v_mc - v_sol
    assert result.v_strike == pytest.approx(expected)


def test_resolve_stage_cascade_runoff_ratio_is_pure(cascade_case):
    kwargs = dict(**cascade_case, topology="runoff_ratio", intensive_value=1.0)
    first = resolve_stage_cascade(**kwargs)
    second = resolve_stage_cascade(**kwargs)
    assert first == second


# ---------------------------------------------------------------------------
# resolve_stage_cascade: validation
# ---------------------------------------------------------------------------


def test_resolve_stage_cascade_rejects_unknown_topology(cascade_case):
    with pytest.raises(SolverValidationError) as exc:
        resolve_stage_cascade(
            **cascade_case, topology="bogus", intensive_value=3.0
        )
    assert exc.value.code == "UNKNOWN_TOPOLOGY"


def test_resolve_stage_cascade_rejects_non_positive_intensive_value(cascade_case):
    with pytest.raises(SolverValidationError) as exc:
        resolve_stage_cascade(
            **cascade_case, topology="r_l_to_g", intensive_value=0.0
        )
    assert exc.value.code == "INVALID_INTENSIVE_VALUE"


def test_resolve_stage_cascade_accounts_for_mash_transfer_loss(cascade_case):
    result = resolve_stage_cascade(
        **cascade_case, topology="r_l_to_g", intensive_value=3.0,
        mash_transfer_loss=0.5,
    )
    # The mash tun drains the kettle target plus the hose holdup.
    assert result.v_run1 + result.v_run2 == pytest.approx(
        cascade_case["v_pre_boil"] + 0.5
    )


def test_resolve_stage_cascade_runoff_ratio_accounts_for_mash_transfer_loss(cascade_case):
    result = resolve_stage_cascade(
        **cascade_case, topology="runoff_ratio", intensive_value=1.0,
        mash_transfer_loss=0.5,
    )
    assert result.v_run1 + result.v_run2 == pytest.approx(
        cascade_case["v_pre_boil"] + 0.5
    )
    assert result.v_sparge == pytest.approx(result.v_run2)


def test_resolve_stage_cascade_exposes_hidden_volume_terms(cascade_case):
    result = resolve_stage_cascade(
        **cascade_case, topology="r_l_to_g", intensive_value=3.0
    )
    m = cascade_case["m_grist"]
    # v_absorption = k_abs_true * m; v_mc = m * mc_bar; v_sol = v_bar * S_conv.
    assert result.v_absorption == pytest.approx(K_ABS_TRUE_METRIC * m)
    assert result.v_mc == pytest.approx(m * cascade_case["mc_bar"])
    s_conv = cascade_case["eta_conv"] * cascade_case["yield_fraction"] * m
    assert result.v_sol == pytest.approx(V_BAR_METRIC * s_conv)


def test_resolve_stage_cascade_ledger_reconciles(cascade_case):
    result = resolve_stage_cascade(
        **cascade_case, topology="r_l_to_g", intensive_value=3.0,
        mash_transfer_loss=0.5,
    )
    # Strike + moisture + extract - absorption - dead space - transfer = pre-boil.
    reconciled = (
        result.v_strike + result.v_mc + result.v_sol + result.v_sparge
        - result.v_absorption - cascade_case["v_dead"] - 0.5
    )
    assert reconciled == pytest.approx(cascade_case["v_pre_boil"])
