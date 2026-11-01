"""Brew sessions: frozen-batch creation, observations, sealing and routes."""

from __future__ import annotations

import shutil

import pytest
from conftest import FakeBatchRepo
from fastapi.testclient import TestClient

from app.auth.deps import get_current_user, require_allowed_user
from app.main import app
from app.schemas.brew_session import (
    BrewSessionCreate,
    BrewSessionPatch,
    ObservationCreate,
    ObservationPatch,
    ObservationValue,
)
from app.services.brew_session_service import BrewSessionService, get_brew_session_service

UID = "user-1"
BATCH_ID = "batch-1"


class FakeBrewSessionRepo:
    def __init__(self):
        self._docs: dict[str, dict] = {}
        self._clock = 10.0

    def _now(self):
        self._clock += 1.0
        return self._clock

    def list_sessions(self, uid, batch_id=None):
        rows = [r for r in self._docs.values() if r["uid"] == uid]
        if batch_id is not None:
            rows = [r for r in rows if r["batch_id"] == batch_id]
        return sorted(rows, key=lambda row: row["created_at"], reverse=True)

    def get(self, uid, session_id):
        row = self._docs.get(session_id)
        return row if row and row["uid"] == uid else None

    def create(self, uid, session_id, data):
        now = self._now()
        row = {"id": session_id, "uid": uid, "created_at": now, "updated_at": now, **data}
        self._docs[session_id] = row
        return row

    def update(self, uid, session_id, data):
        row = self.get(uid, session_id)
        if row is None:
            return None
        row.update(data)
        row["updated_at"] = self._now()
        return row


def frozen_batch(repo: FakeBatchRepo) -> None:
    repo.create(
        UID,
        BATCH_ID,
        {"name": "House Pale", "status": "frozen", "frozen_at": 123.0},
    )
    repo.bundles[BATCH_ID] = {"artifact": {"hash": "sha256:test"}}


@pytest.fixture
def service():
    batches = FakeBatchRepo()
    sessions = FakeBrewSessionRepo()
    frozen_batch(batches)
    return BrewSessionService(sessions, batches)


def create_payload(**overrides) -> BrewSessionCreate:
    data = {
        "batch_id": BATCH_ID,
        "level": "info",
        "plan_snapshot": {"level": "info", "table": [{"kind": {"text": "step"}}]},
    }
    data.update(overrides)
    return BrewSessionCreate(**data)


def observation(**overrides) -> ObservationCreate:
    data = {
        "metric_id": "mash.ph",
        "step_id": "mash-ph",
        "at": 100.0,
        "method": "pH meter",
        "raw": ObservationValue(value=5.4, unit="pH"),
    }
    data.update(overrides)
    return ObservationCreate(**data)


def test_create_session_snapshots_the_frozen_batch(service) -> None:
    session = service.create_session(UID, create_payload())

    assert session.batch_id == BATCH_ID
    assert session.batch_name == "House Pale"
    assert session.artifact_hash == "sha256:test"
    assert session.frozen_at == 123.0
    assert session.status == "planned"
    assert session.plan_snapshot["table"]


def test_create_rejects_a_draft_or_missing_snapshot(service) -> None:
    bad = create_payload(batch_id="missing")
    with pytest.raises(Exception) as missing:
        service.create_session(UID, bad)
    assert "not found" in str(missing.value).lower()

    with pytest.raises(Exception) as snapshot:
        service.create_session(UID, create_payload(plan_snapshot={}))
    assert "table" in str(snapshot.value)


def test_observations_append_and_survive_a_patch(service) -> None:
    session = service.create_session(UID, create_payload())
    session = service.add_observation(UID, session.id, observation())
    assert len(session.observations) == 1
    obs = session.observations[0]
    assert obs.raw.value == 5.4
    assert obs.recorded_at > 0

    session = service.patch_observation(
        UID, session.id, obs.id, ObservationPatch(note="calibrated")
    )
    assert session.observations[0].note == "calibrated"

    session = service.patch_session(
        UID, session.id, BrewSessionPatch(status="brewing", steps={"mash-ph": {"done": True}})
    )
    assert session.status == "brewing"
    assert session.steps["mash-ph"]["done"] is True


def test_finalize_seals_the_log(service) -> None:
    session = service.create_session(UID, create_payload())
    session = service.finalize_session(UID, session.id)

    assert session.status == "sealed"
    assert session.finalized_at is not None

    with pytest.raises(Exception) as sealed:
        service.add_observation(UID, session.id, observation())
    assert "sealed" in str(sealed.value).lower()


def test_list_filters_by_batch(service) -> None:
    session = service.create_session(UID, create_payload())
    assert [row.id for row in service.list_sessions(UID, BATCH_ID)] == [session.id]
    assert service.list_sessions(UID, "other") == []


def test_routes_create_and_read_a_session(service) -> None:
    app.dependency_overrides[get_brew_session_service] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: {"uid": UID, "token": "test"}
    app.dependency_overrides[require_allowed_user] = lambda: {"uid": UID, "token": "test"}
    try:
        client = TestClient(app)
        response = client.post(
            "/brew-sessions",
            json={
                "batch_id": BATCH_ID,
                "level": "critical",
                "plan_snapshot": {"table": [{"kind": {"text": "step"}}]},
            },
        )
        assert response.status_code == 201
        session_id = response.json()["id"]

        loaded = client.get(f"/brew-sessions/{session_id}")
        assert loaded.status_code == 200
        assert loaded.json()["level"] == "critical"

        observed = client.post(
            f"/brew-sessions/{session_id}/observations",
            json={
                "metric_id": "mash.ph",
                "at": 1.0,
                "method": "pH meter",
                "raw": {"value": 5.4, "unit": "pH"},
            },
        )
        assert observed.status_code == 200
        assert len(observed.json()["observations"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.skipif(shutil.which("typst") is None, reason="typst binary not installed")
def test_report_route_renders_the_brew_sheet(service) -> None:
    app.dependency_overrides[get_brew_session_service] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: {"uid": UID, "token": "test"}
    app.dependency_overrides[require_allowed_user] = lambda: {"uid": UID, "token": "test"}
    try:
        client = TestClient(app)
        created = service.create_session(UID, create_payload())
        response = client.get(f"/brew-sessions/{created.id}/report")
        assert response.status_code == 200
        assert response.content.startswith(b"%PDF")
        assert response.headers["content-type"] == "application/pdf"
    finally:
        app.dependency_overrides.clear()
