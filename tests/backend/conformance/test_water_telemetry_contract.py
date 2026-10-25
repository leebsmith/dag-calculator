"""Water telemetry contract: stable fields, valid severities, unique log keys,
and explicit mitigation options for user-actionable warnings.
"""

from __future__ import annotations

import json

import pytest
from conftest import make_water_request

from app.services.water_solver_service import solve_water_request

SEVERITIES = {"INFO", "WARNING", "ERROR", "NOTE"}
DOSE_CODES = {
    "ENZYMATIC_ACID_DOSE_PRESCRIBED",
    "ENZYMATIC_ALKALINE_DOSE_PRESCRIBED",
}
UNREACHABLE = "TARGET_MASH_PH_UNREACHABLE"

CASES = {
    "default": make_water_request(),
    "feasible-acid": make_water_request(target_mash_ph=5.6),
    "feasible-alkaline": make_water_request(target_mash_ph=5.8),
    "unreachable-high": make_water_request(target_mash_ph=6.5),
    "unreachable-low": make_water_request(target_mash_ph=4.0),
    "chalk": make_water_request(
        target_mash_ph=5.8, preferred_alkaline_agent="CHALK"
    ),
}


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
