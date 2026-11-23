"""Route table: the declared HTTP contract, pinned.

Every registered route is recorded by method, path, status, response model,
tags and dependency names. Those are what the frontend, the boundary fixtures and
the auth guard consume, so an accidental edit is a contract change rather than a
detail. Regenerate deliberately with:

    UPDATE_FIXTURES=1 uv run pytest tests/backend/test_route_table.py

Routers are included lazily (`_IncludedRouter`), so `app.routes` does not flatten
them; the walk below applies each inclusion's prefix, tags, dependencies and
schema visibility. That keeps the table honest whether a route is declared on the
app or on a mounted router.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import get_args, get_origin

from fastapi.routing import APIRoute

from app.main import app

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "route-table.json"


def _callable_name(target) -> str:
    return getattr(target, "__name__", repr(target))


def _depends_names(depends) -> set[str]:
    return {_callable_name(dep.dependency) for dep in depends}


def _type_name(model):
    if model is None:
        return None
    origin = get_origin(model)
    if origin is None:
        return getattr(model, "__name__", str(model))
    name = getattr(origin, "__name__", str(origin).replace("typing.", ""))
    if name == "UnionType":
        name = "Union"
    args = ", ".join(_type_name(arg) for arg in get_args(model))
    return f"{name}[{args}]"


def _rows(routes, prefix="", tags=(), deps=frozenset(), in_schema=True):
    for route in routes:
        if isinstance(route, APIRoute):
            yield {
                "methods": sorted(route.methods),
                "path": prefix + route.path,
                "name": route.name,
                "status": route.status_code or 200,
                "response_model": _type_name(route.response_model),
                "tags": sorted({*tags, *route.tags}),
                "dependencies": sorted(
                    {
                        *deps,
                        *(_callable_name(dep.call) for dep in route.dependant.dependencies),
                        *_depends_names(route.dependencies),
                    }
                ),
                "in_schema": in_schema and route.include_in_schema,
            }
            continue

        context = getattr(route, "include_context", None)
        included = getattr(route, "original_router", None)
        if context is not None and included is not None:
            yield from _rows(
                included.routes,
                prefix + context.prefix,
                (*tags, *context.tags),
                deps | _depends_names(context.dependencies),
                in_schema and context.include_in_schema,
            )
            continue

        nested = getattr(route, "routes", None)
        if nested:
            yield from _rows(nested, prefix, tags, deps, in_schema)


def _table() -> list[dict]:
    return sorted(_rows(app.routes), key=lambda row: (row["path"], row["methods"]))


def test_route_table_matches_the_committed_dump():
    expected = _table()
    if os.environ.get("UPDATE_FIXTURES"):
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(json.dumps(expected, indent=2) + "\n")
    assert FIXTURE.exists(), f"missing fixture {FIXTURE}; run with UPDATE_FIXTURES=1"
    assert json.loads(FIXTURE.read_text()) == expected, (
        "route contract changed; re-run with UPDATE_FIXTURES=1 and review the diff"
    )
