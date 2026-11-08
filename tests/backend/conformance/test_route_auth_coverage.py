"""Route auth coverage: every FastAPI route must name the dependency that guards it.

Public probes are allow-listed; solvers are rate-limited; user data needs the
allowlisted identity. A new route without an auth dependency fails here.
"""

from __future__ import annotations

import ast
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[3] / "backend" / "app"

ROUTE_METHODS = {"get", "post", "put", "patch", "delete"}
ROUTE_OBJECTS = {"app", "router"}

# `RateLimitedLlmUser` wraps `AllowedUser` in a tighter token bucket, so it proves
# identity *and* guards the paid call. It satisfies the allowlist requirement.
AUTH_DEPS = {"AllowedUser", "CurrentUser", "RateLimitedUser", "RateLimitedLlmUser"}
ALLOWLISTED = {"AllowedUser", "RateLimitedLlmUser"}

# Deliberately unauthenticated readiness probe.
PUBLIC = {"/health"}
# Identity proof only: the payload reports whether the caller is allowlisted.
SESSION_ONLY = {"/session"}
# Local-development-only diagnostics: the handler returns 404 unless APP_ENV is
# development, so production never reaches the page.
DEV_ONLY = {"/dev/dag-visualizer"}


def _routes() -> list[tuple[str, str, set[str], int, str]]:
    found: list[tuple[str, str, set[str], int, str]] = []
    for path in sorted(APP_DIR.rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in tree.body:
            if not isinstance(node, ast.FunctionDef):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call):
                    continue
                func = decorator.func
                if not isinstance(func, ast.Attribute) or func.attr not in ROUTE_METHODS:
                    continue
                if not isinstance(func.value, ast.Name) or func.value.id not in ROUTE_OBJECTS:
                    continue
                route_path = decorator.args[0].value if decorator.args else ""
                deps = {
                    arg.annotation.id
                    for arg in node.args.args
                    if isinstance(arg.annotation, ast.Name)
                }
                found.append((func.attr.upper(), route_path, deps, node.lineno, path.name))
    return found


def _unauthenticated_problem(where: str, path: str, auth: set[str]) -> str | None:
    if not auth:
        return None
    kind = "public" if path in PUBLIC else "dev-only"
    return f"{where}: {kind} route must not carry {sorted(auth)}"


def _route_problem(
    method: str, path: str, deps: set[str], lineno: int, filename: str
) -> str | None:
    where = f"{method} {path} ({filename}:{lineno})"
    auth = deps & AUTH_DEPS

    if path in PUBLIC or path in DEV_ONLY:
        return _unauthenticated_problem(where, path, auth)
    if not auth:
        return f"{where}: no auth dependency"
    if path in SESSION_ONLY:
        if auth != {"CurrentUser"}:
            return f"{where}: session must use CurrentUser, found {sorted(auth)}"
        return None
    if path.startswith("/solve/"):
        if "RateLimitedUser" not in auth:
            return f"{where}: solver route must be rate-limited"
        return None
    if not auth & ALLOWLISTED:
        return f"{where}: user-data route must use AllowedUser"
    return None


def test_every_route_declares_its_auth_dependency():
    routes = _routes()
    assert len(routes) >= 13, f"route discovery found only {len(routes)} routes"

    offenders = [
        problem
        for problem in (
            _route_problem(method, path, deps, lineno, filename)
            for method, path, deps, lineno, filename in routes
        )
        if problem is not None
    ]
    assert offenders == [], "route auth drift:\n" + "\n".join(offenders)

    seen_paths = {path for _method, path, _deps, _lineno, _filename in routes}
    for path in PUBLIC | SESSION_ONLY | DEV_ONLY:
        assert path in seen_paths, f"stale auth allowlist entry: {path}"
