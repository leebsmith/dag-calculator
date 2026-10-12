"""Unit tests for Phase 1 (cold-side inverse resolution).

Stage 1.1 scope: ``solve_sg_post_boil_from_abv`` and its ASBC/Cutaia helpers.
"""

import math

import pytest

from app.core.batch_solver import (
    SolverValidationError,
    asbc_plato_to_sg,
    asbc_sg_to_plato,
    cutaia_abv,
    solve_sg_post_boil_from_abv,
)
from app.core.utils import plato_to_sg, sg_to_plato


# ---------------------------------------------------------------------------
# ASBC conversion helpers
# ---------------------------------------------------------------------------


def test_asbc_plato_to_sg_at_zero_is_water():
    # The ASBC 3rd-order polynomial carries a small constant offset
    # (1.0000131), so 0 °P maps to just above 1.000 SG.
    assert asbc_plato_to_sg(0.0) == pytest.approx(1.0000131, abs=1e-7)


def test_asbc_plato_to_sg_known_value():
    # 12 °P is a common ale gravity; the ASBC cubic yields ~1.0484.
    assert asbc_plato_to_sg(12.0) == pytest.approx(1.0484, abs=1e-3)


def test_asbc_plato_to_sg_is_monotonic():
    values = [asbc_plato_to_sg(p) for p in range(0, 41, 5)]
    assert values == sorted(values)


def test_asbc_sg_to_plato_round_trip():
    # The ASBC cubic and its inverse are consistent to within a small
    # tolerance across the brewing range.
    for plato in (5.0, 10.0, 15.0, 20.0):
        sg = asbc_plato_to_sg(plato)
        assert asbc_sg_to_plato(sg) == pytest.approx(plato, abs=0.05)


def test_asbc_aliases_match_utils_exactly():
    """Stage 5 regression: the solver's ASBC aliases must be identical to
    ``app.core.utils``'s implementations. This pins the reconciliation so a
    future edit to either module cannot silently reintroduce the divergence.
    """
    for plato in (0.0, 5.0, 10.0, 12.0, 20.0, 40.0):
        assert asbc_plato_to_sg(plato) == plato_to_sg(plato)
    for sg in (1.000, 1.010, 1.040, 1.050, 1.080, 1.120):
        assert asbc_sg_to_plato(sg) == sg_to_plato(sg)


# ---------------------------------------------------------------------------
# Cutaia ABV model
# ---------------------------------------------------------------------------


def test_cutaia_abv_zero_attenuation_is_zero_abv():
    # With AA = 0, AE = OE, so RE = OE and delta = 0 -> ABV = 0.
    assert cutaia_abv(oe_plato=12.0, apparent_attenuation=0.0) == pytest.approx(0.0)


def test_cutaia_abv_increases_with_attenuation():
    low = cutaia_abv(oe_plato=12.0, apparent_attenuation=0.60)
    high = cutaia_abv(oe_plato=12.0, apparent_attenuation=0.80)
    assert high > low


def test_cutaia_abv_increases_with_original_extract():
    low = cutaia_abv(oe_plato=8.0, apparent_attenuation=0.75)
    high = cutaia_abv(oe_plato=16.0, apparent_attenuation=0.75)
    assert high > low


def test_cutaia_abv_typical_ale_is_plausible():
    # A 12 °P wort at 75% AA should land in the ~4.5-5.5% ABV range.
    abv = cutaia_abv(oe_plato=12.0, apparent_attenuation=0.75)
    assert 4.5 < abv < 5.5


# ---------------------------------------------------------------------------
# solve_sg_post_boil_from_abv
# ---------------------------------------------------------------------------


def test_solve_sg_post_boil_round_trip():
    """ABV -> SG -> ABV should recover the original target.

    The ASBC quadratic inversion is only approximate, so the round-trip
    tolerance is loosened to 1e-2 ABV percentage points.
    """
    target_abv = 5.0
    aa = 0.75
    sg = solve_sg_post_boil_from_abv(target_abv, aa)
    oe_plato = asbc_sg_to_plato(sg)
    recovered_abv = cutaia_abv(oe_plato, aa)
    assert recovered_abv == pytest.approx(target_abv, abs=1e-2)


def test_solve_sg_post_boil_known_value():
    # 5.0% ABV at 75% AA corresponds to roughly 1.050 SG.
    sg = solve_sg_post_boil_from_abv(5.0, 0.75)
    assert sg == pytest.approx(1.050, abs=0.005)


def test_solve_sg_post_boil_increases_with_abv():
    low = solve_sg_post_boil_from_abv(4.0, 0.75)
    high = solve_sg_post_boil_from_abv(8.0, 0.75)
    assert high > low


def test_solve_sg_post_boil_decreases_with_attenuation():
    # To hit a fixed ABV, lower attenuation requires a higher OG: less of the
    # sugar is fermented, so more must be present to begin with.
    low_aa = solve_sg_post_boil_from_abv(5.0, 0.60)
    high_aa = solve_sg_post_boil_from_abv(5.0, 0.85)
    assert low_aa > high_aa


def test_solve_sg_post_boil_rejects_non_positive_abv():
    with pytest.raises(SolverValidationError) as exc:
        solve_sg_post_boil_from_abv(0.0, 0.75)
    assert exc.value.code == "INVALID_TARGET_ABV"


def test_solve_sg_post_boil_rejects_zero_attenuation():
    with pytest.raises(SolverValidationError) as exc:
        solve_sg_post_boil_from_abv(5.0, 0.0)
    assert exc.value.code == "INVALID_ATTENUATION"


def test_solve_sg_post_boil_rejects_attenuation_above_one():
    with pytest.raises(SolverValidationError) as exc:
        solve_sg_post_boil_from_abv(5.0, 1.5)
    assert exc.value.code == "INVALID_ATTENUATION"


def test_solve_sg_post_boil_rejects_unreachable_abv():
    # 40 °P at 100% AA yields well under 30% ABV; 50% is unreachable.
    with pytest.raises(SolverValidationError) as exc:
        solve_sg_post_boil_from_abv(50.0, 1.0)
    assert exc.value.code == "ABV_UNREACHABLE"


def test_solve_sg_post_boil_is_pure():
    first = solve_sg_post_boil_from_abv(5.0, 0.75)
    second = solve_sg_post_boil_from_abv(5.0, 0.75)
    assert first == second
    assert math.isfinite(first)
