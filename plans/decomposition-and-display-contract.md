# Decomposition & display contract

Status: **in flight**. Phases 0 (contract guards), 1 (one cell formatter), 2
(error and constraint truth), and 3 (per-row computed fields) landed; Phase 4 is
next.

This is the commit contract for a nine-phase cleanup of the things the feature
run left behind: one display rule, one error/constraint truth, one derivation
site, and four modules that outgrew their shape. Each phase names the context a
fresh session must read, the context it must **not** read, what it owns, what it
must not touch, and the gate that proves it.

Read this document, then only the context listed for the phase you are doing. Do
not read the whole repository per phase; that is the point of the split.

## 1. Why

`make check` and `make test` are green. None of this is breakage; it is debt with
a known direction of failure.

| # | Finding | Evidence | Failure mode |
|---|---|---|---|
| 1 | Five divergent "number → display string" implementations; each resolves decimals and unit symbols differently | `views/producer/table.js:36`, `scalar.js:40`, `finding.js:8`, `collection.js:16-32`, `reportFormat.js:24-40` | The report is a frozen artifact. If its formatting drifts from the screen, a printed recipe silently disagrees with the app. Five copies means every rounding change is a five-site edit. |
| 2 | The formatting contract is prose-only outside templates: 7 inline `* 100`, 6 `UNIT_SYMBOLS[...] ??` fallbacks, 24 `toFixed` in adapters | `cards/hops.js:196,204,213,241,258`, `cards/style.js:695`, `cards/malt.js:135-151` | The guardrails skill promises enforcement but only `*.html` is guarded, so the rule rots in the layer that formats most. |
| 3 | Capacity and binding-constraint knowledge lives in four places | `batch_solver.py:1711-1716`, `:1752-1774`, `:2192-2211`, `:2120-2135` | A fourth capacity limit needs four coordinated edits; miss one and `binding_constraint` silently disagrees with `BindingConstraint`. No test catches it. |
| 4 | Derived values are persisted into collection state: `grist.major_malts.pct`, `batch.sugars.resolved_mass_kg` | written by `fieldActions.js:273,280`, `draftEditor.js:111,141`, `cards/late-additions.js:289,509` | Violates vision §2. It is also why the report re-derives mass: the value has nowhere honest to live. |
| 5 | Water findings are authored twice — six `warnings.append(msg)` sites with one wording and a `TelemetryEvent` with another, reconciled by a loop | `water.py:1001,1015,1349,1365,1380,1394`; loop `:1399-1402` | Two truths for one fact, visibly different in the warning strip and the audit log. The reconciliation loop is the proof. |
| 6 | `solve_water_chemistry` is a 441-line 8-phase function with 27 inline events and user-facing prose in `core/` | `water.py:981-1406` | Phases are untestable alone; copy edits become solver edits; nothing stops the next one (ruff has no complexity rule). |
| 7 | `batch_solver.py` (2314 lines) mixes constants, errors, dataclasses, thermodynamics, four inversions, HLT, orchestration, diagnostics; the extract→sugar→guard block is copied 8× and the FG residual is evaluated twice | `:1837-1999`; guards at `:597,700,789,993,1881,1975,2208`; `brentq` lambda `:1955-1965` | The product's most load-bearing arithmetic has a copy-pasted composition rule, and `None → 0.0` can widen a bracket silently. |
| 8 | `style.js` is a 629-line single `Object.assign` (picker, envelope, ABV writes, scale pins, sliders, conformance) plus a 130-line `stylePreview` getter doing SVG projection with per-coordinate `toFixed` | `cards/style.js:86-714`, plot getter ≈`441-570` | Plot geometry is testable only through the Alpine harness; every style tweak edits a 700-line file. |
| 9 | `SolverValidationError` defined three times, byte-identical | `batch_solver.py:136`, `water.py:141`, `hop_solver.py:34` | One change, three edits; `isinstance` across boundaries depends on them staying identical. |
| 10 | `ReportBundle._cross_references` is a 130-line model validator running ten integrity checks in a schema module; `seal()` validates twice | `schemas/report_bundle.py:157-280`, `:148-154` | Transport shape and graph truth are mixed (vision §6.5); a single check cannot be tested or worded alone. |

## 2. Decisions (locked)

1. **Displayed values may change.** There is one saved batch. No byte-freeze
   requirement; the report fixture is regenerated deliberately, not preserved.
2. **Per-row values are artifact-derived.** A new `collection.fields` grammar
   feature, not host math in `reportFormat.js`.
3. **`pct` stays host-normalized.** Hamilton largest-remainder cannot be
   expressed in the artifact, and `pct` is a boundary input (`boundaryRequest.js:195`
   sends it as `w_i`). It is the documented exception, recorded in the grammar as
   the normalization policy it already is.
4. **Computed fields live on a collection-level `fields` block, never in
   `item_schema`.** `item_schema` describes authored fields only, so a stale row
   key is dropped at the seam rather than trusted.
5. **A computed row field may reference a boundary output the boundary does not
   consume**, pinned by a test rather than a new projection layer.
6. **The grammar revision moves; the payload revision does not.** Grammar 9 → 10.
   `DRAFT_SCHEMA_VERSION` stays 3, so there is no draft migration.
7. **The saved batch is re-frozen** after Phase 4 (operational check, not a commit).
8. **The Fermentables step card gains the new columns** in Phase 4; the plan is
   not report-only.
9. **Solver package splits are in scope** (`core/batch/`, `core/water/`).

## 3. Important TODO — the Alpine root

Not a phase. Add to `TODO.md`; revisit after Phase 8.

The single root is a framework requirement (`x-data`), and `installer-contract`
keeps it *correct*, but nothing keeps it *comprehensible*. Measured today:
**16 installers declare 567 keys; the assembled app exposes 440 enumerable
members plus 180 non-enumerable getters — about 620 members on one reactive
object.**

1. **Flat scope means no ownership at call sites.** `alpine-handlers.test.js`
   verifies a method exists, not that the rendering card owns it. Any partial may
   call any card's method and no guard objects.
2. **Two declaration mechanisms.** `Object.assign` (state and methods) and
   `Object.defineProperties` (reactive mirrors) co-exist; ordering and
   enumerability are bespoke per card, so the surface check covers the object only
   partially.
3. **Implicit refresh ordering.** `refreshStyleCard` / `refreshWaterCard`
   recompute whole-card state after `produce()` with no declared dependency
   between card refresh and boundary resolution.
4. **Reactive cost.** Every member sits on one proxy; the non-enumerable getters
   are invisible to `Object.keys` but still resolved on access.

Directions to evaluate when this program closes (not before): namespaced members
(`app.style.*`) so templates keep dotted access without a flat scope; one
`defineCard()` helper replacing hand-rolled `Object.assign`/`Object.defineProperties`;
extending A8 to "the partial may only reference its own card's KEYS + `fmt` +
base"; a generated ownership index from `INSTALLERS`.

## 4. Phases

Every phase assumes the previous commit is green and that the decisions in §2 are
settled. Do not re-litigate them mid-phase.

### Phase 0 — Pin the contracts (½ day)

**Goal.** Guards exist before anything moves; today's drift is baselined so each
later phase shrinks it.

**Assumed state.** Green baseline; 7 `* 100` sites, 24 `toFixed`, 6 symbol
fallbacks in `frontend/src/adapters/**`.

**Read first.** `tests/guards/css-duplication.test.js`,
`tests/guards/css-guard-util.js`, `tests/guards/css-allowlist.json` (the
allowlist pattern to copy), `tests/guards/util.js`,
`tests/guards/engine-access.test.js` (the A2 allowlist pattern),
`backend/pyproject.toml` `[tool.ruff.lint]`, `Makefile` `check:` target,
`frontend/eslint.config.js`.

**Do not read.** `frontend/src/adapters/cards/*`, `backend/app/core/*`, `docs/**`,
report templates. Nothing changes there.

**Owns.** `tests/guards/adapter-format-contract.test.js` (new),
`tests/guards/import-direction.test.js` (new), `backend/pyproject.toml`.

**Must not change.** No new dependency; guards run under the existing
`node --test` suite; allowlist entries carry a reason and fail when stale, copying
the CSS guard's semantics.

**Gate.** `make check`; `cd frontend && npm test`.

**Commit.** `Pin the adapter-format and import-layering contracts`

**Handoff.** The allowlist counts are the progress bar for Phase 1; `make check`
now fails on new violations.

**Landed.** 33 adapter-format entries (the `toFixed` / `* 100` / `Math.round`
scale-and-divide / `UNIT_SYMBOLS` families, grouped per source line) and the
three `store → adapters` imports. `backend/pyproject.toml` needed no change:
`tach` already pins the backend layering and no ruff rule expresses the frontend
contract; the guard is the enforcement point.

### Phase 1 — One cell formatter (1 day)

**Goal.** Exactly one numeric readout rule, shared by
`table`/`scalar`/`finding`/`collection`/`reportFormat`, plus card-level percent
and unit sites routed through the barrel.

**Assumed state.** Phase 0 landed; the adapter allowlist is non-empty.

**Read first.** `views/producer/table.js`, `scalar.js`, `finding.js`,
`collection.js`, `reportFormat.js`, `utils/format.js`, `utils.js`,
`views/registry/units.js`, `tests/guards/display-precision.test.js`,
`tests/guards/display-only-units.test.js`, `tests/frontend/card-display.test.js`,
`tests/frontend/report-catalog.test.js`, `tests/frontend/hops-card.test.js`,
`tests/frontend/style-card.test.js`, `tests/frontend/water-card.test.js`.

**Do not read.** Backend, `engine/*`, `store/*`, `partials/*` (templates stay as
they are), report templates.

**Owns.** `views/producer/cell.js` (new) and the five producer surfaces;
`adapters/cards/{hops,style,malt,mash}.js` for their formatting sites;
`tests/guards/adapter-format-contract.test.js` (remove entries).

**Must not change.** Unit conversion (`fromBase` / `displayValue`) stays in
`views/producer` and never enters the `utils` barrel; the formatter takes an
already-converted value. Delete `Math.round(v * 1000) / 1000` outright. No
output-freeze requirement, but regenerate `tests/conformance/fixtures/report-bundle.json`
deliberately if it moves.

**Gate.** The five frontend suites above plus `make test`; adapter allowlist
shrinks to zero.

**Commit.** `Route every numeric readout through one cell formatter`

**Handoff.** Record the new helper's path and signature in the guardrails skill's
function index. Later phases assume it exists.

**Landed.** `views/producer/cell.js` exports `formatCell(value, { decimals,
symbol }) → { display, unit }` and `cellLabel(value, { decimals, symbol, dash })`;
`table`/`scalar`/`finding`/`collection`/`reportFormat` call it, and the deleted
`views/producer/format.js` re-export shim had no other consumer. The adapter
allowlist is empty. The `unit-symbol-fallback` rule now matches only the inline
`??` fallback (`UNIT_SYMBOLS[d]?.[u] ?? u`), so `unitSymbol(UNIT_SYMBOLS, …)` —
which the rule's own fix text prescribes — is no longer a violation. The card
sites route through the barrel (`formatPercent`, `formatPercentRange`,
`toPercentValue`, `formatWithDecimals`), and `Math.round(v * 1000) / 1000` is
gone. The report-bundle fixture did not move: it is emitted from the backend
record, not the JS producer.

### Phase 2 — Backend error and constraint truth (½ day)

**Goal.** One `SolverValidationError`, one code → binding-constraint table, one
extract/sugar derivation helper.

**Assumed state.** Phases 0–1 merged; the solvers are untouched so far.

**Read first.** `core/batch_solver.py` (only: constants, `SolverValidationError`,
the eight `EXTRACT_TARGET_NON_POSITIVE` sites, `_capacity_violation`,
`_diagnose_bracket`, `_feasible_bound`, `_resolve_gravity`),
`core/water.py:141` and `core/hop_solver.py:34` (the duplicate class only),
`schemas/boundary.py:42-105` (the enums),
`tests/backend/conformance/test_boundary_error_contract.py`,
`tests/backend/conformance/test_domain_codes.py`,
`tests/backend/conformance/test_batch_solver_phase1.py` (through phase 4).

**Do not read.** Frontend, report code, the `solve_water_chemistry` body, the
renderer.

**Owns.** `core/errors.py` (new), `core/batch_solver.py`, `core/water.py`,
`core/hop_solver.py`.

**Must not change.** Arithmetic. This phase moves rules, it does not alter them.
Keep re-exported names so test imports do not churn. Every emitted code stays a
member of its enum.

**Gate.** `make test` with an unchanged oracle snapshot.

**Commit.** `Make the capacity table the only code-to-binding-constraint map`

**Handoff.** `core/errors.py` exists and the constraint table is the single edit
point for a new capacity limit. Phase 5 relies on that shape.

**Landed.** `core/errors.py` owns `SolverValidationError` (imported and
re-exported by `batch_solver.py`, `water.py`, `hop_solver.py` — one class, one
`isinstance` for all three boundaries), `CapacityLoads`, the `CapacityLimit`
table (`CAPACITY_LIMITS`: constraint, code, measured-load field, capacity
attribute, message), and `BINDING_BY_CODE`. `_capacity_loads` measures all three
loads once, `exceeded_capacity` is the single comparison, `capacity_error` the
single raiser, and `binding_constraint_for` the single code → constraint lookup,
so `_diagnose_bracket`, `_capacity_violation`, `_feasible_bound`, and
`resolve_hlt_water_budget` all read the same table. `hlt_top_up_target` exposes
the top-up expression with its association order intact. `ExtractSplit`,
`resolve_extract_split`, and `require_malt_extract` replace the repeated
extract → sugar → guard blocks; `_resolve_gravity` builds one split per pin and
guards it once (the OG branch's duplicate guard is gone). No arithmetic, wording,
or oracle moved. `test_boundary_error_contract` counts the capacity table as part
of the batch boundary's raised surface, since those codes are no longer literal
`SolverValidationError` calls; `test_domain_codes` still proves each has a
trigger.

### Phase 3 — Grammar: per-row computed fields (1 day)

**Goal.** Collections can declare row-scoped computed `fields`, separate from
`item_schema`.

**Assumed state.** Phases 0–2 merged; artifact at grammar revision 9; payload
revision 3 stays 3.

**Read first.** `docs/dag-artifacts/grammar.md` §2.2 and §2.4,
`docs/dag-artifacts/semantics.md`, `docs/dag-artifacts/expression-language.md`
(reductions), `docs/adding-a-node.md`, `engine/validate.js`, `engine/dag.js`,
`engine/domains.js`, `engine/ast.js`, `scripts/artifact-inventory.mjs`,
`scripts/emit-artifact-inventory.mjs`, `tests/guards/schema-version.test.js`,
`tests/guards/artifact-docs-sync.test.js`, `tests/guards/artifact-purity.test.js`,
`tests/guards/manifest-integrity.test.js`, `tests/guards/artifact-consumers.test.js`,
`tests/conformance/boundary-fixtures.test.js`.

**Do not read.** `adapters/cards/*`, `views/producer/*`, solver internals, the
report renderer, seeds.

**Owns.** `data/artifact.json`, `engine/validate.js`, `engine/dag.js`,
`engine/domains.js`, `docs/dag-artifacts/grammar.md`, `semantics.md`,
`expression-language.md`, `inventory.md`, `docs/adding-a-node.md`.

**Must not change.** `item_schema` stays authored-only. `fields` carry a value
spec like `derived.output`. A computed row field may reference a boundary output
the boundary does not consume; that is permitted and must be pinned by a test.
Bump the grammar only, then `make generate`, the inventory, and the `grammar.md`
header.

**Gate.** `make check`; `make test`; `make generate` produces only the expected
diff.

**Commit.** `Declare per-row computed fields on collections`

**Handoff.** The feature exists and is documented but unused. Phase 4 consumes it.

**Landed.** `collection.fields` is a map of field name → `{ inputs, expr, output }`
— the `derived` node shape without the node wrapper, with the alias `row` reserved
and bound to the element (`row.pct`) and every external value declared in
`inputs`. `validate.js` rejects a field that shadows an `item_schema` field, a
colliding input alias, a dangling input, an undeclared output dimension/taxonomy,
a malformed value spec, an unknown constant/function, and an unknown `row.*`
field; `units.js` gains `validateCollectionFields` (run from `loadArtifact`) to
infer the expression's dimension against `row`'s item schema, matching the derived
rule. `dag.js` adds one edge per field input path (so a field may read a boundary
output the boundary does not consume, while a boundary that consumes the
collection is a load-time cycle) and materializes the values into a **copy** of
each row on read — collection state keeps authored `item_schema` fields only.
Grammar 9 → 10; payload stays 3. `make generate` moved only the artifact
description/version, the inventory version line, and the report-bundle fixture
(hash + version). Tests: `tests/frontend/collection-fields.test.js` (evaluation,
non-persistence, invalidation, the boundary-output case, the cycle, and every
validation error). The inventory generator grew a
`## Collection computed fields` section that is emitted once a collection
declares a field.

### Phase 4 — Migrate rows, add card columns, re-freeze (1 day)

**Goal.** `grist_row.mass_kg` and `extract_kg` plus `sugar_row.resolved_mass_kg`
are computed fields; host writes are deleted; the report stops deriving masses;
the Fermentables card shows mass and extract.

**Assumed state.** Phase 3 merged; `collection.fields` is available; one saved
batch exists in emulator data.

**Read first.** `data/artifact.json` (the grist and sugar nodes, `grist_row`,
`sugar_row`), `views/producer/reportFormat.js`, `views/producer/projection.js`,
`views/registry/fermentables.js`, `views/steps.js` (the fermentables entry),
`partials/step-fermentables.html`, `adapters/fieldActions.js`,
`adapters/draftEditor.js`, `adapters/cards/malt.js`,
`adapters/cards/late-additions.js`, `tests/frontend/report-catalog.test.js`,
`tests/frontend/card-display.test.js`, `tests/frontend/recipes.test.js`,
`tests/backend/conformance/test_report_inputs.py`,
`tests/conformance/fixtures/report-bundle.json`.

**Do not read.** `core/batch*`, `core/water*`, the style card, the Typst
templates, auth/persistence internals, seeds.

**Owns.** `data/artifact.json`, `views/producer/reportFormat.js`,
`views/registry/fermentables.js`, `views/steps.js`,
`partials/step-fermentables.html`, `adapters/fieldActions.js`,
`adapters/draftEditor.js`, `adapters/cards/malt.js`,
`adapters/cards/late-additions.js`, `tests/conformance/fixtures/report-bundle.json`.

**Must not change.** No derived value is written into collection state. Boundary
requests may materialize computed fields at the request seam; they are not
persisted. The report reads catalog paths only. `hamiltonPct` stays for `pct` and
column normalization.

**Gate.** `make test`; regenerate the report fixture deliberately; manual
re-freeze on `make local-dev` and confirm the printed bundle matches the screen;
`validation-parity` green.

**Commits.** `Read the grain bill's mass from the artifact, not the report`, then
`Show mass and extract on the fermentables card`. Re-freezing is an operational
check, not a commit (emulator data is untracked).

**Handoff.** Every later report section reads computed fields directly.
`reportFormat.fermentableRows` no longer exists.

### Phase 5 — `core/batch/` package (2 days)

**Goal.** The 2314-line module becomes a package along its existing phase
boundaries, behind a re-export shim.

**Assumed state.** Phases 0–4 merged; the constraint table is centralized; the
oracle snapshot is green.

**Read first.** `core/batch_solver.py` (section map only: constants → inputs →
composition → volumetric → grist → cascade → HLT → orchestration → diagnostics),
`core/errors.py`, `tests/backend/test_batch_solver.py`,
`tests/backend/conformance/test_batch_solver_phase1.py` through `phase4`,
`test_batch_solver_orchestration.py`, `test_batch_solver_helpers.py`,
`test_numeric_parity.py`, `backend/tach.toml`.

**Do not read.** Water or hop solvers, frontend, report code, docs beyond the
`domain-equations.md` citations already in the docstrings.

**Owns.** `core/batch/` (new package), `core/batch_solver.py` (shim, then
removal), `backend/tach.toml` if a module path is added.

**Must not change.** No arithmetic changes. Keep `batch_solver.py` exporting every
current public name until imports migrate in the follow-up commit.

**Gate.** Identical test results and an unchanged oracle snapshot, both before and
after the shim removal.

**Commits.** `Split the batch solver into phase modules`, then
`Point imports at the batch solver package`.

**Handoff.** Record the module map. The same recipe now applies to water.

### Phase 6 — `core/water/` package and findings channel (2–3 days)

**Goal.** Split the 1422-line module; decompose the 441-line
`solve_water_chemistry` into phases; replace 27 inline events with per-code
factories; make events the only findings source.

**Assumed state.** Phase 5 merged; errors are centralized.

**Read first.** `core/water.py` (module map, `solve_salt_dose`,
`solve_water_chemistry`, the six `warnings.append` sites, the sync loop),
`tests/backend/conformance/test_water_matrix.py`,
`test_water_chemistry_core.py`, `test_water_routing.py`,
`test_water_telemetry_contract.py`, `tests/backend/test_water_fuzz.py`,
`Makefile` `test-fuzz:`.

**Do not read.** Batch solver internals, frontend, report code, the frozen ADSCO
specs in `docs/adsco/`.

**Owns.** `core/water/` (new package), `core/water.py` (shim, then removal),
`backend/tach.toml` if a module path is added.

**Must not change.** No message changes meaning while moving. `warnings` and
`notes` are derived from events and the reconciliation loop is deleted. Telemetry
codes stay members of the declared surface.

**Gate.** The four water suites plus `make test-fuzz CASES=200`; message equality
asserted once, centrally.

**Commit.** `Split the water solver and make telemetry the only findings channel`

**Handoff.** Record the per-code factory module path. Adding a finding is now one
factory edit.

### Phase 7 — Style card (1–2 days)

**Goal.** Plot projection becomes a pure module; the 629-line installer splits.

**Assumed state.** Phases 0–6 merged; the cell formatter is in use.

**Read first.** `adapters/cards/style.js`, `engine/fermentation.js`,
`partials/step-style.html`, `adapters/contract.js`, `adapters/installers.js`,
`tests/frontend/style-card.test.js`, `tests/guards/installer-contract.test.js`,
`tests/guards/determinism.test.js`, `tests/guards/engine-read-mirrors.test.js`.

**Do not read.** The water or hop cards, the solver packages, report code, CSS.

**Owns.** `views/producer/stylePlot.js` (new), `adapters/cards/style.js` plus new
`adapters/cards/style/` modules, `adapters/installers.js`.

**Must not change.** No new app members; this is a split only. Each new module
exports `KEYS`. Geometry stays in `engine/fermentation.js`; projection and
formatting move to `views/producer/stylePlot.js`. The plot model stays
precomputed, so templates never measure.

**Gate.** `style-card`, `installer-contract`, `determinism`, `make check`.

**Commit.** `Move the style plot out of the card adapter`

**Handoff.** Record the new KEYS ownership list. This phase is the worked example
for the Alpine-root TODO in §3.

### Phase 8 — Bundle integrity (½ day)

**Goal.** The 130-line model validator becomes named checks in a service;
`seal()` validates once.

**Assumed state.** Phases 0–7 merged; the bundle format is current.

**Read first.** `schemas/report_bundle.py`, `services/report_bundle_service.py`,
`tests/backend/test_report_bundle_fixture.py`,
`tests/backend/conformance/test_report_bundle.py`,
`test_report_bundle_fixture.py`, `docs/report-renderer.md` (bundle section),
`scripts/describe-report-bundle.mjs`.

**Do not read.** Renderer internals, Typst templates, frontend, solvers.

**Owns.** `services/bundle_integrity.py` (new), `schemas/report_bundle.py`.

**Must not change.** Every existing error message survives verbatim. The validator
stays fail-closed. Sealing still stamps a canonical hash.

**Gate.** `make test`, plus one per-check test for the two checks that have no
direct coverage today.

**Commit.** `Split bundle integrity out of the schema module`

## 5. Report sections, re-sequenced

Hop sections still wait on the schedule-derived IBU split, as `TODO.md` already
says. **Every remaining section sits after Phase 4** — Mash rests, Salt dosing,
Water chemistry, Pinned ions, and Style conformance would otherwise each
re-derive values in `reportFormat.js` the way the extract table did. The brew-day
checklist enhancement stays last.

## 6. Deferred, deliberately

CSS split · single Alpine root · KEYS arrays · JS/Python stub merge ·
`utils/format.js` split · `pct` derivation · seed-builder `seed-io.mjs` ·
`main.py` 409 envelope shape.

The Alpine root itself is not deferred as a *concern*; it is captured in §3 as the
next program after this one.
