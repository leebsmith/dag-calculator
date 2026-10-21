"""Pydantic models for batch persistence (draft state, freeze, record)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class DraftPayload(BaseModel):
    """The browser-computed editable state (roots + collections).

    ``base_updated_at`` is the client's last-observed ``updated_at``, used for
    optimistic-concurrency detection: a non-null value that no longer matches the
    stored timestamp means another session wrote in between.
    """

    name: str = "Untitled"
    roots: dict[str, Any] = Field(default_factory=dict)
    collections: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    schema_version: int = 2
    parent_batch_id: str | None = None
    base_updated_at: float | None = None


class TrashPayload(BaseModel):
    """The trash/restore toggle (soft delete)."""

    trashed: bool


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
    schema_version: int = 2


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

    # draft-only state
    roots: dict[str, Any] = Field(default_factory=dict)
    collections: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)

    # frozen-only state
    valuation: dict[str, Any] | None = None
    valuation_format: str | None = None
    provenance: dict[str, dict[str, Any]] | None = None
    conformance: dict[str, Any] | None = None
    parent_batch_id: str | None = None
    frozen_at: float | None = None
