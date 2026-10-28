"""Water telemetry contract: stable fields, valid severities, unique log keys,
explicit mitigation options for user-actionable warnings, and one findings
channel.

``warnings`` and ``notes`` are projections of the telemetry stream. That
equality is asserted here, once, centrally — nowhere else restates a message.
"""

from __future__ import annotations

import json

import pytest
from conftest import make_water_request

from app.core.water.inputs import GrainEntry, WaterChemistryInput
from app.core.water.orchestration import solve_water_chemistry
from app.core.water.telemetry import TELEMETRY_CODES
from app.schemas.boundary import IonProfile, WaterStrategy
from app.services.water_solver_service import solve_water_request

SEVERITIES = {"INFO", "WARNING", "ERROR", "NOTE"}
DOSE_CODES = {
    "ENZYMATIC_ACID_DOSE_PRESCRIBED",
    "ENZYMATIC_ALKALINE_DOSE_PRESCRIBED",
}
UNREACHABLE = "TARGET_MASH_PH_UNREACHABLE"

ZERO_IONS = IonProfile(
    calcium_ca=0.0,
    magnesium_mg=0.0,
    sodium_na=0.0,
    sulfate_so4=0.0,
    chloride_cl=0.0,
    alkalinity_as_caco3=0.0,
)

CASES = {
    "default": make_water_request(),
    "feasible-acid": make_water_request(target_mash_ph=5.6),
    "feasible-alkaline": make_water_request(target_mash_ph=5.8),
    "unreachable-high": make_water_request(target_mash_ph=6.5),
    "unreachable-low": make_water_request(target_mash_ph=4.0),
    "chalk": make_water_request(
        target_mash_ph=5.8, preferred_alkaline_agent="CHALK"
    ),
    "baseline": make_water_request(
        strategy=WaterStrategy.BASELINE, source=ZERO_IONS, target=ZERO_IONS
    ),
    "optimize": make_water_request(
        strategy=WaterStrategy.OPTIMIZE,
        target=IonProfile(
            calcium_ca=60.0,
            magnesium_mg=8.0,
            sodium_na=20.0,
            sulfate_so4=100.0,
            chloride_cl=70.0,
            alkalinity_as_caco3=40.0,
        ),
    ),
    "custom-pins": make_water_request(
        strategy=WaterStrategy.CUSTOM, custom_pinned_ions=["so4", "cl"]
    ),
    "floor-override": make_water_request(calcium_floor_ppm=20.0),
    "sulfate-heavy": make_water_request(
        strategy=WaterStrategy.BASELINE,
        source=IonProfile(
            calcium_ca=90.0,
            magnesium_mg=20.0,
            sodium_na=30.0,
            sulfate_so4=450.0,
            chloride_cl=30.0,
            alkalinity_as_caco3=150.0,
        ),
        target=ZERO_IONS,
    ),
    "magnesium-heavy": make_water_request(
        strategy=WaterStrategy.BASELINE,
        source=IonProfile(
            calcium_ca=90.0,
            magnesium_mg=60.0,
            sodium_na=30.0,
            sulfate_so4=40.0,
            chloride_cl=30.0,
            alkalinity_as_caco3=150.0,
        ),
        target=ZERO_IONS,
    ),
}

CORE_CASES = [
    WaterChemistryInput(
        grist=[GrainEntry(5.0, 3.0, "BASE")],
        source={
            "ca": 10.0,
            "mg": 2.0,
            "na": 8.0,
            "so4": 5.0,
            "cl": 7.0,
            "alk": 40.0,
            "fe": 0.4,
        },
        target={"ca": 80.0, "mg": 5.0, "na": 20.0, "so4": 100.0, "cl": 50.0},
        v_mash_treat_l=15.0,
        v_hlt_treat_l=10.0,
        v_hlt_debt_l=0.0,
        v_sparge_demand_l=8.0,
        mash_thickness_l_per_kg=3.0,
        target_mash_ph=5.35,
        strategy="FLAVOR",
    ),
]


def _project(telemetry) -> tuple[list[str], list[str]]:
    """The findings policy, written independently of ``derive_findings``."""
    warnings: list[str] = []
    notes: list[str] = []
    for event in telemetry:
        if event["severity"] == "WARNING":
            if event["message"] not in warnings:
                warnings.append(event["message"])
        elif event["severity"] in {"NOTE", "INFO"} and event["category"] in {
            "OPTIMIZATION",
            "GUARDRAIL",
        }:
            if event["message"] not in notes:
                notes.append(event["message"])
    return warnings, notes


def test_every_telemetry_event_has_the_contract_shape():
    for label, request in CASES.items():
        response = solve_water_request(request)
        assert response.telemetry, label
        keys = set()
        for event in response.telemetry:
            assert isinstance(event, dict), label
            assert set(event) == {"code", "category", "severity", "message", "context"}, label
            assert isinstance(event["code"], str) and event["code"], label
            assert isinstance(event["category"], str) and event["category"], label
            assert event["severity"] in SEVERITIES, (label, event["severity"])
            assert isinstance(event["message"], str) and event["message"], label
            assert isinstance(event["context"], dict), label
            json.dumps(event)
            key = (event["code"], event["message"])
            assert key not in keys, f"{label}: duplicate telemetry key {key}"
            keys.add(key)

        assert all(isinstance(item, str) and item for item in response.warnings), label
        assert all(isinstance(item, str) and item for item in response.notes), label


def test_warnings_and_notes_are_the_telemetry_projection():
    outputs = [solve_water_request(request) for request in CASES.values()]
    outputs.extend(solve_water_chemistry(inp) for inp in CORE_CASES)
    for output in outputs:
        warnings, notes = _project(output.telemetry)
        assert output.warnings == warnings
        assert output.notes == notes


def test_emitted_codes_are_members_of_the_declared_surface():
    outputs = [solve_water_request(request) for request in CASES.values()]
    outputs.extend(solve_water_chemistry(inp) for inp in CORE_CASES)
    for output in outputs:
        for event in output.telemetry:
            assert event["code"] in TELEMETRY_CODES, event["code"]


def test_dose_events_report_the_corrected_ph():
    for label, request in CASES.items():
        response = solve_water_request(request)
        for event in response.telemetry:
            if event["code"] in DOSE_CODES:
                assert event["context"]["ph_after"] == pytest.approx(
                    response.prescription.predicted_mash_ph
                ), label


def test_unreachable_targets_name_the_failure_and_mitigations():
    for label in ("unreachable-high", "unreachable-low"):
        response = solve_water_request(CASES[label])
        event = next(
            event for event in response.telemetry if event["code"] == UNREACHABLE
        )
        context = event["context"]
        assert context["reason"] in {
            "below_model_floor",
            "above_model_ceiling",
        }
        assert context["target_ph"] == pytest.approx(
            CASES[label].target_mash_ph
        )
        assert context["predicted_ph"] == pytest.approx(
            response.prescription.predicted_mash_ph
        )
        assert context["model_floor"] == 4.0
        assert context["model_ceiling"] == 6.0
        assert isinstance(context["mitigations"], list)
        assert context["mitigations"]
        assert all(isinstance(item, str) and item for item in context["mitigations"])
        assert "Mitigations:" in event["message"]


def test_feasible_cases_do_not_report_a_target_miss_or_unreachable():
    for label in ("default", "feasible-acid", "feasible-alkaline", "chalk"):
        response = solve_water_request(CASES[label])
        codes = {event["code"] for event in response.telemetry}
        assert "TARGET_MASH_PH_MISSED" not in codes, label
        assert UNREACHABLE not in codes, label
