"""Report rendering: artifacts, spec errors, headers, and the two routes."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import pytest
from conftest import FakeBatchRepo
from fastapi.testclient import TestClient

from app.auth.deps import get_current_user, require_allowed_user
from app.main import app
from app.schemas.report_bundle import ReportBundle
from app.services import batch_service
from app.services.batch_service import BatchService, get_batch_service
from app.services.bundle_integrity import parse_bundle, seal_bundle
from app.services.report_render import (
    ReportRenderError,
    ReportSpecError,
    parse_spec,
    render,
)

TYPST = shutil.which("typst")

pytestmark = pytest.mark.skipif(
    TYPST is None, reason="typst binary not installed; render gates skipped"
)

UID = "user-1"
BUNDLE = (
    Path(__file__).resolve().parents[2]
    / "tests"
    / "conformance"
    / "fixtures"
    / "report-bundle.json"
)
SECTIONS = ("brewhouse", "batch-facts", "yeast", "volume-ledger", "liquor-ledger")


def bundle_dict() -> dict:
    return json.loads(BUNDLE.read_text())


def bundle() -> ReportBundle:
    return parse_bundle(bundle_dict())


def draft_bundle_dict() -> dict:
    """The fixture reshaped as the draft preview the client would post."""
    data = bundle_dict()
    data["batch"].update({"status": "draft", "frozen_at": None, "parent_batch_id": None})
    return seal_bundle(data).model_dump(mode="json")


@pytest.fixture(scope="session")
def render_once():
    """One compile per (bundle, spec) for the session.

    The determinism case renders directly, so its two compiles stay independent
    of this cache.
    """
    cache = {}

    def render_once(bundle_obj, spec):
        key = (
            bundle_obj.content_hash,
            spec.doc_kind,
            spec.fmt,
            spec.sections,
            spec.paper,
            spec.page,
            os.environ.get("TYPST_BIN"),
        )
        if key not in cache:
            cache[key] = render(bundle_obj, spec)
        return cache[key]

    return render_once


@pytest.fixture(scope="session")
def frozen_report(render_once):
    return render_once(bundle(), parse_spec())


@pytest.fixture(scope="session")
def second_frozen_report():
    return render(bundle(), parse_spec())


def test_a_frozen_bundle_renders_a_pdf(frozen_report) -> None:
    rendered = frozen_report

    assert rendered.data.startswith(b"%PDF")
    assert rendered.media_type == "application/pdf"
    assert rendered.sections == SECTIONS
    assert rendered.pages >= 1
    assert rendered.key is not None and len(rendered.key) == 16


def test_a_png_request_returns_one_page(render_once) -> None:
    rendered = render_once(bundle(), parse_spec(fmt="png", page=2))

    assert rendered.data.startswith(b"\x89PNG")
    assert rendered.media_type == "image/png"
    assert rendered.page == 2


def test_a_page_beyond_the_document_is_a_spec_error() -> None:
    with pytest.raises(ReportSpecError, match="beyond"):
        render(bundle(), parse_spec(fmt="png", page=99))


def test_an_unknown_section_is_a_spec_error() -> None:
    with pytest.raises(ReportSpecError, match="unknown section"):
        render(bundle(), parse_spec(sections="not-a-section"))


def test_an_empty_resolved_selection_is_a_spec_error() -> None:
    data = bundle_dict()
    del data["formatted"]["batch.target_ibu"]  # batch-facts loses its presence

    with pytest.raises(ReportSpecError, match="nothing to report"):
        render(seal_bundle(data), parse_spec(sections="batch-facts"))


def test_frozen_renders_are_byte_identical(frozen_report, second_frozen_report) -> None:
    assert frozen_report.data == second_frozen_report.data


def test_the_render_key_tracks_the_spec(
    frozen_report, second_frozen_report, render_once
) -> None:
    assert frozen_report.key == second_frozen_report.key
    assert frozen_report.key != render_once(bundle(), parse_spec(paper="letter")).key
    assert frozen_report.key != render_once(bundle(), parse_spec(fmt="png")).key


def test_a_mismatched_typst_binary_is_unavailable(monkeypatch) -> None:
    monkeypatch.setenv("TYPST_BIN", "/bin/true")

    with pytest.raises(ReportRenderError) as exc:
        render(bundle(), parse_spec())
    assert exc.value.unavailable


@pytest.fixture
def service(monkeypatch, render_once):
    """The service renders through the session cache, so a route case reuses the
    compile its spec already has."""
    monkeypatch.setattr(batch_service, "render_bundle", render_once)
    svc = BatchService(FakeBatchRepo())
    app.dependency_overrides[get_batch_service] = lambda: svc
    app.dependency_overrides[get_current_user] = lambda: {"uid": UID, "token": "test"}
    app.dependency_overrides[require_allowed_user] = lambda: {"uid": UID, "token": "test"}
    yield svc
    app.dependency_overrides.clear()


@pytest.fixture
def client(service):
    return TestClient(app)


def frozen_batch(service) -> str:
    service._repo.create(UID, "batch-1", {"name": "House Pale"})
    record, reason = service._repo.freeze(
        UID,
        "batch-1",
        {"valuation": {}, "provenance": {}},
        bundle_factory=lambda frozen_id, row: bundle_dict(),
    )
    assert reason is None
    return record["id"]


def test_get_renders_a_frozen_batch(client, service) -> None:
    batch_id = frozen_batch(service)

    response = client.get(f"/batches/{batch_id}/report")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert response.headers["X-Report-Sections"].split(",") == list(SECTIONS)
    assert int(response.headers["X-Report-Pages"]) >= 1
    assert response.headers["ETag"].startswith('"')


def test_get_refuses_a_draft(client, service) -> None:
    service._repo.create(UID, "draft-1", {"name": "Draft"})

    response = client.get("/batches/draft-1/report")

    assert response.status_code == 409


def test_get_is_404_for_another_users_batch(client, service) -> None:
    service._repo.create("someone-else", "their-1", {"name": "Theirs"})

    assert client.get("/batches/their-1/report").status_code == 404


def test_get_maps_spec_errors_to_422(client, service) -> None:
    batch_id = frozen_batch(service)

    assert client.get(f"/batches/{batch_id}/report?sections=nope").status_code == 422
    assert client.get(f"/batches/{batch_id}/report?paper=legal").status_code == 422
    assert client.get(f"/batches/{batch_id}/report?doc_kind=label").status_code == 422
    assert (
        client.get(f"/batches/{batch_id}/report?format=png&page=99").status_code == 422
    )


def test_a_png_route_returns_an_image(client, service) -> None:
    batch_id = frozen_batch(service)

    response = client.get(f"/batches/{batch_id}/report?format=png&page=1")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")


def test_post_renders_a_drafts_bundle(client, service) -> None:
    service._repo.create(UID, "frozen-1", {"name": "Draft"})

    response = client.post(
        "/batches/frozen-1/report", json={"bundle": draft_bundle_dict()}
    )

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")
    # A preview embeds its compile time, so it makes no ETag claim.
    assert "ETag" not in response.headers


def test_post_refuses_a_frozen_batch(client, service) -> None:
    batch_id = frozen_batch(service)

    response = client.post(f"/batches/{batch_id}/report", json={"bundle": bundle_dict()})

    assert response.status_code == 409


def test_post_rejects_a_foreign_bundle(client, service) -> None:
    service._repo.create(UID, "draft-3", {"name": "Draft"})

    response = client.post(
        "/batches/draft-3/report", json={"bundle": draft_bundle_dict()}
    )

    assert response.status_code == 422


def test_post_rejects_a_frozen_bundle_for_a_draft(client, service) -> None:
    service._repo.create(UID, "frozen-1", {"name": "Draft"})

    response = client.post("/batches/frozen-1/report", json={"bundle": bundle_dict()})

    assert response.status_code == 422
