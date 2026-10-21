"""HTTP-layer tests: auth enforcement, error mapping, and route wiring."""

from __future__ import annotations

import pytest
from conftest import FakeBatchRepo, make_batch_request, make_water_request
from fastapi.testclient import TestClient

from app.auth.deps import get_current_user
from app.main import app
from app.schemas.batch import DraftPayload, FreezePayload
from app.services.batch_service import BatchService, get_batch_service
from app.services.batch_solver_service import solve_batch_request
from app.services.errors import SolverServiceError
from app.services.water_solver_service import solve_water_request

UID = "user-1"


@pytest.fixture
def service():
    svc = BatchService(FakeBatchRepo())
    app.dependency_overrides[get_batch_service] = lambda: svc
    app.dependency_overrides[get_current_user] = lambda: {"uid": UID, "token": "test"}
    yield svc
    app.dependency_overrides.clear()


@pytest.fixture
def client(service):
    return TestClient(app)


@pytest.fixture
def anon_client():
    app.dependency_overrides.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()


def draft_body(**overrides):
    return {"name": "A", "roots": {"mash.grain_temp_c": 20.0}, **overrides}


def test_auth_is_enforced_on_every_route(anon_client):
    routes = [
        ("GET", "/batches", None),
        ("PUT", "/batches/b1", draft_body()),
        ("PATCH", "/batches/b1", {"trashed": True}),
        ("DELETE", "/batches/b1", None),
        ("POST", "/batches/b1/freeze", {}),
        ("GET", "/batches/b1", None),
        ("POST", "/solve/batch", make_batch_request().model_dump(mode="json")),
        ("POST", "/solve/water", make_water_request().model_dump(mode="json")),
    ]
    for method, path, body in routes:
        response = anon_client.request(method, path, json=body)
        assert response.status_code == 401, f"{method} {path}"
        assert response.json()["detail"] == "Missing bearer token"


def test_batch_solver_returns_the_response_contract(client):
    request = make_batch_request()
    response = client.post("/solve/batch", json=request.model_dump(mode="json"))

    assert response.status_code == 200
    body = response.json()
    assert body == solve_batch_request(request).model_dump(mode="json")
    assert "fingerprint" not in body
    assert body["cascade"]["v_strike"] > 0


def test_water_solver_returns_the_response_contract(client):
    request = make_water_request()
    response = client.post("/solve/water", json=request.model_dump(mode="json"))

    assert response.status_code == 200
    assert response.json() == solve_water_request(request).model_dump(mode="json")


def test_request_validation_uses_fastapi_detail_shape(client):
    response = client.post("/solve/batch", json={"target_abv": 5.5})

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert any("body" in item["loc"] for item in detail)
    assert any(item["msg"] for item in detail)


def test_solver_failure_maps_to_the_error_envelope(client, monkeypatch):
    def _fail(_request):
        raise SolverServiceError("NO_SOLUTION", "no root in bracket", {"iterations": 12})

    monkeypatch.setattr("app.main.solve_batch_request", _fail)
    response = client.post("/solve/batch", json=make_batch_request().model_dump(mode="json"))

    assert response.status_code == 422
    assert response.json() == {
        "code": "NO_SOLUTION",
        "message": "no root in bracket",
        "details": {"iterations": 12},
    }


def test_water_solver_failure_maps_to_the_error_envelope(client, monkeypatch):
    def _fail(_request):
        raise SolverServiceError("INFEASIBLE", "no salt plan")

    monkeypatch.setattr("app.main.solve_water_request", _fail)
    response = client.post("/solve/water", json=make_water_request().model_dump(mode="json"))

    assert response.status_code == 422
    assert response.json()["code"] == "INFEASIBLE"
    assert response.json()["details"] == {}


def test_upsert_creates_a_draft_owned_by_the_caller(client):
    response = client.put("/batches/b1", json=draft_body())

    assert response.status_code == 200
    record = response.json()
    assert record["id"] == "b1"
    assert record["uid"] == UID
    assert record["status"] == "draft"
    assert record["trashed"] is False
    assert record["roots"] == {"mash.grain_temp_c": 20.0}


def test_upsert_with_a_stale_baseline_returns_the_conflict_envelope(client):
    first = client.put("/batches/b1", json=draft_body()).json()
    client.put("/batches/b1", json=draft_body(base_updated_at=first["updated_at"], name="B"))

    response = client.put("/batches/b1", json=draft_body(base_updated_at=first["updated_at"], name="C"))

    assert response.status_code == 409
    assert response.json()["code"] == "CONFLICT"
    assert response.json()["details"] == {"reason": "stale"}


def test_upsert_against_a_frozen_batch_returns_the_same_conflict_envelope(client, service):
    created = client.put("/batches/b1", json=draft_body()).json()
    frozen = service.freeze_batch(UID, created["id"], FreezePayload())

    response = client.put(f"/batches/{frozen.id}", json=draft_body())

    assert response.status_code == 409
    assert response.json()["code"] == "CONFLICT"
    assert response.json()["details"] == {"reason": "frozen"}


def test_freeze_returns_201_and_links_the_parent(client):
    created = client.put("/batches/b1", json=draft_body()).json()
    payload = {"valuation": {"batch.target_abv": 5.5}, "provenance": {}}

    response = client.post(f"/batches/{created['id']}/freeze", json=payload)

    assert response.status_code == 201
    frozen = response.json()
    assert frozen["status"] == "frozen"
    assert frozen["parent_batch_id"] == created["id"]
    assert frozen["valuation"] == {"batch.target_abv": 5.5}


def test_freezing_a_frozen_batch_is_409(client, service):
    created = client.put("/batches/b1", json=draft_body()).json()
    frozen = client.post(f"/batches/{created['id']}/freeze", json={}).json()

    response = client.post(f"/batches/{frozen['id']}/freeze", json={})
    assert response.status_code == 409
    assert response.json()["detail"] == "Already frozen"


def test_trash_and_restore_routes(client):
    client.put("/batches/b1", json=draft_body())

    trashed = client.patch("/batches/b1", json={"trashed": True})
    assert trashed.status_code == 200
    assert trashed.json()["trashed"] is True

    restored = client.patch("/batches/b1", json={"trashed": False})
    assert restored.json()["trashed"] is False


def test_delete_returns_204_without_a_body(client):
    client.put("/batches/b1", json=draft_body())

    response = client.delete("/batches/b1")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get("/batches/b1").status_code == 404


def test_list_is_scoped_to_the_authenticated_user(client, service):
    client.put("/batches/b1", json=draft_body())
    service.upsert_draft("someone-else", "b2", DraftPayload())

    response = client.get("/batches")

    assert response.status_code == 200
    assert [record["id"] for record in response.json()] == ["b1"]


def test_missing_batch_is_404_with_a_detail(client):
    response = client.get("/batches/nope")

    assert response.status_code == 404
    assert response.json()["detail"] == "Batch not found"
