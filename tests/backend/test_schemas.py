"""Pydantic contract conformance tests for the boundary schemas."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest
from conftest import make_batch_request, make_water_request
from pydantic import ValidationError

from app.schemas.batch import DraftPayload
from app.schemas.boundary import (
    BatchSolverRequest,
    BatchSpargeTopology,
    GristBillRow,
    WaterSolverRequest,
    WaterStrategy,
)

ARTIFACT = json.loads(
    (Path(__file__).resolve().parents[2] / "data" / "artifact.json").read_text()
)


def test_extra_fields_forbidden():
    with pytest.raises(ValidationError):
        make_batch_request(bogus_field=1.0)


def test_models_are_frozen():
    req = make_batch_request()
    with pytest.raises(ValidationError):
        req.target_abv = 9.0  # type: ignore[misc]


def test_enum_coercion_from_string():
    req = make_batch_request(topology="runoff_ratio")
    assert req.topology is BatchSpargeTopology.RUNOFF_RATIO


def test_water_strategy_enum():
    req = make_water_request(strategy="CALCIUM_FLOOR")
    assert req.strategy is WaterStrategy.CALCIUM_FLOOR


def test_custom_pins_allow_five_and_six():
    five = make_water_request(
        strategy="CUSTOM", custom_pinned_ions=["ca", "mg", "na", "so4", "cl"]
    )
    assert len(five.custom_pinned_ions) == 5
    six = make_water_request(
        strategy="CUSTOM", custom_pinned_ions=["ca", "mg", "na", "so4", "cl", "alk"]
    )
    assert len(six.custom_pinned_ions) == 6


def test_custom_pins_are_capped_at_six():
    with pytest.raises(ValidationError):
        make_water_request(
            strategy="CUSTOM", custom_pinned_ions=["ca", "mg", "na", "so4", "cl", "alk", "fe"]
        )


def test_defaults_applied():
    req = make_batch_request()
    assert req.s_late_add == 0.0
    assert req.f_shrink == 0.04
    water = make_water_request()
    assert water.calcium_floor_ppm == 50.0


def test_invalid_domain_rejected():
    with pytest.raises(ValidationError):
        make_batch_request(target_abv=0.0)
    with pytest.raises(ValidationError):
        make_batch_request(malt_attenuation_cap=1.5)


def test_intensive_value_bound_matches_the_split_roots():
    for root in ("batch.mash_thickness_l_per_kg", "batch.runoff_ratio"):
        assert ARTIFACT["nodes"][root]["domain"] == {"gt": 0}

    with pytest.raises(ValidationError):
        make_batch_request(intensive_value=0.0)
    assert make_batch_request(intensive_value=1e-9).intensive_value == 1e-9


def test_fingerprint_present_and_stable():
    req = make_batch_request()
    assert len(req.canonical_fingerprint()) == 64
    assert req.canonical_fingerprint() == req.canonical_fingerprint()


def test_fingerprint_independent_of_construction_order():
    a = make_batch_request()
    b = BatchSolverRequest.model_validate(
        dict(reversed(list(a.model_dump().items())))
    )
    assert a.canonical_fingerprint() == b.canonical_fingerprint()


def test_water_request_builds():
    req = make_water_request()
    assert isinstance(req, WaterSolverRequest)


def test_water_defaults():
    """C3/C5: omitted fields fall back to the corrected defaults.

    ``strategy`` must default to AUTO (matching core + UI), and
    ``target_mash_ph`` to 5.4 (not the legacy 5.35).
    """
    ions = {
        "calcium_ca": 10.0,
        "magnesium_mg": 2.0,
        "sodium_na": 8.0,
        "sulfate_so4": 5.0,
        "chloride_cl": 7.0,
        "alkalinity_as_caco3": 40.0,
    }
    req = WaterSolverRequest.model_validate(
        {
            "grist": [{"mass_kg": 5.0, "color_lovibond": 3.0, "grain_type": "BASE"}],
            "source": ions,
            "target": ions,
            "v_mash_treat_l": 15.0,
            "v_hlt_treat_l": 10.0,
            "v_sparge_demand_l": 8.0,
            "mash_thickness_l_per_kg": 3.0,
        }
    )
    assert req.strategy is WaterStrategy.AUTO
    assert req.target_mash_ph == 5.4


def test_grain_bill_normalization_accepts_valid_bills():
    req = make_batch_request(
        grain_bill=[
            GristBillRow(w_i=0.5, yield_i=0.80, mc_i=0.00),
            GristBillRow(w_i=0.5, yield_i=0.70, mc_i=0.00),
        ]
    )
    assert sum(row.w_i for row in req.grain_bill) == pytest.approx(1.0)


def test_grain_bill_normalization_rejects_unbalanced_bills():
    with pytest.raises(ValidationError):
        make_batch_request(
            grain_bill=[
                GristBillRow(w_i=0.6, yield_i=0.80, mc_i=0.00),
                GristBillRow(w_i=0.5, yield_i=0.70, mc_i=0.00),
            ]
        )


def test_grain_bill_normalization_tolerates_float_drift():
    # 0.1 * 10 accumulates float error but stays within the 1e-6 tolerance.
    req = make_batch_request(
        grain_bill=[GristBillRow(w_i=0.1, yield_i=0.80, mc_i=0.00)] * 10
    )
    assert sum(row.w_i for row in req.grain_bill) == pytest.approx(1.0, abs=1e-6)


def test_draft_name_is_capped_at_200_chars():
    assert DraftPayload(name="x" * 200).name == "x" * 200
    with pytest.raises(ValidationError):
        DraftPayload(name="x" * 201)


def test_grain_bill_is_capped_at_50_rows():
    with pytest.raises(ValidationError):
        make_batch_request(
            grain_bill=[GristBillRow(w_i=0.02, yield_i=0.80, mc_i=0.00)] * 51
        )


def test_target_abv_has_an_upper_bound():
    with pytest.raises(ValidationError):
        make_batch_request(target_abv=150.0)


def test_large_draft_warns_but_is_not_rejected(caplog):
    with caplog.at_level(logging.WARNING, logger="app.schemas.batch"):
        DraftPayload(roots={"blob": "x" * (512 * 1024 + 16)})
    assert any("draft payload is" in message for message in caplog.messages)
