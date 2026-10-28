"""Seeded invariant fuzz across the water solver's input surface.

Not a golden oracle: this asserts the structural invariants (non-negative doses,
pH band or explicit out-of-range flag, vessel distribution rules, residual HLT,
determinism, additions only) on pseudo-random yet physically plausible inputs.
Skipped by default; ``make test-fuzz`` supplies the case count and seed.
"""

from __future__ import annotations

import os

import pytest
from conformance.test_water_matrix import (
    BEERS,
    IONS,
    WATERS,
    _assert_invariants,
    _lcg,
    _request,
)

from app.core.water.orchestration import solve_water_chemistry

CASES = int(os.environ.get("WATER_FUZZ_CASES", "0"))
SEED = int(os.environ.get("WATER_FUZZ_SEED", "20261022"))

STRATEGIES = ("AUTO", "CALCIUM_FLOOR", "HYBRID", "OPTIMIZE", "BASELINE")
DISTRIBUTIONS = ("PROPORTIONAL", "MASH_ONLY")
ACIDS = ("LACTIC_88", "PHOSPHORIC_10", "PHOSPHORIC_85")
FORMS = (
    ("GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE"),
    ("GYPSUM_ANHYDROUS", "CACL2_ANHYDROUS"),
)
AGENTS = ("BAKING_SODA", "CHALK", "PICKLING_LIME")
PH_TARGETS = (5.2, 5.4, 5.6)
ION_TARGET_MAX = {"ca": 300.0, "mg": 100.0, "na": 250.0, "so4": 400.0, "cl": 300.0, "alk": 250.0}


def _pick(rng, values):
    return values[int(next(rng) * len(values))]


@pytest.mark.skipif(CASES <= 0, reason="set WATER_FUZZ_CASES to run the sweep")
def test_seeded_fuzz_invariants():
    rng = _lcg(SEED)
    water_names = list(WATERS)

    for _case in range(CASES):
        beer = _pick(rng, list(BEERS))
        water = _pick(rng, water_names)
        strategy = _pick(rng, STRATEGIES)
        gypsum_form, cacl2_form = _pick(rng, FORMS)
        target = {
            ion: round(next(rng) * ION_TARGET_MAX[ion], 1) if next(rng) < 0.7 else 0.0
            for ion in IONS
        }
        inp = _request(
            beer,
            water,
            target,
            strategy=strategy,
            salt_distribution=_pick(rng, DISTRIBUTIONS),
            acid_medium=_pick(rng, ACIDS),
            gypsum_form=gypsum_form,
            cacl2_form=cacl2_form,
            preferred_alkaline_agent=_pick(rng, AGENTS),
            calcium_floor_ppm=0.0 if next(rng) < 0.2 else 50.0,
            target_mash_ph=_pick(rng, PH_TARGETS),
        )
        out = solve_water_chemistry(inp)
        _assert_invariants(inp, out)
