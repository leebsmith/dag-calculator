"""Cross-runtime numeric parity: Python solvers must reproduce the shared fixture."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.batch_solver import cutaia_abv, solve_sg_post_boil_from_abv
from app.core.utils import plato_to_sg, sg_to_plato

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "conformance" / "fixtures" / "numeric-parity.json").read_text()
)


@pytest.mark.parametrize("case", FIXTURE["plato_to_sg"])
def test_plato_to_sg(case):
    assert plato_to_sg(case["plato"]) == pytest.approx(case["sg"], rel=1e-12, abs=1e-12)


@pytest.mark.parametrize("case", FIXTURE["sg_to_plato"])
def test_sg_to_plato(case):
    assert sg_to_plato(case["sg"]) == pytest.approx(case["plato"], rel=1e-12, abs=1e-12)


@pytest.mark.parametrize("case", FIXTURE["cutaia_abv"])
def test_cutaia_abv(case):
    assert cutaia_abv(sg_to_plato(case["og_sg"]), case["aa"]) == pytest.approx(
        case["abv"], rel=1e-12, abs=1e-12
    )


@pytest.mark.parametrize("case", FIXTURE["max_achievable_abv"])
def test_max_achievable_abv(case):
    assert cutaia_abv(sg_to_plato(case["og_sg"]), case["aa"]) == pytest.approx(
        case["abv"], rel=1e-12, abs=1e-12
    )


@pytest.mark.parametrize("case", FIXTURE["phase1_sg_from_abv"])
def test_phase1_sg_from_abv(case):
    assert solve_sg_post_boil_from_abv(case["target_abv"], case["aa"]) == pytest.approx(
        case["sg"], rel=1e-12, abs=1e-12
    )
