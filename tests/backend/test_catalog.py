"""Offline tests for catalog records (fake repository, no Firestore)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.artifact import load_artifact, validate_component
from app.auth.deps import require_allowed_user
from app.main import app
from app.services.catalog_service import (
    CatalogService,
    CatalogValidationError,
    get_catalog_service,
)

UID = "user-1"

MALT = {
    "name": "House Pale",
    "category": "BASE",
    "yield_fraction": 0.8,
    "color_lovibond": 3,
}


class FakeCatalogRepo:
    def __init__(self):
        self.docs = {}
        self._clock = 1.0
        self._auto = 0

    def _now(self):
        self._clock += 1.0
        return self._clock

    def list_items(self, uid, kind):
        return sorted(
            [
                record
                for (owner, _), record in self.docs.items()
                if owner == uid and record["kind"] == kind
            ],
            key=lambda record: record["created_at"],
            reverse=True,
        )

    def get(self, uid, kind, item_id):
        record = self.docs.get((uid, item_id))
        return record if record and record["kind"] == kind else None

    def create(self, uid, kind, component, id_field, schema_version):
        self._auto += 1
        item_id = f"item-{self._auto}"
        record = {
            "id": item_id,
            "kind": kind,
            "component": {**component, id_field: item_id},
            "created_at": self._now(),
            "schema_version": schema_version,
        }
        self.docs[(uid, item_id)] = record
        return record

    def delete(self, uid, kind, item_id):
        record = self.docs.get((uid, item_id))
        if not record or record["kind"] != kind:
            return False
        del self.docs[(uid, item_id)]
        return True


def service():
    return CatalogService(FakeCatalogRepo())


def test_create_assigns_the_identity_field_and_lists_by_kind():
    svc = service()
    created = svc.create_item("u1", "malt", MALT)

    assert created.id == "item-1"
    assert created.kind == "malt"
    assert created.component["id"] == "item-1"
    assert created.schema_version == load_artifact()["schema_version"]
    assert [item.id for item in svc.list_items("u1", "malt")] == ["item-1"]
    assert svc.list_items("u1", "equipment") == []


def test_create_honours_the_catalog_specific_identity_field():
    created = service().create_item(
        "u1", "water_report", {"laboratory": "Ward Labs", "calcium_ca": 40}
    )
    assert created.component["report_id"] == created.id
    assert "id" not in created.component


@pytest.mark.parametrize(
    "component",
    [
        {"category": "BASE"},
        {"name": "X", "category": "BASE", "yield_fraction": 1.5},
        {"name": "X", "category": "NOT_A_CATEGORY"},
        {"name": "X", "bogus": 1},
    ],
)
def test_create_rejects_invalid_components(component):
    with pytest.raises(CatalogValidationError) as exc:
        service().create_item("u1", "malt", component)
    assert exc.value.errors


def test_unknown_kind_is_404():
    with pytest.raises(HTTPException) as exc:
        service().create_item("u1", "bogus_kind", {})
    assert exc.value.status_code == 404
    with pytest.raises(HTTPException) as exc:
        service().list_items("u1", "bogus_kind")
    assert exc.value.status_code == 404


def test_records_are_scoped_and_deleted_hard():
    svc = service()
    created = svc.create_item("u1", "malt", MALT)

    with pytest.raises(HTTPException) as exc:
        svc.get_item("u2", "malt", created.id)
    assert exc.value.status_code == 404

    svc.delete_item("u1", "malt", created.id)
    with pytest.raises(HTTPException) as exc:
        svc.get_item("u1", "malt", created.id)
    assert exc.value.status_code == 404
    with pytest.raises(HTTPException) as exc:
        svc.delete_item("u1", "malt", created.id)
    assert exc.value.status_code == 404


@pytest.fixture
def client():
    svc = service()
    app.dependency_overrides[require_allowed_user] = lambda: {"uid": UID, "token": "t"}
    app.dependency_overrides[get_catalog_service] = lambda: svc
    yield TestClient(app), svc
    app.dependency_overrides.clear()


def test_routes_round_trip_create_list_get_delete(client):
    http, _ = client

    created = http.post("/catalog/malt", json={"component": MALT})
    assert created.status_code == 201
    record = created.json()
    assert record["component"]["id"] == record["id"]

    listed = http.get("/catalog/malt")
    assert [item["id"] for item in listed.json()] == [record["id"]]

    fetched = http.get(f"/catalog/malt/{record['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["component"]["name"] == "House Pale"

    assert http.delete(f"/catalog/malt/{record['id']}").status_code == 204
    assert http.get(f"/catalog/malt/{record['id']}").status_code == 404


def test_create_route_maps_validation_to_a_structured_422(client):
    http, _ = client
    response = http.post("/catalog/malt", json={"component": {"name": "X", "bogus": 1}})

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION"
    assert any("bogus" in error for error in body["details"]["errors"])


def test_unknown_kind_and_missing_items_are_404(client):
    http, _ = client
    assert http.get("/catalog/bogus_kind").status_code == 404
    assert http.get("/catalog/malt/missing").status_code == 404
    assert http.delete("/catalog/malt/missing").status_code == 404


CURVE = {
    "name": "Garage kettle",
    "measured_at": "2026-11-01",
    "ambient_temp_c": 12,
    "start_temp_c": 99,
    "points": [
        {"time_min": 10, "temp_c": 80},
        {"time_min": 20, "temp_c": 68},
    ],
}


def test_create_cooling_curve_uses_the_record_schema():
    created = service().create_item("u1", "cooling_curve", CURVE)
    assert created.kind == "cooling_curve"
    assert created.component["id"] == "item-1"
    assert created.component["points"][0]["temp_c"] == 80


@pytest.mark.parametrize(
    "component",
    [
        {**CURVE, "measured_at": ""},
        {**CURVE, "measured_at": "11/01/2026"},
        {**CURVE, "points": [{"time_min": 10, "temp_c": 80}]},
        {
            **CURVE,
            "points": [
                {"time_min": 20, "temp_c": 80},
                {"time_min": 10, "temp_c": 68},
            ],
        },
        {
            **CURVE,
            "points": [{"time_min": 10, "temp_c": 80, "bogus": 1}, {"time_min": 20, "temp_c": 68}],
        },
        {**CURVE, "ambient_temp_c": -30},
        {**CURVE, "unknown": 1},
    ],
)
def test_create_rejects_invalid_cooling_curves(component):
    with pytest.raises(CatalogValidationError) as exc:
        service().create_item("u1", "cooling_curve", component)
    assert exc.value.errors


PARITY = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "tests"
        / "conformance"
        / "fixtures"
        / "record-schema-cases.json"
    ).read_text()
)


def test_record_schema_fixture_agrees_with_the_python_validator():
    assert validate_component("cooling_curve", PARITY["valid"]) == []
    for entry in PARITY["invalid"]:
        errors = validate_component("cooling_curve", entry["component"])
        assert any(error.startswith(f"{entry['field']}:") for error in errors), entry["case"]
