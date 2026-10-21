"""Offline tests for the per-user Firestore batch repository (fake collections)."""

from __future__ import annotations

import logging

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

    def get(self, transaction=None):
        if transaction is not None:
            transaction.calls.append(("get", self.id))
        return FakeDocumentSnapshot(self._collection, self.id)

    def set(self, record):
        self._collection.docs[self.id] = dict(record)

    def update(self, changes):
        self._collection.docs[self.id].update(changes)

    def delete(self):
        self._collection.docs.pop(self.id, None)


class FakeQuery:
    def __init__(self, collection, field, direction):
        self._collection = collection
        self._field = field
        self._descending = direction is not None and "DESC" in str(direction).upper()
        self._limit = None

    def limit(self, n):
        self._limit = n
        return self

    def stream(self):
        docs = list(self._collection.docs.items())
        docs.sort(key=lambda kv: kv[1].get(self._field, 0), reverse=self._descending)
        if self._limit is not None:
            docs = docs[: self._limit]
        for doc_id, _ in docs:
            yield FakeDocumentSnapshot(self._collection, doc_id)


class FakeCollection:
    def __init__(self):
        self.docs = {}
        self._auto = 0

    def document(self, doc_id=None):
        if doc_id is None:
            self._auto += 1
            doc_id = f"auto-{self._auto}"
        return FakeDocumentReference(self, doc_id)

    def add(self, record):
        self._auto += 1
        doc_id = f"auto-{self._auto}"
        self.docs[doc_id] = dict(record)
        return None, FakeDocumentReference(self, doc_id)

    def order_by(self, field, direction=None):
        return FakeQuery(self, field, direction)

    def stream(self):
        for doc_id in list(self.docs):
            yield FakeDocumentSnapshot(self, doc_id)


class FakeTransaction:
    def __init__(self):
        self.calls = []
        self._id = None
        self._max_attempts = 1
        self._read_only = False

    def _clean_up(self):
        self._id = None

    def _begin(self, retry_id=None):
        self._id = b"txn"
        self.calls.append(("begin", retry_id))

    def _commit(self):
        self.calls.append(("commit", None))

    def _rollback(self):
        self.calls.append(("rollback", None))

    def set(self, ref, record):
        self.calls.append(("set", ref.id))
        ref.set(record)

    def update(self, ref, changes):
        self.calls.append(("update", ref.id))
        ref.update(changes)

    def delete(self, ref):
        self.calls.append(("delete", ref.id))
        ref.delete()


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
        self.last_transaction = None

    def collection(self, name):
        assert name == "users"
        return FakeUsersCollection(self)

    def transaction(self):
        self.last_transaction = FakeTransaction()
        return self.last_transaction


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


def test_list_batches_orders_and_respects_the_limit():
    store, db = repo()
    store.create("u1", "a", {"name": "A"})
    store.create("u1", "b", {"name": "B"})
    store.create("u1", "c", {"name": "C"})
    user_docs(db, "u1")["a"]["updated_at"] = 1.0
    user_docs(db, "u1")["b"]["updated_at"] = 3.0
    user_docs(db, "u1")["c"]["updated_at"] = 2.0

    assert [r["id"] for r in store.list_batches("u1")] == ["b", "c", "a"]
    assert [r["id"] for r in store.list_batches("u1", limit=2)] == ["b", "c"]


def test_list_batches_warns_when_truncated(caplog):
    store, _ = repo()
    store.create("u1", "a", {"name": "A"})
    store.create("u1", "b", {"name": "B"})
    store.create("u1", "c", {"name": "C"})

    with caplog.at_level(logging.WARNING, logger="app.batch_repo"):
        store.list_batches("u1", limit=2)

    assert any("truncated" in message for message in caplog.messages)


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

    frozen, reason = store.freeze(
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

    assert reason is None
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

    record, reason = store.freeze("u2", "b1", {})
    assert record is None and reason == "missing"
    record, reason = store.freeze("u1", "missing", {})
    assert record is None and reason == "missing"
    assert len(user_docs(db, "u1")) == before


def test_get_batch_repo_wraps_the_firestore_client():
    db = FakeDb()

    store = get_batch_repo(db)

    assert isinstance(store, BatchRepository)
    assert store._db is db
    collection = store._collection("u1")
    assert collection is db.batches["u1"]


def test_apply_draft_creates_when_absent():
    store, db = repo()

    record, reason = store.apply_draft("u1", "b1", {"name": "A"}, None)

    assert reason is None
    assert record["id"] == "b1"
    assert record["status"] == "draft"
    assert record["trashed"] is False
    assert db.last_transaction.calls == [
        ("begin", None),
        ("get", "b1"),
        ("set", "b1"),
        ("commit", None),
    ]


def test_apply_draft_updates_when_baseline_matches():
    store, _ = repo()
    created, _ = store.apply_draft("u1", "b1", {"name": "A"}, None)

    updated, reason = store.apply_draft("u1", "b1", {"name": "B"}, created["updated_at"])

    assert reason is None
    assert updated["name"] == "B"
    assert updated["updated_at"] > created["updated_at"]


def test_apply_draft_rejects_stale_baseline_without_writing():
    store, db = repo()
    created, _ = store.apply_draft("u1", "b1", {"name": "A"}, None)
    store.apply_draft("u1", "b1", {"name": "B"}, created["updated_at"])
    before = user_docs(db, "u1")["b1"]

    record, reason = store.apply_draft("u1", "b1", {"name": "C"}, created["updated_at"])

    assert reason == "stale"
    assert record["name"] == "B"
    assert user_docs(db, "u1")["b1"] == before
    assert [call[0] for call in db.last_transaction.calls] == ["begin", "get", "commit"]


def test_apply_draft_rejects_frozen():
    store, _ = repo()
    store.create("u1", "b1", {"name": "A"})
    store._collection("u1").document("b1").update({"status": "frozen"})

    record, reason = store.apply_draft("u1", "b1", {"name": "B"}, None)

    assert reason == "frozen"
    assert record["status"] == "frozen"


def test_apply_draft_two_writers_one_deterministic_loser():
    store, _ = repo()
    first, _ = store.apply_draft("u1", "b1", {"name": "A"}, None)

    # Both writers captured the same baseline before either committed.
    winner, winner_reason = store.apply_draft("u1", "b1", {"name": "Winner"}, first["updated_at"])
    loser, loser_reason = store.apply_draft("u1", "b1", {"name": "Loser"}, first["updated_at"])

    assert winner_reason is None
    assert winner["name"] == "Winner"
    assert loser_reason == "stale"
    assert loser["name"] == "Winner"


def test_apply_draft_force_overrides_a_stale_baseline():
    store, _ = repo()
    created, _ = store.apply_draft("u1", "b1", {"name": "A"}, None)
    store.apply_draft("u1", "b1", {"name": "B"}, created["updated_at"])

    record, reason = store.apply_draft("u1", "b1", {"name": "C"}, created["updated_at"], force=True)

    assert reason is None
    assert record["name"] == "C"


def test_apply_draft_force_still_rejects_frozen():
    store, _ = repo()
    store.create("u1", "b1", {"name": "A"})
    store._collection("u1").document("b1").update({"status": "frozen"})

    record, reason = store.apply_draft("u1", "b1", {"name": "B"}, None, force=True)

    assert reason == "frozen"
    assert record["status"] == "frozen"


def test_freeze_reads_before_it_writes():
    store, db = repo()
    store.create("u1", "b1", {"name": "A"})

    frozen, reason = store.freeze("u1", "b1", {"valuation": {"x": 1}})

    assert reason is None
    assert db.last_transaction.calls[0][0] == "begin"
    assert db.last_transaction.calls[1] == ("get", "b1")
    assert db.last_transaction.calls[2][0] == "set"
    assert frozen["id"] == db.last_transaction.calls[2][1]


def test_freeze_refuses_an_already_frozen_record():
    store, db = repo()
    store.create("u1", "b1", {"name": "A"})

    frozen, reason = store.freeze("u1", "b1", {})
    assert reason is None

    again, reason = store.freeze("u1", frozen["id"], {})
    assert reason == "frozen"
    assert again["status"] == "frozen"
    assert len([d for d in user_docs(db, "u1") if d != "b1"]) == 1


def test_freeze_after_trash_still_snapshots_with_trashed_false():
    store, db = repo()
    store.create("u1", "b1", {"name": "A"})
    store.set_trashed("u1", "b1", True)

    frozen, reason = store.freeze("u1", "b1", {})

    assert reason is None
    assert frozen["status"] == "frozen"
    assert frozen["trashed"] is False
    assert frozen["parent_batch_id"] == "b1"
