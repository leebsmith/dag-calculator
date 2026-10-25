"""Unit tests for Phase 3 (grist mass resolution, 1D root-finding).

Stage 1.3 scope: ``grist_mass_bracket``, ``grist_mass_residual``, and
``solve_grist_mass`` under the ``{V_pre_boil, R_L:G}`` topology only.
"""

import math

import pytest

from app.core.batch_solver import (
    SolverValidationError,
    grist_mass_bracket,
    grist_mass_residual,
    solve_grist_mass,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def standard_case():
    """A plausible 20 L batch: ~5 kg grist, 3:1 L:G, 75% conversion."""
    return dict(
        v_pre_boil=25.0,
        r_l_to_g=3.0,
        yield_fraction=0.7474,
        mc_bar=0.042,
        eta_conv=0.75,
        s_post_boil_target=2.7808,
        s_late_add=0.0,
        v_dead=0.5,
    )


# ---------------------------------------------------------------------------
# grist_mass_bracket
# ---------------------------------------------------------------------------


def test_grist_mass_bracket_known_value():
    # delta_s = 2.7808, E = 0.7474
    # a = 2.7808 / 0.7474 = 3.7206...
    # b = 2.7808 / (0.5 * 0.7474) = 7.4412...
    a, b = grist_mass_bracket(2.7808, 0.0, 0.7474)
    assert a == pytest.approx(3.7206, abs=1e-4)
    assert b == pytest.approx(7.4412, abs=1e-4)


def test_grist_mass_bracket_upper_is_double_lower():
    a, b = grist_mass_bracket(2.7808, 0.0, 0.7474)
    assert b == pytest.approx(2.0 * a)


def test_grist_mass_bracket_lower_clamped_at_zero():
    # Late addition exceeds target -> delta_s negative -> a clamped to 0.
    a, b = grist_mass_bracket(1.0, 2.0, 0.7474)
    assert a == 0.0
    assert b < 0.0


# ---------------------------------------------------------------------------
# grist_mass_residual
# ---------------------------------------------------------------------------


def test_grist_mass_residual_is_finite(standard_case):
    value = grist_mass_residual(m_grist=5.0, **standard_case)
    assert math.isfinite(value)


def test_grist_mass_residual_changes_sign_across_bracket(standard_case):
    a, b = grist_mass_bracket(
        standard_case["s_post_boil_target"],
        standard_case["s_late_add"],
        standard_case["yield_fraction"],
    )
    f_a = grist_mass_residual(m_grist=a, **standard_case)
    f_b = grist_mass_residual(m_grist=b, **standard_case)
    assert f_a * f_b < 0.0


def test_grist_mass_residual_is_pure(standard_case):
    first = grist_mass_residual(m_grist=5.0, **standard_case)
    second = grist_mass_residual(m_grist=5.0, **standard_case)
    assert first == second


# ---------------------------------------------------------------------------
# solve_grist_mass
# ---------------------------------------------------------------------------


def test_solve_grist_mass_returns_positive_root(standard_case):
    m_grist = solve_grist_mass(**standard_case)
    assert m_grist > 0.0
    assert math.isfinite(m_grist)


def test_solve_grist_mass_root_is_actually_a_root(standard_case):
    m_grist = solve_grist_mass(**standard_case)
    residual = grist_mass_residual(m_grist=m_grist, **standard_case)
    assert residual == pytest.approx(0.0, abs=1e-6)


def test_solve_grist_mass_is_pure(standard_case):
    first = solve_grist_mass(**standard_case)
    second = solve_grist_mass(**standard_case)
    assert first == second


def test_solve_grist_mass_increases_with_extract_target(standard_case):
    # Both targets must be feasible within the 25 L pre-boil anchor.
    low = solve_grist_mass(**{**standard_case, "s_post_boil_target": 2.0})
    high = solve_grist_mass(**{**standard_case, "s_post_boil_target": 3.0})
    assert high > low


def test_solve_grist_mass_rejects_non_positive_yield_fraction(standard_case):
    with pytest.raises(SolverValidationError) as exc:
        solve_grist_mass(**{**standard_case, "yield_fraction": 0.0})
    assert exc.value.code == "INVALID_YIELD"


def test_solve_grist_mass_rejects_non_positive_extract_target(standard_case):
    with pytest.raises(SolverValidationError) as exc:
        solve_grist_mass(
            **{**standard_case, "s_post_boil_target": 0.0, "s_late_add": 0.5}
        )
    assert exc.value.code == "EXTRACT_TARGET_NON_POSITIVE"


def test_solve_grist_mass_rejects_infeasible_target(standard_case):
    # A 5 kg extract target exceeds what the 25 L pre-boil anchor can supply,
    # so the residual stays negative across the whole bracket.
    with pytest.raises(SolverValidationError) as exc:
        solve_grist_mass(**{**standard_case, "s_post_boil_target": 5.0})
    assert exc.value.code == "BRACKET_NO_SIGN_CHANGE"
