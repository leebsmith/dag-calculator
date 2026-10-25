"""Boundary route contract: the shared route fixture must match the FastAPI
routes, their HTTP method, and their response models.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.main import app

FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "conformance"
        / "fixtures"
        / "boundary-routes.json"
    ).read_text()
)

ROUTE_MAP = {
    route.path: route
    for route in app.routes
    if "POST" in getattr(route, "methods", set())
}


@pytest.mark.parametrize(("binding", "spec"), FIXTURE.items())
def test_boundary_route_matches_fixture(binding, spec):
    route = ROUTE_MAP.get(spec["path"])
    assert route is not None, f"{binding}: missing POST route {spec['path']}"
    assert "POST" in route.methods, binding
    assert route.response_model is not None, f"{binding}: no response_model"
    assert route.response_model.__name__ == spec["response_model"], (
        f"{binding}: response model {route.response_model.__name__} "
        f"!= {spec['response_model']}"
    )


def test_solve_route_set_matches_fixture():
    solve_paths = {path for path in ROUTE_MAP if path.startswith("/solve/")}
    assert solve_paths == {spec["path"] for spec in FIXTURE.values()}
