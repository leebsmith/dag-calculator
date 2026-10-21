---
title: Complexity Refactor — Seven Risks, Sequenced
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
status: proposed
gate: seven risks closed in order; legacy paths removed; frontend gates fail the build; DRY helpers carry the AI AGENT HOOKS comment; lint + tests + build green
---

# Complexity Refactor — Seven Risks, Sequenced

Address the seven risks from the code-complexity assessment, in order, with
scoped commits between them. Legacy paths are removed first as a prerequisite.
No stage begins until the previous stage's acceptance criteria are met.

## Baseline

Measured before this plan:

- ~12.2k lines frontend, ~3.0k lines backend, ~6.1k lines tests.
- Artifact: 96 nodes, 13 functions, 42 constants.
- Test suite: 234 frontend tests and 192 backend tests passing.

Complexity is concentrated in the frontend composition seam and in duplicated
JS/Python numeric and wire contracts. The DAG runtime, artifact schema, seed
builders, and backend layering are proportionate and are not refactored here.

## Global execution rules

1. **Order is binding.** Stage 0 is a prerequisite; risks 1–7 follow in the
   original order. Do not start a later stage while an earlier stage is open.
2. **One scoped commit per named commit below.** Imperative subjects. Do not
   combine unrelated refactors with behavior changes.
3. **Gates.** After Stage 3, every commit must pass both `make check` and
   `make test` before the next commit. Before Stage 3, run `cd frontend &&
   npm test` and `cd backend && uv run pytest ../tests/backend/` explicitly.
4. **No dependency changes** to `package.json` or `pyproject.toml`.
5. **Artifact is canonical.** No artifact change is expected in any stage. If a
   stage discovers one is necessary, that commit must also run
   `node scripts/emit-artifact-inventory.mjs` and update the affected living
   docs.
6. **Extraction commits are behavior-preserving.** Stage 5 in particular must
   not change the app-facing method names used by partials and tests.
7. **Legacy references in `plans/` are history.** Do not rewrite them when the
   code path is deleted.

## DRY helper comment convention

New production functions, methods, and classes whose purpose is to remove
duplicated logic must carry the following comment immediately above the
declaration, after any module-level docstring.

JavaScript:

```js
// AI AGENT HOOKS: Use this function/method/class for [describe functions]. Do not duplicated this logic elsewhere
```

Python:

```python
# AI AGENT HOOKS: Use this function/method/class for [describe functions]. Do not duplicated this logic elsewhere
```

Rules:

- Replace `[describe functions]` with the concrete responsibility, for example
  “resolving the live engine”, “normalizing draft rows”, “building the boundary
  request body”, or “computing frozen valuation entries”.
- Preserve the wording verbatim, including “Do not duplicated this logic
  elsewhere”.
- Do not add it to existing functions that are merely moved, trivial wrappers,
  unrelated additions, or test helpers. A shared test helper gets the comment
  only when the helper itself replaces duplicated test logic.
- This is an explicit exception to the repository rule against code comments.
- Final audit: `rg "AI AGENT HOOKS"` finds every new DRY helper introduced by
  this plan, and no such helper lacks the comment.

Expected applications: the live engine accessor (Stage 1), declarative boundary
mapping and shared contract helpers (Stage 4), `session`, `boundaryRunner`,
`draftEditor`, unit-preference actions, and `snapshot` (Stage 5), producer and
registry helpers (Stage 6), and the frozen valuation shape helper (Stage 7).

---

## Stage 0 — Remove legacy paths (prerequisite)

The legacy `engineAdapter` is not the product path, but it owns tests that must
be preserved before deletion.

### Commit 0.1 — `Port the remaining legacy adapter coverage to the step adapter`

- Move the `flattenResponse` tests from `tests/frontend/adapter.test.js` into a
  new `tests/frontend/apiClient.test.js`.
- Add missing step-adapter coverage to `tests/frontend/step-boundaries.test.js`:
  - a debounced burst collapses into one batch + one water request;
  - concurrent `solveNow()` calls dedupe by fingerprint;
  - a superseded solve discards its result.
- Keep the existing boot, solver-error, and request-body coverage.

**Acceptance:** the step adapter covers every behavior currently asserted only
against the legacy adapter; `npm test` is green before deletion.

### Commit 0.2 — `Remove the legacy MWE adapter and page`

- Delete `frontend/src/adapters/engineAdapter.js`.
- Delete `frontend/mwe.html`.
- Delete `tests/frontend/adapter.test.js`.
- Remove the `createCalculatorApp` import and the `Alpine.data("calculator",
  ...)` registration from `frontend/src/main.js`.
- Remove the `mwe` input from `frontend/vite.config.js`.
- Remove `mwe.html` from `frontend/purgecss.config.js`.

**Acceptance:** `npm run build` emits only the product entry; `rg
"engineAdapter|createCalculatorApp|mwe"` returns nothing outside historical
plans; `npm test` is green.

---

## Risk 1 — Stale engine in card closures

`cardCtx` captures the engine once, while `loadState` and `teardown` replace the
closure variable. Cards then read stale state.

### Commit 1.1 — `Bind card state to the current engine`

- Add `tests/frontend/step-lifecycle.test.js` covering `loadState` and
  `teardown` across the affected cards:
  - style selection, envelope, region, and target values;
  - mash rests and derived mash readouts;
  - hop rows;
  - yeast selection;
  - draft rows.
- Replace the captured engine in `cardCtx` with a live accessor or stable
  facade. Cards must resolve the engine at call time, not registration time.
- Update every `refresh*Card` function to read the live engine.
- Add the `AI AGENT HOOKS` comment to the accessor or facade.

**Acceptance:** after `loadState({ roots: { "batch.style_id": "21A" } })`, the
style card reflects `21A`; after loading custom `mash.rests`, `mashRests`
reflects the loaded collection; `teardown` restores baseline card state.

---

## Risk 2 — Boundary solves close open editors

`stepAdapter.solveNow` currently calls `closeDraft()` and clears drawers after
every HTTP solve. Production always uses HTTP.

### Commit 2.1 — `Keep draft editors open across boundary solves`

- Remove the draft/drawer reset block from the solve path.
- Keep editor closure in explicit actions only: save, cancel, open another
  draft, teardown.
- Add HTTP-mode regression tests:
  - opening a draft, editing a root, and completing a solve leaves the draft and
    its rows intact;
  - a failed solve also leaves the editor intact;
  - `saveDraft` and `cancelDraft` still close it.

**Acceptance:** no `closeDraft`, `maltDrawer = null`, or `sugarDrawer = null`
remains in `solveNow`; regression tests fail if the block returns.

---

## Risk 3 — Build gates do not gate

`Makefile:55` ignores frontend lint failures and `Makefile:62` ignores
frontend test failures.

### Commit 3.1 — `Fail the build when frontend checks fail`

- Remove `|| true` from both recipes.
- Keep frontend checks ahead of backend checks. Make may fail fast, but it must
  return non-zero.
- Update `README.md` only if the documented command behavior needs
  clarification.

**Acceptance:** temporarily introduce a failing frontend test and a lint error;
confirm `make test` and `make check` exit non-zero; remove the probes.

---

## Risk 4 — Duplicated numeric and wire contracts

ASBC/Cutaia formulas, shared constants, canonical JSON, and boundary field
lists exist independently in the artifact, JS engine, and Python backend.

### Commit 4.1 — `Pin shared solver constants to the artifact`

- Add a backend contract test that loads `data/artifact.json` and compares every
  duplicated Python constant:
  - `GAMMA_METRIC` ↔ `sucrose_yield_ldk`;
  - `V_BAR_METRIC` ↔ `v_bar`;
  - `K_ABS_TRUE_METRIC` ↔ `k_abs_true`;
  - `RHO_WATER_METRIC` ↔ `rho_water`;
  - `F_SHRINK_DEFAULT` ↔ `default_shrinkage_fraction`;
  - water constants including bicarbonate equivalent weight, calcium floor,
    mash-pH window, and default mash pH.

**Acceptance:** changing either side alone fails the backend suite.

### Commit 4.2 — `Add cross-runtime numeric parity fixtures`

- Add a shared fixture covering ASBC Plato↔SG, Cutaia ABV, maximum achievable
  ABV, and the Phase 1 SG-from-ABV inverse.
- Add a JS test evaluating the artifact functions against the fixture.
- Add a Python test evaluating `app.core.utils` and `app.core.batch_solver`
  against the same fixture.
- Add the `AI AGENT HOOKS` comment to any new shared pure helper.

**Acceptance:** changing one runtime's coefficient or formula fails the other
runtime's test.

### Commit 4.3 — `Share canonical JSON fingerprint vectors`

- Extract the existing golden strings into one fixture consumed by
  `tests/frontend/boundary.test.js` and `tests/backend/test_fingerprint.py`.
- Add edge cases: integral floats, `-0`, exponent boundaries, non-finite
  values, unicode strings, and nested objects.
- Keep current fingerprints unchanged.

**Acceptance:** both runtimes produce byte-identical canonical JSON and
fingerprints for every vector.

### Commit 4.4 — `Enforce the boundary field contract end to end`

- Replace the hardcoded builder field list with one declarative
  alias/path/wire-name map per binding.
- Extend `tests/guards/boundary-inputs.test.js` from “reads are declared” to
  “reads exactly equal declared inputs”.
- Add a backend fixture/test asserting that wire keys exactly match the
  Pydantic model fields.
- Add the `AI AGENT HOOKS` comment to the declarative mapping helper.

**Acceptance:** adding or removing a boundary input requires one mapping update;
omitting it fails both suites.

### Commit 4.5 — `Document the cross-runtime contract`

- Add a living-doc section to `docs/engine.md` describing the artifact, solver,
  and boundary-adapter runtimes, which constants and formulas are shared, and
  which fixtures pin them.

**Acceptance:** a maintainer can identify the single test surface for each
shared value or formula.

---

## Risk 5 — `stepAdapter` is a god object

These commits are behavior-preserving extractions. Stage 1's accessor is
intentionally minimal; this stage replaces it with a formal session object.

### Commit 5.1 — `Extract the engine session from the step adapter`

- Create `frontend/src/adapters/session.js` owning engine construction,
  rebuilding, topological order, boundary nodes, and the live engine accessor.
- Remove all `createCalculator` calls from `stepAdapter`; they live only in the
  session module.
- Update card context to use the session.
- Add the `AI AGENT HOOKS` comment to the session factory and accessor.

**Acceptance:** no engine construction remains in `stepAdapter`; Stage 1
lifecycle tests pass unchanged.

### Commit 5.2 — `Extract the boundary solve runner`

- Create `frontend/src/adapters/boundaryRunner.js` owning debounce, solve token,
  in-flight dedupe, statuses, and error state.
- `solveNow` and `scheduleSolve` delegate to the runner.
- Add the `AI AGENT HOOKS` comment to the runner factory.

**Acceptance:** Stage 0 debounce/dedupe tests and Stage 2 editor tests pass
unchanged.

### Commit 5.3 — `Extract draft editor state`

- Move draft state, open/close/save, normalization, cell edits, and draft-row
  helpers into `frontend/src/adapters/draftEditor.js` (or
  `frontend/src/store/draftEditor.js` if it owns no adapters).
- Preserve app-facing method names so partials and tests do not churn.
- Add the `AI AGENT HOOKS` comment to the editor factory and normalization
  helpers.

**Acceptance:** draft-card tests pass without changes to partials.

### Commit 5.4 — `Extract unit preference actions`

- Move `setUnit`, `resetUnits`, `toggleFieldUnit`, and unit-mode persistence
  into a small adapter module; keep app methods as thin delegates.
- Add the `AI AGENT HOOKS` comment to the unit-actions factory.

**Acceptance:** unit menu and per-field override tests pass.

### Commit 5.5 — `Extract the snapshot seam`

- Move `draftState`, `freezePayload`, and `detectDrift` into
  `frontend/src/store/snapshot.js`.
- Add the `AI AGENT HOOKS` comment to the snapshot factory.

**Acceptance:** persistence and drift tests pass; Stage 7 has one place to
change the frozen shape.

### Commit 5.6 — `Reduce the step adapter to composition`

- `createStepApp` creates the session, runner, editor, unit actions, and
  snapshot helpers, registers cards, and returns the app surface.
- Remove leftover private helpers that now belong to an extracted module.

**Acceptance:** `createStepApp` is under roughly 250 lines; no engine
construction, solver timer, draft normalization, or unit persistence logic
remains in it.

---

## Risk 6 — Domain/presentation leakage

`producer.valuate` and card modules hardcode node ids and cross-cutting rules.
The artifact remains canonical; presentation metadata moves to the registry.

### Commit 6.1 — `Move field special cases into presentation metadata`

- Move `CONFORMANCE_FIELD_MAP`, the intensive-value polymorphic mode, the
  target-ABV max hint, and the HLT clamp bounds out of `producer.valuate` and
  `stepAdapter.clampToSelection`.
- Put them in `frontend/src/views/registry/` as presentation metadata.
- Keep the artifact unchanged.
- Add the `AI AGENT HOOKS` comment to any new metadata lookup helper.

**Acceptance:** the special cases are data, not branches keyed by literal id.

### Commit 6.2 — `Split the producer into projection and valuation modules`

- Separate static projection from dynamic valuation behind a thin barrel that
  preserves the current public exports.
- Add the `AI AGENT HOOKS` comment to the new projection and valuation
  entry points.

**Acceptance:** no projection function exceeds roughly 60 lines or complexity
20.

### Commit 6.3 — `Split scalar, table, and collection valuators`

- Move scalar resolution, readout-table valuation, collection display
  conversion, provenance decoration, and conformance decoration into separate
  modules.
- Add the `AI AGENT HOOKS` comment to each extracted valuator.

**Acceptance:** `valuate` is an orchestrator, not a 168-line branch tree.

### Commit 6.4 — `Centralize card node ids in registries`

- Move literal node ids in the style, mash, hops, yeast, and late-addition
  cards into their registry/config modules.
- Keep a small `frontend/src/views/registry/system.js` for genuinely
  cross-cutting ids used by the adapter.

**Acceptance:** cards read ids from registry/config objects rather than inline
string literals.

### Commit 6.5 — `Guard presentation literals and document host rules`

- Add `tests/guards/presentation-ids.test.js` forbidding literal `slice.node`
  ids in `frontend/src/views/producer/**` and
  `frontend/src/adapters/cards/**`; registry modules are the allowed home.
- Add a `docs/engine.md` / `docs/adding-a-node.md` section listing which rules
  are artifact-owned and which are intentionally host-side: Hamilton, Tinseth,
  style conformance, seed derivations, and fermentation geometry.

**Acceptance:** the guard fails on a newly introduced literal; the docs make
host-rule ownership explicit.

---

## Risk 7 — Frozen valuation stores engine internals

`freezePayload` stores `{ outputs, fingerprint }` for boundary nodes instead of
their outputs. `TODO.md` already flags the shape.

### Commit 7.1 — `Freeze boundary outputs instead of cache wrappers`

- In the snapshot module, store `engine.get(id).outputs` for boundary nodes.
- Add a contract test defining the frozen valuation:
  - every node id is present;
  - boundary entries are plain output maps;
  - no `outputs` or `fingerprint` wrappers;
  - every value is JSON-serializable and finite.
- Update `tests/frontend/realized-vitals.test.js`, which currently encodes the
  wrapper shape.
- Add a `valuation_format` marker to the frontend payload and the backend
  `FreezePayload` / `BatchRecord` schemas. New freezes emit the new format;
  missing format is treated as the legacy shape for future read paths.
- Update `docs/dag-artifacts/semantics.md` §3.2 and the persistence schema
  docstring.
- Remove the completed freeze-shape item from `TODO.md`.
- Add the `AI AGENT HOOKS` comment to the frozen-value helper.

**Acceptance:** a frozen batch contains no engine cache internals; fork still
works because it reads roots and collections, not valuation; the shape contract
test fails if a wrapper returns.

---

## Final verification

- `make check && make test` green.
- `cd frontend && npm run build` green, with only the product entry emitted.
- `rg "engineAdapter|createCalculatorApp|mwe"` clean outside historical plans.
- A deliberately failing frontend test makes `make test` fail; a deliberately
  failing lint rule makes `make check` fail.
- `rg "AI AGENT HOOKS"` finds every new DRY helper introduced by this plan.
- Artifact inventory unchanged unless an artifact edit was explicitly
  introduced.

## Out of scope

- Artifact grammar, engine evaluation, seed builders, and `tach` layering.
- The lower-severity debt not part of the seven risks: consolidating the three
  schema validators, persistence conflict merge (M3), and deployment config.
- New features listed in `TODO.md`.
