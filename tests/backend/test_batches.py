"""Offline tests for the batch service (fake repository — no Firestore/network)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.schemas.batch import DraftPayload, FreezePayload
from app.services.batch_service import BatchService


class FakeRepo:
    def __init__(self):
        self._docs: dict[str, dict] = {}
        self._next = 0

    def _next_id(self):
        self._next += 1
        return f"batch-{self._next}"

    def list_batches(self, uid):
        return sorted(
            [r for r in self._docs.values() if r["uid"] == uid],
            key=lambda r: r.get("updated_at", 0),
            reverse=True,
        )

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

    def freeze(self, uid, batch_id, data):
        source = self._docs.get(batch_id)
        if not source or source["uid"] != uid:
            return None
        bid = self._next_id()
        r = {
            "id": bid,
            "uid": uid,
            "name": source.get("name", "Untitled"),
            "status": "frozen",
            "schema_version": data.get("schema_version", source.get("schema_version", 2)),
            "valuation": data.get("valuation", {}),
            "provenance": data.get("provenance", {}),
            "parent_batch_id": batch_id,
            "roots": source.get("roots", {}),
            "collections": source.get("collections", {}),
            "created_at": 3.0,
            "updated_at": 3.0,
            "frozen_at": 3.0,
        }
        self._docs[bid] = r
        return r


def test_create_and_list_are_uid_scoped():
    svc = BatchService(FakeRepo())
    rec = svc.create_draft("u1", DraftPayload(name="A", roots={"mash.grain_temp_c": 20}))
    assert rec.id
    assert rec.uid == "u1"
    assert rec.status == "draft"
    assert rec.roots == {"mash.grain_temp_c": 20}

    assert len(svc.list_batches("u1")) == 1
    assert svc.list_batches("u2") == []


def test_update_then_get():
    svc = BatchService(FakeRepo())
    rec = svc.create_draft("u1", DraftPayload(name="A"))
    updated = svc.update_draft(
        "u1",
        rec.id,
        DraftPayload(name="B", collections={"batch.sugars": []}),
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


def test_freeze_creates_immutable_linked_record():
    svc = BatchService(FakeRepo())
    rec = svc.create_draft("u1", DraftPayload(name="Saison", roots={"mash.grain_temp_c": 20}))

    frozen = svc.freeze_batch(
        "u1",
        rec.id,
        FreezePayload(
            valuation={"mash.grain_temp_c": 20.0, "solver.batch.sg_post_boil": 1.055},
            provenance={"batch.yeast": {"source_template_id": "y1", "source_revision": "abc"}},
        ),
    )
    assert frozen.status == "frozen"
    assert frozen.parent_batch_id == rec.id
    assert frozen.valuation["solver.batch.sg_post_boil"] == 1.055
    assert frozen.provenance["batch.yeast"]["source_template_id"] == "y1"

    # the source draft is untouched and still editable
    assert svc.get_batch("u1", rec.id).status == "draft"


def test_cannot_update_frozen_batch():
    svc = BatchService(FakeRepo())
    rec = svc.create_draft("u1", DraftPayload())
    frozen = svc.freeze_batch("u1", rec.id, FreezePayload())

    with pytest.raises(HTTPException) as exc:
        svc.update_draft("u1", frozen.id, DraftPayload())
    assert exc.value.status_code == 409


def test_cannot_freeze_twice():
    svc = BatchService(FakeRepo())
    rec = svc.create_draft("u1", DraftPayload())
    frozen = svc.freeze_batch("u1", rec.id, FreezePayload())

    with pytest.raises(HTTPException) as exc:
        svc.freeze_batch("u1", frozen.id, FreezePayload())
    assert exc.value.status_code == 409


def test_fork_from_frozen_carries_state_and_lineage():
    svc = BatchService(FakeRepo())
    draft = svc.create_draft("u1", DraftPayload(name="Saison", roots={"mash.grain_temp_c": 20}))
    frozen = svc.freeze_batch("u1", draft.id, FreezePayload(valuation={"x": 1}))

    # a frozen batch keeps the editable state for lossless forking
    assert frozen.roots == {"mash.grain_temp_c": 20}

    fork = svc.create_draft(
        "u1",
        DraftPayload(
            name="Saison (copy)",
            parent_batch_id=frozen.id,
            roots=frozen.roots,
            collections=frozen.collections,
        ),
    )
    assert fork.parent_batch_id == frozen.id
    assert fork.roots == {"mash.grain_temp_c": 20}
