"""Import lifecycle: accept a document, keep the transcription, retire the record.

The API's job here is narrow and deliberately dumb. It decodes a document,
refuses what it cannot read, asks for a transcription once, and stores the
result. It does not map, does not solve, and never invents a batch: an unsolvable
or half-mapped import stays a record until the user either finishes it or drops
it.

Two rules are enforced here rather than in the repository, because they are
policy and they are testable without Firestore: a **committed** record is
immutable and undeletable (it is a batch's audit trail), and re-uploading a
document the user already imported is a conflict with a pointer, not a silent
duplicate.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import logging
import uuid
from typing import Annotated, Any

from fastapi import Depends
from pydantic import ValidationError

from app.repositories.import_repo import ImportRepoDep, ImportRepository
from app.schemas.import_record import (
    CreateImportRequest,
    ImportRecord,
    ImportStatus,
    UpdateImportRequest,
)
from app.services import gemini, recipe_import

logger = logging.getLogger("app.import_service")

MAX_DOCUMENT_BYTES = gemini.MAX_INLINE_BYTES
PDF_MAGIC = b"%PDF"
# Identity is a sealed snapshot at batch creation, so an import that carries one
# must carry the two components the batch contract requires.
REQUIRED_IDENTITY = ("equipment", "style")


class ImportNotFound(Exception):
    """No such record for this user."""


class ImportConflict(Exception):
    """The record cannot change: it is committed, or the transition is illegal."""

    def __init__(self, reason: str) -> None:
        super().__init__(f"import record is {reason}")
        self.reason = reason


class DuplicateImport(Exception):
    """This document is already on file, so the caller can explain, not just refuse."""

    def __init__(self, import_id: str, status: str = "extracted", reason: str | None = None) -> None:
        super().__init__("this document has already been imported")
        self.import_id = import_id
        self.status = status
        self.failure_reason = reason


class ImportPayloadError(Exception):
    """The upload is not a PDF we can read."""


class ImportService:
    def __init__(self, repo: ImportRepository) -> None:
        self._repo = repo

    def list(self, uid: str) -> list[ImportRecord]:
        """Every readable record, newest first.

        One unreadable document must not take the whole queue down: a record
        written by an older schema would otherwise make the landing page 500 and
        the import surface unreachable. Skipped records are logged with their id
        so they can be found and removed, never silently forgotten.
        """
        records = []
        for doc in self._repo.list(uid):
            try:
                records.append(ImportRecord.model_validate(doc))
            except ValidationError as exc:
                logger.warning(
                    "skipping unreadable import record id=%s uid=%s: %s",
                    doc.get("id"),
                    uid,
                    exc.errors()[0].get("msg"),
                )
        return records

    def get(self, uid: str, import_id: str) -> ImportRecord:
        doc = self._repo.get(uid, import_id)
        if doc is None:
            raise ImportNotFound(import_id)
        return ImportRecord.model_validate(doc)

    def create(self, uid: str, request: CreateImportRequest) -> ImportRecord:
        data = decode_document(request.content_base64)
        identity = validate_identity(request.identity)
        digest = hashlib.sha256(data).hexdigest()
        if not request.force:
            existing = self._repo.find_by_sha256(uid, digest)
            if existing is not None:
                raise DuplicateImport(
                    existing["id"], existing.get("status", "extracted"), existing.get("failure_reason")
                )
        record, _raw = recipe_import.extract_recipe_bytes(data, request.filename)
        if record.source.sha256 != digest:
            raise ImportPayloadError("the document changed while it was being read")
        return ImportRecord.model_validate(
            self._repo.create(
                uid,
                uuid.uuid4().hex,
                {
                    "status": ImportStatus.EXTRACTED.value,
                    "identity": identity,
                    "extract": record.model_dump(mode="json"),
                    "ledger": [],
                    "suggestions": [],
                    "batch_id": None,
                },
            )
        )

    def update(self, uid: str, import_id: str, request: UpdateImportRequest) -> ImportRecord:
        current = self.get(uid, import_id)
        if current.status in (ImportStatus.COMMITTED, ImportStatus.FAILED):
            raise ImportConflict(current.status.value)
        changes: dict[str, Any] = {}
        if request.extract is not None:
            assert_same_provenance(current.extract.source, request.extract.source)
            changes["extract"] = request.extract.model_dump(mode="json")
        if request.identity is not None:
            changes["identity"] = validate_identity(request.identity)
        if request.ledger is not None:
            changes["ledger"] = request.ledger
        if request.suggestions is not None:
            changes["suggestions"] = request.suggestions
        if request.status is not None:
            status = self._next_status(current.status, request.status)
            changes["status"] = status.value
            if status == ImportStatus.FAILED:
                changes["failure_reason"] = request.failure_reason or "no batch quantities"
        doc = self._repo.update(uid, import_id, changes)
        if doc is None:
            raise ImportNotFound(import_id)
        return ImportRecord.model_validate(doc)

    def delete(self, uid: str, import_id: str) -> None:
        current = self.get(uid, import_id)
        if current.status == ImportStatus.COMMITTED:
            raise ImportConflict("committed")
        if not self._repo.delete(uid, import_id):
            raise ImportNotFound(import_id)

    @staticmethod
    def _next_status(current: ImportStatus, wanted: ImportStatus) -> ImportStatus:
        """Only the transitions the flow allows; commit happens elsewhere."""
        if wanted == current:
            return current
        allowed = {
            ImportStatus.EXTRACTED: {ImportStatus.MAPPING, ImportStatus.ABANDONED, ImportStatus.FAILED},
            ImportStatus.MAPPING: {ImportStatus.EXTRACTED, ImportStatus.ABANDONED, ImportStatus.FAILED},
            ImportStatus.ABANDONED: {ImportStatus.MAPPING, ImportStatus.FAILED},
        }
        if wanted not in allowed.get(current, set()):
            raise ImportConflict(f"{current.value}->{wanted.value}")
        return wanted


def assert_same_provenance(current, incoming) -> None:
    """A correction may change what was read, never which document produced it."""
    if (
        incoming.sha256 != current.sha256
        or incoming.model != current.model
        or incoming.prompt_id != current.prompt_id
        or incoming.prompt_version != current.prompt_version
        or incoming.filename != current.filename
        or incoming.page_count != current.page_count
    ):
        raise ImportPayloadError("a correction may not change the document's provenance")


def decode_document(content_base64: str) -> bytes:
    """Base64 to bytes, refusing anything that is not a readable PDF."""
    try:
        data = base64.b64decode(content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ImportPayloadError("the upload is not valid base64") from exc
    if not data:
        raise ImportPayloadError("the upload is empty")
    if len(data) > MAX_DOCUMENT_BYTES:
        raise ImportPayloadError(
            f"the document is {len(data) // 1_000_000} MB; "
            f"the limit is {MAX_DOCUMENT_BYTES // 1_000_000} MB"
        )
    if not data.lstrip().startswith(PDF_MAGIC):
        raise ImportPayloadError("the upload is not a PDF")
    return data


def validate_identity(identity: dict[str, dict[str, Any]] | None) -> dict[str, dict[str, Any]] | None:
    """An identity is a batch's sealed snapshot, so it must be complete."""
    if identity is None:
        return None
    missing = [key for key in REQUIRED_IDENTITY if not identity.get(key)]
    if missing:
        raise ImportPayloadError("identity is missing " + ", ".join(missing))
    return identity


def get_import_service(repo: ImportRepoDep) -> ImportService:
    return ImportService(repo)


ImportServiceDep = Annotated[ImportService, Depends(get_import_service)]
