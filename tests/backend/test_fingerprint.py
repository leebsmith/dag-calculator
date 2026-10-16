"""Fingerprint parity tests: the SHA-256 formatter must match the JS engine byte-for-byte."""

from __future__ import annotations

import math

import pytest

from app.schemas.boundary import (
    _canonicalize,
    _js_float_to_string,
    BatchSolverRequest,
    BatchSpargeTopology,
    GristBillRow,
)

BATCH_FINGERPRINT = "74d296c4e9f98dceb540c211bb061a88cd84731963b8c9fa540c5c38868570cb"
BATCH_CANONICAL_JSON = (
    '{"apparent_attenuation":0.75,"delta_v_evap":3,"eta_conv":0.95,'
    '"f_shrink":0.04,"grain_bill":[{"mc_i":0.04,"w_i":1,"yield_i":0.8}],'
    '"hlt_coil_floor_l":0,"hlt_dead_space_l":0,"hlt_starting_volume_l":25,'
    '"hlt_transfer_loss_l":0,"intensive_value":3,"mash_transfer_loss":0,'
    '"max_hlt_volume_l":30,"s_late_add":0,"target_abv":5.5,"topology":"r_l_to_g",'
    '"v_dead":0,"v_ferm":20,"v_kettle_dead":0,"v_kettle_transfer":0,"v_trub":0}'
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (20.0, "20"),
        (1.5, "1.5"),
        (0.5, "0.5"),
        (0.00001, "0.00001"),
        (1e-7, "1e-7"),
        (1e-6, "0.000001"),
        (1e20, "100000000000000000000"),
        (1e21, "1e+21"),
        (1.23e22, "1.23e+22"),
        (1.5e-8, "1.5e-8"),
        (-0.0, "0"),
        (-1.5, "-1.5"),
        (385.641, "385.641"),
        (2.08635, "2.08635"),
        (0.45359237, "0.45359237"),
    ],
)
def test_js_float_formatting(value, expected):
    assert _js_float_to_string(value) == expected


def test_non_finite_collapses_to_null():
    assert _js_float_to_string(float("inf")) == "null"
    assert _js_float_to_string(float("-inf")) == "null"
    assert _js_float_to_string(float("nan")) == "null"


def test_negative_zero_collapses_to_zero():
    assert _js_float_to_string(-0.0) == "0"


def test_canonical_json_golden():
    req = BatchSolverRequest(
        target_abv=5.5,
        apparent_attenuation=0.75,
        v_ferm=20.0,
        topology=BatchSpargeTopology.R_L_TO_G,
        intensive_value=3.0,
        grain_bill=[GristBillRow(w_i=1.0, yield_i=0.80, mc_i=0.04)],
        delta_v_evap=3.0,
        eta_conv=0.95,
        hlt_starting_volume_l=25.0,
        max_hlt_volume_l=30.0,
    )
    assert _canonicalize(req.model_dump(mode="json")) == BATCH_CANONICAL_JSON


def test_canonical_fingerprint_golden():
    req = BatchSolverRequest(
        target_abv=5.5,
        apparent_attenuation=0.75,
        v_ferm=20.0,
        topology=BatchSpargeTopology.R_L_TO_G,
        intensive_value=3.0,
        grain_bill=[GristBillRow(w_i=1.0, yield_i=0.80, mc_i=0.04)],
        delta_v_evap=3.0,
        eta_conv=0.95,
        hlt_starting_volume_l=25.0,
        max_hlt_volume_l=30.0,
    )
    assert req.canonical_fingerprint() == BATCH_FINGERPRINT
