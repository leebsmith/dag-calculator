"""Pydantic models for batch persistence (draft state + record)."""

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


class BatchRecord(DraftPayload):
    """A persisted batch as returned by the API (draft or frozen)."""

    id: str
    uid: str
    status: str = "draft"
    created_at: float
    updated_at: float
