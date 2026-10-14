---
title: Step D — JSON Seam End-to-End
step: D
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [Step A]
blocks: [Step E]
gate: adapter assembles full requests, flattens responses, maps errors; engine stays sync; make check/test green
status: done
completed: 793ee84
---

# Step D — JSON Seam End-to-End

> **Update:** the assumption below ("the artifact's declared `inputs` … match
> `boundary.py`") turned out to be false — grain-bill/water-grist rows and the
> nested `IonProfile`s need an explicit mapping layer. See
> `plans/step-D2-boundary-requests.md` for the request adapter, grist
> normalization, and HTTP opt-in that complete this step.

**Goal:** replace the MWE's stub boundaries with the real seam — the browser
assembles the full `BatchSolverRequest`/`WaterSolverRequest`, POSTs JSON to
FastAPI, and maps the response back into the engine's flattened output keys, with
the error surface (`SolverErrorResponse`) surfaced. **The engine stays pure &
synchronous**; async I/O lives entirely in the adapter.

## Design: async I/O around a sync engine
The engine's boundary resolution is synchronous. HTTP is not. Resolution:
**pre-resolve the boundary cache**, then evaluate derived nodes synchronously.

```
adapter.solve():
  for nodeId in topoOrder where kind==="boundary":      # batch before water
    { binding, inputs, fingerprint } = engine.boundaryRequest(nodeId)
    if engine.hasBoundaryResult(fingerprint): continue
    response = await postJSON(urlFor(binding), inputs)  # full Pydantic request
    engine.applyBoundaryResult(fingerprint, flatten(response))
  # now engine.get(...)/resolve(...) are pure & sync (cache hits)
```

- `boundaryRequest(nodeId)` resolves the node's declared `inputs` to a plain
  object (the request body), and computes the **canonical fingerprint** of it.
- `applyBoundaryResult(fingerprint, outputs)` seeds the engine's boundary cache.
- `flatten(response)` deep-flattens the nested Pydantic response to the artifact's
  **dotted** output keys (`cascade.v_strike`, `hlt.v_hlt_debt`, `grist_buckets_kg.BASE`).
- Topological order guarantees `solver.batch` outputs are cached before
  `solver.water` (whose inputs derive from them).

## Steps

### D.1 — Engine seam API (`frontend/src/engine/dag.js` + `index.js`)
- `boundaryRequest(nodeId) -> { binding, inputs, fingerprint }`.
- `applyBoundaryResult(fingerprint, outputs)` / `hasBoundaryResult(fingerprint)`.
- No change to the sync evaluation path; a boundary evaluated without a cached
  result still throws (signals "not pre-resolved").

### D.2 — HTTP client (`frontend/src/adapters/apiClient.js`)
- `postJSON(url, body) -> response`; non-2xx → throw a typed `SolverError`
  carrying `{ code, message, details }` from `SolverErrorResponse`.
- `flattenResponse(obj) -> { "a.b": value, ... }` (deep-flatten; leaves pass through).
- Base URL from `import.meta.env.VITE_API_BASE` (default `""` → same-origin).

### D.3 — Async adapter (`frontend/src/adapters/engineAdapter.js`)
- `async solve()` implementing the pre-resolution loop; boundary URL map
  `{ batch_sparge_solver: "/solve/batch", water_chemistry_solver: "/solve/water" }`.
- Keep the stub path for offline/MWE (a `boundaries` mode flag); HTTP is opt-in via
  a config/env. Stubs remain the default for `npm run dev` without a backend.
- Surface per-boundary status: `{ id, state: pending|ok|error, code? }`.

### D.4 — Dev proxy (`frontend/vite.config.js`)
- Proxy `/solve` (and `/api`) → `http://127.0.0.1:8000` so the SPA shares an origin
  with FastAPI in `make local-dev` (avoids CORS).

### D.5 — Tests (mock fetch; no network)
- `tests/frontend/adapter.test.js`: inject a fake `fetch`; assert the adapter
  assembles the **full** request bodies (all declared inputs), calls the right
  URLs in topo order, flattens the nested response into dotted keys, and the engine
  then resolves derived + relation/domain nodes. Assert `SolverErrorResponse` →
  typed error surfaced (status `error`).
- Keep `tests/conformance/parity.test.js` green (engine unchanged).

### D.6 — Docs
- `tech-stack.md` seam note: the route paths are `/solve/batch` and `/solve/water`
  (the legacy `/api/solve-*` convention is retired; the Vite proxy bridges dev).
- `TODO.md`: note real Firebase auth on the routes is still deferred.

## Out of scope (recorded)
Rich boundary-status UI (Step E) · real Firebase auth · persistence/freeze (Step F)
· seed/schema conformance (Step G) · map/dict value type · boolean input · list
literals · `max`.

## Gate (definition of done)
- Adapter assembles full requests, flattens responses, maps errors — verified with
  a mocked fetch (no network).
- Engine remains sync/pure; `make check` and `make test` green.

## Risks
- **Route-path drift:** legacy UI used `/api/solve-batch`; backend exposes
  `/solve/batch`. The adapter + Vite proxy standardize on `/solve/*`.
- **Request-shape drift:** the request body must match `BatchSolverRequest`
  field-for-field; the engine's `boundaryRequest` uses the artifact's declared
  `inputs`, which Step A verified match `boundary.py`.
- **Fingerprint:** computed over the request inputs; identical to the backend's
  `canonical_fingerprint` (Step A parity test).

## Program context
A → B → C ‖ **D** → E; Steps F/G parallel.
