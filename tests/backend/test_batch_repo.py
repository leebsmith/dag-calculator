"""Offline tests for the per-user Firestore batch repository (fake collections)."""

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

    def stream(self):
        for doc_id in list(self.docs):
            yield FakeDocumentSnapshot(self, doc_id)


class FakeUserDocument:
    def __init__(self, db, uid):
        self._db = db
        self._uid = uid

    def collection(self, name):
        assert name == "batches"
        return self._db.batches.setdefault(self._uid, FakeCollection())


class FakeUsersCollection:
    def __init__(self, db):
        self._db = db

    def document(self, uid):
        return FakeUserDocument(self._db, uid)


class FakeDb:
    def __init__(self):
        self.batches = {}

    def collection(self, name):
        assert name == "users"
        return FakeUsersCollection(self)


def repo():
    db = FakeDb()
    return BatchRepository(db), db


def user_docs(db, uid):
    return db.batches.setdefault(uid, FakeCollection()).docs


def test_create_stamps_status_and_timestamps_under_the_user_path():
    store, db = repo()

    record = store.create("u1", "b1", {"name": "A", "roots": {"x": 1}})

    assert record["id"] == "b1"
    assert record["uid"] == "u1"
    assert record["status"] == "draft"
    assert record["trashed"] is False
    assert record["created_at"] <= record["updated_at"]
    stored = user_docs(db, "u1")["b1"]
    assert stored["roots"] == {"x": 1}
    assert "uid" not in stored


def test_get_is_scoped_by_the_path():
    store, _ = repo()
    store.create("u1", "b1", {"name": "A"})

    assert store.get("u1", "b1")["name"] == "A"
    assert store.get("u2", "b1") is None
    assert store.get("u1", "missing") is None


def test_list_reads_only_the_users_subcollection_and_sorts_updated_at_desc():
    store, db = repo()
    store.create("u1", "old", {"name": "Old"})
    store.create("u1", "new", {"name": "New"})
    store.create("u2", "foreign", {"name": "Foreign"})
    user_docs(db, "u1")["old"]["updated_at"] = 1.0
    user_docs(db, "u1")["new"]["updated_at"] = 2.0

    assert [r["id"] for r in store.list_batches("u1")] == ["new", "old"]
    assert [r["id"] for r in store.list_batches("u2")] == ["foreign"]


def test_update_advances_updated_at_and_is_path_scoped():
    store, _ = repo()
    created = store.create("u1", "b1", {"name": "A"})

    updated = store.update("u1", "b1", {"name": "B"})

    assert updated["name"] == "B"
    assert updated["updated_at"] > created["updated_at"]
    assert store.update("u2", "b1", {"name": "Hijack"}) is None
    assert store.update("u1", "missing", {"name": "X"}) is None


def test_set_trashed_and_rename_are_path_scoped():
    store, _ = repo()
    created = store.create("u1", "b1", {"name": "A"})

    assert store.set_trashed("u1", "b1", True)["trashed"] is True
    assert store.set_trashed("u2", "b1", True) is None

    renamed = store.rename("u1", "b1", "B")
    assert renamed["name"] == "B"
    assert renamed["updated_at"] > created["updated_at"]
    assert store.rename("u2", "b1", "Hijack") is None
    assert store.rename("u1", "missing", "X") is None


def test_delete_removes_only_from_the_users_collection():
    store, db = repo()
    store.create("u1", "b1", {"name": "A"})
    store.create("u2", "b1", {"name": "Theirs"})

    assert store.delete("u1", "b1") is True
    assert "b1" not in user_docs(db, "u1")
    assert "b1" in user_docs(db, "u2")
    assert store.delete("u1", "b1") is False


def test_freeze_creates_a_linked_immutable_snapshot_in_the_same_path():
    store, db = repo()
    draft = store.create(
        "u1",
        "b1",
        {
            "name": "Saison",
            "roots": {"mash.grain_temp_c": 20},
            "collections": {"grist.major_malts": []},
            "selections": {"batch.yeast": {"id": "y1", "name": "Yeast"}},
        },
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
    assert frozen["uid"] == "u1"
    assert frozen["roots"] == draft["roots"]
    assert frozen["collections"] == draft["collections"]
    assert frozen["selections"] == draft["selections"]
    assert frozen["valuation"] == {"batch.target_abv": 5.5}
    assert frozen["valuation_format"] == "outputs"
    assert frozen["provenance"] == {"batch.yeast": {"source_template_id": "y1"}}
    assert frozen["conformance"] == {"sai": 92}
    assert frozen["schema_version"] == 3
    assert frozen["frozen_at"] == frozen["created_at"]
    assert frozen["id"].startswith("auto-")
    assert frozen["id"] in user_docs(db, "u1")


def test_freeze_refuses_foreign_or_missing_drafts():
    store, db = repo()
    store.create("u1", "b1", {"name": "A"})
    before = len(user_docs(db, "u1"))

    assert store.freeze("u2", "b1", {}) is None
    assert store.freeze("u1", "missing", {}) is None
    assert len(user_docs(db, "u1")) == before


def test_get_batch_repo_wraps_the_firestore_client():
    db = FakeDb()

    store = get_batch_repo(db)

    assert isinstance(store, BatchRepository)
    assert store._db is db
    collection = store._collection("u1")
    assert collection is db.batches["u1"]
