"""Pydantic models for user-authored catalog records."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CatalogItemCreate(BaseModel):
    """A component submitted for validation and server-side id assignment."""

    component: dict[str, Any] = Field(default_factory=dict)


class CatalogItem(BaseModel):
    """An immutable catalog record as returned by the API."""

    id: str
    kind: str
    component: dict[str, Any]
    created_at: float
    schema_version: int
