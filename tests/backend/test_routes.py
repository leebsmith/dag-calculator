"""HTTP-layer tests: auth enforcement, error mapping, and route wiring."""

from __future__ import annotations

import pytest
from conftest import (
    FakeBatchRepo,
    freeze_payload,
    make_batch_request,
    make_hop_request,
    make_water_request,
)
from fastapi.testclient import TestClient

from app.auth.deps import get_current_user, require_allowed_user
from app.main import app
from app.schemas.batch import DraftPayload
from app.services.batch_service import BatchService, get_batch_service
from app.services.batch_solver_service import solve_batch_request
from app.services.errors import SolverServiceError
from app.services.hop_solver_service import solve_hop_request
from app.services.water_solver_service import solve_water_request

UID = "user-1"


@pytest.fixture
def service():
    svc = BatchService(FakeBatchRepo())
    app.dependency_overrides[get_batch_service] = lambda: svc
    app.dependency_overrides[get_current_user] = lambda: {"uid": UID, "token": "test"}
    app.dependency_overrides[require_allowed_user] = lambda: {"uid": UID, "token": "test"}
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
        ("GET", "/session", None),
        ("GET", "/batches", None),
        ("PUT", "/batches/b1", draft_body()),
        ("PATCH", "/batches/b1", {"trashed": True}),
        ("DELETE", "/batches/b1", None),
        ("POST", "/batches/b1/freeze", {}),
        ("GET", "/batches/b1", None),
        ("POST", "/solve/batch", make_batch_request().model_dump(mode="json")),
        ("POST", "/solve/water", make_water_request().model_dump(mode="json")),
        ("POST", "/solve/hops", make_hop_request().model_dump(mode="json")),
        ("GET", "/catalog/equipment", None),
        ("POST", "/catalog/equipment", {"component": {"name": "Rig"}}),
        ("GET", "/catalog/equipment/missing", None),
        ("DELETE", "/catalog/equipment/missing", None),
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


def test_hop_solver_returns_the_response_contract(client):
    request = make_hop_request()
    response = client.post("/solve/hops", json=request.model_dump(mode="json"))

    assert response.status_code == 200
    assert response.json() == solve_hop_request(request).model_dump(mode="json")
    assert len(response.json()["boil_rows"]) == 1
    assert len(response.json()["whirlpool_rows"]) == 1


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
    details = response.json()["details"]
    assert details["reason"] == "stale"
    assert details["current"]["id"] == "b1"
    assert details["current"]["status"] == "draft"


def test_upsert_against_a_frozen_batch_returns_the_same_conflict_envelope(client, service):
    created = client.put("/batches/b1", json=draft_body()).json()
    frozen = service.freeze_batch(UID, created["id"], freeze_payload())

    response = client.put(f"/batches/{frozen.id}", json=draft_body())

    assert response.status_code == 409
    assert response.json()["code"] == "CONFLICT"
    details = response.json()["details"]
    assert details["reason"] == "frozen"
    assert details["current"]["id"] == frozen.id
    assert details["current"]["status"] == "frozen"


def test_freeze_returns_201_and_links_the_parent(client):
    created = client.put("/batches/b1", json=draft_body()).json()
    payload = freeze_payload({"batch.target_abv": 5.5}).model_dump(mode="json")

    response = client.post(f"/batches/{created['id']}/freeze", json=payload)

    assert response.status_code == 201
    frozen = response.json()
    assert frozen["status"] == "frozen"
    assert frozen["parent_batch_id"] == created["id"]
    assert frozen["valuation"] == {"batch.target_abv": 5.5}


def test_freeze_accepts_report_inputs_and_catalog(client, service):
    created = client.put("/batches/b1", json=draft_body()).json()
    payload = {
        "valuation": {
            "batch.target_abv": 5.5,
            "solver.batch": {"sg_post_boil": 1.055},
        },
        "report_inputs": {
            "validation": {"relations": [{"id": "r", "holds": True}]},
            "telemetry": {
                "solver.batch": {
                    "binding": "batch_sparge_solver",
                    "fingerprint": "sha256:fp",
                    "telemetry": [],
                    "warnings": [],
                    "notes": [],
                }
            },
        },
        "catalog": {
            "dimensions": {},
            "nodes": {
                "batch.target_abv": {
                    "label": "Target ABV",
                    "dimension": "abv",
                    "unit": "pct",
                    "symbol": "%",
                    "decimals": 1,
                },
                "solver.batch": {"label": "Batch solver"},
                "solver.batch.sg_post_boil": {
                    "label": "Post-boil gravity",
                    "dimension": "gravity",
                    "unit": "SG",
                    "symbol": "SG",
                    "decimals": 3,
                },
            },
        },
        "formatted": {},
        "formatted_tables": {},
        "formatted_summaries": {},
    }

    response = client.post(f"/batches/{created['id']}/freeze", json=payload)

    assert response.status_code == 201
    frozen = response.json()
    bundle = service._repo.bundles[frozen["id"]]
    assert bundle["catalog"]["nodes"]["batch.target_abv"]["label"] == "Target ABV"
    assert bundle["telemetry"]["solver.batch"]["binding"] == "batch_sparge_solver"
    assert bundle["validation"]["relations"][0]["id"] == "r"


def test_freeze_rejects_a_bundle_with_undeclared_nodes(client):
    created = client.put("/batches/b1", json=draft_body()).json()

    response = client.post(
        f"/batches/{created['id']}/freeze",
        json=freeze_payload({"nope": 1}).model_dump(mode="json"),
    )

    assert response.status_code == 422
    assert "undeclared nodes" in response.json()["detail"]


def test_freezing_a_frozen_batch_is_409(client, service):
    created = client.put("/batches/b1", json=draft_body()).json()
    body = freeze_payload().model_dump(mode="json")
    frozen = client.post(f"/batches/{created['id']}/freeze", json=body).json()

    response = client.post(f"/batches/{frozen['id']}/freeze", json=body)
    assert response.status_code == 409
    assert response.json()["detail"] == "Already frozen"


def test_trash_and_restore_routes(client):
    client.put("/batches/b1", json=draft_body())

    trashed = client.patch("/batches/b1", json={"trashed": True})
    assert trashed.status_code == 200
    assert trashed.json()["trashed"] is True

    restored = client.patch("/batches/b1", json={"trashed": False})
    assert restored.json()["trashed"] is False


def test_rename_route_updates_the_name_and_keeps_state(client, service):
    created = client.put("/batches/b1", json=draft_body()).json()
    frozen_record = service.freeze_batch(UID, created["id"], freeze_payload())

    renamed = client.patch("/batches/b1", json={"name": "  Session IPA  "})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Session IPA"
    assert renamed.json()["roots"] == created["roots"]

    renamed_frozen = client.patch(f"/batches/{frozen_record.id}", json={"name": "Session IPA v1"})
    assert renamed_frozen.status_code == 200
    assert renamed_frozen.json()["status"] == "frozen"
    assert renamed_frozen.json()["valuation"] == frozen_record.valuation


def test_patch_rejects_an_empty_change_set_and_blank_names(client):
    client.put("/batches/b1", json=draft_body())

    assert client.patch("/batches/b1", json={}).status_code == 422
    assert client.patch("/batches/b1", json={"name": "   "}).status_code == 422
    assert client.patch("/batches/missing", json={"name": "Gone"}).status_code == 404


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


def test_oversized_draft_name_returns_422(client):
    response = client.put("/batches/b1", json=draft_body(name="x" * 201))

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)


def test_malformed_batch_id_returns_404(client):
    assert client.get("/batches/..").status_code == 404
    assert client.get("/batches/" + "a" * 65).status_code == 404
    assert client.get("/batches/bad!id").status_code == 404


def test_report_bundle_requires_a_frozen_batch(client):
    created = client.put("/batches/b1", json=draft_body()).json()

    response = client.get(f"/batches/{created['id']}/report-bundle")

    assert response.status_code == 409
    assert "preview" in response.json()["detail"]


def test_report_bundle_missing_batch_is_404(client):
    assert client.get("/batches/missing/report-bundle").status_code == 404


def test_report_bundle_returns_the_stored_bundle(client):
    created = client.put("/batches/b1", json=draft_body()).json()
    payload = freeze_payload({"batch.target_abv": 5.5}).model_dump(mode="json")
    frozen = client.post(f"/batches/{created['id']}/freeze", json=payload).json()

    response = client.get(f"/batches/{frozen['id']}/report-bundle")

    assert response.status_code == 200
    bundle = response.json()
    assert bundle["batch"]["id"] == frozen["id"]
    assert bundle["batch"]["status"] == "frozen"
    assert bundle["batch"]["frozen_at"] == frozen["frozen_at"]
    assert bundle["content_hash"].startswith("sha256:")


def test_report_bundle_409_when_the_frozen_batch_predates_bundles(client, service):
    created = client.put("/batches/b1", json=draft_body()).json()
    payload = freeze_payload().model_dump(mode="json")
    frozen = client.post(f"/batches/{created['id']}/freeze", json=payload).json()
    service._repo.bundles.pop(frozen["id"])

    response = client.get(f"/batches/{frozen['id']}/report-bundle")

    assert response.status_code == 409
    assert "predates report bundles" in response.json()["detail"]


def test_report_bundle_preview_does_not_persist(client, service):
    created = client.put("/batches/b1", json=draft_body()).json()
    before = set(service._repo._docs)

    payload = freeze_payload({"batch.target_abv": 5.5}).model_dump(mode="json")
    response = client.post(f"/batches/{created['id']}/report-bundle", json=payload)

    assert response.status_code == 200
    bundle = response.json()
    assert bundle["batch"]["id"] == created["id"]
    assert bundle["batch"]["status"] == "draft"
    assert bundle["batch"]["frozen_at"] is None
    assert bundle["batch"]["parent_batch_id"] is None
    assert bundle["state"]["valuation"] == {"batch.target_abv": 5.5}
    assert set(service._repo._docs) == before
    assert service._repo.bundles == {}


def test_report_bundle_preview_rejects_a_frozen_batch(client):
    created = client.put("/batches/b1", json=draft_body()).json()
    payload = freeze_payload().model_dump(mode="json")
    frozen = client.post(f"/batches/{created['id']}/freeze", json=payload).json()

    response = client.post(f"/batches/{frozen['id']}/report-bundle", json=payload)

    assert response.status_code == 409
    assert "stored bundle" in response.json()["detail"]


def test_report_bundle_preview_rejects_an_unsealable_bundle(client):
    created = client.put("/batches/b1", json=draft_body()).json()
    payload = freeze_payload({"nope": 1}).model_dump(mode="json")

    response = client.post(f"/batches/{created['id']}/report-bundle", json=payload)

    assert response.status_code == 422
    assert "undeclared nodes" in response.json()["detail"]
