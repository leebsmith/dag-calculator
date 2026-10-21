"""Firestore access for batch drafts and frozen batches.

Batches live in the structural per-user path ``users/{uid}/batches``; ownership
is the path itself, so records no longer store or filter by ``uid``.
"""

from __future__ import annotations

import time
from typing import Annotated, Any

from fastapi import Depends
from firebase_admin import firestore

from app.database.firestore import get_db

COLLECTION = "batches"

DB = Annotated[firestore.Client, Depends(get_db)]


class BatchRepository:
    def __init__(self, db) -> None:
        self._db = db

    def _collection(self, uid: str):
        return self._db.collection("users").document(uid).collection(COLLECTION)

    def list_batches(self, uid: str) -> list[dict[str, Any]]:
        docs = self._collection(uid).stream()
        records = [self._record(uid, doc.id, doc.to_dict()) for doc in docs]
        return sorted(records, key=lambda r: r.get("updated_at", 0), reverse=True)

    def get(self, uid: str, batch_id: str) -> dict[str, Any] | None:
        doc = self._collection(uid).document(batch_id).get()
        if not doc.exists:
            return None
        return self._record(uid, batch_id, doc.to_dict())

    def create(self, uid: str, batch_id: str, data: dict[str, Any]) -> dict[str, Any]:
        now = time.time()
        record = {
            **data,
            "status": "draft",
            "trashed": False,
            "created_at": now,
            "updated_at": now,
        }
        self._collection(uid).document(batch_id).set(record)
        return self._record(uid, batch_id, record)

    def apply_draft(
        self,
        uid: str,
        batch_id: str,
        data: dict[str, Any],
        base_updated_at: float | None,
        force: bool = False,
    ) -> tuple[dict[str, Any], str | None]:
        """Atomically create-or-update a draft, rejecting stale/frozen writes.

        Runs inside a Firestore transaction: the read and write are atomic, so
        the optimistic ``base_updated_at`` comparison cannot be raced by another
        autosave. Returns ``(record, reason)`` where ``reason`` is ``None`` on
        success, ``"frozen"`` when the target is already immutable, or
        ``"stale"`` when the client's baseline no longer matches (unless
        ``force`` is set, which skips only the baseline comparison).
        """
        ref = self._collection(uid).document(batch_id)
        transaction = self._db.transaction()

        with transaction:
            snapshot = transaction.get(ref)
            if not snapshot.exists:
                now = time.time()
                record = {
                    **data,
                    "status": "draft",
                    "trashed": False,
                    "created_at": now,
                    "updated_at": now,
                }
                transaction.set(ref, record)
                return self._record(uid, batch_id, record), None

            current = self._record(uid, batch_id, snapshot.to_dict())
            if current.get("status") != "draft":
                return current, "frozen"
            if not force and base_updated_at is not None and current.get("updated_at") != base_updated_at:
                return current, "stale"

            record = {**current, **data, "updated_at": time.time()}
            transaction.update(ref, {**data, "updated_at": record["updated_at"]})
            return record, None

    def update(self, uid: str, batch_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        doc = self._collection(uid).document(batch_id).get()
        if not doc.exists:
            return None
        self._collection(uid).document(batch_id).update({**data, "updated_at": time.time()})
        return self.get(uid, batch_id)

    def set_trashed(self, uid: str, batch_id: str, trashed: bool) -> dict[str, Any] | None:
        doc = self._collection(uid).document(batch_id).get()
        if not doc.exists:
            return None
        self._collection(uid).document(batch_id).update(
            {"trashed": trashed, "updated_at": time.time()}
        )
        return self.get(uid, batch_id)

    def rename(self, uid: str, batch_id: str, name: str) -> dict[str, Any] | None:
        doc = self._collection(uid).document(batch_id).get()
        if not doc.exists:
            return None
        self._collection(uid).document(batch_id).update({"name": name, "updated_at": time.time()})
        return self.get(uid, batch_id)

    def delete(self, uid: str, batch_id: str) -> bool:
        doc = self._collection(uid).document(batch_id).get()
        if not doc.exists:
            return False
        self._collection(uid).document(batch_id).delete()
        return True

    def freeze(
        self, uid: str, batch_id: str, data: dict[str, Any]
    ) -> tuple[dict[str, Any] | None, str | None]:
        """Atomically snapshot a draft into an immutable frozen batch.

        The status check and the snapshot insert share one transaction, closing
        the double-freeze window and the duplicate source-read window (the
        service no longer re-reads the source before delegating). Returns
        ``(record, reason)``: ``reason`` is ``None`` on success, ``"missing"``
        when the source does not exist (or belongs to another user), or
        ``"frozen"`` when the target is already immutable.
        """
        collection = self._collection(uid)
        ref = collection.document(batch_id)
        new_ref = collection.document()
        transaction = self._db.transaction()

        with transaction:
            snapshot = transaction.get(ref)
            if not snapshot.exists:
                return None, "missing"

            source = snapshot.to_dict()
            if source.get("status") != "draft":
                return self._record(uid, batch_id, source), "frozen"

            now = time.time()
            record = {
                "name": source.get("name", "Untitled"),
                "status": "frozen",
                "trashed": False,
                "schema_version": data.get("schema_version", source.get("schema_version", 2)),
                "valuation": data.get("valuation", {}),
                "valuation_format": data.get("valuation_format"),
                "provenance": data.get("provenance", {}),
                "conformance": data.get("conformance"),
                "parent_batch_id": batch_id,
                "roots": source.get("roots", {}),
                "collections": source.get("collections", {}),
                "selections": source.get("selections", {}),
                "created_at": now,
                "updated_at": now,
                "frozen_at": now,
            }
            transaction.set(new_ref, record)
            return self._record(uid, new_ref.id, record), None

    @staticmethod
    def _record(uid: str, batch_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {"id": batch_id, "uid": uid, **data}


def get_batch_repo(db: DB) -> BatchRepository:
    return BatchRepository(db)


BatchRepoDep = Annotated[BatchRepository, Depends(get_batch_repo)]
