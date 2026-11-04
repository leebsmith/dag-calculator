"""Import records: one recipe document awaiting mapping, and its lifecycle.

A record is the workspace between "a PDF was read" and "a batch exists". It owns
the transcription, the identity the user picked, and (later) the ledger. Nothing
here is derived from the artifact, and nothing here is a batch: a record only
becomes one at commit, and a committed record is immutable because it is that
batch's audit trail.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import Field

from app.schemas.recipe_import import ExtractedRecipe, StrictModel

IMPORT_SCHEMA_VERSION = 1


class ImportStatus(StrEnum):
    """Where a record sits.

    ``committed`` and ``failed`` are terminal: a commit is a batch's audit trail,
    and a failure is a marker that keeps the interpretation (so nobody pays for
    the same document twice) plus the reason it could not be used. Both are
    deletable; neither is editable.
    """

    EXTRACTED = "extracted"
    MAPPING = "mapping"
    COMMITTED = "committed"
    ABANDONED = "abandoned"
    FAILED = "failed"


class ImportRecord(StrictModel):
    """The stored record. ``uid`` is the Firestore path, never a field."""

    schema_version: int = IMPORT_SCHEMA_VERSION
    id: str
    status: ImportStatus = ImportStatus.EXTRACTED
    identity: dict[str, dict[str, Any]] | None = None
    extract: ExtractedRecipe
    ledger: list[dict[str, Any]] = []
    suggestions: list[dict[str, Any]] = []
    batch_id: str | None = None
    failure_reason: str | None = None
    # The authored IBU split between the pools, and where it came from
    # ("printed" | "estimated" | "authored"), so the review can label it.
    pool_ibu_fraction: float | None = None
    pool_ibu_source: str | None = None
    target_profile_id: str | None = None
    # How the imported recipe's yeast lines became the batch's one attenuation:
    # {"mode": "single", "line_id": ...} or
    # {"mode": "blend", "line_ids": [...], "ref": <library yeast id>, "name": ...}.
    # The engine still receives one selection; this is the recipe's own fact.
    yeast_outcome: dict[str, Any] | None = None
    # The solved comparison captured at commit, so the batch can show what changed
    # without re-running a boundary.
    delta: dict[str, Any] | None = None
    created_at: float
    updated_at: float


class CreateImportRequest(StrictModel):
    """A PDF, base64 encoded, plus the identity the user picked.

    Base64 rather than multipart: the transport stays JSON, so the endpoint
    needs no multipart parser and the request shape matches every other call.
    """

    filename: str = Field(min_length=1, max_length=200)
    content_base64: str = Field(min_length=1)
    identity: dict[str, dict[str, Any]] | None = None
    force: bool = False


class UpdateImportRequest(StrictModel):
    """Editable before commit: the identity, the ledger, the frozen suggestions."""

    identity: dict[str, dict[str, Any]] | None = None
    extract: ExtractedRecipe | None = None
    ledger: list[dict[str, Any]] | None = None
    suggestions: list[dict[str, Any]] | None = None
    pool_ibu_fraction: float | None = None
    pool_ibu_source: str | None = None
    target_profile_id: str | None = None
    yeast_outcome: dict[str, Any] | None = None
    delta: dict[str, Any] | None = None
    batch_id: str | None = None
    status: ImportStatus | None = None
    failure_reason: str | None = None
    pool_ibu_fraction: float | None = None
    pool_ibu_source: str | None = None
