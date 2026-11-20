"""Routing and constraint surface: the accepted strategies and the pin fixture.

The frontend renders a target only for the ions a mode actually constrains
(``views/registry/water.js:pinnedIonsFor``). That table is declared in JS and
cannot import the Python router, so the two are tied together by a committed
fixture generated from the solver's *observable* behaviour: for each canonical
mode, solve a distinctive target vector and record which ions land on target.

Refresh with ``UPDATE_FIXTURES=1 uv run pytest tests/backend/conformance/test_water_routing.py``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from app.core.errors import SolverValidationError
from app.core.water.dosing import solve_salt_dose
from app.core.water.router import STRATEGIES, resolve_strategy
from app.core.water.salts import ions_added_ppm
from app.schemas.boundary import WaterStrategy

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


@pytest.mark.parametrize("strategy", STRATEGIES)
def test_canonical_strategies_resolve_to_themselves(strategy):
    assert resolve_strategy(strategy) == strategy


@pytest.mark.parametrize("strategy", ["AUTO", "MODE_1", "FLAVOR_ONLY", "", "bogus"])
def test_unknown_strategies_are_rejected(strategy):
    with pytest.raises(SolverValidationError) as exc:
        resolve_strategy(strategy)
    assert exc.value.code == "UNKNOWN_STRATEGY"
    assert "Expected one of" in exc.value.message


def test_accepted_strategies_match_the_schema_enum():
    assert set(STRATEGIES) == {member.value for member in WaterStrategy}


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
