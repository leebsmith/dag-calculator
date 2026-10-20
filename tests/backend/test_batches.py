"""Offline tests for the batch service (fake repository — no Firestore/network)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.schemas.batch import DraftPayload, FreezePayload
from app.services.batch_service import BatchConflictError, BatchService


class FakeRepo:
    def __init__(self):
        self._docs: dict[str, dict] = {}
        self._clock = 1.0

    def _now(self):
        self._clock += 1.0
        return self._clock

    def list_batches(self, uid):
        return sorted(
            [r for r in self._docs.values() if r["uid"] == uid],
            key=lambda r: r.get("updated_at", 0),
            reverse=True,
        )

    def get(self, uid, batch_id):
        r = self._docs.get(batch_id)
        return r if r and r["uid"] == uid else None

    def create(self, uid, batch_id, data):
        now = self._now()
        r = {
            "id": batch_id,
            "uid": uid,
            "status": "draft",
            "trashed": False,
            "created_at": now,
            "updated_at": now,
            **data,
        }
        self._docs[batch_id] = r
        return r

    def update(self, uid, batch_id, data):
        r = self._docs.get(batch_id)
        if not r or r["uid"] != uid:
            return None
        self._docs[batch_id] = {**r, **data, "updated_at": self._now()}
        return self._docs[batch_id]

    def set_trashed(self, uid, batch_id, trashed):
        r = self._docs.get(batch_id)
        if not r or r["uid"] != uid:
            return None
        self._docs[batch_id] = {**r, "trashed": trashed, "updated_at": self._now()}
        return self._docs[batch_id]

    def delete(self, uid, batch_id):
        r = self._docs.get(batch_id)
        if not r or r["uid"] != uid:
            return False
        del self._docs[batch_id]
        return True

    def freeze(self, uid, batch_id, data):
        source = self._docs.get(batch_id)
        if not source or source["uid"] != uid:
            return None
        now = self._now()
        r = {
            "id": f"{batch_id}-frozen",
            "uid": uid,
            "name": source.get("name", "Untitled"),
            "status": "frozen",
            "trashed": False,
            "schema_version": data.get("schema_version", source.get("schema_version", 2)),
            "valuation": data.get("valuation", {}),
            "provenance": data.get("provenance", {}),
            "parent_batch_id": batch_id,
            "roots": source.get("roots", {}),
            "collections": source.get("collections", {}),
            "created_at": now,
            "updated_at": now,
            "frozen_at": now,
        }
        self._docs[r["id"]] = r
        return r


def test_upsert_creates_then_updates():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="A", roots={"mash.grain_temp_c": 20}))
    assert rec.id == "batch-a"
    assert rec.status == "draft"
    assert rec.trashed is False
    assert rec.roots == {"mash.grain_temp_c": 20}

    updated = svc.upsert_draft(
        "u1",
        "batch-a",
        DraftPayload(name="B", roots={"mash.grain_temp_c": 21}, base_updated_at=rec.updated_at),
    )
    assert updated.name == "B"
    assert updated.roots == {"mash.grain_temp_c": 21}


def test_list_is_uid_scoped():
    svc = BatchService(FakeRepo())
    svc.upsert_draft("u1", "batch-a", DraftPayload(name="A"))
    assert len(svc.list_batches("u1")) == 1
    assert svc.list_batches("u2") == []


def test_upsert_frozen_is_409():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload())
    frozen = svc.freeze_batch("u1", rec.id, FreezePayload())

    with pytest.raises(HTTPException) as exc:
        svc.upsert_draft("u1", frozen.id, DraftPayload())
    assert exc.value.status_code == 409


def test_upsert_stale_baseline_conflicts():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="A"))

    # a first write advances updated_at
    svc.upsert_draft(
        "u1",
        "batch-a",
        DraftPayload(name="B", base_updated_at=rec.updated_at),
    )

    # replaying the original baseline now conflicts
    with pytest.raises(BatchConflictError):
        svc.upsert_draft(
            "u1",
            "batch-a",
            DraftPayload(name="C", base_updated_at=rec.updated_at),
        )


def test_trash_and_restore():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="A"))

    trashed = svc.set_trashed("u1", rec.id, True)
    assert trashed.trashed is True
    assert svc.list_batches("u1")[0].trashed is True

    restored = svc.set_trashed("u1", rec.id, False)
    assert restored.trashed is False


def test_permanent_delete():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload())

    svc.delete_batch("u1", rec.id)
    assert svc.list_batches("u1") == []

    with pytest.raises(HTTPException) as exc:
        svc.get_batch("u1", rec.id)
    assert exc.value.status_code == 404


def test_foreign_and_missing_are_404():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload())

    with pytest.raises(HTTPException) as exc:
        svc.get_batch("u2", rec.id)
    assert exc.value.status_code == 404

    with pytest.raises(HTTPException) as exc:
        svc.get_batch("u1", "nope")
    assert exc.value.status_code == 404

    with pytest.raises(HTTPException) as exc:
        svc.delete_batch("u2", rec.id)
    assert exc.value.status_code == 404


def test_freeze_creates_immutable_linked_record():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="Saison", roots={"mash.grain_temp_c": 20}))

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


def test_cannot_freeze_twice():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload())
    frozen = svc.freeze_batch("u1", rec.id, FreezePayload())

    with pytest.raises(HTTPException) as exc:
        svc.freeze_batch("u1", frozen.id, FreezePayload())
    assert exc.value.status_code == 409


def test_fork_from_frozen_carries_state_and_lineage():
    svc = BatchService(FakeRepo())
    draft = svc.upsert_draft("u1", "batch-a", DraftPayload(name="Saison", roots={"mash.grain_temp_c": 20}))
    frozen = svc.freeze_batch("u1", draft.id, FreezePayload(valuation={"x": 1}))

    # a frozen batch keeps the editable state for lossless forking
    assert frozen.roots == {"mash.grain_temp_c": 20}

    fork = svc.upsert_draft(
        "u1",
        "fork-a",
        DraftPayload(
            name="Saison (copy)",
            parent_batch_id=frozen.id,
            roots=frozen.roots,
            collections=frozen.collections,
        ),
    )
    assert fork.parent_batch_id == frozen.id
    assert fork.roots == {"mash.grain_temp_c": 20}
