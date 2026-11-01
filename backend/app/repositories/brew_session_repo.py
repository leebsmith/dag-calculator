"""Firestore access for brew sessions under ``users/{uid}/brew_sessions``."""

from __future__ import annotations

import time
from typing import Annotated, Any

from fastapi import Depends
from firebase_admin import firestore

from app.database.firestore import get_db

COLLECTION = "brew_sessions"

DB = Annotated[firestore.Client, Depends(get_db)]


class BrewSessionRepository:
    def __init__(self, db) -> None:
        self._db = db

    def _collection(self, uid: str):
        return self._db.collection("users").document(uid).collection(COLLECTION)

    def list_sessions(self, uid: str, batch_id: str | None = None) -> list[dict[str, Any]]:
        query = self._collection(uid).order_by("created_at", direction=firestore.Query.DESCENDING)
        records = []
        for doc in query.stream():
            record = self._record(uid, doc.id, doc.to_dict())
            if batch_id is not None and record.get("batch_id") != batch_id:
                continue
            records.append(record)
        return records

    def get(self, uid: str, session_id: str) -> dict[str, Any] | None:
        doc = self._collection(uid).document(session_id).get()
        if not doc.exists:
            return None
        return self._record(uid, session_id, doc.to_dict())

    def create(self, uid: str, session_id: str, data: dict[str, Any]) -> dict[str, Any]:
        now = time.time()
        record = {**data, "created_at": now, "updated_at": now}
        self._collection(uid).document(session_id).set(record)
        return self._record(uid, session_id, record)

    def update(self, uid: str, session_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        ref = self._collection(uid).document(session_id)
        doc = ref.get()
        if not doc.exists:
            return None
        ref.update({**data, "updated_at": time.time()})
        return self.get(uid, session_id)

    @staticmethod
    def _record(uid: str, session_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {"id": session_id, "uid": uid, **data}


def get_brew_session_repo(db: DB) -> BrewSessionRepository:
    return BrewSessionRepository(db)


BrewSessionRepoDep = Annotated[BrewSessionRepository, Depends(get_brew_session_repo)]
