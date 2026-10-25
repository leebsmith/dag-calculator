"""Guarded schema for the report bundle (plans/report-bundle.md).

The bundle is the only input a report generator consumes: artifact and catalog as of
freeze, the whole solved state, the captured validation outcome, and solver
telemetry. It is deliberately small — `artifact.content` is free-form JSON trusted by
hash (the engine has already validated it), so this module enforces *bundle*
structure and cross-references rather than duplicating the artifact schema.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, model_validator

from app.schemas.canonical import sha256_canonical

BUNDLE_FORMAT = 1


class BundleModel(BaseModel):
    """Reject unknown fields so a shape change cannot pass silently."""

    model_config = ConfigDict(extra="forbid", frozen=True)


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
    bundle_format: Literal[1] = BUNDLE_FORMAT
    artifact: ArtifactBundle
    catalog: Catalog
    batch: BatchHeader
    state: StateBundle
    conformance: dict[str, Any] | None = None
    validation: ValidationBundle = Field(default_factory=ValidationBundle)
    telemetry: dict[str, BoundaryTelemetry] = Field(default_factory=dict)
    content_hash: str

    @classmethod
    def seal(cls, content: dict[str, Any]) -> ReportBundle:
        """Validate a bundle, then stamp the hash of its canonical body."""
        draft = cls.model_validate({**content, "content_hash": ""}, context={"sealing": True})
        digest = bundle_content_hash(draft.model_dump(mode="json"))
        return cls.model_validate({**draft.model_dump(mode="json"), "content_hash": digest})

    @model_validator(mode="after")
    def _cross_references(self) -> ReportBundle:
        nodes: dict[str, Any] = self.artifact.content.get("nodes") or {}
        dimensions: dict[str, Any] = self.artifact.content.get("dimensions") or {}
        identity: dict[str, str] = self.artifact.content.get("identity") or {}
        schemas: dict[str, Any] = self.artifact.content.get("primitive_schemas") or {}

        unknown = sorted(set(self.state.valuation) - set(nodes))
        if unknown:
            raise ValueError(f"valuation names undeclared nodes: {', '.join(unknown)}")

        for node_id, entry in self.telemetry.items():
            node = nodes.get(node_id)
            if not node or node.get("kind") != "boundary":
                raise ValueError(f'telemetry key "{node_id}" is not a boundary node')
            if node.get("binding") != entry.binding:
                raise ValueError(
                    f'telemetry binding "{entry.binding}" does not match "{node["binding"]}"'
                )

        unknown_dims = sorted(set(self.catalog.dimensions) - set(dimensions))
        if unknown_dims:
            raise ValueError(f"catalog names undeclared dimensions: {', '.join(unknown_dims)}")

        unknown_ns = sorted(set(self.batch.identity) - set(identity))
        if unknown_ns:
            raise ValueError(f"identity namespaces not declared: {', '.join(unknown_ns)}")

        for path in self.catalog.nodes:
            if not _resolves(path, nodes, identity, schemas):
                raise ValueError(f'catalog path "{path}" resolves to no node, field, or namespace')

        for node_id, rows in self.state.collections.items():
            node = nodes.get(node_id)
            if not node or node.get("kind") != "collection":
                raise ValueError(f'collection state for non-collection node "{node_id}"')
            if node.get("item_schema") not in schemas:
                raise ValueError(f'collection "{node_id}" names an unknown item schema')
            if not isinstance(rows, list):
                raise ValueError(f'collection "{node_id}" rows must be a list')

        exposed = set()
        for node_id, value in self.state.valuation.items():
            exposed.add(node_id)
            if isinstance(value, dict):
                exposed.update(f"{node_id}.{key}" for key in value)
            elif isinstance(value, list):
                for row in value:
                    if isinstance(row, dict):
                        exposed.update(f"{node_id}.{key}" for key in row)
        uncovered = sorted(exposed - set(self.catalog.nodes))
        if uncovered:
            raise ValueError(
                "catalog does not cover the solved state: " + ", ".join(uncovered)
            )

        orphaned = sorted(set(self.telemetry) - set(self.state.valuation))
        if orphaned:
            raise ValueError(
                "telemetry names unsolved boundaries: " + ", ".join(orphaned)
            )

        return self

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


def _resolves(path: str, nodes: dict[str, Any], identity: dict[str, str], schemas: dict[str, Any]) -> bool:
    """Mirror the engine's dotted-path rule: exact node, longest node prefix, then
    the longest identity namespace prefix. A suffix must name a schema field."""
    if path in nodes:
        return True
    segments = path.split(".")
    for index in range(len(segments) - 1, 0, -1):
        prefix = ".".join(segments[:index])
        node = nodes.get(prefix)
        if node is None:
            continue
        suffix = segments[index:]
        if node.get("kind") == "boundary":
            declared = node.get("outputs") or {}
            return ".".join(suffix) in declared
        if node.get("kind") in {"selection", "collection"}:
            schema_id = (node.get("output") or {}).get("schema") or node.get("item_schema")
            schema = schemas.get(schema_id) or {}
            return suffix[0] in schema
        return False
    for index in range(len(segments), 0, -1):
        namespace = ".".join(segments[:index])
        if namespace in identity:
            schema = schemas.get(identity[namespace]) or {}
            suffix = segments[index:]
            return len(suffix) == 1 and suffix[0] in schema
    return False
