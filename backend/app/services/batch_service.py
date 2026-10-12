"""Batch business logic: draft CRUD + freeze (immutability + lineage)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException

from app.repositories.batch_repo import BatchRepoDep, BatchRepository
from app.schemas.batch import BatchRecord, DraftPayload, FreezePayload


class BatchService:
    def __init__(self, repo: BatchRepository) -> None:
        self._repo = repo

    def list_drafts(self, uid: str) -> list[BatchRecord]:
        return [BatchRecord(**r) for r in self._repo.list_drafts(uid)]

    def create_draft(self, uid: str, payload: DraftPayload) -> BatchRecord:
        return BatchRecord(**self._repo.create(uid, payload.model_dump()))

    def update_draft(self, uid: str, batch_id: str, payload: DraftPayload) -> BatchRecord:
        existing = self._repo.get(uid, batch_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        if existing.get("status") != "draft":
            raise HTTPException(status_code=409, detail="Cannot mutate a frozen batch")
        return BatchRecord(**self._repo.update(uid, batch_id, payload.model_dump()))

    def freeze_batch(self, uid: str, batch_id: str, payload: FreezePayload) -> BatchRecord:
        existing = self._repo.get(uid, batch_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        if existing.get("status") != "draft":
            raise HTTPException(status_code=409, detail="Already frozen")
        return BatchRecord(**self._repo.freeze(uid, batch_id, payload.model_dump()))

    def get_batch(self, uid: str, batch_id: str) -> BatchRecord:
        record = self._repo.get(uid, batch_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        return BatchRecord(**record)


def get_batch_service(repo: BatchRepoDep) -> BatchService:
    return BatchService(repo)


BatchServiceDep = Annotated[BatchService, Depends(get_batch_service)]
