"""Firestore access for batch drafts (and, later, frozen batches)."""

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

    def list_drafts(self, uid: str) -> list[dict[str, Any]]:
        docs = (
            self._coll.where(filter=firestore.FieldFilter("uid", "==", uid))
            .where(filter=firestore.FieldFilter("status", "==", "draft"))
            .stream()
        )
        return [self._record(doc.id, doc.to_dict()) for doc in docs]

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

    @staticmethod
    def _record(batch_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {"id": batch_id, **data}


def get_batch_repo(db: DB) -> BatchRepository:
    return BatchRepository(db)


BatchRepoDep = Annotated[BatchRepository, Depends(get_batch_repo)]
