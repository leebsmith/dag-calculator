# Test-coverage gaps → closure plan

Status: in progress
Scope: `make verify` is the only gate (no CI workflow). 409 semantics are in scope.

## Baseline (measured)

| Suite | Tests | Coverage |
|---|---|---|
| `node --test` | 256 pass | 86.0% lines, 81.8% branches |
| `pytest ../tests/backend` | 236 pass | 90% stmts |

Blind spots: `app/main.py` 0%, `app/repositories/batch_repo.py` 35%,
`app/database/firebase.py` 50%; `store/persistence.js` 73%;
`adapters/batchClient.js` behaviour 0%; no build gate; 4/5 seed builders
unimportable; skippable oracle/node tests.

## Decisions

1. **One 409 shape.** Every batch conflict returns
   `{"code": "CONFLICT", "message": ..., "details": {"reason": "stale"|"frozen"}}`
   so `persistence.saveNow()` reconciles on `err.code === "CONFLICT"` for both
   the stale-baseline and frozen-batch cases. `BatchConflictError` grows a
   `reason`.
2. **`make verify` = `check` + `test` + `build`**, build includes a post-build
   assertion on `frontend/dist`.
3. **Builders become importable.** Each `build-*-seed.mjs` exports a pure
   normalize function; the write happens under the CLI guard. A guard test
   rebuilds `data/sources/` into a temp dir and deep-equals `data/seeds/`.
4. **Skips are opt-in.** Oracle parity skips only when the repo is absent and
   `REQUIRE_ORACLE` is unset; `REQUIRE_ORACLE=1` (used by `make test-oracle`)
   turns absence into a failure.

## Incremental commits

1. `Document the coverage gaps and the verify gate` — this plan.
2. `Gate the frontend build in make verify` — `make build`/`verify`, post-build
   assertion, widen eslint to `tests/`.
3. `Return one 409 envelope for duplicate and frozen batch writes` — service +
   route + units.
4. `Cover the HTTP seam with route tests` — `tests/backend/test_routes.py`
   (auth 401, solver 422 envelope, 409 both reasons, 204, 404, list/get).
5. `Cover the batch CRUD wire client` — `tests/frontend/batchClient.test.js`
   (URL/method/body per op, 204, error envelope).
6. `Cover the persistence lifecycle` — open/fork/drift/freeze/restore/delete/
   autosave-failure/reconcile in `tests/frontend/persistence.test.js`.
7. `Guard Alpine handler bindings` — `tests/guards/alpine-handlers.test.js`
   resolves every called identifier in `@event` attributes against
   `createStepApp()`.
8. `Make seed builders importable and guard rebuild determinism` — export
   normalize functions in the four builders; add
   `tests/guards/seed-rebuild.test.js`.
9. `Guard repository record shaping` — `tests/backend/test_batch_repo.py` with
   a fake Firestore collection (uid scoping, sorting, ownership, freeze link).
10. `Make oracle skips explicit and add coverage targets` — `REQUIRE_ORACLE`,
    `make test-oracle`, `make coverage`.
11. `Close residual unit gaps` — `engine/validate.js`, `apiClient.js` error
    branches, `navigation.js` flush, `cards/malt.js` / `catalogDraft.js`.

## Outcome

All eleven commits landed; `make verify` is green (eslint + stylelint + ruff +
tach, 346 node tests, 263 pytest tests, vite build + dist assertions).

| Measure | Before | After |
|---|---|---|
| Node tests | 256 | 346 |
| Pytest tests | 236 | 263 |
| Frontend lines/branches | 86.0 / 81.8 | 89.9 / 84.1 |
| Backend statements | 90% | 98% |
| `app/main.py` | 0% | 100% |
| `batch_repo.py` | 35% | 100% |
| `persistence.js` | 73% | 99% |
| `batchClient.js` | 0% behaviour | 100% |
| `catalogDraft.js` | 60% | 100% |
| `userCatalogUi.js` | 47% | 99% |
| Seed builders importable | 1/5 | 5/5 |

## Remaining, deliberately deferred

- Browser-only entry (`main.js`, `firebase.js`, 0%): requires a DOM/Firebase
  harness; the build gate covers resolution, the handler guard covers wiring.
- `sha256.js` 31-50: the no-`crypto.subtle` fallback; only reachable by
  deleting a Node global.
- Card adapters below 90% lines: `yeast` (73%), `late-additions` (75%),
  `hops` (91%), `mash` (92%), `style` (82%) — mostly presentational branches.
- `engine/units.js` 87% (invalid-unit branches) and the sealed solver cores
  (`batch_solver.py` 98%, `water.py` 97%) — numeric edge branches.
- Deploy path (Cloud Run entrypoint, `uv export`, hosting rewrites/CORS) is
  still untested; `make verify` stops at the local build.
- No coverage threshold in `make verify` (baselined via `make coverage` only).

