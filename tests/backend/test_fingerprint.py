"""Fingerprint parity tests: the SHA-256 formatter must match the JS engine byte-for-byte."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.boundary import (
    BatchSolverRequest,
    BatchSpargeTopology,
    GristBillRow,
)
from app.schemas.canonical import canonicalize as _canonicalize
from app.schemas.canonical import js_float_to_string as _js_float_to_string

FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[1]
        / "conformance"
        / "fixtures"
        / "canonical-json.json"
    ).read_text()
)

SPECIAL_FLOATS = {
    "NaN": float("nan"),
    "Infinity": float("inf"),
    "-Infinity": float("-inf"),
}


@pytest.mark.parametrize("case", FIXTURE["floats"])
def test_js_float_formatting(case):
    assert _js_float_to_string(case["value"]) == case["expected"]


def test_negative_zero_collapses_to_zero():
    assert _js_float_to_string(-0.0) == "0"


@pytest.mark.parametrize("case", FIXTURE["special_floats"])
def test_non_finite_collapses_to_null(case):
    assert _js_float_to_string(SPECIAL_FLOATS[case["value"]]) == case["expected"]


@pytest.mark.parametrize("case", FIXTURE["strings"])
def test_string_escaping(case):
    assert _canonicalize(case["value"]) == case["canonical"]


@pytest.mark.parametrize("vector", FIXTURE["vectors"], ids=lambda v: v["name"])
def test_canonical_vectors(vector):
    assert _canonicalize(vector["value"]) == vector["canonical"]


def canonical_batch() -> BatchSolverRequest:
    return BatchSolverRequest(
        target_abv=5.5,
        apparent_attenuation=0.75,
        v_ferm=20.0,
        topology=BatchSpargeTopology.R_L_TO_G,
        intensive_value=3.0,
        grain_bill=[GristBillRow(w_i=1.0, yield_i=0.80, mc_i=0.04, fermentability_i=0.8)],
        delta_v_evap=3.0,
        eta_conv=0.95,
        hlt_starting_volume_l=25.0,
        max_hlt_volume_l=30.0,
        max_kettle_volume_l=40.0,
        max_mash_tun_volume_l=40.0,
    )


def test_canonical_json_golden():
    assert _canonicalize(canonical_batch().model_dump(mode="json")) == FIXTURE["batch"]["canonical"]


def test_canonical_fingerprint_golden():
    assert canonical_batch().canonical_fingerprint() == FIXTURE["batch"]["fingerprint"]
