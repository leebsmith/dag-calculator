"""Batch business logic: draft upsert + freeze + trash/delete."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException

from app.repositories.batch_repo import BatchRepoDep, BatchRepository
from app.schemas.batch import BatchRecord, DraftPayload, FreezePayload


class BatchConflictError(Exception):
    """A draft write was rejected because the stored batch moved on.

    ``reason`` is ``"stale"`` when the client's baseline ``updated_at`` no longer
    matches and ``"frozen"`` when the target is already an immutable snapshot.
    The HTTP layer maps both onto one ``CONFLICT`` envelope so the browser can
    reconcile from the remote record.
    """

    def __init__(self, reason: str, current: BatchRecord) -> None:
        super().__init__("Batch changed elsewhere")
        self.reason = reason
        self.current = current


class BatchService:
    def __init__(self, repo: BatchRepository) -> None:
        self._repo = repo

    def list_batches(self, uid: str) -> list[BatchRecord]:
        return [BatchRecord(**r) for r in self._repo.list_batches(uid)]

    def upsert_draft(self, uid: str, batch_id: str, payload: DraftPayload) -> BatchRecord:
        existing = self._repo.get(uid, batch_id)
        data = payload.model_dump(exclude_none=True, exclude={"base_updated_at"})
        if existing is None:
            return BatchRecord(**self._repo.create(uid, batch_id, data))
        if existing.get("status") != "draft":
            raise BatchConflictError("frozen", BatchRecord(**existing))
        if (
            payload.base_updated_at is not None
            and existing.get("updated_at") != payload.base_updated_at
        ):
            raise BatchConflictError("stale", BatchRecord(**existing))
        return BatchRecord(**self._repo.update(uid, batch_id, data))

    def freeze_batch(self, uid: str, batch_id: str, payload: FreezePayload) -> BatchRecord:
        existing = self._repo.get(uid, batch_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        if existing.get("status") != "draft":
            raise HTTPException(status_code=409, detail="Already frozen")
        return BatchRecord(**self._repo.freeze(uid, batch_id, payload.model_dump()))

    def set_trashed(self, uid: str, batch_id: str, trashed: bool) -> BatchRecord:
        record = self._repo.set_trashed(uid, batch_id, trashed)
        if record is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        return BatchRecord(**record)

    def rename_batch(self, uid: str, batch_id: str, name: str) -> BatchRecord:
        record = self._repo.rename(uid, batch_id, name)
        if record is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        return BatchRecord(**record)

    def delete_batch(self, uid: str, batch_id: str) -> None:
        if not self._repo.delete(uid, batch_id):
            raise HTTPException(status_code=404, detail="Batch not found")

    def get_batch(self, uid: str, batch_id: str) -> BatchRecord:
        record = self._repo.get(uid, batch_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        return BatchRecord(**record)


def get_batch_service(repo: BatchRepoDep) -> BatchService:
    return BatchService(repo)


BatchServiceDep = Annotated[BatchService, Depends(get_batch_service)]
