"""Offline tests for the batch service (fake repository — no Firestore/network)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.schemas.batch import DraftPayload
from app.services.batch_service import BatchService


class FakeRepo:
    def __init__(self):
        self._docs: dict[str, dict] = {}
        self._next = 0

    def _next_id(self):
        self._next += 1
        return f"batch-{self._next}"

    def list_drafts(self, uid):
        return [
            r
            for r in self._docs.values()
            if r["uid"] == uid and r["status"] == "draft"
        ]

    def get(self, uid, batch_id):
        r = self._docs.get(batch_id)
        return r if r and r["uid"] == uid else None

    def create(self, uid, data):
        bid = self._next_id()
        r = {"id": bid, "uid": uid, "status": "draft", "created_at": 1.0, "updated_at": 1.0, **data}
        self._docs[bid] = r
        return r

    def update(self, uid, batch_id, data):
        r = self._docs.get(batch_id)
        if not r or r["uid"] != uid:
            return None
        self._docs[batch_id] = {**r, **data, "updated_at": 2.0}
        return self._docs[batch_id]


def test_create_and_list_are_uid_scoped():
    svc = BatchService(FakeRepo())
    rec = svc.create_draft("u1", DraftPayload(name="A", roots={"mash.grain_temp_c": 20}))
    assert rec.id
    assert rec.uid == "u1"
    assert rec.status == "draft"
    assert rec.roots == {"mash.grain_temp_c": 20}

    assert len(svc.list_drafts("u1")) == 1
    assert svc.list_drafts("u2") == []


def test_update_then_get():
    svc = BatchService(FakeRepo())
    rec = svc.create_draft("u1", DraftPayload(name="A"))
    updated = svc.update_draft(
        "u1",
        rec.id,
        DraftPayload(name="B", collections={"batch.sugars": []}, overlays={"equipment.profile": {"x": 1}}),
    )
    assert updated.name == "B"
    assert updated.collections == {"batch.sugars": []}
    assert svc.get_batch("u1", rec.id).name == "B"


def test_foreign_and_missing_batches_are_404():
    svc = BatchService(FakeRepo())
    rec = svc.create_draft("u1", DraftPayload())

    with pytest.raises(HTTPException) as exc:
        svc.get_batch("u2", rec.id)
    assert exc.value.status_code == 404

    with pytest.raises(HTTPException) as exc:
        svc.get_batch("u1", "nope")
    assert exc.value.status_code == 404

    with pytest.raises(HTTPException) as exc:
        svc.update_draft("u2", rec.id, DraftPayload())
    assert exc.value.status_code == 404
