"""Freeze-time report inputs pin to the bundle request models.

`tests/conformance/fixtures/report-inputs.json` is also read by the frontend
producer test, so both sides of the freeze payload agree on one key set.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.schemas.report_bundle import BoundaryTelemetry, ValidationBundle

FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "conformance"
        / "fixtures"
        / "report-inputs.json"
    ).read_text()
)


def test_validation_block_matches_the_fixture():
    assert list(ValidationBundle.model_fields) == FIXTURE["validation"]


def test_telemetry_entry_matches_the_fixture():
    assert list(BoundaryTelemetry.model_fields) == FIXTURE["telemetry"]
