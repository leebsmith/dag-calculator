"""The rendered-recipe document model (presentation only).

Hand-written and generic: one fixed shape describes any recipe document, so the
projector parses a template into these models at runtime rather than generating
classes. Every leaf value is a display string ("12.2 g") or ``None`` when a
conditional binding is absent; nothing here re-derives domain values.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Block = "Value | Table | Group | Prose"


class Column(BaseModel):
    """A table column bound to a collection item field."""

    label: str
    field: str


class Value(BaseModel):
    """A labelled key/value line; ``value`` is already formatted."""

    kind: Literal["value"] = "value"
    label: str
    node: str
    value: str | None = None
    unit_label: str | None = None


class Table(BaseModel):
    """A collection rendered as rows of formatted strings."""

    kind: Literal["table"] = "table"
    label: str
    collection: str
    columns: list[Column] = Field(default_factory=list)
    rows: list[list[str | None]] = Field(default_factory=list)


class Prose(BaseModel):
    """Interleaved document text."""

    kind: Literal["prose"] = "prose"
    text: str


class Group(BaseModel):
    """An anonymous nested block (same body shape as a section)."""

    kind: Literal["group"] = "group"
    label: str | None = None
    blocks: list[Value | Table | Group | Prose] = Field(default_factory=list)


class Section(BaseModel):
    """A named document section; may nest subsections."""

    id: str
    title: str | None = None
    subtitle: str | None = None
    prose: list[str] = Field(default_factory=list)
    blocks: list[Value | Table | Group | Prose] = Field(default_factory=list)
    subsections: list[Section] = Field(default_factory=list)


class BatchIdentity(BaseModel):
    """The batch header: the immutable identity the document was computed from."""

    equipment: dict = Field(default_factory=dict)
    water_source: dict = Field(default_factory=dict)
    style: dict = Field(default_factory=dict)


class DocumentIdentity(BaseModel):
    """Document identity and reproducibility metadata."""

    schema_version: int
    valuation_format: str | None = None
    provenance: dict = Field(default_factory=dict)
    content_hash: str | None = None
    batch: BatchIdentity = Field(default_factory=BatchIdentity)


class RecipeDocument(BaseModel):
    """A populated document tree, renderable by any backend."""

    title: str
    subtitle: str | None = None
    meta: dict[str, str] = Field(default_factory=dict)
    prose: list[str] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)
    identity: DocumentIdentity
