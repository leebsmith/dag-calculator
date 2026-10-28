"""Cross-reference integrity for a sealed report bundle (plans/report-bundle.md).

`schemas/report_bundle.py` owns transport shape: the guarded models, the declared
enums, and the canonical `content_hash`. This module owns graph truth — a bundle
may only name nodes, dimensions, identity namespaces, item schemas, and boundary
outputs the vendored artifact declares, and its display strings may only name
catalog paths. `parse_bundle` and `seal_bundle` are the two constructors: each runs
every check exactly once, so `ReportBundle.model_validate` on its own is
shape-only.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from app.schemas.report_bundle import ReportBundle, bundle_content_hash


class BundleIntegrityError(ValueError):
    """A bundle names something the artifact does not declare."""


Check = Callable[[ReportBundle], None]


def check_valuation_nodes(bundle: ReportBundle) -> None:
    """Every solved value belongs to a declared node."""
    unknown = sorted(set(bundle.state.valuation) - set(_nodes(bundle)))
    if unknown:
        raise BundleIntegrityError(
            f"valuation names undeclared nodes: {', '.join(unknown)}"
        )


def check_telemetry_bindings(bundle: ReportBundle) -> None:
    """Telemetry is captured per boundary, and names the binding it came from."""
    nodes = _nodes(bundle)
    for node_id, entry in bundle.telemetry.items():
        node = nodes.get(node_id)
        if not node or node.get("kind") != "boundary":
            raise BundleIntegrityError(f'telemetry key "{node_id}" is not a boundary node')
        if node.get("binding") != entry.binding:
            raise BundleIntegrityError(
                f'telemetry binding "{entry.binding}" does not match "{node["binding"]}"'
            )


def check_catalog_dimensions(bundle: ReportBundle) -> None:
    unknown = sorted(set(bundle.catalog.dimensions) - set(_dimensions(bundle)))
    if unknown:
        raise BundleIntegrityError(
            f"catalog names undeclared dimensions: {', '.join(unknown)}"
        )


def check_identity_namespaces(bundle: ReportBundle) -> None:
    unknown = sorted(set(bundle.batch.identity) - set(_identity(bundle)))
    if unknown:
        raise BundleIntegrityError(
            f"identity namespaces not declared: {', '.join(unknown)}"
        )


def check_catalog_paths(bundle: ReportBundle) -> None:
    nodes = _nodes(bundle)
    identity = _identity(bundle)
    schemas = _schemas(bundle)
    for path in bundle.catalog.nodes:
        if not _resolves(path, nodes, identity, schemas):
            raise BundleIntegrityError(
                f'catalog path "{path}" resolves to no node, field, or namespace'
            )


def check_catalog_symbols(bundle: ReportBundle) -> None:
    """A dimensioned node with a unit must name the symbol the readout shows.

    Without it a generator prints the unit id ("5.6 pct" for ABV), which is a
    silent presentation regression rather than a missing value.
    """
    missing = sorted(
        path
        for path, entry in bundle.catalog.nodes.items()
        if entry.unit is not None and not entry.symbol
    )
    if missing:
        raise BundleIntegrityError(
            "catalog unit without a display symbol: " + ", ".join(missing)
        )


def check_formatted_values(bundle: ReportBundle) -> None:
    """Formatted strings are the only display source a report reads.

    Every one must name a catalog path, and a dimensioned value must carry the
    number/unit split (the ledger aligns those columns).
    """
    dimensions = _dimensions(bundle)
    for path, entry in bundle.formatted.items():
        if path not in bundle.catalog.nodes:
            raise BundleIntegrityError(f'formatted path "{path}" is not in the catalog')
        spec = bundle.catalog.nodes[path]
        dim = dimensions.get(spec.dimension) if spec.dimension else None
        numeric = (dim or {}).get("kind") in ("linear", "affine", "nonlinear")
        if (
            spec.unit is not None
            and numeric
            and (entry.number is None or entry.unit is None)
        ):
            raise BundleIntegrityError(
                f'formatted path "{path}" has a display unit but no number/unit split'
            )


def check_formatted_tables(bundle: ReportBundle) -> None:
    """Per-row display strings for collection tables (grist, hops, …)."""
    nodes = _nodes(bundle)
    for collection, rows in bundle.formatted_tables.items():
        node = nodes.get(collection)
        if not node or node.get("kind") != "collection":
            raise BundleIntegrityError(
                f'formatted table "{collection}" is not a collection node'
            )
        for row in rows:
            for column, cell in row.items():
                if not cell.text:
                    raise BundleIntegrityError(
                        f'formatted table "{collection}.{column}" has no text'
                    )


def check_formatted_summaries(bundle: ReportBundle) -> None:
    """Per-table weighted summaries: the collection they summarise, or the
    literal "overall" aggregate across tables."""
    nodes = _nodes(bundle)
    for key, summary in bundle.formatted_summaries.items():
        if key != "overall":
            node = nodes.get(key)
            if not node or node.get("kind") != "collection":
                raise BundleIntegrityError(
                    f'formatted summary "{key}" is not a collection node or "overall"'
                )
        for column in ("color", "extract_yield"):
            cell = getattr(summary, column)
            if cell is not None and not cell.text:
                raise BundleIntegrityError(f'formatted summary "{key}.{column}" has no text')


def check_collection_state(bundle: ReportBundle) -> None:
    """Collection rows belong to a collection node with a declared item schema."""
    nodes = _nodes(bundle)
    schemas = _schemas(bundle)
    for node_id, rows in bundle.state.collections.items():
        node = nodes.get(node_id)
        if not node or node.get("kind") != "collection":
            raise BundleIntegrityError(
                f'collection state for non-collection node "{node_id}"'
            )
        if node.get("item_schema") not in schemas:
            raise BundleIntegrityError(
                f'collection "{node_id}" names an unknown item schema'
            )
        if not isinstance(rows, list):
            raise BundleIntegrityError(f'collection "{node_id}" rows must be a list')


def check_catalog_coverage(bundle: ReportBundle) -> None:
    """Every value the state exposes has a catalog entry to display it."""
    exposed = set()
    for node_id, value in bundle.state.valuation.items():
        exposed.add(node_id)
        if isinstance(value, dict):
            exposed.update(f"{node_id}.{key}" for key in value)
        elif isinstance(value, list):
            for row in value:
                if isinstance(row, dict):
                    exposed.update(f"{node_id}.{key}" for key in row)
    uncovered = sorted(exposed - set(bundle.catalog.nodes))
    if uncovered:
        raise BundleIntegrityError(
            "catalog does not cover the solved state: " + ", ".join(uncovered)
        )


def check_telemetry_coverage(bundle: ReportBundle) -> None:
    """A boundary with telemetry was solved, so its value is in the state."""
    orphaned = sorted(set(bundle.telemetry) - set(bundle.state.valuation))
    if orphaned:
        raise BundleIntegrityError(
            "telemetry names unsolved boundaries: " + ", ".join(orphaned)
        )


CHECKS: tuple[Check, ...] = (
    check_valuation_nodes,
    check_telemetry_bindings,
    check_catalog_dimensions,
    check_identity_namespaces,
    check_catalog_paths,
    check_catalog_symbols,
    check_formatted_values,
    check_formatted_tables,
    check_formatted_summaries,
    check_collection_state,
    check_catalog_coverage,
    check_telemetry_coverage,
)


def verify(bundle: ReportBundle) -> ReportBundle:
    """Run every integrity check, in the order the messages are worded."""
    for check in CHECKS:
        check(bundle)
    return bundle


def parse_bundle(content: Mapping[str, Any]) -> ReportBundle:
    """Validate a stored or posted bundle: transport shape, then graph truth."""
    return verify(ReportBundle.model_validate(content))


def seal_bundle(content: Mapping[str, Any]) -> ReportBundle:
    """Validate a bundle once, then stamp the canonical hash of the checked body."""
    draft = ReportBundle.model_validate(
        {**content, "content_hash": ""}, context={"sealing": True}
    )
    verify(draft)
    digest = bundle_content_hash(draft.model_dump(mode="json"))
    return draft.model_copy(update={"content_hash": digest})


def _nodes(bundle: ReportBundle) -> dict[str, Any]:
    return bundle.artifact.content.get("nodes") or {}


def _dimensions(bundle: ReportBundle) -> dict[str, Any]:
    return bundle.artifact.content.get("dimensions") or {}


def _identity(bundle: ReportBundle) -> dict[str, str]:
    return bundle.artifact.content.get("identity") or {}


def _schemas(bundle: ReportBundle) -> dict[str, Any]:
    return bundle.artifact.content.get("primitive_schemas") or {}


def _resolves(
    path: str,
    nodes: dict[str, Any],
    identity: dict[str, str],
    schemas: dict[str, Any],
) -> bool:
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
            if node.get("kind") == "collection" and suffix[0] in (node.get("fields") or {}):
                return True
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
