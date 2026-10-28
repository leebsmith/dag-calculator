"""Guarded schema for the report bundle (plans/report-bundle.md).

The bundle is the only input a report generator consumes: artifact and catalog as of
freeze, the whole solved state, the captured validation outcome, and solver
telemetry. It is deliberately small — `artifact.content` is free-form JSON trusted by
hash (the engine has already validated it), so this module enforces *bundle*
structure (guarded models, declared enums, the canonical content hash) rather than
duplicating the artifact schema. Whether those structures name what the artifact
declares is graph truth, not transport shape: `app.services.bundle_integrity` owns
it, and `parse_bundle` / `seal_bundle` are the checked constructors.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, model_validator

from app.schemas.canonical import sha256_canonical

BUNDLE_FORMAT = 7


class BundleModel(BaseModel):
    """Reject unknown fields so a shape change cannot pass silently."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class FormattedValue(BundleModel):
    """A value as the browser would display it, frozen at freeze.

    ``text`` is what a report prints (number + symbol). ``number`` and ``unit``
    exist for tables that align the figures in one column and the unit in
    another. The report generator never converts or rounds.
    """

    text: str
    number: str | None = None
    unit: str | None = None


class FormattedSummary(BundleModel):
    """A table's mass-weighted colour and extract yield, pre-formatted.

    ``color`` and ``extract_yield`` are the same frozen display records a row
    cell uses. Absent when the table has no rows to weigh.
    """

    color: FormattedValue | None = None
    extract_yield: FormattedValue | None = None


class ArtifactBundle(BundleModel):
    schema_version: int
    hash: str
    content: dict[str, Any]


class DimensionUnit(BundleModel):
    factor: float | None = None
    offset: float | None = None
    fwd: str | None = None
    inv: str | None = None


class DimensionSpec(BundleModel):
    base_unit: str
    kind: Literal["linear", "affine", "nonlinear", "identity"]
    units: dict[str, DimensionUnit] = Field(default_factory=dict)


class NodePresentation(BundleModel):
    label: str
    dimension: str | None = None
    unit: str | None = None
    symbol: str | None = None
    decimals: int | None = None
    step: str | None = None
    options: list[str] | None = None
    option_labels: dict[str, str] | None = None


class CatalogContent(BundleModel):
    """Presentation facts as the browser captures them, before hashing."""

    dimensions: dict[str, DimensionSpec] = Field(default_factory=dict)
    nodes: dict[str, NodePresentation] = Field(default_factory=dict)


class Catalog(CatalogContent):
    hash: str


class BatchHeader(BundleModel):
    id: str
    name: str
    status: Literal["draft", "frozen"] = "frozen"
    frozen_at: float | None = None
    parent_batch_id: str | None = None
    identity: dict[str, dict[str, Any]]


class StateBundle(BundleModel):
    valuation: dict[str, Any]
    roots: dict[str, Any] = Field(default_factory=dict)
    collections: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    selections: dict[str, dict[str, Any] | None] = Field(default_factory=dict)
    provenance: dict[str, dict[str, Any]] = Field(default_factory=dict)


class ValidationBundle(BundleModel):
    relations: list[dict[str, Any]] = Field(default_factory=list)
    domains: list[dict[str, Any]] = Field(default_factory=list)
    field_domains: list[dict[str, Any]] = Field(default_factory=list)
    collection_domains: list[dict[str, Any]] = Field(default_factory=list)


class BoundaryTelemetry(BundleModel):
    binding: str
    fingerprint: str
    telemetry: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class ReportInputs(BundleModel):
    """Freeze-time capture: validation outcome and per-boundary telemetry."""

    validation: ValidationBundle = Field(default_factory=ValidationBundle)
    telemetry: dict[str, BoundaryTelemetry] = Field(default_factory=dict)


def bundle_content_hash(content: dict[str, Any]) -> str:
    """Hash everything in the bundle except ``content_hash`` itself."""
    return sha256_canonical({key: value for key, value in content.items() if key != "content_hash"})


class ReportBundle(BundleModel):
    bundle_format: Literal[7] = BUNDLE_FORMAT
    artifact: ArtifactBundle
    catalog: Catalog
    batch: BatchHeader
    state: StateBundle
    formatted: dict[str, FormattedValue] = Field(default_factory=dict)
    formatted_tables: dict[str, list[dict[str, FormattedValue]]] = Field(
        default_factory=dict
    )
    formatted_summaries: dict[str, FormattedSummary] = Field(default_factory=dict)
    conformance: dict[str, Any] | None = None
    validation: ValidationBundle = Field(default_factory=ValidationBundle)
    telemetry: dict[str, BoundaryTelemetry] = Field(default_factory=dict)
    content_hash: str

    @model_validator(mode="after")
    def _content_hash_matches(self, info: ValidationInfo) -> ReportBundle:
        if info.context and info.context.get("sealing"):
            return self
        expected = bundle_content_hash(self.model_dump(mode="json"))
        if self.content_hash != expected:
            raise ValueError(
                f"content_hash does not match the bundle body: {self.content_hash} != {expected}"
            )
        return self

