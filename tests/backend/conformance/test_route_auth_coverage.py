"""Route auth coverage: every FastAPI route must name the dependency that guards it.

Public probes are allow-listed; solvers are rate-limited; user data needs the
allowlisted identity. A new route without an auth dependency fails here.
"""

from __future__ import annotations

import ast
from pathlib import Path

MAIN = Path(__file__).resolve().parents[3] / "backend" / "app" / "main.py"

ROUTE_METHODS = {"get", "post", "put", "patch", "delete"}

# Deliberately unauthenticated readiness probe.
PUBLIC = {"/health"}
# Identity proof only: the payload reports whether the caller is allowlisted.
SESSION_ONLY = {"/session"}


def _routes() -> list[tuple[str, str, set[str], int]]:
    tree = ast.parse(MAIN.read_text())
    found: list[tuple[str, str, set[str], int]] = []
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef):
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            func = decorator.func
            if not isinstance(func, ast.Attribute) or func.attr not in ROUTE_METHODS:
                continue
            if not isinstance(func.value, ast.Name) or func.value.id != "app":
                continue
            path = decorator.args[0].value if decorator.args else ""
            deps = {
                arg.annotation.id
                for arg in node.args.args
                if isinstance(arg.annotation, ast.Name)
            }
            found.append((func.attr.upper(), path, deps, node.lineno))
    return found


def test_every_route_declares_its_auth_dependency():
    routes = _routes()
    assert len(routes) >= 13, f"route discovery found only {len(routes)} routes"

    offenders: list[str] = []
    seen_paths: set[str] = set()

    for method, path, deps, lineno in routes:
        seen_paths.add(path)
        where = f"{method} {path} (main.py:{lineno})"
        auth = deps & {"AllowedUser", "CurrentUser", "RateLimitedUser"}

        if path in PUBLIC:
            if auth:
                offenders.append(f"{where}: public route must not carry {sorted(auth)}")
            continue
        if not auth:
            offenders.append(f"{where}: no auth dependency")
            continue
        if path in SESSION_ONLY and auth != {"CurrentUser"}:
            offenders.append(f"{where}: session must use CurrentUser, found {sorted(auth)}")
            continue
        if path.startswith("/solve/") and "RateLimitedUser" not in auth:
            offenders.append(f"{where}: solver route must be rate-limited")
            continue
        if not path.startswith("/solve/") and path not in SESSION_ONLY:
            if "AllowedUser" not in auth:
                offenders.append(f"{where}: user-data route must use AllowedUser")

        if method != "GET" and path in PUBLIC:
            offenders.append(f"{where}: mutating route cannot be public")

    assert offenders == [], "route auth drift:\n" + "\n".join(offenders)
    for path in PUBLIC | SESSION_ONLY:
        assert path in seen_paths, f"stale auth allowlist entry: {path}"
