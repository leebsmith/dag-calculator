"""Batch business logic: draft upsert + freeze + trash/delete."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, HTTPException
from pydantic import ValidationError

from app.artifact import load_artifact
from app.repositories.batch_repo import BatchRepoDep, BatchRepository
from app.schemas.batch import BatchRecord, DraftPayload, FreezePayload
from app.schemas.report_bundle import ReportBundle
from app.services.bundle_integrity import (
    BundleIntegrityError,
    parse_bundle,
)
from app.services.report_bundle_service import build_report_bundle
from app.services.report_render import (
    RenderedReport,
    ReportRenderError,
    ReportSpec,
    ReportSpecError,
)
from app.services.report_render import (
    render as render_bundle,
)


def _blocking_finding(payload: FreezePayload) -> dict[str, Any] | None:
    """The first violated relation that the artifact declares blocking."""
    artifact = load_artifact()
    blocking = {
        relation["id"]
        for relation in artifact.get("relations", [])
        if relation.get("blocking")
    }
    for state in payload.report_inputs.validation.relations:
        if state.get("id") in blocking and state.get("holds") is False:
            return state
    return None


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


def _bundle_rejection(exc: ValidationError | BundleIntegrityError) -> str:
    """The validator's own messages, without pydantic's input-value dump."""
    if not isinstance(exc, ValidationError):
        return str(exc)
    return "; ".join(error.get("msg", "") for error in exc.errors()) or str(exc)


class BatchService:
    def __init__(self, repo: BatchRepository) -> None:
        self._repo = repo

    def list_batches(self, uid: str) -> list[BatchRecord]:
        return [BatchRecord(**r) for r in self._repo.list_batches(uid)]

    def upsert_draft(self, uid: str, batch_id: str, payload: DraftPayload) -> BatchRecord:
        data = payload.model_dump(exclude_none=True, exclude={"base_updated_at", "force"})
        record, reason = self._repo.apply_draft(
            uid, batch_id, data, payload.base_updated_at, payload.force
        )
        if reason == "frozen":
            raise BatchConflictError("frozen", BatchRecord(**record))
        if reason == "stale":
            raise BatchConflictError("stale", BatchRecord(**record))
        return BatchRecord(**record)

    def freeze_batch(self, uid: str, batch_id: str, payload: FreezePayload) -> BatchRecord:
        blocking = _blocking_finding(payload)
        if blocking is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot freeze: blocking finding '{blocking['id']}' "
                    "does not hold"
                ),
            )
        try:
            record, reason = self._repo.freeze(
                uid,
                batch_id,
                payload.model_dump(),
                bundle_factory=lambda frozen_id, frozen: build_report_bundle(
                    frozen_id=frozen_id, record=frozen, payload=payload
                ),
            )
        except (ValidationError, BundleIntegrityError) as exc:
            raise HTTPException(
                status_code=422, detail=f"Report bundle rejected: {_bundle_rejection(exc)}"
            ) from exc
        if reason == "missing":
            raise HTTPException(status_code=404, detail="Batch not found")
        if reason == "frozen":
            raise HTTPException(status_code=409, detail="Already frozen")
        return BatchRecord(**record)

    def _stored_bundle(self, uid: str, batch_id: str) -> ReportBundle:
        """The validated bundle stored beside a frozen batch."""
        record = self._repo.get(uid, batch_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        if record.get("status") != "frozen":
            raise HTTPException(
                status_code=409,
                detail="Drafts have no report bundle; request a preview instead",
            )
        stored = self._repo.get_report_bundle(uid, batch_id)
        if stored is None:
            raise HTTPException(
                status_code=409,
                detail="This frozen batch predates report bundles; fork and re-freeze it",
            )
        try:
            return parse_bundle(stored)
        except (ValidationError, BundleIntegrityError) as exc:
            raise HTTPException(
                status_code=500, detail=f"Stored report bundle is invalid: {exc}"
            ) from exc

    def report_bundle(self, uid: str, batch_id: str) -> dict[str, Any]:
        """Return the immutable bundle stored beside a frozen batch."""
        return self._stored_bundle(uid, batch_id).model_dump(mode="json")

    def render_report(
        self, uid: str, batch_id: str, spec: ReportSpec
    ) -> RenderedReport:
        """Render a frozen batch's stored bundle."""
        return self._render(self._stored_bundle(uid, batch_id), spec)

    def render_preview(
        self,
        uid: str,
        batch_id: str,
        bundle_payload: dict[str, Any],
        spec: ReportSpec,
    ) -> RenderedReport:
        """Render a posted bundle for a draft, persisting nothing."""
        record = self._repo.get(uid, batch_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        if record.get("status") == "frozen":
            raise HTTPException(
                status_code=409, detail="Frozen batches render their stored bundle"
            )
        try:
            bundle = parse_bundle(bundle_payload)
        except (ValidationError, BundleIntegrityError) as exc:
            raise HTTPException(
                status_code=422, detail=f"Report bundle rejected: {_bundle_rejection(exc)}"
            ) from exc
        if bundle.batch.id != record["id"]:
            raise HTTPException(
                status_code=422,
                detail="Report bundle belongs to a different batch",
            )
        if bundle.batch.status != "draft":
            raise HTTPException(
                status_code=422, detail="Report preview needs a draft bundle"
            )
        return self._render(bundle, spec)

    @staticmethod
    def _render(bundle: ReportBundle, spec: ReportSpec) -> RenderedReport:
        try:
            return render_bundle(bundle, spec)
        except ReportSpecError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except ReportRenderError as exc:
            raise HTTPException(
                status_code=503 if exc.unavailable else 500, detail=str(exc)
            ) from exc

    def preview_report_bundle(
        self, uid: str, batch_id: str, payload: FreezePayload
    ) -> dict[str, Any]:
        """Assemble a bundle for a draft without persisting a frozen batch."""
        record = self._repo.get(uid, batch_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        if record.get("status") == "frozen":
            raise HTTPException(
                status_code=409, detail="Frozen batches serve their stored bundle"
            )
        preview = {
            **record,
            "status": "draft",
            "frozen_at": None,
            "parent_batch_id": None,
            "valuation": payload.valuation,
            "provenance": payload.provenance,
            "conformance": payload.conformance,
        }
        try:
            return build_report_bundle(
                frozen_id=record["id"], record=preview, payload=payload
            )
        except (ValidationError, BundleIntegrityError) as exc:
            raise HTTPException(
                status_code=422, detail=f"Report bundle rejected: {_bundle_rejection(exc)}"
            ) from exc

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
