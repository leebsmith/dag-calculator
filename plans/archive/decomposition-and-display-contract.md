# Decomposition & display contract

Status: **closed**. Phases 0 (contract guards), 1 (one cell formatter), 2
(error and constraint truth), 3 (per-row computed fields), 4 (row migration),
5 (`core/batch/`), 6 (`core/water/` + one findings channel), 7 (the style
card split), and 8 (bundle integrity) landed. The follow-on program — the Alpine
root, §3 — is the next TODO.

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
rule. `dag.js` gives each field input a **read-side** edge (a `dependents` entry,
not an `adjacency` one) and resolves it in authored mode, so a field may read the
very boundary its collection feeds. The values are materialized into a **copy** of
each row on read; collection state keeps authored `item_schema` fields only.
(Phase 4 amended the edge rule from the original "one edge per input / cycle";
the motivation is recorded there.)
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

**Commits.** `Let computed row fields read the boundary they feed` (the engine
amendment Phase 3's edge rule required), then
`Read the fermentable masses from the artifact` (the row migration and the card
columns). Re-freezing is an operational check, not a commit (emulator data is
untracked).

**Handoff.** Every later report section reads computed fields directly.
`reportFormat.fermentableRows` no longer exists.

**Landed.** The batch boundary consumes both collections (`grain_bill`,
`s_late_add_request` → `batch.sugars`), so a row field reading `solver.batch`
closed a load-time cycle under Phase 3's edge rule. Nothing in the phase could
work until that was amended, so `dag.js` now treats every field input as a
**read-side** edge and resolves it in **authored mode** — the same mode every
boundary request uses (`resolveBoundaryInputs`). That makes "a request never
carries a derived row value" structural rather than a convention, and it lets a
field read the boundary it feeds because the boundary reads the authored rows.
`getAuthored` exposes the authored read; the producer's collection valuator and
`refreshMaltCard` fall back to it when a boundary is unresolved or failed, so the
authored rows still render.

`grist.major_malts.fields.mass_kg` is `m_grist × pct`; `extract_kg` is
`mass × yield × (1 − moisture)` with `batch.grain_moisture_fraction` as the
fallback for a row without a moisture figure — the boundary's own `mc_i` rule —
expressed as `mass·yield − mass·yield·moisture` because the dimension algebra has
no `1 − fraction`. `batch.sugars.fields.resolved_mass_kg` carries the share-mode
allocation (`(parts / parts_total) × budget / yield`) and falls back to the
authored dose. `sugar_row.resolved_mass_kg` left `item_schema`.

`reportFormat.fermentableRows` is gone: `buildReportTables` / `buildReportSummaries`
read `mass_kg`, `extract_kg`, and `resolved_mass_kg` from the catalog (the sugar
extract is still `mass × yield`). The sugar amount column now takes the resolved
field's precision, so a 0.5 kg sugar prints `0.50 kg`. Host writes are deleted:
`refreshLateAdditionsCard` no longer records resolved masses,
`adoptLateAdditionShare` writes only the authored dose, and the draft editor
previews the allocation (`draftResolvedRows`) instead of stamping it into scratch
rows. `resolveCollectionColumns`, `buildReportCatalog`, and the backend bundle
validator's `_resolves` all accept computed-field paths.

The Fermentables card gained Mass and Extract columns (`refreshMaltCard` formats
them in the mass display unit). Outstanding: the operational re-freeze on
`make local-dev` (emulator data is untracked) and confirming the printed bundle
matches the screen.

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

**Landed.** `app.core.batch` is ten modules in pipeline order — `constants`
(physical constants + `sugar_extract_for`), `inputs` (`GrainBillEntry`,
`BatchSolverInput`), `helpers` (the composites and shared volumetric
primitives), `composition` (Phase 1 and 1b), `volumetric` (Phase 2), `grist`
(Phase 3), `cascade` (Phase 4), `hlt`, `orchestration` (result types, scale-pin
resolution, pipeline, `solve_batch`, the feasible bound), and `diagnostics`
(capacity loads, bracket diagnosis). The map is the package docstring's table.
The first commit left `batch_solver.py` as an explicit `__all__` shim; the
second pointed the service and every test at the owner modules and deleted it.
`composition` owns the extract split's *use* while `ExtractSplit` itself stayed
in `volumetric` (its own phase), so composition imports Phase 2 — the split is
their shared seam rather than a backwards dependency. `_capacity_violation`
stayed beside `_Pipeline` in `orchestration` (its argument type) so diagnostics
never imports the pipeline; `_capacity_loads` and `_diagnose_bracket` moved out.
No arithmetic moved: an AST comparison proves all 73 top-level statements are
byte-identical to the pre-split module, `test_boundary_error_contract` now walks
the package directory for raise sites, and `make test` reports the same 692
passed / 1 skipped with an unchanged oracle fixture before and after the shim
removal. Two living docs that named the old path now name the package
(`domain-equations.md` §2, `calculator-assumed-dosing-practice.md` §3).

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

**Landed.** `app.core.water` is nine modules in pipeline order — `constants`
(physical constants and table lookups), `telemetry` (`TelemetryEvent`, one
factory per finding code, the `TELEMETRY_CODES` declared surface,
`derive_findings`), `inputs` (`GrainEntry`, `WaterChemistryInput`), `chemistry`
(grist acidity, residual alkalinity, the bounded mash-pH model, acid/alkaline
dosing), `salts` (`SaltDose`, dose-to-ion stoichiometry), `router` (the AUTO
classifier), `engines` (the two LPs and the least-squares cloner), `dosing`
(`solve_salt_dose`), and `orchestration` (`WaterChemistryOutput`, the phases,
`solve_water_chemistry`). The map is the package docstring's table; `water.py`
is deleted and every importer names its owner module, so `tach.toml` needed no
change.

`solve_water_chemistry` is now orchestration over named phases: `_gate_inputs`
(volume gates, contaminants, floor override), `_stage1_ions` (post-salt mash/HLT
vectors), `_resolve_mash_correction` (the pH inversion and the stage-2 acid or
alkaline demand, returned as a `MashCorrection`), `_post_dose_ions` (the
corrected vector and predicted pH), `_emit_mash_findings`, `_resolve_sparge_acid`,
`_resolve_allocations`, and `_emit_operational_findings`. The boundary function
composes them; it no longer contains chemistry, prose, or event literals.

Findings have one truth. Every message is a factory in `core/water/telemetry.py`
and `warnings`/`notes` are `derive_findings` projections of the event stream —
the `warnings.append` sites and the end-of-function reconciliation loop are
deleted. The four duplicate wordings it existed to paper over are gone: the short
HLT-surplus, magnesium, and sulfate warnings and the short "calcium floor
unreachable with pinned flavor targets" note each collapse into their canonical
event message. The bare calcium-floor audit becomes
`GUARDRAIL_CALCIUM_BELOW_FLOOR` (so the finding survives the channel change), the
cloner/sparse fallback notes become `OPT_CLONE_CONSTRAINT_RELAXED` and
`OPT_SPARSE_EQUALITIES_ONLY`, and the LP fallback note folds into the existing
`OPT_LP_RELAXATION_APPLIED`. `solve_salt_dose` keeps its three-tuple signature,
with `notes` now projected from the events it emitted.

No arithmetic moved: a 19,440-case sweep (beers × waters × targets × strategies ×
pH targets × agents × acids × distributions × floors) matches the pre-split
module on every numeric field, and every pre-split telemetry `(code, message)`
pair is still emitted. `make test` is 694 passed / 1 skipped — the previous 692
plus the two new contract tests — and `make test-fuzz CASES=200` is green. The
central assertion is
`test_warnings_and_notes_are_the_telemetry_projection` (the findings policy is
restated once, independently, and compared against every case);
`test_emitted_codes_are_members_of_the_declared_surface` pins the vocabulary.

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

**Landed.** `views/producer/stylePlot.js` exports
`stylePlotModel({ region, point, safestPoint, pin, target })`, returning the model
the template binds or `null` when there is nothing to draw. It owns the fixed
320 px square, its margins, the tick ladder, the polyline builder, and every label
format; the region vertices, contours, and composition locus still come from
`engine/fermentation.js`. `tests/frontend/style-plot.test.js` exercises it without
the Alpine harness: the three pin geometries, the unpinned case, the degenerate
region, and the projected coordinates and summary.

`adapters/cards/style.js` is now a composition root (~20 lines) over four modules
under `adapters/cards/style/`, each exporting `KEYS`. The split is a partition of
the old member list — no app member was added, renamed, or dropped; the declared
KEYS gained one entry (`conformanceSummary`, below):

| Module | KEYS | Members |
|---|---|---|
| `declaration.js` | 7 | `selectedStyleId`, `selectedStyle`, `styleGravity`, `styleVitals`, `fermentationField`, `fermentationProvenance`, `styleEnvelopeFields` |
| `navigator.js` | 25 | `styleRegion`, `styleEnvelope`, `styleSafestPoint`, `styleExtract`, `styleAbvTouched`, `styleAbvCentered`, `styleSolvedAa`, `styleSolvedCap`, `styleSolvedVolume`, `attenuationBlend`, `attenuationCap`, `attenuationSugarLift`, `computeStyleTarget`, `writeStyleAbv`, `setStyleTargetAbv`, `centerOrClampStyleAbv`, `afterCompute`, `onBatchLoad`, `resetStyleTarget`, `styleTargetNearest`, `styleAbvBounds`, `styleAbvTarget`, `styleTargetInfo`, `styleTargetRisk`, `stylePreview` |
| `targets.js` | 36 | `scalePin`, `scalePinLabel`, `activeScaleTargetRoot`, `activeScaleTarget`, `activeScaleTargetLabel`, `activeScaleTargetDisplay`, `activeScaleTargetUnit`, `activeScaleTargetStep`, `scaleTargetMismatch`, `targetSrm`, `targetIbu`, `whirlpoolFraction`, `boilIbu`, `whirlpoolIbu`, `syncScalePinState`, `setScalePin`, `setScaleTarget`, `editScaleTargetInput`, `commitScaleTargetInput`, `resetScaleTarget`, `refreshTargets`, `setTargetSrm`, `setTargetIbu`, `setWhirlpoolFraction`, `scalePinOptions`, `styleSrmBounds`, `styleIbuBounds`, `srmTargetField`, `ibuTargetField`, `srmTargetProvenance`, `ibuTargetProvenance`, `ibuGu`, `ibuGuDisplay`, `whirlpoolPctDisplay`, `boilIbuDisplay`, `whirlpoolIbuDisplay` |
| `conformance.js` | 4 | `styleConformance`, `styleSai`, `styleConformanceReport`, `conformanceSummary` |

`conformanceSummary` is the one key the old list never declared: it is a
non-enumerable getter, so the surface check could not see it and it went
unguarded rather than missing. `INSTALLERS` names the four modules,
`styleDeclaration` / `styleNavigator` / `styleTargets` / `styleConformance`, so a
collision inside the card is now reported against the module that caused it.
`refreshStyleCard` keeps the old order — declaration, then the solved navigator
state (which sets the extract point), then the pin mirrors and the target
mismatch that read it. No arithmetic, formatting, or template moved; `make test`
reports 853 frontend passes (848 plus the five plot tests) and the same 694
backend passes.

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

**Landed.** `services/bundle_integrity.py` owns twelve named checks —
`check_valuation_nodes`, `check_telemetry_bindings`, `check_catalog_dimensions`,
`check_identity_namespaces`, `check_catalog_paths`, `check_catalog_symbols`,
`check_formatted_values`, `check_formatted_tables`, `check_formatted_summaries`,
`check_collection_state`, `check_catalog_coverage`, `check_telemetry_coverage` —
in the order the old validator ran them, with every message verbatim. `CHECKS` is
the declared surface and `verify()` runs it; `check_collection_state` is one
check with three rules because they all describe the same row block.

The layering forced the phase's one deviation. `tach` pins `app.schemas` with no
dependencies, so the schema cannot import the service; a `ReportBundle` validator
that cannot reach the checks cannot be the enforcement point. The constructors
therefore moved with the checks and the schema kept transport shape: the shape
models, `bundle_content_hash`, and `_content_hash_matches` stay in
`schemas/report_bundle.py`, while `parse_bundle` (shape + hash, then checks) is the
read seam and `seal_bundle` the write seam. `ReportBundle.seal` is deleted rather
than left as a shape-only alias — reaching for `model_validate` directly checks
the shape but not the references, which the module docstrings now say. Both seams
raise: the checks raise `BundleIntegrityError(ValueError)`, so the batch service
catches `(ValidationError, BundleIntegrityError)` at freeze, preview, posted
preview, and stored-bundle read, and `_bundle_rejection` prints the message rather
than a pydantic dump. A stored bundle still fails closed (`500`); a posted one
still maps to `422`.

`seal_bundle` validates once: one `model_validate` under the sealing context, the
checks, then `bundle_content_hash` stamped onto the validated draft with
`model_copy` — no second validation of a body that was already checked. The
canonical hash is unchanged (same canonical dump, same `sha256_canonical`), so the
committed fixture did not move.

Two per-check tests cover the checks that had none: `catalog unit without a
display symbol` (through `seal_bundle`) and `names an unknown item schema`
(calling `check_collection_state` on a `model_copy` — the one case that cannot be
reached through a seam because path resolution fails first). `make test` is 696
backend passes (694 plus the two) and 853 frontend passes, unchanged.
`docs/report-bundle.md` names both owners; `docs/report-generation.md`'s invariant
list now names `bundle_format == 7` and `seal_bundle`.

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
