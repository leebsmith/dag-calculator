"""Unit tests for the solver request/input field-parity assertion."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from pydantic import BaseModel

from app.core.batch.inputs import BatchSolverInput
from app.core.water import WaterChemistryInput
from app.schemas.boundary import BatchSolverRequest, WaterSolverRequest
from app.services.parity import assert_field_parity


class _Model(BaseModel):
    a: int
    b: str


@dataclass
class _Matched:
    a: int
    b: str


@dataclass
class _ExtraField:
    a: int
    b: str
    c: float


@dataclass
class _MissingField:
    a: int


def test_parity_passes_when_fields_match():
    assert_field_parity(_Model, _Matched)


def test_parity_fails_on_a_field_missing_from_the_dataclass():
    with pytest.raises(AssertionError):
        assert_field_parity(_Model, _MissingField)


def test_parity_fails_on_an_extra_dataclass_field():
    with pytest.raises(AssertionError):
        assert_field_parity(_Model, _ExtraField)


def test_batch_solver_request_and_input_parity():
    assert_field_parity(BatchSolverRequest, BatchSolverInput)


def test_water_solver_request_and_input_parity():
    assert_field_parity(WaterSolverRequest, WaterChemistryInput)
