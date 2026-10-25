"""Committed report-bundle fixture: shape, hash, and freshness.

Regenerate with ``cd backend && PYTHONPATH=. uv run python
scripts/emit_report_bundle_fixture.py`` in the same commit as any artifact change.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from app.schemas.report_bundle import ReportBundle

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "tests" / "conformance" / "fixtures" / "report-bundle.json"
EMITTER = ROOT / "backend" / "scripts" / "emit_report_bundle_fixture.py"


def _emitter():
    spec = importlib.util.spec_from_file_location("emit_report_bundle_fixture", EMITTER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _fixture() -> dict:
    return json.loads(FIXTURE.read_text())


def test_the_fixture_validates_and_hashes_are_prefixed():
    bundle = ReportBundle.model_validate(_fixture())
    assert bundle.bundle_format == 1
    assert bundle.artifact.hash.startswith("sha256:")
    assert bundle.catalog.hash.startswith("sha256:")
    assert bundle.content_hash.startswith("sha256:")


def test_the_fixture_is_a_self_sufficient_freeze():
    bundle = ReportBundle.model_validate(_fixture())
    assert bundle.batch.id == "frozen-1"
    assert bundle.batch.status == "frozen"
    assert bundle.batch.parent_batch_id == "draft-1"
    assert set(bundle.batch.identity) == {"equipment", "water.source", "style"}
    assert bundle.state.valuation["solver.batch"]["sg_post_boil"] == 1.055
    assert bundle.state.collections["mash.rests"][0]["rest_id"] == "beta"
    assert bundle.catalog.nodes["solver.water.mash_additions.gypsum_kg"].unit == "g"
    assert bundle.telemetry["solver.water"].binding == "water_chemistry_solver"
    assert bundle.validation.relations[0]["id"] == "hlt_not_overfilled"


def test_the_fixture_matches_a_fresh_emission():
    emitted = _emitter()
    fresh = emitted.build_report_bundle(
        frozen_id="frozen-1", record=emitted.RECORD, payload=emitted.PAYLOAD
    )
    assert _fixture() == fresh, (
        "report-bundle.json is stale; re-run "
        "backend/scripts/emit_report_bundle_fixture.py"
    )
