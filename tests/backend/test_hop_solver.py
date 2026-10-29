"""Hop-bitterness boundary tests (Tinseth + Arrhenius cooling integral)."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from app.core import hop_solver
from app.core.hop_solver import BoilHopEntry, HopSolverInput, WhirlpoolHopEntry
from app.schemas.boundary import (
    BoilHopRow,
    HopSolverRequest,
    WhirlpoolHopForm,
    WhirlpoolHopRow,
)
from app.services.hop_solver_service import solve_hop_request


def make_request(**overrides) -> HopSolverRequest:
    kwargs = {
        "boil_hops": [
            BoilHopRow(alpha_acid_pct=0.10, boil_time_fraction=1.0, pct=0.5),
            BoilHopRow(alpha_acid_pct=0.12, boil_time_fraction=0.5, pct=0.5),
        ],
        "whirlpool_hops": [
            WhirlpoolHopRow(
                alpha_acid_pct=0.10,
                duration_min=30.0,
                initial_temp_c=99.0,
                pct=1.0,
                product_form=WhirlpoolHopForm.T90_PELLET,
            )
        ],
        "boil_target_ibu": 40.0,
        "whirlpool_target_ibu": 20.0,
        "boil_time_min": 60.0,
        "pre_boil_gravity": 1.048,
        "post_boil_gravity": 1.055,
        "post_boil_volume_l": 20.0,
        "whirlpool_ambient_temp_c": 20.0,
        "whirlpool_cooling_time_constant_min": 108.7,
    }
    kwargs.update(overrides)
    return HopSolverRequest(**kwargs)


def test_arrhenius_relative_rate_matches_reference_benchmarks():
    cases = [
        (100.0, 1.009),
        (90.0, 0.4907),
        (80.0, 0.229),
        (70.0, 0.1022),
        (60.0, 0.0435),
        (50.0, 0.0175),
    ]
    for temp_c, expected in cases:
        assert hop_solver.relative_isomerization_rate(temp_c) == pytest.approx(
            expected, abs=0.004
        )


def test_passive_30_minute_rest_integrates_to_reference_effective_time():
    effective = hop_solver.effective_whirlpool_minutes(
        duration_min=30.0, initial_temp_c=99.0, ambient_temp_c=20.0, k_per_min=0.0092
    )
    assert effective == pytest.approx(14.795001104424578, abs=1e-9)


def test_isothermal_windows_match_reference_vectors():
    boiling = hop_solver.effective_whirlpool_minutes(
        duration_min=30.0, initial_temp_c=100.0, ambient_temp_c=100.0, k_per_min=0.0
    )
    assert boiling == pytest.approx(30.276952309409356, abs=1e-9)

    cool = hop_solver.effective_whirlpool_minutes(
        duration_min=20.0, initial_temp_c=60.0, ambient_temp_c=20.0, k_per_min=0.0
    )
    assert cool == pytest.approx(0.8696428564474775, abs=1e-9)


def test_whirlpool_mass_inverts_the_forward_ibu_model():
    effective = hop_solver.effective_whirlpool_minutes(30.0, 99.0, 20.0, 0.0092)
    utilization = hop_solver.whirlpool_utilization(1.05, effective)
    ibu = (0.05 * 1000 * 0.1 * 1000 / 20.0) * utilization
    assert ibu == pytest.approx(28.327469657064622, abs=1e-6)

    mass, effective_minutes = hop_solver.whirlpool_mass_kg(
        ibu=ibu,
        alpha_fraction=0.1,
        volume_l=20.0,
        gravity=1.05,
        duration_min=30.0,
        initial_temp_c=99.0,
        ambient_temp_c=20.0,
        k_per_min=0.0092,
        product_form="t90_pellet",
    )
    assert mass == pytest.approx(0.05, abs=1e-12)
    assert effective_minutes == pytest.approx(effective, abs=1e-12)


def test_flowable_extract_scales_mass_by_the_product_scalar():
    common = {
        "ibu": 30.0,
        "alpha_fraction": 0.45,
        "volume_l": 20.0,
        "gravity": 1.05,
        "duration_min": 30.0,
        "initial_temp_c": 99.0,
        "ambient_temp_c": 20.0,
        "k_per_min": 0.0092,
    }
    pellet, _ = hop_solver.whirlpool_mass_kg(product_form="t90_pellet", **common)
    extract, _ = hop_solver.whirlpool_mass_kg(product_form="flowable_extract", **common)
    assert pellet is not None and extract is not None
    assert pellet / extract == pytest.approx(1.15, abs=1e-12)


def test_lupulin_pellet_scales_mass_by_its_constant():
    common = {
        "ibu": 30.0,
        "alpha_fraction": 0.18,
        "volume_l": 20.0,
        "gravity": 1.05,
        "duration_min": 25.0,
        "initial_temp_c": 76.0,
        "ambient_temp_c": 20.0,
        "k_per_min": 0.0092,
    }
    pellet, _ = hop_solver.whirlpool_mass_kg(product_form="t90_pellet", **common)
    lupulin, _ = hop_solver.whirlpool_mass_kg(product_form="lupulin_pellet", **common)
    assert pellet is not None and lupulin is not None
    assert pellet / lupulin == pytest.approx(1.10, abs=1e-12)


def test_flowable_extract_multiplier_falls_as_the_wort_cools():
    assert hop_solver.product_form_utilization("flowable_extract", 99.0) == pytest.approx(1.15)
    assert hop_solver.product_form_utilization("flowable_extract", 90.0) == pytest.approx(1.15)
    assert hop_solver.product_form_utilization("flowable_extract", 75.0) == pytest.approx(0.80)
    assert hop_solver.product_form_utilization("flowable_extract", 60.0) == pytest.approx(0.80)
    mid = hop_solver.product_form_utilization("flowable_extract", 82.5)
    assert 0.80 < mid < 1.15
    assert hop_solver.product_form_utilization("t90_pellet", 75.0) == pytest.approx(1.0)
    assert hop_solver.product_form_utilization("lupulin_pellet", 75.0) == pytest.approx(1.10)

    common = {
        "ibu": 30.0,
        "alpha_fraction": 0.45,
        "volume_l": 20.0,
        "gravity": 1.05,
        "duration_min": 30.0,
        "ambient_temp_c": 20.0,
        "k_per_min": 0.0092,
    }
    hot, _ = hop_solver.whirlpool_mass_kg(
        product_form="flowable_extract", initial_temp_c=95.0, **common
    )
    cool, _ = hop_solver.whirlpool_mass_kg(
        product_form="flowable_extract", initial_temp_c=76.0, **common
    )
    assert hot is not None and cool is not None
    assert cool > hot


def test_cooling_temperature_follows_newton_decay():
    t = hop_solver.cooling_temperature(30.0, 99.0, 20.0, 0.0092)
    assert 79.0 < t < 81.0
    assert hop_solver.cooling_temperature(0.0, 99.0, 20.0, 0.0092) == 99.0


def test_tinseth_utilization_and_inverse_round_trip():
    utilization = hop_solver.tinseth_utilization(1.048, 60.0)
    assert utilization > 0.0
    mass = hop_solver.mass_from_ibu(20.0, 0.1, 60.0, 1.048, 20.0)
    assert mass is not None
    assert hop_solver.mass_from_ibu(0.0, 0.1, 60.0, 1.048, 20.0) is None


def test_request_returns_one_row_per_addition_and_totals():
    response = solve_hop_request(make_request())
    assert len(response.boil_rows) == 2
    assert len(response.whirlpool_rows) == 1
    assert response.boil_rows[0].minutes == pytest.approx(60.0)
    assert response.boil_rows[1].minutes == pytest.approx(30.0)
    assert response.boil_rows[0].ibu == pytest.approx(20.0)
    assert response.boil_rows[1].ibu == pytest.approx(20.0)
    assert response.whirlpool_rows[0].ibu == pytest.approx(20.0)
    assert response.boil_mass_kg == pytest.approx(
        sum(row.mass_kg for row in response.boil_rows)
    )
    assert response.total_mass_kg == pytest.approx(
        response.boil_mass_kg + response.whirlpool_mass_kg
    )
    assert math.isfinite(response.total_mass_kg)


def _two_charge_input(first_temp=99.0, second_temp=76.7, first_duration=30.0, second_duration=20.0):
    return HopSolverInput(
        boil_hops=[],
        whirlpool_hops=[
            WhirlpoolHopEntry(
                alpha_acid_pct=0.20,
                duration_min=first_duration,
                initial_temp_c=first_temp,
                pct=0.5,
                product_form="lupulin_pellet",
            ),
            WhirlpoolHopEntry(
                alpha_acid_pct=0.20,
                duration_min=second_duration,
                initial_temp_c=second_temp,
                pct=0.5,
                product_form="lupulin_pellet",
            ),
        ],
        boil_target_ibu=0.0,
        whirlpool_target_ibu=20.0,
        boil_time_min=60.0,
        pre_boil_gravity=1.055,
        post_boil_gravity=1.055,
        post_boil_volume_l=20.0,
        whirlpool_ambient_temp_c=20.0,
        whirlpool_cooling_time_constant_min=108.7,
    )


def test_charges_share_one_timeline_and_a_chill_splits_the_window():
    chilled = hop_solver.solve_hops(_two_charge_input())
    passive = hop_solver.solve_hops(
        _two_charge_input(second_temp=hop_solver.cooling_temperature(10.0, 99.0, 20.0, 1 / 108.7))
    )

    assert len(chilled.whirlpool_rows) == 2
    first, second = chilled.whirlpool_rows
    # The first charge sees the hot 10 minutes plus the chilled 20.
    assert first.effective_minutes > second.effective_minutes
    # A chill removes hot exposure, so the first charge needs more mass for its share.
    assert first.mass_kg > passive.whirlpool_rows[0].mass_kg
    assert first.effective_minutes == pytest.approx(
        hop_solver.effective_whirlpool_minutes(10.0, 99.0, 20.0, 1 / 108.7)
        + hop_solver.effective_whirlpool_minutes(20.0, 76.7, 20.0, 1 / 108.7)
    )

    timeline = hop_solver.build_whirlpool_timeline(
        _two_charge_input().whirlpool_hops, 20.0, 1 / 108.7
    )
    assert len(timeline.chills) == 1
    assert timeline.chills[0].at_min == pytest.approx(10.0)
    assert timeline.chills[0].to_temp_c == pytest.approx(76.7)


def test_a_charge_above_the_latent_curve_is_heating():
    with pytest.raises(hop_solver.SolverValidationError) as exc:
        hop_solver.solve_hops(_two_charge_input(second_temp=95.0))
    assert exc.value.code == "WHIRLPOOL_HEATING"


def test_two_temperatures_at_one_addition_are_a_conflict():
    with pytest.raises(hop_solver.SolverValidationError) as exc:
        hop_solver.build_whirlpool_timeline(
            [
                WhirlpoolHopEntry(0.2, 20.0, 80.0, 0.5, "t90_pellet"),
                WhirlpoolHopEntry(0.2, 20.0, 90.0, 0.5, "t90_pellet"),
            ],
            20.0,
            1 / 108.7,
        )
    assert exc.value.code == "WHIRLPOOL_ADDITION_CONFLICT"


def test_a_sub_ambient_charge_is_rejected():
    with pytest.raises(hop_solver.SolverValidationError) as exc:
        hop_solver.solve_hops(_two_charge_input(first_temp=15.0))
    assert exc.value.code == "WHIRLPOOL_BELOW_AMBIENT"


def test_zero_rest_charge_has_no_mass():
    inputs = HopSolverInput(
        boil_hops=[],
        whirlpool_hops=[
            WhirlpoolHopEntry(0.2, 0.0, 76.7, 1.0, "lupulin_pellet"),
        ],
        boil_target_ibu=0.0,
        whirlpool_target_ibu=20.0,
        boil_time_min=60.0,
        pre_boil_gravity=1.055,
        post_boil_gravity=1.055,
        post_boil_volume_l=20.0,
        whirlpool_ambient_temp_c=20.0,
        whirlpool_cooling_time_constant_min=108.7,
    )
    rows = hop_solver.solve_hops(inputs).whirlpool_rows
    assert rows[0].effective_minutes == 0.0
    assert rows[0].mass_kg is None


def test_invalid_inputs_raise_typed_errors():
    base = dict(
        boil_hops=[],
        whirlpool_hops=[],
        boil_target_ibu=40.0,
        whirlpool_target_ibu=20.0,
        boil_time_min=60.0,
        pre_boil_gravity=1.048,
        post_boil_gravity=1.055,
        post_boil_volume_l=20.0,
        whirlpool_ambient_temp_c=20.0,
        whirlpool_cooling_time_constant_min=108.7,
    )
    with pytest.raises(hop_solver.SolverValidationError) as exc:
        hop_solver.solve_hops(hop_solver.HopSolverInput(**{**base, "post_boil_gravity": 0.0}))
    assert exc.value.code == "INVALID_GRAVITY"

    with pytest.raises(hop_solver.SolverValidationError) as exc:
        hop_solver.solve_hops(hop_solver.HopSolverInput(**{**base, "post_boil_volume_l": 0.0}))
    assert exc.value.code == "INVALID_VOLUME"

    with pytest.raises(hop_solver.SolverValidationError) as exc:
        hop_solver.solve_hops(
            hop_solver.HopSolverInput(**{**base, "whirlpool_cooling_time_constant_min": 0.0})
        )
    assert exc.value.code == "INVALID_COOLING_CONSTANT"


HOP_PARITY = json.loads(
    (Path(__file__).resolve().parents[1] / "conformance" / "fixtures" / "hop-parity.json").read_text()
)


def _compare_rows(actual, expected, label):
    assert len(actual) == len(expected), label
    for index, (got, want) in enumerate(zip(actual, expected, strict=True)):
        for key, value in want.items():
            assert getattr(got, key) == pytest.approx(value), f"{label}[{index}].{key}"


def test_shared_hop_parity_fixture_matches_core_solver():
    for case in HOP_PARITY["cases"]:
        payload = case["input"]
        result = hop_solver.solve_hops(
            HopSolverInput(
                boil_hops=[BoilHopEntry(**row) for row in payload["boil_hops"]],
                whirlpool_hops=[
                    WhirlpoolHopEntry(**row) for row in payload["whirlpool_hops"]
                ],
                boil_target_ibu=payload["boil_target_ibu"],
                whirlpool_target_ibu=payload["whirlpool_target_ibu"],
                boil_time_min=payload["boil_time_min"],
                pre_boil_gravity=payload["pre_boil_gravity"],
                post_boil_gravity=payload["post_boil_gravity"],
                post_boil_volume_l=payload["post_boil_volume_l"],
                whirlpool_ambient_temp_c=payload["whirlpool_ambient_temp_c"],
                whirlpool_cooling_time_constant_min=payload[
                    "whirlpool_cooling_time_constant_min"
                ],
            )
        )
        expected = case["expected"]
        _compare_rows(result.boil_rows, expected["boil_rows"], f"{case['name']}.boil_rows")
        _compare_rows(
            result.whirlpool_rows,
            expected["whirlpool_rows"],
            f"{case['name']}.whirlpool_rows",
        )
        for key in ("boil_mass_kg", "whirlpool_mass_kg", "total_mass_kg"):
            assert getattr(result, key) == pytest.approx(expected[key]), f"{case['name']}.{key}"
