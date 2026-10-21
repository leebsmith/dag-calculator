"""Offline tests for the per-user catalog repository (fake Firestore)."""

from __future__ import annotations

from app.repositories.catalog_repo import CatalogRepository, get_catalog_repo


class FakeSnapshot:
    def __init__(self, collection, doc_id):
        self.id = doc_id
        self._collection = collection

    @property
    def exists(self):
        return self.id in self._collection.docs

    def to_dict(self):
        return dict(self._collection.docs[self.id])


class FakeDocument:
    def __init__(self, collection, doc_id):
        self.id = doc_id
        self._collection = collection

    def get(self):
        return FakeSnapshot(self._collection, self.id)

    def set(self, record):
        self._collection.docs[self.id] = dict(record)

    def delete(self):
        self._collection.docs.pop(self.id, None)


class FakeQuery:
    def __init__(self, collection, field, value):
        self._collection = collection
        self._field = field
        self._value = value

    def stream(self):
        for doc_id, record in list(self._collection.docs.items()):
            if record.get(self._field) == self._value:
                yield FakeSnapshot(self._collection, doc_id)


class FakeCollection:
    def __init__(self):
        self.docs = {}

    def document(self, doc_id):
        return FakeDocument(self, doc_id)

    def where(self, filter):
        return FakeQuery(self, filter.field_path, filter.value)

    def stream(self):
        for doc_id in list(self.docs):
            yield FakeSnapshot(self, doc_id)


class FakeUserDocument:
    def __init__(self, db, uid):
        self._db = db
        self._uid = uid

    def collection(self, name):
        assert name == "catalog_items"
        return self._db.items.setdefault(self._uid, FakeCollection())


class FakeUsers:
    def __init__(self, db):
        self._db = db

    def document(self, uid):
        return FakeUserDocument(self._db, uid)


class FakeDb:
    def __init__(self):
        self.items = {}

    def collection(self, name):
        assert name == "users"
        return FakeUsers(self)


def repo():
    db = FakeDb()
    return CatalogRepository(db), db


def test_create_assigns_an_id_and_the_identity_field_under_the_user_path():
    store, db = repo()

    record = store.create("u1", "malt", {"name": "House Pale"}, "id", 4)

    assert record["id"] == record["component"]["id"]
    assert record["kind"] == "malt"
    assert record["schema_version"] == 4
    assert record["created_at"] > 0
    assert record["id"] in db.items["u1"].docs


def test_get_and_list_are_scoped_by_user_and_kind():
    store, _ = repo()
    malt = store.create("u1", "malt", {"name": "A"}, "id", 4)
    store.create("u1", "equipment", {"name": "Rig"}, "id", 4)
    store.create("u2", "malt", {"name": "Theirs"}, "id", 4)

    assert store.get("u1", "malt", malt["id"])["component"]["name"] == "A"
    assert store.get("u2", "malt", malt["id"]) is None
    assert store.get("u1", "equipment", malt["id"]) is None

    assert [r["component"]["name"] for r in store.list_items("u1", "malt")] == ["A"]
    assert [r["component"]["name"] for r in store.list_items("u2", "malt")] == ["Theirs"]


def test_water_reports_use_their_own_identity_field():
    store, _ = repo()

    record = store.create("u1", "water_report", {"laboratory": "Ward"}, "report_id", 4)

    assert record["component"]["report_id"] == record["id"]
    assert "id" not in record["component"]


def test_delete_is_hard_and_path_scoped():
    store, db = repo()
    record = store.create("u1", "malt", {"name": "A"}, "id", 4)

    assert store.delete("u2", "malt", record["id"]) is False
    assert record["id"] in db.items["u1"].docs
    assert store.delete("u1", "malt", record["id"]) is True
    assert record["id"] not in db.items["u1"].docs
    assert store.delete("u1", "malt", record["id"]) is False


def test_get_catalog_repo_wraps_the_client():
    db = FakeDb()
    store = get_catalog_repo(db)

    assert isinstance(store, CatalogRepository)
    assert store._db is db
    assert store._collection("u1") is db.items["u1"]
