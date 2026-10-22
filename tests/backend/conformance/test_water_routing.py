"""Routing and constraint surface: the AUTO truth table and the pin fixture.

The frontend renders a target only for the ions a mode actually constrains
(``views/registry/water.js:pinnedIonsFor``). That table is declared in JS and
cannot import the Python router, so the two are tied together by a committed
fixture generated from the solver's *observable* behaviour: for each canonical
mode, solve a distinctive target vector and record which ions land on target.

Refresh with ``UPDATE_FIXTURES=1 uv run pytest tests/backend/conformance/test_water_routing.py``.
"""

from __future__ import annotations

import itertools
import json
import os
from pathlib import Path

import pytest

from app.core.water import (
    SolverValidationError,
    infer_adsco_mode,
    ions_added_ppm,
    solve_salt_dose,
)

FIXTURE = (
    Path(__file__).resolve().parents[2] / "conformance" / "fixtures" / "ion-constraints.json"
)

IONS = ("ca", "mg", "na", "so4", "cl", "alk")
SOURCE = {"ca": 11.0, "mg": 3.0, "na": 7.0, "so4": 13.0, "cl": 5.0, "alk": 37.0}
TARGET = {"ca": 73.0, "mg": 17.0, "na": 29.0, "so4": 211.0, "cl": 97.0, "alk": 61.0}
FIXED_STRATEGIES = ("CALCIUM_FLOOR", "FLAVOR", "HYBRID", "OPTIMIZE", "BASELINE")
PIN_EXAMPLES = (("ca", "cl"), ("so4", "mg"), ("alk",))


def _observed_held(strategy: str, pins: tuple[str, ...]) -> list[str]:
    dose, _notes, _canonical = solve_salt_dose(
        strategy,
        SOURCE,
        TARGET,
        "GYPSUM_DIHYDRATE",
        "CACL2_DIHYDRATE",
        50.0,
        custom_pinned_ions=list(pins),
    )
    added = ions_added_ppm(dose, "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE")
    reached = {ion: SOURCE[ion] + added.get(ion, 0.0) for ion in IONS}
    candidates = pins or IONS
    return [ion for ion in candidates if abs(reached[ion] - TARGET[ion]) < 1e-3]


def build_fixture() -> dict:
    return {
        "generated_by": "tests/backend/conformance/test_water_routing.py",
        "note": "Ion constraint sets observed from the solver: an ion is held when "
        "it lands on target. CUSTOM is collection-driven (the request names the pins).",
        "source": SOURCE,
        "target": TARGET,
        "modes": {strategy: _observed_held(strategy, ()) for strategy in FIXED_STRATEGIES},
        "pin_examples": {
            ",".join(pins): _observed_held("CUSTOM", pins) for pins in PIN_EXAMPLES
        },
    }


def test_ion_constraint_fixture_matches_solver_behaviour():
    fresh = build_fixture()
    if os.environ.get("UPDATE_FIXTURES") == "1":
        FIXTURE.write_text(json.dumps(fresh, indent=2, sort_keys=True) + "\n")
    stored = json.loads(FIXTURE.read_text())
    assert stored == fresh, (
        "ion-constraints.json is stale - regenerate with UPDATE_FIXTURES=1 "
        "(and update views/registry/water.js if a mode's pin set changed)"
    )


def _expected_auto(subset: frozenset[str]) -> str:
    """The classification spec, written independently of the router's branches."""
    if not subset:
        return "BASELINE"
    if subset == frozenset(IONS):
        return "OPTIMIZE"
    if subset & {"so4", "cl"} and "alk" in subset and not subset & {"ca", "mg", "na"}:
        return "HYBRID"
    if subset & {"so4", "cl", "na"} and not subset & {"ca", "mg", "alk"}:
        return "CALCIUM_FLOOR"
    return "OPTIMIZE"


@pytest.mark.parametrize(
    "subset",
    [frozenset(c) for n in range(len(IONS) + 1) for c in itertools.combinations(IONS, n)],
)
def test_auto_routing_truth_table(subset):
    target = {ion: (200.0 if ion in subset else 0.0) for ion in IONS}
    _mode, canonical, fallback = infer_adsco_mode("AUTO", target, [])
    assert canonical == _expected_auto(subset)
    assert fallback is (canonical == "OPTIMIZE" and subset != frozenset(IONS))


@pytest.mark.parametrize("subset", [frozenset({"ca", "so4"}), frozenset({"na"})])
@pytest.mark.parametrize("pins", [("so4",), ("ca", "cl")])
def test_auto_with_pins_always_uses_custom(subset, pins):
    target = {ion: (200.0 if ion in subset else 0.0) for ion in IONS}
    _mode, canonical, fallback = infer_adsco_mode("AUTO", target, list(pins))
    assert (canonical, fallback) == ("CUSTOM", False)


@pytest.mark.parametrize("pins", [("so4",), ("ca", "cl")])
def test_auto_without_targets_is_baseline_even_with_pins(pins):
    empty = {ion: 0.0 for ion in IONS}
    _mode, canonical, _fallback = infer_adsco_mode("AUTO", empty, list(pins))
    assert canonical == "BASELINE"


@pytest.mark.parametrize(
    ("strategy", "canonical"),
    [
        ("CALCIUM_FLOOR", "CALCIUM_FLOOR"),
        ("MODE_1", "CALCIUM_FLOOR"),
        ("FLAVOR", "FLAVOR"),
        ("HYBRID", "HYBRID"),
        ("MODE_2", "HYBRID"),
        ("OPTIMIZE", "OPTIMIZE"),
        ("MODE_3", "OPTIMIZE"),
        ("BASELINE", "BASELINE"),
        ("MODE_4", "BASELINE"),
        ("CUSTOM", "CUSTOM"),
        ("MODE_5", "CUSTOM"),
    ],
)
def test_explicit_strategies_are_not_rerouted(strategy, canonical):
    _mode, resolved, fallback = infer_adsco_mode(
        strategy, TARGET, ["so4"] if canonical == "CUSTOM" else []
    )
    assert (resolved, fallback) == (canonical, False)


def test_custom_without_pins_raises():
    with pytest.raises(SolverValidationError) as exc:
        solve_salt_dose(
            "CUSTOM",
            SOURCE,
            TARGET,
            "GYPSUM_DIHYDRATE",
            "CACL2_DIHYDRATE",
            50.0,
        )
    assert exc.value.code == "PINNED_IONS_REQUIRED"


def test_auto_falls_back_to_best_fit_instead_of_going_unactionable():
    events: list = []
    dose, _notes, canonical = solve_salt_dose(
        "AUTO",
        {"ca": 20.0, "so4": 9.0},
        {"ca": 60.0, "so4": 100.0},
        "GYPSUM_DIHYDRATE",
        "CACL2_DIHYDRATE",
        50.0,
        events=events,
    )
    assert canonical == "OPTIMIZE"
    assert dose.gypsum_g_per_l >= 0.0
    assert "ROUTER_AUTO_BEST_FIT" in [event.code for event in events]


def test_custom_pins_are_honoured():
    source = {"ca": 0.0, "mg": 0.0, "na": 0.0, "so4": 9.0, "cl": 3.0, "alk": 0.0}
    target = {"ca": 0.0, "mg": 0.0, "na": 0.0, "so4": 100.0, "cl": 60.0, "alk": 0.0}
    dose, _notes, canonical = solve_salt_dose(
        "CUSTOM",
        source,
        target,
        "GYPSUM_DIHYDRATE",
        "CACL2_DIHYDRATE",
        50.0,
        custom_pinned_ions=["so4", "cl"],
    )
    added = ions_added_ppm(dose, "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE")
    assert canonical == "CUSTOM"
    assert source["so4"] + added["so4"] == pytest.approx(100.0, abs=1e-4)
    assert source["cl"] + added["cl"] == pytest.approx(60.0, abs=1e-4)
