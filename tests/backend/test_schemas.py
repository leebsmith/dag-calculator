"""Pydantic contract conformance tests for the boundary schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.boundary import (
    BatchSolverRequest,
    BatchSpargeTopology,
    WaterStrategy,
    WaterSolverRequest,
)

from conftest import make_batch_request, make_water_request


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
        make_batch_request(apparent_attenuation=1.5)


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
