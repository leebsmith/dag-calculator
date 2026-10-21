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

    def freeze(self, uid: str, batch_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        """Create an immutable frozen snapshot linked to the source draft."""
        source = self.get(uid, batch_id)
        if source is None:
            return None
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
        _, ref = self._collection(uid).add(record)
        return self._record(uid, ref.id, record)

    @staticmethod
    def _record(uid: str, batch_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {"id": batch_id, "uid": uid, **data}


def get_batch_repo(db: DB) -> BatchRepository:
    return BatchRepository(db)


BatchRepoDep = Annotated[BatchRepository, Depends(get_batch_repo)]
