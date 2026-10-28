"""Server-side assembly of the freeze-time report bundle (plans/archive/report-bundle.md).

The browser ships the state, validation, telemetry, and presentation catalog; the
server owns the vendored artifact, its hashes, and the canonical content hash.
The bundle is written in the same transaction as the frozen batch record.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.artifact import load_artifact
from app.schemas.batch import FreezePayload
from app.schemas.canonical import sha256_canonical
from app.schemas.report_bundle import BUNDLE_FORMAT
from app.services.bundle_integrity import seal_bundle


def _plain(value: Any) -> Any:
    """Convert the artifact's frozen mappings/tuples into JSON-native containers."""
    if isinstance(value, Mapping):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    return value


def build_report_bundle(
    *, frozen_id: str, record: Mapping[str, Any], payload: FreezePayload
) -> dict[str, Any]:
    """Assemble and seal one immutable bundle for a newly frozen batch."""
    artifact = _plain(load_artifact())
    catalog_body = payload.catalog.model_dump(mode="json")
    inputs = payload.report_inputs

    content = {
        "bundle_format": BUNDLE_FORMAT,
        "artifact": {
            "schema_version": artifact.get("schema_version", 0),
            "hash": sha256_canonical(artifact),
            "content": artifact,
        },
        "catalog": {"hash": sha256_canonical(catalog_body), **catalog_body},
        "formatted": {
            path: entry.model_dump(mode="json")
            for path, entry in payload.formatted.items()
        },
        "formatted_tables": {
            collection: [
                {column: cell.model_dump(mode="json") for column, cell in row.items()}
                for row in rows
            ]
            for collection, rows in payload.formatted_tables.items()
        },
        "formatted_summaries": {
            key: summary.model_dump(mode="json")
            for key, summary in payload.formatted_summaries.items()
        },
        "batch": {
            "id": frozen_id,
            "name": record.get("name", "Untitled"),
            "status": record.get("status", "frozen"),
            "frozen_at": record.get("frozen_at"),
            "parent_batch_id": record.get("parent_batch_id"),
            "identity": record.get("identity", {}),
        },
        "state": {
            "valuation": record.get("valuation", {}),
            "roots": record.get("roots", {}),
            "collections": record.get("collections", {}),
            "selections": record.get("selections", {}),
            "provenance": record.get("provenance", {}),
        },
        "conformance": record.get("conformance"),
        "validation": inputs.validation.model_dump(mode="json"),
        "telemetry": {
            node_id: entry.model_dump(mode="json")
            for node_id, entry in inputs.telemetry.items()
        },
    }
    return seal_bundle(content).model_dump(mode="json")
