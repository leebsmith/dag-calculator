"""Offline tests for the Firestore batch repository (fake collection, no network)."""

from __future__ import annotations

from app.repositories.batch_repo import BatchRepository, get_batch_repo


class FakeDocumentSnapshot:
    def __init__(self, collection, doc_id):
        self.id = doc_id
        self._collection = collection

    @property
    def exists(self):
        return self.id in self._collection.docs

    def to_dict(self):
        return dict(self._collection.docs[self.id])


class FakeDocumentReference:
    def __init__(self, collection, doc_id):
        self.id = doc_id
        self._collection = collection

    def get(self):
        return FakeDocumentSnapshot(self._collection, self.id)

    def set(self, record):
        self._collection.docs[self.id] = dict(record)

    def update(self, changes):
        self._collection.docs[self.id].update(changes)

    def delete(self):
        self._collection.docs.pop(self.id, None)


class FakeQuery:
    def __init__(self, collection, field, op, value):
        self._collection = collection
        self._field = field
        self._op = op
        self._value = value

    def stream(self):
        assert self._op == "=="
        for doc_id, record in list(self._collection.docs.items()):
            if record.get(self._field) == self._value:
                yield FakeDocumentSnapshot(self._collection, doc_id)


class FakeCollection:
    def __init__(self):
        self.docs = {}
        self._auto = 0

    def document(self, doc_id):
        return FakeDocumentReference(self, doc_id)

    def add(self, record):
        self._auto += 1
        doc_id = f"auto-{self._auto}"
        self.docs[doc_id] = dict(record)
        return None, FakeDocumentReference(self, doc_id)

    def where(self, filter):
        return FakeQuery(self, filter.field_path, filter.op_string, filter.value)


class FakeDb:
    def __init__(self):
        self.batches = FakeCollection()

    def collection(self, name):
        assert name == "batches"
        return self.batches


def repo():
    db = FakeDb()
    return BatchRepository(db), db


def test_create_stamps_ownership_status_and_timestamps():
    store, db = repo()

    record = store.create("u1", "b1", {"name": "A", "roots": {"x": 1}})

    assert record["id"] == "b1"
    assert record["uid"] == "u1"
    assert record["status"] == "draft"
    assert record["trashed"] is False
    assert record["created_at"] <= record["updated_at"]
    assert db.batches.docs["b1"]["roots"] == {"x": 1}


def test_get_is_scoped_to_the_owner():
    store, _ = repo()
    store.create("u1", "b1", {"name": "A"})

    assert store.get("u1", "b1")["name"] == "A"
    assert store.get("u2", "b1") is None
    assert store.get("u1", "missing") is None


def test_list_filters_by_owner_and_sorts_updated_at_desc():
    store, _ = repo()
    store.create("u1", "old", {"name": "Old"})
    store.create("u1", "new", {"name": "New"})
    store.create("u2", "foreign", {"name": "Foreign"})
    store._coll.document("old").update({"updated_at": 1.0})
    store._coll.document("new").update({"updated_at": 2.0})

    assert [r["id"] for r in store.list_batches("u1")] == ["new", "old"]


def test_update_advances_updated_at_and_refuses_foreign_docs():
    store, _ = repo()
    created = store.create("u1", "b1", {"name": "A"})

    updated = store.update("u1", "b1", {"name": "B"})

    assert updated["name"] == "B"
    assert updated["updated_at"] > created["updated_at"]
    assert store.update("u2", "b1", {"name": "Hijack"}) is None
    assert store.update("u1", "missing", {"name": "X"}) is None


def test_set_trashed_toggles_only_owned_docs():
    store, _ = repo()
    store.create("u1", "b1", {"name": "A"})

    assert store.set_trashed("u1", "b1", True)["trashed"] is True
    assert store.set_trashed("u2", "b1", True) is None
    assert store.set_trashed("u1", "missing", True) is None


def test_delete_removes_only_owned_docs():
    store, db = repo()
    store.create("u1", "b1", {"name": "A"})

    assert store.delete("u2", "b1") is False
    assert "b1" in db.batches.docs
    assert store.delete("u1", "b1") is True
    assert "b1" not in db.batches.docs
    assert store.delete("u1", "b1") is False


def test_freeze_creates_a_linked_immutable_snapshot():
    store, db = repo()
    draft = store.create(
        "u1",
        "b1",
        {"name": "Saison", "roots": {"mash.grain_temp_c": 20}, "collections": {"grist.major_malts": []}},
    )

    frozen = store.freeze(
        "u1",
        draft["id"],
        {
            "valuation": {"batch.target_abv": 5.5},
            "valuation_format": "outputs",
            "provenance": {"batch.yeast": {"source_template_id": "y1"}},
            "conformance": {"sai": 92},
            "schema_version": 3,
        },
    )

    assert frozen["status"] == "frozen"
    assert frozen["parent_batch_id"] == "b1"
    assert frozen["roots"] == draft["roots"]
    assert frozen["collections"] == draft["collections"]
    assert frozen["valuation"] == {"batch.target_abv": 5.5}
    assert frozen["valuation_format"] == "outputs"
    assert frozen["provenance"] == {"batch.yeast": {"source_template_id": "y1"}}
    assert frozen["conformance"] == {"sai": 92}
    assert frozen["schema_version"] == 3
    assert frozen["frozen_at"] == frozen["created_at"]
    assert frozen["id"].startswith("auto-")
    assert frozen["id"] in db.batches.docs


def test_freeze_refuses_foreign_or_missing_drafts():
    store, db = repo()
    store.create("u1", "b1", {"name": "A"})
    before = len(db.batches.docs)

    assert store.freeze("u2", "b1", {}) is None
    assert store.freeze("u1", "missing", {}) is None
    assert len(db.batches.docs) == before


def test_get_batch_repo_wraps_the_firestore_client():
    db = FakeDb()

    store = get_batch_repo(db)

    assert isinstance(store, BatchRepository)
    assert store._coll is db.batches
