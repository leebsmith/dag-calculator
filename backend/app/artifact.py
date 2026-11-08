"""Artifact + catalog registry access for server-side validation.

The deployed backend ships a vendored copy under ``app/_vendor``; local runs
resolve the repository ``data/`` directory. ``ARTIFACT_PATH`` overrides both.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
from collections.abc import Mapping
from datetime import date
from pathlib import Path
from types import MappingProxyType
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger("app.artifact")

_DOMAIN_OPS = {
    "gt": lambda a, b: a > b,
    "gte": lambda a, b: a >= b,
    "lt": lambda a, b: a < b,
    "lte": lambda a, b: a <= b,
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
}
_DOMAIN_STRING = re.compile(r"^\$value\s*(>=|<=|==|!=|>|<)\s*(.+?)\s*$")
_DOMAIN_STRING_OPS = {
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}

# One entry per file, keyed by the file's identity on disk. A dev server outlives
# an artifact or seed edit, and re-reading should not need a restart: production
# vendors an immutable copy, so the stat is the only cost.
_cache: dict[str, tuple[tuple[int, int], dict[str, Any]]] = {}


def _repo_data_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "data"


def _candidate_dirs() -> list[Path]:
    override = os.environ.get("ARTIFACT_PATH")
    if override:
        path = Path(override).expanduser()
        return [path.parent if path.is_file() else path]
    return [Path(__file__).resolve().parent / "_vendor", _repo_data_dir()]


def data_dir() -> Path:
    """Return the first candidate directory containing ``artifact.json``."""
    candidates = _candidate_dirs()
    for candidate in candidates:
        if (candidate / "artifact.json").is_file():
            return candidate
    raise FileNotFoundError(
        "artifact.json not found in: " + ", ".join(str(c) for c in candidates)
    )


def _freeze(value: Any) -> Any:
    """Deep-freeze a parsed JSON structure into read-only mappings/tuples."""
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    return value


def _load(name: str) -> dict[str, Any]:
    directory = data_dir()
    path = directory / name
    stat = path.stat()
    stamp = (stat.st_mtime_ns, stat.st_size)
    cached = _cache.get(name)
    if cached and cached[0] == stamp:
        return cached[1]
    with path.open(encoding="utf-8") as handle:
        value = _freeze(json.load(handle))
    _cache[name] = (stamp, value)
    if name == "artifact.json":
        logger.info("Resolved artifact data directory: %s", directory)
    return value


def clear_cache() -> None:
    _cache.clear()


def load_artifact() -> dict[str, Any]:
    return _load("artifact.json")


def load_catalogs() -> dict[str, Any]:
    return _load("catalogs.json")


def load_record_schemas() -> dict[str, Any]:
    return _load("record_schemas.json")


def load_record_catalogs() -> dict[str, Any]:
    return _load("record_catalogs.json")


def load_catalog_registry() -> dict[str, Any]:
    """The merged artifact-backed and non-DAG record catalogs."""
    return {**load_catalogs(), **load_record_catalogs()}


def _resolve_limit(limit: Any, constants: dict[str, Any]) -> Any:
    if isinstance(limit, (int, float)):
        return limit
    if isinstance(limit, Mapping) and "const" in limit:
        return constants.get(limit["const"], {}).get("value")
    return None


def _string_limit(expression: str, constants: dict[str, Any]) -> float | None:
    text = expression.strip()
    if text.startswith("constants."):
        constant = constants.get(text[len("constants.") :], {})
        limit = constant.get("value") if isinstance(constant, Mapping) else None
        return float(limit) if isinstance(limit, (int, float)) else None
    try:
        return float(text)
    except ValueError:
        return None


def _string_domain_error(domain: str, value: float, constants: dict[str, Any]) -> bool:
    for term in domain.split("&&"):
        match = _DOMAIN_STRING.match(term.strip())
        if match is None:
            return False
        op, limit_expr = match.groups()
        limit = _string_limit(limit_expr, constants)
        if limit is None:
            continue
        if not _DOMAIN_STRING_OPS[op](value, limit):
            return True
    return False


def _domain_error(domain: Any, value: float, constants: dict[str, Any]) -> bool:
    if isinstance(domain, str):
        return _string_domain_error(domain, value, constants)
    if not isinstance(domain, Mapping):
        return False
    for op, limit_expr in domain.items():
        test = _DOMAIN_OPS.get(op)
        if test is None:
            continue
        limit = _resolve_limit(limit_expr, constants)
        if not isinstance(limit, (int, float)) or not math.isfinite(limit):
            continue
        if not test(value, limit):
            return True
    return False


def _is_safe_url(value: Any) -> bool:
    """Return True when `value` is an unset string or an http(s) URL."""
    if not isinstance(value, str):
        return False
    stripped = value.strip()
    if not stripped:
        return True  # empty is "unset", not a violation
    return urlparse(stripped).scheme in ("http", "https")


def _missing(value: Any) -> bool:
    return value is None or value == "" or (isinstance(value, list) and len(value) == 0)


def _validate_string_value(spec: Any, value: Any, field: str, errors: list[str]) -> None:
    if not isinstance(value, str):
        errors.append(f"{field}: must be a string")
        return
    if spec.get("format") != "date":
        return
    try:
        date.fromisoformat(value)
    except ValueError:
        errors.append(f"{field}: must be an ISO date (YYYY-MM-DD)")


def _validate_record_scalar(
    artifact: dict[str, Any], spec: Any, value: Any, field: str, errors: list[str]
) -> None:
    if not isinstance(spec, Mapping):
        return
    kind = spec.get("type")
    if kind == "list":
        _validate_record_list(artifact, spec, value, field, errors)
        return
    if kind == "string":
        _validate_string_value(spec, value, field, errors)
        return
    if spec.get("dimension"):
        _validate_dimension_value(artifact, spec, value, field, errors)
        return
    if spec.get("taxonomy"):
        _validate_taxonomy_value(artifact, spec, value, field, errors)
        return
    if kind == "boolean" and not isinstance(value, bool):
        errors.append(f"{field}: must be a boolean")


def _validate_rows(
    artifact: dict[str, Any],
    item: Mapping[str, Any],
    value: list[Any],
    field: str,
    ordered_by: str | None,
    errors: list[str],
) -> list[float]:
    ordered: list[float] = []
    for index, row in enumerate(value):
        if not isinstance(row, dict):
            errors.append(f"{field}.{index}: row must be an object")
            continue
        _validate_row_fields(artifact, item, row, f"{field}.{index}", errors)
        if ordered_by and isinstance(row.get(ordered_by), (int, float)):
            ordered.append(row[ordered_by])
    return ordered


def _validate_row_fields(
    artifact: dict[str, Any],
    item: Mapping[str, Any],
    row: dict[str, Any],
    prefix: str,
    errors: list[str],
) -> None:
    for item_field, item_spec in item.items():
        row_value = row.get(item_field)
        if _missing(row_value):
            if isinstance(item_spec, Mapping) and item_spec.get("required"):
                errors.append(f"{prefix}.{item_field}: {item_field} is required")
            continue
        _validate_record_scalar(artifact, item_spec, row_value, f"{prefix}.{item_field}", errors)
    for item_field in row:
        if item_field not in item:
            errors.append(f'{prefix}.{item_field}: undeclared field "{item_field}"')


def _validate_ordering(
    ordered: list[float], ordered_by: str | None, field: str, errors: list[str]
) -> None:
    for index in range(1, len(ordered)):
        if ordered[index] <= ordered[index - 1]:
            errors.append(
                f"{field}.{index}.{ordered_by}: "
                "times must be strictly increasing and unique"
            )


def _validate_record_list(
    artifact: dict[str, Any], spec: Any, value: Any, field: str, errors: list[str]
) -> None:
    if not isinstance(value, list):
        errors.append(f"{field}: must be a list")
        return
    min_items = spec.get("min_items")
    if isinstance(min_items, int) and len(value) < min_items:
        errors.append(f"{field}: needs at least {min_items} rows")
    item = spec.get("item", {})
    if not isinstance(item, Mapping):
        return
    if any(isinstance(entry, Mapping) and entry.get("type") == "list" for entry in item.values()):
        errors.append(f"{field}: nested lists are not supported")
        return
    ordered_by = spec.get("ordered_by")
    ordered = _validate_rows(artifact, item, value, field, ordered_by, errors)
    _validate_ordering(ordered, ordered_by, field, errors)


def _validate_record_component(
    artifact: dict[str, Any], schema: Any, component: Any, meta: dict[str, Any]
) -> list[str]:
    if not isinstance(schema, Mapping):
        return ["*: unknown record schema"]
    if not isinstance(component, dict):
        return ["*: component must be an object"]
    errors: list[str] = []
    fields = schema.get("fields", {})
    title_field = meta.get("title_field", "name")
    if _missing(component.get(title_field)):
        errors.append(f"{title_field}: {title_field} is required")
    id_field = meta.get("id_field")
    if id_field in component and not isinstance(component[id_field], str):
        errors.append(f"{id_field}: must be a string")
    for field, spec in fields.items():
        value = component.get(field)
        if _missing(value):
            if isinstance(spec, Mapping) and spec.get("required"):
                errors.append(f"{field}: {field} is required")
            continue
        _validate_record_scalar(artifact, spec, value, field, errors)
    for field in component:
        if field not in fields:
            errors.append(f'{field}: undeclared field "{field}"')
    return errors


def _header_errors(component: dict[str, Any], meta: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    title_field = meta.get("title_field", "name")
    title = component.get(title_field)
    if not isinstance(title, str) or not title.strip():
        errors.append(f"{title_field}: {title_field} is required")
    identity = meta.get("id_field")
    if identity in component and not isinstance(component[identity], str):
        errors.append(f"{identity}: must be a string")
    return errors


def _validate_dimension_value(
    artifact: dict[str, Any], spec: Any, value: Any, field: str, errors: list[str]
) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        errors.append(f"{field}: must be a number")
        return
    if not math.isfinite(value):
        errors.append(f"{field}: must be finite")
        return
    if _domain_error(spec.get("domain"), value, artifact.get("constants", {})):
        errors.append(f"{field}: violates {spec.get('domain')}")


def _validate_taxonomy_value(
    artifact: dict[str, Any], spec: Any, value: Any, field: str, errors: list[str]
) -> None:
    allowed = artifact.get("taxonomies", {}).get(spec["taxonomy"], [])
    if value not in allowed:
        errors.append(f"{field}: '{value}' is not in taxonomy {spec['taxonomy']}")


def _validate_field_value(
    artifact: dict[str, Any], field: str, spec: Any, value: Any, errors: list[str]
) -> None:
    if field == "url":
        if not _is_safe_url(value):
            errors.append(f"{field}: must be an http(s) URL")
        return
    if spec.get("dimension"):
        _validate_dimension_value(artifact, spec, value, field, errors)
        return
    if spec.get("taxonomy"):
        _validate_taxonomy_value(artifact, spec, value, field, errors)
        return
    if spec.get("type") == "boolean" and not isinstance(value, bool):
        errors.append(f"{field}: must be a boolean")


def _validate_declared_fields(
    artifact: dict[str, Any],
    schema: Mapping[str, Any],
    component: dict[str, Any],
    errors: list[str],
) -> None:
    for field, value in component.items():
        if field not in schema:
            errors.append(f"{field}: undeclared field '{field}'")
            continue
        if value is None or value == "":
            continue
        _validate_field_value(artifact, field, schema[field], value, errors)


def validate_component(kind: str, component: Any) -> list[str]:
    """Validate a component against its catalog kind's primitive schema.

    Returns a list of ``"field: message"`` strings; empty means valid.
    """
    meta = load_catalog_registry().get(kind)
    if meta is None:
        return [f"*: unknown catalog kind '{kind}'"]
    artifact = load_artifact()
    if meta.get("schema_source") == "records":
        schema = load_record_schemas().get(meta["schema"])
        return _validate_record_component(artifact, schema, component, meta)
    if not isinstance(component, dict):
        return ["*: component must be an object"]
    schema = artifact.get("primitive_schemas", {}).get(meta["schema"])
    if schema is None:
        return [f"*: unknown primitive schema '{meta['schema']}'"]

    errors = _header_errors(component, meta)
    _validate_declared_fields(artifact, schema, component, errors)
    _validate_yeast_attenuation(kind, component, errors)
    return errors


def _validate_yeast_attenuation(kind: str, component: dict, errors: list[str]) -> None:
    """A ranged yeast's cap is the published high; the two cannot disagree."""
    if kind != "yeast" or not isinstance(component, dict):
        return
    low = component.get("attenuation_low_pct")
    high = component.get("attenuation_high_pct")
    if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
        return
    if component.get("attenuation_cap_pct") != high:
        errors.append(
            "attenuation_cap_pct: Cap must equal the published high when a range is set."
        )
