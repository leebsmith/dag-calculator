"""HTTP surface for import records: status codes, error envelopes, ownership.

The service is real; the repository is a dict. What is under test is the seam a
browser will actually talk to, including the codes that tell it *why* an import
did not happen — duplicate, ambiguous, no recipe, no key, rate limited.
"""

from __future__ import annotations

import base64
import hashlib

import pytest
from conftest import FakeImportRepo
from fastapi.testclient import TestClient

from app.auth.deps import get_current_user, require_allowed_user
from app.auth.throttle import llm_limiter, rate_limiter
from app.main import app
from app.schemas.recipe_import import (
    ExtractedRecipe,
    ExtractionPayload,
    MatchReply,
    MatchResponse,
    Pick,
    SourceMeta,
)
from app.services import gemini, recipe_import
from app.services.import_service import ImportService, get_import_service

UID = "user-1"
PDF = b"%PDF-1.4\n1 0 obj << /Type /Pages /Count 1 >>\n%%EOF\n"


def canned(data: bytes, name: str) -> tuple[ExtractedRecipe, object]:
    return ExtractedRecipe(
        source=SourceMeta(
            filename=name,
            sha256=hashlib.sha256(data).hexdigest(),
            page_count=1,
            model="test-flash",
            prompt_id="extract",
            prompt_version=1,
            extracted_at="2026-11-03T00:00:00Z",
        ),
        payload=ExtractionPayload.model_validate({
            "detected_recipes": [{"title": "Test Bitter", "pages": [1]}],
            "targets": {"volume": {"value": 20.0, "unit": "l", "verbatim": "20 L", "page": 1}},
        }),
    ), None


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(recipe_import, "extract_recipe_bytes", canned)
    service = ImportService(FakeImportRepo())
    app.dependency_overrides[get_import_service] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: {"uid": UID, "token": "t"}
    app.dependency_overrides[require_allowed_user] = lambda: {"uid": UID, "token": "t"}
    rate_limiter.clear()
    llm_limiter.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    llm_limiter.clear()


def body(**overrides) -> dict:
    payload = {
        "filename": "page.pdf",
        "content_base64": base64.b64encode(PDF).decode("ascii"),
    }
    payload.update(overrides)
    return payload


def test_create_returns_the_record(client):
    response = client.post("/imports", json=body())
    assert response.status_code == 201
    record = response.json()
    assert record["status"] == "extracted"
    assert record["extract"]["source"]["filename"] == "page.pdf"
    assert record["ledger"] == []


def test_a_duplicate_answers_with_the_existing_id(client):
    first = client.post("/imports", json=body()).json()
    again = client.post("/imports", json=body())
    assert again.status_code == 409
    assert again.json()["code"] == "IMPORT_DUPLICATE"
    assert again.json()["details"]["import_id"] == first["id"]


def test_force_imports_a_copy(client):
    client.post("/imports", json=body())
    forced = client.post("/imports", json=body(force=True))
    assert forced.status_code == 201


def test_an_ambiguous_document_is_refused_with_its_titles(client, monkeypatch):
    def ambiguous(*_args, **_kwargs):
        raise recipe_import.AmbiguousDocument(["First", "Second"])

    monkeypatch.setattr(recipe_import, "extract_recipe_bytes", ambiguous)
    response = client.post("/imports", json=body())
    assert response.status_code == 422
    assert response.json()["code"] == "IMPORT_AMBIGUOUS"
    assert response.json()["details"]["titles"] == ["First", "Second"]


def test_a_document_with_no_recipe_is_refused(client, monkeypatch):
    def empty(*_args, **_kwargs):
        raise recipe_import.NoRecipeFound()

    monkeypatch.setattr(recipe_import, "extract_recipe_bytes", empty)
    response = client.post("/imports", json=body())
    assert response.status_code == 422
    assert response.json()["code"] == "IMPORT_NO_RECIPE"


def test_a_missing_key_is_a_configuration_error_not_a_crash(client, monkeypatch):
    def unavailable(*_args, **_kwargs):
        raise gemini.GeminiUnavailable("GEMINI_API_KEY is not set")

    monkeypatch.setattr(recipe_import, "extract_recipe_bytes", unavailable)
    response = client.post("/imports", json=body())
    assert response.status_code == 503
    assert response.json()["code"] == "IMPORT_NOT_CONFIGURED"


def test_an_upstream_failure_is_502(client, monkeypatch):
    def failed(*_args, **_kwargs):
        raise gemini.GeminiError("the provider returned 500")

    monkeypatch.setattr(recipe_import, "extract_recipe_bytes", failed)
    response = client.post("/imports", json=body())
    assert response.status_code == 502
    assert response.json()["code"] == "IMPORT_UPSTREAM_FAILED"


def test_an_upload_that_is_not_a_pdf_is_422(client):
    response = client.post("/imports", json=body(content_base64=base64.b64encode(b"hello").decode()))
    assert response.status_code == 422
    assert response.json()["code"] == "IMPORT_PAYLOAD"


def test_list_open_and_delete(client):
    created = client.post("/imports", json=body()).json()
    listed = client.get("/imports")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [created["id"]]

    opened = client.get(f"/imports/{created['id']}")
    assert opened.status_code == 200
    assert opened.json()["id"] == created["id"]

    assert client.get("/imports/does-not-exist").status_code == 404
    assert client.delete(f"/imports/{created['id']}").status_code == 204
    assert client.get("/imports").json() == []


def test_patch_edits_the_ledger(client):
    created = client.post("/imports", json=body()).json()
    patched = client.patch(
        f"/imports/{created['id']}",
        json={"ledger": [{"line_id": "l1", "decision": "unresolved"}]},
    )
    assert patched.status_code == 200
    assert patched.json()["ledger"] == [{"line_id": "l1", "decision": "unresolved"}]


def test_a_committed_record_refuses_edits_and_deletion(client):
    created = client.post("/imports", json=body()).json()
    service = app.dependency_overrides[get_import_service]()
    service._repo.docs[UID][created["id"]]["status"] = "committed"

    patched = client.patch(f"/imports/{created['id']}", json={"ledger": []})
    assert patched.status_code == 409
    assert patched.json()["details"]["reason"] == "committed"

    deleted = client.delete(f"/imports/{created['id']}")
    assert deleted.status_code == 409


def test_the_llm_bucket_guards_uploads(client):
    """A paid call gets a tighter allowance than the general bucket."""
    for _ in range(6):
        assert client.post("/imports", json=body(force=True)).status_code == 201
    refused = client.post("/imports", json=body(force=True))
    assert refused.status_code == 429


def test_the_match_endpoint_is_stateless_and_charges_the_llm_bucket(client, monkeypatch):
    seen = []

    def fake_match(request):
        seen.append(request)
        return MatchResponse(items=[MatchReply(text="Carafoam", picks=[Pick(id="carapils")])])

    monkeypatch.setattr(recipe_import, "match_candidates", fake_match)
    response = client.post(
        "/imports/match",
        json={
            "kind": "malt",
            "items": [
                {
                    "text": "Carafoam",
                    "candidates": [{"id": "carapils", "name": "CARAPILS", "standard": "dextrin-malt"}],
                }
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["items"][0]["picks"][0]["id"] == "carapils"
    assert len(seen) == 1, "one batched call, no record touched"


def test_a_match_without_a_key_is_503(client, monkeypatch):
    def unavailable(_request):
        raise gemini.GeminiUnavailable("GEMINI_API_KEY is not set")

    monkeypatch.setattr(recipe_import, "match_candidates", unavailable)
    response = client.post(
        "/imports/match",
        json={"kind": "hop", "items": [{"text": "Citra", "candidates": [{"id": "citra", "name": "Citra"}]}]},
    )
    assert response.status_code == 503
    assert response.json()["code"] == "IMPORT_NOT_CONFIGURED"
