"""Committed report-bundle fixture: shape, hash, and freshness.

Regenerate with ``cd backend && PYTHONPATH=. uv run python
scripts/emit_report_bundle_fixture.py`` in the same commit as any artifact change.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from app.services.bundle_integrity import parse_bundle

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
    bundle = parse_bundle(_fixture())
    assert bundle.bundle_format == 7
    assert bundle.artifact.hash.startswith("sha256:")
    assert bundle.catalog.hash.startswith("sha256:")
    assert bundle.content_hash.startswith("sha256:")


def test_the_fixture_is_a_self_sufficient_freeze():
    bundle = parse_bundle(_fixture())
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


def test_the_bundle_ledgers_close():
    """The hand-authored fixture must satisfy the identities its ledgers print.

    The volume ledger, the liquor ledger and the extract ledger each sum on
    screen. Nothing recomputes these at render time, so the fixture is the only
    place a drift can hide.
    """
    bundle = _fixture()
    valuation = bundle["state"]["valuation"]
    solver = valuation["solver.batch"]
    equipment = bundle["batch"]["identity"]["equipment"]

    v_run1 = solver["cascade.v_run1"]
    v_run2 = solver["cascade.v_run2"]
    v_sparge = solver["cascade.v_sparge"]
    v_pre = solver["v_pre_boil"]
    transfer_loss = equipment["mash_transfer_loss_l"]

    # Runnings: the tun drains the kettle plus its transfer plumbing.
    assert v_run2 == pytest.approx(v_sparge)
    assert v_run1 + v_run2 == pytest.approx(v_pre + transfer_loss)

    # HLT budget: top-up target is a floor, deliverable is what remains.
    debt = solver["hlt.v_hlt_debt"]
    after_strike = solver["hlt.v_hlt_after_strike"]
    top_up = solver["hlt.v_hlt_top_up"]
    required = solver["hlt.v_hlt_required"]
    target = solver["hlt.v_hlt_target"]
    deliverable = solver["hlt.v_sparge_deliverable"]

    assert required == pytest.approx(v_sparge + debt)
    assert target == pytest.approx(max(equipment["hlt_coil_floor_l"], required))
    assert top_up == pytest.approx(max(0.0, target - after_strike))
    assert deliverable == pytest.approx(after_strike + top_up - debt)
    assert valuation["batch.surplus_sparge_capacity"] == pytest.approx(
        deliverable - v_sparge
    )

    # Extract chain: potential -> converted -> tun -> kettle -> fermenter.
    moisture_fallback = valuation["batch.grain_moisture_fraction"]
    yield_fraction = sum(
        row["pct"]
        * row["yield_fraction"]
        * (1.0 - row.get("moisture_fraction", moisture_fallback))
        for row in valuation["grist.major_malts"]
    )
    potential = solver["extract.s_potential"]
    converted = solver["extract.s_converted"]
    tun = solver["extract.s_tun"]
    kettle = solver["extract.s_kettle"]
    fermenter = solver["extract.s_fermenter"]
    post = solver["s_post_boil_target"]

    assert potential == pytest.approx(solver["m_grist"] * yield_fraction)
    assert converted == pytest.approx(
        valuation["batch.conversion_efficiency"] * potential
    )
    assert tun == pytest.approx(solver["cascade.s_run1"] + solver["cascade.s_run2"])
    assert kettle == pytest.approx(
        tun * v_pre / (v_pre + transfer_loss)
    )
    assert post == pytest.approx(
        kettle + valuation["batch.sugar_extract_total"]
    )

    v_ferm = valuation["batch.v_ferm"]
    v_kettle_cold = (
        v_ferm
        + equipment["kettle_dead_space_l"]
        + equipment["kettle_transfer_loss_l"]
        + equipment["trub_loss_l"]
    )
    assert fermenter == pytest.approx(post * v_ferm / v_kettle_cold)
    assert solver["brewhouse_efficiency"] == pytest.approx(kettle / potential)

    assert valuation["batch.extract_loss_conversion"] == pytest.approx(
        potential - converted
    )
    assert valuation["batch.extract_loss_retention"] == pytest.approx(
        converted - tun
    )
    assert valuation["batch.extract_loss_transfer"] == pytest.approx(tun - kettle)
    assert valuation["batch.extract_loss_mash"] == pytest.approx(converted - kettle)
    assert valuation["batch.extract_loss_kettle"] == pytest.approx(post - fermenter)
