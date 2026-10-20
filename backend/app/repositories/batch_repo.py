"""Firestore access for batch drafts and frozen batches."""

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
        self._coll = db.collection(COLLECTION)

    def list_batches(self, uid: str) -> list[dict[str, Any]]:
        docs = self._coll.where(filter=firestore.FieldFilter("uid", "==", uid)).stream()
        records = [self._record(doc.id, doc.to_dict()) for doc in docs]
        return sorted(records, key=lambda r: r.get("updated_at", 0), reverse=True)

    def get(self, uid: str, batch_id: str) -> dict[str, Any] | None:
        doc = self._coll.document(batch_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("uid") != uid:
            return None
        return self._record(batch_id, data)

    def create(self, uid: str, data: dict[str, Any]) -> dict[str, Any]:
        now = time.time()
        record = {
            **data,
            "uid": uid,
            "status": "draft",
            "created_at": now,
            "updated_at": now,
        }
        _, ref = self._coll.add(record)
        return self._record(ref.id, record)

    def update(self, uid: str, batch_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        doc = self._coll.document(batch_id).get()
        if not doc.exists or doc.to_dict().get("uid") != uid:
            return None
        self._coll.document(batch_id).update({**data, "updated_at": time.time()})
        return self.get(uid, batch_id)

    def freeze(self, uid: str, batch_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        """Create an immutable frozen snapshot linked to the source draft."""
        source = self.get(uid, batch_id)
        if source is None:
            return None
        now = time.time()
        record = {
            "uid": uid,
            "name": source.get("name", "Untitled"),
            "status": "frozen",
            "schema_version": data.get("schema_version", source.get("schema_version", 2)),
            "valuation": data.get("valuation", {}),
            "provenance": data.get("provenance", {}),
            "conformance": data.get("conformance"),
            "parent_batch_id": batch_id,
            "roots": source.get("roots", {}),
            "collections": source.get("collections", {}),
            "created_at": now,
            "updated_at": now,
            "frozen_at": now,
        }
        _, ref = self._coll.add(record)
        return self._record(ref.id, record)

    @staticmethod
    def _record(batch_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {"id": batch_id, **data}


def get_batch_repo(db: DB) -> BatchRepository:
    return BatchRepository(db)


BatchRepoDep = Annotated[BatchRepository, Depends(get_batch_repo)]
