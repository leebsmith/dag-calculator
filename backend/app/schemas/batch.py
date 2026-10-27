"""Pydantic models for batch persistence (draft state, freeze, record)."""

from __future__ import annotations

import logging
from typing import Annotated, Any

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.schemas.report_bundle import CatalogContent, FormattedValue, ReportInputs

logger = logging.getLogger("app.schemas.batch")

# Log-only draft-size ceiling (C2): warn above this so we can review real P99
# payload sizes before enforcing a hard rejection.
DRAFT_SIZE_WARN_BYTES = 512 * 1024


class DraftPayload(BaseModel):
    """The browser-computed editable state (roots + collections).

    ``base_updated_at`` is the client's last-observed ``updated_at``, used for
    optimistic-concurrency detection: a non-null value that no longer matches the
    stored timestamp means another session wrote in between.
    """

    name: Annotated[str, StringConstraints(max_length=200)] = "Untitled"
    identity: dict[str, dict[str, Any]] = Field(default_factory=dict)
    roots: dict[str, Any] = Field(default_factory=dict)
    collections: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    selections: dict[str, dict[str, Any]] = Field(default_factory=dict)
    schema_version: int = 3
    parent_batch_id: str | None = None
    parent_name: str | None = None
    base_updated_at: float | None = None
    # Client "keep mine" escape hatch: when true, the server skips the optimistic
    # baseline comparison but still refuses to overwrite a frozen batch.
    force: bool = False

    @model_validator(mode="after")
    def _warn_large_draft(self) -> DraftPayload:
        size = len(self.model_dump_json().encode("utf-8"))
        if size > DRAFT_SIZE_WARN_BYTES:
            logger.warning(
                "draft payload is %d bytes (over the %d-byte high-water mark)",
                size,
                DRAFT_SIZE_WARN_BYTES,
            )
        return self


class BatchPatch(BaseModel):
    """Partial metadata update: rename and/or the trash toggle (soft delete).

    Both fields are optional so the same route serves the trash button and the
    landing-page rename, but at least one must be present.
    """

    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ] | None = None
    trashed: bool | None = None

    @model_validator(mode="after")
    def _require_a_change(self) -> BatchPatch:
        if self.name is None and self.trashed is None:
            raise ValueError("name or trashed is required")
        return self


class FreezePayload(BaseModel):
    """The browser-computed full valuation + provenance (immutable snapshot).

    ``valuation_format`` marks how boundary nodes are stored. ``"outputs"``
    means each boundary entry is its plain output map. ``None`` is the legacy
    shape, where a boundary entry was the engine's ``{outputs, fingerprint}``
    cache wrapper; read paths must treat a missing marker as legacy.
    """

    valuation: dict[str, Any] = Field(default_factory=dict)
    valuation_format: str | None = None
    provenance: dict[str, dict[str, Any]] = Field(default_factory=dict)
    conformance: dict[str, Any] | None = None
    schema_version: int = 3
    # Bundle inputs captured in the browser. Required: a freeze always emits a
    # self-sufficient bundle, and there is no legacy client without them.
    report_inputs: ReportInputs
    catalog: CatalogContent
    formatted: dict[str, FormattedValue]


class BatchRecord(BaseModel):
    """A persisted batch as returned by the API (draft or frozen)."""

    id: str
    uid: str
    name: str
    status: str
    schema_version: int
    created_at: float
    updated_at: float
    trashed: bool = False

    # identity is batch-level and immutable for the record's life
    identity: dict[str, dict[str, Any]] = Field(default_factory=dict)

    # draft-only state
    roots: dict[str, Any] = Field(default_factory=dict)
    collections: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    selections: dict[str, dict[str, Any]] = Field(default_factory=dict)

    # frozen-only state
    valuation: dict[str, Any] | None = None
    valuation_format: str | None = None
    provenance: dict[str, dict[str, Any]] | None = None
    conformance: dict[str, Any] | None = None
    parent_batch_id: str | None = None
    parent_name: str | None = None
    frozen_at: float | None = None
