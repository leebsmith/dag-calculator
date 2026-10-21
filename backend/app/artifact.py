"""Artifact + catalog registry access for server-side validation.

The deployed backend ships a vendored copy under ``app/_vendor``; local runs
resolve the repository ``data/`` directory. ``ARTIFACT_PATH`` overrides both.
"""

from __future__ import annotations

import json
import logging
import math
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger("app.artifact")

_DOMAIN_OPS = {
    "gt": lambda a, b: a > b,
    "gte": lambda a, b: a >= b,
    "lt": lambda a, b: a < b,
    "lte": lambda a, b: a <= b,
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
}

_cache: dict[str, dict[str, Any]] = {}


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


def _load(name: str) -> dict[str, Any]:
    directory = data_dir()
    key = f"{directory}:{name}"
    if key not in _cache:
        path = directory / name
        with path.open(encoding="utf-8") as handle:
            _cache[key] = json.load(handle)
        if name == "artifact.json":
            logger.info("Resolved artifact data directory: %s", directory)
    return _cache[key]


def clear_cache() -> None:
    _cache.clear()


def load_artifact() -> dict[str, Any]:
    return _load("artifact.json")


def load_catalogs() -> dict[str, Any]:
    return _load("catalogs.json")


def _resolve_limit(limit: Any, constants: dict[str, Any]) -> Any:
    if isinstance(limit, (int, float)):
        return limit
    if isinstance(limit, dict) and "const" in limit:
        return constants.get(limit["const"], {}).get("value")
    return None


def _domain_error(domain: Any, value: float, constants: dict[str, Any]) -> bool:
    if not isinstance(domain, dict):
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


def validate_component(kind: str, component: Any) -> list[str]:
    """Validate a component against its catalog kind's primitive schema.

    Returns a list of ``"field: message"`` strings; empty means valid.
    """
    catalogs = load_catalogs()
    meta = catalogs.get(kind)
    if meta is None:
        return [f"*: unknown catalog kind '{kind}'"]
    if not isinstance(component, dict):
        return ["*: component must be an object"]

    artifact = load_artifact()
    schema = artifact.get("primitive_schemas", {}).get(meta["schema"])
    if schema is None:
        return [f"*: unknown primitive schema '{meta['schema']}'"]

    errors: list[str] = []
    title_field = meta.get("title_field", "name")
    title = component.get(title_field)
    if not isinstance(title, str) or not title.strip():
        errors.append(f"{title_field}: {title_field} is required")

    identity = meta.get("id_field")
    if identity in component and not isinstance(component[identity], str):
        errors.append(f"{identity}: must be a string")

    constants = artifact.get("constants", {})
    for field, value in component.items():
        if field not in schema:
            errors.append(f"{field}: undeclared field '{field}'")
            continue
        if value is None or value == "":
            continue
        spec = schema[field]
        if spec.get("dimension"):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                errors.append(f"{field}: must be a number")
                continue
            if not math.isfinite(value):
                errors.append(f"{field}: must be finite")
                continue
            if _domain_error(spec.get("domain"), value, constants):
                errors.append(f"{field}: violates {spec.get('domain')}")
        elif spec.get("taxonomy"):
            allowed = artifact.get("taxonomies", {}).get(spec["taxonomy"], [])
            if value not in allowed:
                errors.append(f"{field}: '{value}' is not in taxonomy {spec['taxonomy']}")
        elif spec.get("type") == "boolean" and not isinstance(value, bool):
            errors.append(f"{field}: must be a boolean")
    return errors
