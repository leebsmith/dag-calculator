# Backend Router Extraction

Status: **deferred** (2026-11-23) — not rejected, not abandoned
Scope: `backend/app/main.py` and `backend/app/routers/`
Out of scope: route paths, request/response schemas, service or repository code,
solver behaviour, frontend adapters, auth and throttling policy, artifact changes

## Why deferred

The risk this plan was written for was accretion — a 720-line module with nothing
stopping it from growing — not complexity. Two cheaper instruments landed on
2026-11-23 and now cover it: `tests/guards/backend-shape.test.js` pins the ten
backend modules over 400 lines (pins only descend) and
`tests/backend/test_route_table.py` pins the HTTP contract. This file is kept as
the runbook for the day the split is actually warranted.

| Claim | Measurement | Verdict |
|---|---|---|
| Extraction was started and abandoned | `routers/dev.py` was created by *"Add the artifact DAG visualizer and local inspector"* — it exists to isolate a dev-only tool | **No dropped thread** |
| `main.py` is a change hotspot | 32 of 1,000 commits touched it | **No** |
| Splitting buys parallel work | 1,000 of 1,000 commits are one author | **Void** |
| The file is complex | 35 handlers, ~19 lines each, all delegation; `ruff` `C901` capped at 10 | **Long, not tangled** |
| The file is an accident | Its docstring claims the role: *"FastAPI application: the JSON seam between the browser and the sealed solvers"* | **Deliberate: one readable seam** |
| The move is safe whenever it happens | The auth-coverage guard walks every ``@app.*``/``@router.*`` in the tree via AST and is path-agnostic | **True** |

**Re-open when any of these is true:** `main.py` passes ~1,000 lines; a second
author commits; a route can no longer be located in a few seconds.

Three amendments were recorded while landing the ratchet, and the phases below
already reflect the first two:

- **Phase 0 is satisfied.** The route-table snapshot records method, path, name,
  status, response model, tags and dependency names for every route.
- **The inventory is 36 routes, not 35** — the 35 `app` handlers plus `dev.py`'s
  inspector.
- **Included routers are lazy in this FastAPI build.** `app.include_router(…)`
  appends an `_IncludedRouter` instead of flattening its routes, so any test that
  walks `app.routes` for `APIRoute` instances sees nothing once routes move behind
  a router. The route table recurses through the included router's
  `original_router` and applies its `include_context`; do not replace it with a
  flat walk.

Execution therefore starts from phase 1.

## Goal

`main.py` should assemble the application — middleware, exception handlers,
startup logging, router mounting — and hold no route handlers. Target: **no
`@app.<method>` decorator remains, and `main.py` under ~150 lines** (today 720).

The work is a verbatim move. No path changes, no behaviour changes, no schema
changes. Every acceptance gate exists to prove that.

## Baseline

Measured on 2026-11-23 (re-verify before starting; counts drift):

| Fact | Value |
|---|---|
| `backend/app/main.py` | **720 lines**, one of ten modules pinned by the size ratchet |
| Route decorators on the app | **35** |
| Routes in total, all sources | **36** — `dev.py` adds the inspector |
| `backend/app/routers/` | `dev.py` (extracted) + `__init__.py` only |
| Route lines outside `routers/` | all 35 |
| File-length guard on the backend | `tests/guards/backend-shape.test.js`, ceiling 400 |
| Contract guard | `tests/backend/test_route_table.py` + `tests/backend/fixtures/route-table.json` |

### Route inventory (36)

Grouped by URL prefix, which is what the Vite proxy and the route fixtures pin.

| Module | Routes |
|---|---|
| `system.py` | 2 — `GET /health`, `GET /session` |
| `solver.py` | 3 — `POST /solve/{batch,water,hops}` |
| `catalog.py` | 4 — `GET /catalog/{kind}`, `GET /catalog/{kind}/{item_id}`, `POST /catalog/{kind}`, `DELETE /catalog/{kind}/{item_id}` |
| `batches.py` | 8 — `GET /batches`, `GET|PUT|PATCH|DELETE /batches/{id}`, `POST /batches/{id}/freeze`, `GET|POST /batches/{id}/report-bundle` |
| `report.py` | 3 — `GET /report/sections`, `GET|POST /batches/{id}/report` |
| `imports.py` | 7 — `POST /imports`, `POST /imports/gapfill`, `POST /imports/match`, `GET /imports`, `GET|PATCH|DELETE /imports/{id}` |
| `brew_sessions.py` | 8 — `GET|POST /brew-sessions`, `GET|PATCH /brew-sessions/{id}`, `GET /brew-sessions/{id}/report`, `POST /brew-sessions/{id}/observations`, `PATCH /brew-sessions/{id}/observations/{obs_id}`, `POST /brew-sessions/{id}/finalize` |
| `dev.py` | 1 — already extracted; stays out of the OpenAPI schema |

## What stays in `main.py`

App-level concerns only:

- `app = FastAPI(...)`
- `_no_store` middleware
- `_rate_limited_handler` exception handler
- `include_router(...)` for every router in `app/routers/`
- the `data_dir` log line and `log_allowlist_status()`
- imports of the routers

Two helper groups move with their domain, which is why the split is clean:

| Helper | Lines | Moves to |
|---|---|---|
| `_report_spec`, `_report_response` | 328, 344 | `report.py` |
| `_import_error`, `_gemini_failure` | 453, 460 | `imports.py` |

No helper is shared across two domains today, so no `common.py` is needed.

## Decisions

### D1 — Group by URL prefix, not by OpenAPI tag

Two routes carry `tags=["report"]` but live under `/batches/{id}/report`. Grouping
by tag would scatter one domain across two files and split the `_report_*` helper
pair from the batch record CRUD.

**Decision: URL prefix wins.** `report.py` owns `/report/*` and the two
`/batches/{id}/report` render/preview routes; `batches.py` owns the record CRUD
and `report-bundle`. Both mount full literal paths, so the two modules legitimately
share a `/batches` prefix. `brew-sessions/{id}/report` stays in `brew_sessions.py`
for the same reason.

### D2 — No `APIRouter(prefix=...)`

Paths are pinned twice from outside the backend — `tests/conformance/fixtures/boundary-routes.json`
and the Vite proxy list read by `tests/guards/api-proxy.test.js`. A `prefix=`
split would hide the literal path from the decorator and invite a double-prefix
or a missing-segment bug that neither fixture reports clearly.

**Decision: `APIRouter()` with full literal paths.** The decorator is the path.

### D3 — `tach` declares per-router modules

`backend/tach.toml` currently has `app.routers` → `depends_on = ["app.artifact"]`,
which is true only of `dev.py`. New routers need `app.auth`, `app.schemas` and
`app.services`.

- *Option A* — widen `app.routers` to the union of everything. Simple, and it
  makes the package boundary meaningless.
- *Option B* — declare `app.routers.system`, `app.routers.solver`, … each with
  exactly the dependencies it uses. Matches the file's existing granularity (nine
  declared modules).

**Decision: B**, falling back to A only if `tach` rejects the granularity. Verify
with `tach check` before the first extraction, not after all seven.

### D4 — Equivalence is proved, not asserted

Two mechanical proofs, both cheap:

1. **Route-table snapshot** — already landed. It records, per route,
   `(methods, path, name, status, response_model, tags, dependencies)` and is
   compared after each phase.
2. **OpenAPI set-diff** — dump `app.openapi()` before and after; compare as sets
   keyed by `(path, method)`, not as ordered documents, because registration order
   changes when routes move between routers. `tests/backend/test_dev_inspector.py:80`
   already reads `app.openapi()["paths"]`, so the pattern is established.

Registration order also affects *path resolution*, which a snapshot cannot see
(FastAPI matches in declaration order). Existing request-level tests in
`tests/backend/test_imports.py` (static `/imports/match`, `/imports/gapfill` vs
param `/imports/{id}`) and `test_batches.py` are the check for that; they must run
green in every phase.

## Phases

| Phase | Work | Acceptance gate |
|---|---|---|
| 0. Pin | Route-table snapshot. **Complete** — 36 routes committed. | `make test` green |
| 1. Boundary | Rewrite `tach.toml` per D3 with routers still empty; `tach check`. | `make check` green |
| 2. Leaf domains | `system.py`, `solver.py`, `catalog.py` — fewest dependencies first. | Snapshot identical; `test_routes.py`, `test_catalog.py`, `test_batch_solver.py` green |
| 3. Imports | `imports.py` incl. `_import_error`, `_gemini_failure`. | Snapshot identical; `test_imports.py` green; scope route monkeypatch targets (below) |
| 4. Brew sessions | `brew_sessions.py`. | Snapshot identical; `test_brew_sessions.py`, `test_brew_session_report.py` green |
| 5. Batches, then report | `batches.py`, then `report.py` last — the `/batches/{id}/report` pair is embedded in the batch block today. | Snapshot identical; `test_batches.py`, report tests green; OpenAPI set-diff clean |
| 6. Close | Remove now-unused imports from `main.py`; add the anti-regrowth guard; update the stale doc line; lower the `main.py` size pin. | `make check` + `make test` green; `main.py` has zero route decorators |

### Must-miss-nothing migration: monkeypatch targets

`tests/backend/test_routes.py:147,163` patches through the module namespace:

```
monkeypatch.setattr("app.main.solve_batch_request", _fail)
monkeypatch.setattr("app.main.solve_water_request", _fail)
```

After phase 2 these become `app.routers.solver.solve_batch_request` /
`app.routers.solver.solve_water_request`. A stale target is not silent — the patch
call itself raises — but the message points at the patch line rather than the
move. Grep the whole suite for `"app.main.<anything>"` as the first step of phase
2, not the last.

### Anti-regrowth guard (phase 6)

Two assertions, both in the existing guard style:

1. `backend/app/main.py` contains no `@app.<method>(` decorator.
2. Every module in `backend/app/routers/` that defines a module-level `router` is
   mounted by `main.py`.

The second is the one that matters: an unregistered router is a silent 404 with
no import error, which is the standard way an extraction rots.

## Documentation

- `plans/recipe-import.md:513` says routes live in `app/main.py`; update it to the
  router module.
- No artifact change, so `make generate` is not involved and no
  `<!-- claims: … -->` declaration is needed.
- On completion this plan archives to `plans/archive/YYYY-MM/` per
  `tests/guards/archive-layout.test.js`.

## Risks

| Risk | Mitigation |
|---|---|
| A route's rate-limit dependency changes silently during the move | Route-table snapshot includes dependencies; `test_throttle.py` covers per-route classes |
| Path resolution order changes for static-vs-param siblings | Request-level tests per domain, run every phase |
| `tach` rejects per-module paths | Verify in phase 1, fall back to D3 option A |
| Registration order changes OpenAPI ordering | Compare as a set, not a document diff |
| A new router is written but never mounted | Phase 6 guard |
| A test walks `app.routes` for `APIRoute` and sees nothing | Included routers are lazy; recurse through the included router (see the amendments above) |

## Effort

Seven modules, ~35 handlers moved verbatim, one test file's patch targets, one
`tach.toml` rewrite, two doc lines, one anti-regrowth guard. Mechanical, half a
day at the outside — the guards cost more than the move, and the equivalence
snapshot is already paid for.

## Non-goals

- Splitting `main.py`'s middleware or exception handlers into modules.
- Renaming routes, adding prefixes, adding tags, or changing `response_model`.
- Reworking `*ServiceDep` aliases — they already live in `app/services/`.
- Touching `routers/dev.py`, which is already extracted and already excluded from
  the OpenAPI schema.
