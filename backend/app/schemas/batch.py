"""Pydantic models for batch persistence (draft state, freeze, record)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class DraftPayload(BaseModel):
    """The browser-computed editable state (roots + collections + overlays)."""

    name: str = "Untitled"
    roots: dict[str, Any] = Field(default_factory=dict)
    collections: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    overlays: dict[str, dict[str, Any]] = Field(default_factory=dict)
    schema_version: int = 2
    parent_batch_id: str | None = None


class FreezePayload(BaseModel):
    """The browser-computed full valuation + provenance (immutable snapshot)."""

    valuation: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, dict[str, Any]] = Field(default_factory=dict)
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

    # draft-only state
    roots: dict[str, Any] = Field(default_factory=dict)
    collections: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    overlays: dict[str, dict[str, Any]] = Field(default_factory=dict)

    # frozen-only state
    valuation: dict[str, Any] | None = None
    provenance: dict[str, dict[str, Any]] | None = None
    parent_batch_id: str | None = None
    frozen_at: float | None = None
