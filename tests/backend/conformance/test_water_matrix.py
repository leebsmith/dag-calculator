"""Water solver matrix: beers x source waters x settings, invariants only.

There is no oracle for every combination, so these cases assert *properties* the
physics and the contract demand rather than golden numbers. Curated scenarios
carry explicit expectations (held ions, telemetry, expected failures); the seeded
combination sweep asserts the structural invariants across the axes.
"""

from __future__ import annotations

import math

import pytest

from app.core.water import (
    GrainEntry,
    SolverValidationError,
    WaterChemistryInput,
    mash_ph_status,
    solve_water_chemistry,
)

IONS = ("ca", "mg", "na", "so4", "cl", "alk")
SALTS = ("gypsum_g", "cacl2_g", "epsom_g", "nacl_g")

BEERS = {
    "pilsner": ([GrainEntry(4.5, 1.5, "BASE")], 3.0, 5.3),
    "pale-ale": ([GrainEntry(4.0, 2.0, "BASE"), GrainEntry(0.6, 40.0, "CRYSTAL")], 3.0, 5.4),
    "amber": ([GrainEntry(3.6, 2.0, "BASE"), GrainEntry(1.0, 60.0, "CRYSTAL")], 2.8, 5.4),
    "stout": (
        [GrainEntry(3.6, 2.0, "BASE"), GrainEntry(0.5, 350.0, "ROASTED"), GrainEntry(0.4, 60.0, "CRYSTAL")],
        2.6,
        5.5,
    ),
    "imperial-stout": ([GrainEntry(7.5, 2.0, "BASE"), GrainEntry(1.4, 350.0, "ROASTED")], 2.4, 5.5),
    "acid-malt": ([GrainEntry(4.0, 2.0, "BASE"), GrainEntry(0.6, 2.5, "ACID")], 3.0, 5.3),
}

WATERS = {
    "ro": {"ca": 0.0, "mg": 0.0, "na": 0.0, "so4": 0.0, "cl": 0.0, "alk": 0.0},
    "soft": {"ca": 10.0, "mg": 2.0, "na": 8.0, "so4": 5.0, "cl": 5.0, "alk": 15.0},
    "ward-labs": {"ca": 21.5, "mg": 5.0, "na": 10.0, "so4": 9.0, "cl": 3.0, "alk": 78.0},
    "hard-bicarbonate": {"ca": 90.0, "mg": 20.0, "na": 30.0, "so4": 40.0, "cl": 30.0, "alk": 240.0},
    "mineralized": {"ca": 300.0, "mg": 40.0, "na": 60.0, "so4": 500.0, "cl": 80.0, "alk": 120.0},
    "chloride-heavy": {"ca": 60.0, "mg": 10.0, "na": 40.0, "so4": 20.0, "cl": 250.0, "alk": 90.0},
    "sulfate-heavy": {"ca": 80.0, "mg": 15.0, "na": 25.0, "so4": 400.0, "cl": 30.0, "alk": 60.0},
}

FLAVOR_TARGET = {"so4": 250.0, "cl": 50.0}
BUFFER_TARGET = {"so4": 50.0, "cl": 120.0, "alk": 60.0}
CLONE_TARGET = {"ca": 60.0, "mg": 8.0, "na": 20.0, "so4": 100.0, "cl": 70.0, "alk": 40.0}


def _request(beer, water, target, **overrides):
    grist, thickness, ph = BEERS[beer]
    params = dict(
        grist=list(grist),
        source=dict(WATERS[water]),
        target=dict(target),
        v_mash_treat_l=15.0,
        v_hlt_treat_l=20.0,
        v_hlt_debt_l=1.0,
        v_sparge_demand_l=18.0,
        mash_thickness_l_per_kg=thickness,
        target_mash_ph=ph,
        strategy="AUTO",
    )
    params.update(overrides)
    return WaterChemistryInput(**params)


SCENARIOS = [
    pytest.param(
        "ro-pilsner-flavor",
        _request("pilsner", "ro", FLAVOR_TARGET, strategy="CALCIUM_FLOOR"),
        {"held": {"so4": 250.0, "cl": 50.0}},
        id="ro-pilsner-flavor",
    ),
    pytest.param(
        "soft-pale-auto",
        _request("pale-ale", "soft", FLAVOR_TARGET),
        {"held": {"so4": 250.0, "cl": 50.0}},
        id="soft-pale-auto",
    ),
    pytest.param(
        "ward-stout-hybrid",
        _request("stout", "ward-labs", BUFFER_TARGET, strategy="HYBRID"),
        {"held": {"so4": 50.0, "cl": 120.0}},
        id="ward-stout-hybrid",
    ),
    pytest.param(
        "hard-bicarbonate-pilsner-hybrid",
        _request("pilsner", "hard-bicarbonate", BUFFER_TARGET, strategy="HYBRID", salt_distribution="MASH_ONLY"),
        {"held": {"so4": 50.0, "cl": 120.0}},
        id="hard-bicarbonate-pilsner-hybrid",
    ),
    pytest.param(
        "mineralized-imperial-clone",
        _request("imperial-stout", "mineralized", CLONE_TARGET, strategy="OPTIMIZE"),
        {},
        id="mineralized-imperial-clone",
    ),
    pytest.param(
        "chloride-heavy-amber-auto",
        _request("amber", "chloride-heavy", {"cl": 150.0, "so4": 30.0}),
        {
            "held": {"so4": 30.0},
            "at_least": {"cl": 250.0},
            "telemetry": ["FLAVOR_TARGET_BELOW_SOURCE"],
        },
        id="chloride-heavy-amber-auto",
    ),
    pytest.param(
        "sulfate-heavy-acid-malt",
        _request("acid-malt", "sulfate-heavy", {"so4": 450.0, "cl": 60.0}),
        {"held": {"so4": 450.0, "cl": 60.0}},
        id="sulfate-heavy-acid-malt",
    ),
    pytest.param(
        "baseline-ro",
        _request("pilsner", "ro", FLAVOR_TARGET, strategy="BASELINE"),
        {"no_salt_dose": True},
        id="baseline-ro",
    ),
    pytest.param(
        "phosphoric-anhydrous-agent",
        _request(
            "pale-ale",
            "ward-labs",
            BUFFER_TARGET,
            strategy="HYBRID",
            acid_medium="PHOSPHORIC_85",
            gypsum_form="GYPSUM_ANHYDROUS",
            cacl2_form="CACL2_ANHYDROUS",
            preferred_alkaline_agent="BAKING_SODA",
        ),
        {"held": {"so4": 50.0, "cl": 120.0}},
        id="phosphoric-anhydrous-agent",
    ),
    pytest.param(
        "acid-target-ph-low",
        _request("stout", "ward-labs", BUFFER_TARGET, strategy="HYBRID", target_mash_ph=5.2),
        {"held": {"so4": 50.0, "cl": 120.0}},
        id="acid-target-ph-low",
    ),
    pytest.param(
        "custom-pins-flavor",
        _request(
            "pale-ale",
            "soft",
            FLAVOR_TARGET,
            strategy="CUSTOM",
            custom_pinned_ions=["so4", "cl"],
        ),
        {"held": {"so4": 250.0, "cl": 50.0}},
        id="custom-pins-flavor",
    ),
    pytest.param(
        "custom-pin-below-source",
        _request(
            "pale-ale",
            "hard-bicarbonate",
            {"ca": 40.0, "so4": 150.0},
            strategy="CUSTOM",
            custom_pinned_ions=["ca"],
        ),
        {"telemetry": ["PINNED_TARGET_BELOW_SOURCE"]},
        id="custom-pin-below-source",
    ),
]


def _assert_invariants(inp: WaterChemistryInput, out) -> None:
    for dose in (out.mash_dose_g, out.sparge_dose_g):
        for key, value in dose.items():
            assert math.isfinite(value) and value >= 0.0, key
    for value in (out.alkaline_agent_g, out.mash_acid_ml, out.sparge_acid_ml):
        assert math.isfinite(value) and value >= 0.0

    for field in ("post_salt_mash_ions", "post_dose_mash_ions"):
        ions = getattr(out, field)
        for ion in IONS:
            assert math.isfinite(ions[ion]) and ions[ion] >= 0.0, (field, ion)

    assert 3.5 < out.predicted_mash_ph < 7.5
    assert out.mash_ph_status == mash_ph_status(out.predicted_mash_ph)

    # Salts only add: the five mineral ions never fall below the source.
    for ion in ("ca", "mg", "na", "so4", "cl"):
        assert out.post_dose_mash_ions[ion] >= inp.source[ion] - 1e-6, ion

    if inp.salt_distribution == "MASH_ONLY":
        for salt in SALTS:
            assert out.sparge_dose_g[salt] == 0.0, salt
    else:
        ratio = inp.v_hlt_treat_l / inp.v_mash_treat_l
        for salt in SALTS:
            assert out.sparge_dose_g[salt] == pytest.approx(
                out.mash_dose_g[salt] * ratio, abs=1e-9
            ), salt

    assert out.residual_hlt_water_l == pytest.approx(
        max(0.0, inp.v_hlt_treat_l - inp.v_sparge_demand_l)
    )

    again = solve_water_chemistry(inp)
    assert again == out, "solver must be deterministic"


@pytest.mark.parametrize(("label", "inp", "expect"), SCENARIOS)
def test_scenario_invariants(label, inp, expect):
    out = solve_water_chemistry(inp)
    _assert_invariants(inp, out)

    for ion, ppm in expect.get("held", {}).items():
        assert out.post_salt_mash_ions[ion] == pytest.approx(ppm, abs=0.5), (label, ion)

    for ion, ppm in expect.get("at_least", {}).items():
        assert out.post_salt_mash_ions[ion] >= ppm - 0.5, (label, ion)

    codes = {event["code"] for event in out.telemetry}
    for code in expect.get("telemetry", []):
        assert code in codes, (label, code, sorted(codes))

    if expect.get("no_salt_dose"):
        for salt in SALTS:
            assert out.mash_dose_g[salt] == 0.0

    if expect.get("error"):
        pytest.fail(f"{label} was declared infeasible; it solved instead")


def test_conflicting_custom_pins_fail_legibly():
    # Pinning Na and Cl with a ratio no salt can satisfy (NaCl couples them).
    inp = _request(
        "pale-ale",
        "ro",
        {"na": 100.0, "cl": 10.0},
        strategy="CUSTOM",
        custom_pinned_ions=["na", "cl"],
    )
    with pytest.raises(SolverValidationError) as exc:
        solve_water_chemistry(inp)
    assert exc.value.code == "SALT_SOLVE_FAILED"


def _lcg(seed: int):
    state = seed
    while True:
        state = (1103515245 * state + 12345) % (2**31)
        yield state / (2**31)


SEED = 20261022
SWEEP_CASES = 40


def test_seeded_combination_sweep():
    rng = _lcg(SEED)
    beer_names = list(BEERS)
    water_names = list(WATERS)
    strategies = ["AUTO", "CALCIUM_FLOOR", "HYBRID", "OPTIMIZE", "BASELINE"]
    distributions = ["PROPORTIONAL", "MASH_ONLY"]
    acids = ["LACTIC_88", "PHOSPHORIC_10", "PHOSPHORIC_85"]
    forms = [("GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE"), ("GYPSUM_ANHYDROUS", "CACL2_ANHYDROUS")]
    agents = ["BAKING_SODA", "CHALK", "PICKLING_LIME"]

    for _ in range(SWEEP_CASES):
        beer = beer_names[int(next(rng) * len(beer_names))]
        water = water_names[int(next(rng) * len(water_names))]
        strategy = strategies[int(next(rng) * len(strategies))]
        distribution = distributions[int(next(rng) * len(distributions))]
        acid = acids[int(next(rng) * len(acids))]
        gypsum_form, cacl2_form = forms[int(next(rng) * len(forms))]
        agent = agents[int(next(rng) * len(agents))]
        floor = 0.0 if next(rng) < 0.2 else 50.0
        ph = [5.2, 5.4, 5.6][int(next(rng) * 3)]
        target = {
            ion: round(next(rng) * 300.0, 1) if next(rng) < 0.7 else 0.0 for ion in IONS
        }

        inp = _request(
            beer,
            water,
            target,
            strategy=strategy,
            salt_distribution=distribution,
            acid_medium=acid,
            gypsum_form=gypsum_form,
            cacl2_form=cacl2_form,
            preferred_alkaline_agent=agent,
            calcium_floor_ppm=floor,
            target_mash_ph=ph,
        )
        out = solve_water_chemistry(inp)
        _assert_invariants(inp, out)
