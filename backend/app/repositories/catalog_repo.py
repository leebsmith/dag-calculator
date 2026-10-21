"""Firestore access for immutable per-user catalog records."""

from __future__ import annotations

import time
import uuid
from typing import Annotated, Any

from fastapi import Depends
from firebase_admin import firestore

from app.database.firestore import get_db

COLLECTION = "catalog_items"

DB = Annotated[firestore.Client, Depends(get_db)]


class CatalogRepository:
    def __init__(self, db) -> None:
        self._db = db

    def _collection(self, uid: str):
        return self._db.collection("users").document(uid).collection(COLLECTION)

    def list_items(self, uid: str, kind: str) -> list[dict[str, Any]]:
        docs = self._collection(uid).where(
            filter=firestore.FieldFilter("kind", "==", kind)
        ).stream()
        records = [self._record(doc.id, doc.to_dict()) for doc in docs]
        return sorted(
            [record for record in records if record.get("kind") == kind],
            key=lambda record: record.get("created_at", 0),
            reverse=True,
        )

    def get(self, uid: str, kind: str, item_id: str) -> dict[str, Any] | None:
        doc = self._collection(uid).document(item_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        if data.get("kind") != kind:
            return None
        return self._record(item_id, data)

    def create(
        self,
        uid: str,
        kind: str,
        component: dict[str, Any],
        id_field: str,
        schema_version: int,
    ) -> dict[str, Any]:
        item_id = uuid.uuid4().hex
        record = {
            "kind": kind,
            "component": {**component, id_field: item_id},
            "created_at": time.time(),
            "schema_version": schema_version,
        }
        self._collection(uid).document(item_id).set(record)
        return self._record(item_id, record)

    def delete(self, uid: str, kind: str, item_id: str) -> bool:
        doc = self._collection(uid).document(item_id).get()
        if not doc.exists or doc.to_dict().get("kind") != kind:
            return False
        self._collection(uid).document(item_id).delete()
        return True

    @staticmethod
    def _record(item_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {"id": item_id, **data}


def get_catalog_repo(db: DB) -> CatalogRepository:
    return CatalogRepository(db)


CatalogRepoDep = Annotated[CatalogRepository, Depends(get_catalog_repo)]
