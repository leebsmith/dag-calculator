"""Firestore access for import records.

Records live under ``users/{uid}/recipe_imports``; ownership is the path itself.
The collection is small by nature — a record exists only between an upload and a
commit, or as a committed receipt until its batch is permanently deleted — so the
list is capped generously and warns like the batch list does.
"""

from __future__ import annotations

import logging
import time
from typing import Annotated, Any

from fastapi import Depends
from firebase_admin import firestore

from app.database.firestore import get_db

COLLECTION = "recipe_imports"
LIST_LIMIT = 200
HIGH_WATER_MARK = 150

logger = logging.getLogger("app.import_repo")

DB = Annotated[firestore.Client, Depends(get_db)]


class ImportRepository:
    def __init__(self, db) -> None:
        self._db = db

    def _collection(self, uid: str):
        return self._db.collection("users").document(uid).collection(COLLECTION)

    def list(self, uid: str, limit: int = LIST_LIMIT) -> list[dict[str, Any]]:
        docs = (
            self._collection(uid)
            .order_by("updated_at", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )
        records = [self._record(doc.id, doc.to_dict()) for doc in docs]
        if len(records) >= limit:
            logger.warning(
                "import list truncated at %d documents for uid=%s; consider paging",
                limit,
                uid,
            )
        elif len(records) >= HIGH_WATER_MARK:
            logger.warning(
                "import list reached %d documents for uid=%s (high-water mark %d)",
                len(records),
                uid,
                HIGH_WATER_MARK,
            )
        return records

    def get(self, uid: str, import_id: str) -> dict[str, Any] | None:
        doc = self._collection(uid).document(import_id).get()
        if not doc.exists:
            return None
        return self._record(import_id, doc.to_dict())

    def find_by_sha256(self, uid: str, sha256: str) -> dict[str, Any] | None:
        """The committed-or-open record for a document, if this user already has one."""
        query = self._collection(uid).where("extract.source.sha256", "==", sha256).limit(1)
        for doc in query.stream():
            return self._record(doc.id, doc.to_dict())
        return None

    def delete_by_batch_id(self, uid: str, batch_id: str) -> int:
        """Delete the committed receipts for a batch, returning how many went."""
        docs = list(self._collection(uid).where("batch_id", "==", batch_id).stream())
        if not docs:
            return 0
        batch = self._db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        return len(docs)

    def create(self, uid: str, import_id: str, data: dict[str, Any]) -> dict[str, Any]:
        now = time.time()
        record = {**data, "created_at": now, "updated_at": now}
        self._collection(uid).document(import_id).set(record)
        return self._record(import_id, record)

    def update(self, uid: str, import_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        doc = self._collection(uid).document(import_id).get()
        if not doc.exists:
            return None
        self._collection(uid).document(import_id).update({**data, "updated_at": time.time()})
        return self.get(uid, import_id)

    def delete(self, uid: str, import_id: str) -> bool:
        doc = self._collection(uid).document(import_id).get()
        if not doc.exists:
            return False
        self._collection(uid).document(import_id).delete()
        return True

    def _record(self, import_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {**data, "id": import_id}


def get_import_repo(db: DB) -> ImportRepository:
    return ImportRepository(db)


ImportRepoDep = Annotated[ImportRepository, Depends(get_import_repo)]
