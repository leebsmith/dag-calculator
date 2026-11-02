# Codebase rationalization — hop host, collection UI, metadata, docs

Status: W1 and the W4 retirements landed (see §11). Derived from the size/bloat
assessment of 2026-11-02 (pinned in §1). D1, D2, D3 (A now, D as W3B), D4 (2a now,
2b gated), D5, D6, D7 and D8 are resolved and the TODO/vision wording is approved.
The only deferred choice is D4's 2b gate, whose measurements are written down in
`plans/codebase-rationalization-decisions.md`. D8's follow-through is the deployment
subset of §3 step 10.

Scope: `frontend/src`, `backend/app`, `docs/`, `plans/`, plus the guards that pin them.
Tests are out of scope as *product*, but guard/test edits are in scope where a guard
is the only anti-drift mechanism for the change.

---

## 1. Pinned assessment (the baseline this plan answers)

> **Verdict.** Not bloated in the usual sense — there is almost no copy-paste and no
> dead code — but it is larger than its feature list, and the excess is concentrated
> in two places rather than spread evenly.
>
> **Numbers** (excluding tests): `frontend/src` 28,279 · `backend/app` 9,857 ·
> `scripts` 5,500 · `data/artifact.json` 124 KB (122 nodes: 34 root, 62 derived,
> 12 choice, 9 collection, 2 selection, 3 boundary; 21 dimensions, 18 functions) ·
> `docs` + `plans` 24,000.
> Duplication: 36 eight-line windows repeat across ~20k JS/PY lines (≈328 lines).
> Dead code: every module in `frontend/src` has an importer.
>
> **Warranted:** the engine (2,490 lines for 122 nodes, dimensions, domains and
> validation); the backend layering (30 routes; `telemetry.py` is a consolidation,
> not ceremony); the tooling (`test-affected`, `docs-claims`, seed builders).
>
> **Not warranted:**
> 1. The domain math exists two-and-a-half times. The artifact declares 62 derived
>    nodes and 18 functions; the JS engine evaluates them; the Python core
>    reimplements grist/cascade/volumetric, hops and water (~5.6k lines). Then a
>    *third* copy: `views/hops.js` + `views/whirlpool.js` implement Tinseth and the
>    whirlpool cooling integral again as the offline stub. Two is a design; three is
>    drift waiting to happen.
> 2. Per-collection bespoke UI. Nine ingredient collections each get hand-written
>    markup, handlers and a label table: five modal editors at 1,937 lines of HTML,
>    16 card adapters at 3,999, 17 registry modules at 1,368 of pure label/unit data.
>    Roughly 7,300 lines — 26% of the frontend — describing the same table + form +
>    readouts nine times with different columns.
> 3. Presentation metadata outside the artifact: registry label/unit tables and the
>    mode→pin-set routing are a second description of the model.
> 4. Documentation outweighs the code by a third (24k docs/plans vs 38k production).
>    That is the audit stance, not sprawl — but it is why the project is bigger than
>    the app.
>
> **Judgment.** Warranted for the engine, the solvers and the backend. Not warranted
> for the collection UI, the one place where the codebase grew by pattern repetition
> rather than by function — a descriptor-driven table/form would plausibly remove
> 4–6k lines without losing a feature. The solver duplication should be left alone
> except for deleting the third copy.
>
> **Caveat:** dead CSS selectors in the 2,224-line `style.css` were not measured.

### 1.1 Corrections found while scoping (the assessment was partly wrong)

- The artifact does **not** implement hop math. `solver.hops` is a boundary with
  `binding: hop_bitterness_solver` and nine domain codes; the 18 artifact functions
  are forward arithmetic only. So hop math exists **twice** (Python host, JS host),
  not three times — but the JS copy is **live in production**, not only offline:
  `adapters/cards/hops.js:358` passes `whirlpoolTimeline` from `views/whirlpool.js`
  to the chart. The real defect is placement and coverage, not count: the timeline
  that the user sees is computed in JS while the numbers beside it come from Python.
  (Resolved in §3: the JS copy is deleted, not consolidated.)
- "Drift" is already partly mitigated: `tests/conformance/fixtures/hop-parity.json`
  (11 cases) is asserted by **both** runtimes (`tests/frontend/hop-parity.test.js`,
  `tests/backend/test_hop_solver.py:379+`) with strict key-set equality and 1e-9
  tolerance. What is **not** covered: the timeline, and the domain codes — the JS
  stub performs no validation and returns numbers where Python raises
  `CONE_UTILIZATION_REQUIRED`, `WHIRLPOOL_HEATING`, `WHIRLPOOL_BELOW_AMBIENT`, etc.
- **Product decision (2026-11-02): the app is http-live only.** Solvers are
  authoring-time; brew day reads a frozen bundle and records state. The code already
  assumes this: `main.js:224` always passes `useHttp: true`; the brew-session path
  imports no engine and no boundary runner (`brewSessionActions.js` reads
  `bundle.formatted_tables`, `state.valuation`, `artifact.hash`); freeze
  refuses mid-solve (`persistence.js:206-211`). So the `useHttp: false` branch is
  unreachable by any user, and the stub's hardcoded water constants are a test
  fixture, not user-facing fiction.
- The `docs/` weight is mostly *enforced*: four files are byte-compared to emitters,
  two carry parsed anchors, one guard checks every backticked citation in every
  living doc. Retiring prose is cheap; moving generated output is a guard change.

---

## 2. Governing constraints (non-negotiable for every wave)

- `data/artifact.json` is canonical. Any artifact edit is atomic with
  `make generate` output and the prose doc that describes it.
- Repo axiom A3: the artifact is domain-only — enforced by
  `tests/guards/artifact-purity.test.js`'s denylist (`label`, `title`, `display`,
  `decimals`, `format` … denied). W3A also denies `displayUnit`, `hint` and
  `optionLabels`; `unit` stays allowed because a unit id drives conversion.
- `docs/historical/**`, `docs/adsco/**` (except `ui.md`) and `plans/archive/**` are
  frozen; `check-hygiene.mjs` fails a commit that touches them.
- Four generated docs are byte-compared by guards: `dag-artifacts/inventory.md`,
  `report-bundle-glossary.md`, `report-sections.md`, `frontend-ownership.md`.
- `make test` is the gate; `make quick` is only the loop. Every wave ends with
  `make test`, and `make verify` where the artifact or bundle changed.
- The app is http-live only: no domain math in the browser, no boundary implemented
  client-side. A test double may exist under `tests/`, never under `frontend/src`.
- No comments in code. Commit subjects imperative.

---

## 3. Workstream W1 — retire the browser host (http-live only)

### 3.1 Decision (settled)

| Option | Verdict |
|---|---|
| A. One JS host, moved and pinned | **Rejected** — keeps domain math in the browser and leaves the curve undeclared |
| B. Delete the JS host, lose the curve | **Rejected** — the card needs a curve |
| C. Leave it | **Rejected** — an unreachable branch that has already drifted |
| **D. Curve as a declared output** | **Chosen** — the backend is the only host |

Consequence: `whirlpool_timeline` becomes a boundary output, the JS math is deleted
rather than consolidated, and the stub is demoted to a tests-only double. This is the
only wave that produces a real deletion.

### 3.2 Steps

1. **Artifact**: add `whirlpool_timeline` to `solver.hops.outputs` as
   `{ "type": "collection", "item_schema": "whirlpool_timeline_segment" }`, with
   `whirlpool_timeline_segment = { start_min: time, end_min: time, temp_c: temperature }`.
   A content change, not a grammar revision — outputs already support collections
   (`boil_rows` is the same shape). Chills are the segment discontinuities; if a chill
   needs its own annotation, add `chilled: boolean` to the item schema rather than a
   second collection.
2. **Backend**: return the existing `build_whirlpool_timeline`
   (`hop_solver.py:337`) from `solve_hops` and map its segments into the response.
   No new math; the timeline is already computed to derive `effective_minutes`.
3. **Artifact atomicity**: `make generate` (inventory, glossary, manifest hash);
   re-emit `tests/conformance/fixtures/report-bundle.json`
   (`backend/scripts/emit_report_bundle_fixture.py`); add the timeline to the output
   list in `docs/hops/whirlpool-hopping-model.md`. Artifact + generated docs + prose
   in one commit.
4. **Frontend renderer**: `cards/hops.js` draws the curve from
   `engine.resolve("solver.hops.whirlpool_timeline")`;
   `views/producer/whirlpoolPolicy.js` reads the served curve instead of calling
   `whirlpoolTimeline`.
5. **Delete the browser math**: `frontend/src/views/hops.js` (54) goes;
   `views/whirlpool.js` keeps only chart geometry, `PRODUCT_FORM_UTILIZATION` (still
   read by `tests/guards/taxonomy-coverage.test.js`) and the display defaults —
   roughly 200 of its 294 lines go.
6. **Collapse `useHttp`** (17 references): `createSession` takes an optional
   `boundaries` map defaulting to `{}`; production passes nothing, tests inject the
   double. `boundaryRunner` loses `syncBlockedOffline` and both early returns;
   statuses start `pending`. `engine.markBoundaryUnavailable` stays — it is the state
   that makes a failed solve render placeholders.
7. **Demote the stub**: move `adapters/stubBoundaries.js` to
   `tests/fixtures/boundaryDouble.js`, shape-only — every declared output key present
   with a constant/sample value, marked as a test double. Delete
   `tests/frontend/hop-parity.test.js` (its claim was offline == online, and there is
   no offline); demote `hop-parity.json` to a Python-only golden snapshot emitted by a
   script and checked for staleness. Re-point `tests/frontend/helpers.js` and
   `tests/guards/{stub-outputs,boundary-routes,determinism,engine-cold-start}.test.js`.
8. **New guard** `tests/guards/brew-day-solver-free.test.js`, in the shape of
   `import-direction.test.js`: the brew-session and checklist modules may not import
   `engine/index.js`, `boundaryRunner.js` or `boundaryRequest.js`, and may not resolve
   `solver.*` paths. Proven to fail by adding a `solver.*` read to a brew-session
   module in review.
9. **Wording** (approved):
   - `TODO.md`: replace "Offline resilience (IndexedDB write-ahead overlay)" with
     "Brew-day offline: cache the frozen bundle, queue note writes. Solving is
     authoring-time; no boundary runs on the brew-day path."
   - `docs/vision.md` refusal list: "The calculator does not solve during a brew.
     Freezing is where solving stops; brew day reads the frozen bundle and records
     state. Offline is a state, not a second solver."
   - `docs/engine.md` boundary seam: one sentence — a boundary has exactly one host,
     server-side; the frontend consumes declared outputs and never recomputes them.
10. **Deployment** (D8 settled 2026-11-02 — same-origin Hosting rewrite to Cloud Run;
    see `plans/codebase-rationalization-decisions.md`):
    - `firebase.json`: `run` rewrites for `/solve/**`, `/batches/**`,
      `/brew-sessions/**`, `/catalog/**`, `/report/**` and `/session`, all **before**
      the `** → /index.html` catch-all. `/health` stays off Hosting.
    - `make deploy-frontend` (not `make build`): assert `VITE_API_BASE` is unset and the
      bundle contains no `.run.app`. The CSP stays untouched (`connect-src 'self'` now
      covers the API) and no CORS middleware is added.
    - **Update the `README.md` deployment contract** in the same commit: the production
      topology (Hosting + Firestore + Cloud Run, one origin), the same-origin rewrite
      invariant, `VITE_API_BASE` unset, the Admin-SDK-only data path, and a pointer to
      `firebase.json`/the `Makefile` for mutable values. Do not restate project id,
      region or service name.
    - Smoke tests after the first deploy: a signed-in `/session` returns 200 (the
      Authorization header survives the rewrite), and the PDF report renders inside the
      Hosting request timeout.

### 3.3 Acceptance

- `grep -rn "massFromIbu\|tinsethUtilization\|whirlpoolMass\|relativeIsomerizationRate\|coolingTemperature" frontend/src` → no hits.
- `grep -rn "STUB_BOUNDARIES" frontend/src` → no hits.
- The artifact declares `whirlpool_timeline`, `/solve/hops` returns it, the card draws
  it, and the bundle fixture is re-emitted.
- `brew-day-solver-free` guard green, and demonstrated red when a `solver.*` read is
  added to a brew-session module.
- The tests-side double still produces every declared output key (`stub-outputs`
  green).
- `make verify` green.

### 3.4 Notes and risks

- `bundle_integrity` permits only outputs the artifact declares, so the new output and
  the bundle fixture must land together or the brew-session freeze path fails on the
  extra key.
- The report need not print the curve in this wave; the bundle only gains access.
  Printing it is a later `.typ` section (`docs/adding-a-section.md`).
- The old risk — a JS host reproducing Python's domain codes — disappears with the
  host.

---

## 4. Workstream W2 — collection UI, in three shippable tiers

### 4.1 Measured surface

| Collection | Markup | Adapter | Registry | Total |
|---|---:|---:|---:|---:|
| Malt | 485 | 202 | 10 | 697 |
| Trace malt | 411 | 82 | 7 | 500 |
| Sugar / late additions | 414 | 404 | 28 | 1,155 (+309 view) |
| Boil hop | 436 | ~345 | 16 | 797 |
| Whirlpool hop | 614 | ~130 | 17 | 761 |
| Dry hop | 416 | 212 | 22 | 650 |
| Yeast | 254 | 187 | 23 | 464 |
| Water salts | 259 | 639 | 208 | 1,106 |
| Mash rests | 266 | 349 | 18 | 633 |

Six catalogue collections: **4,787 lines (18.6% of `frontend/src`)**. Ten surfaces:
**7,480 (29%)**. Shared chrome already exists at the data layer
(`catalogDraft.js` 334, `draftEditor.js` 307) — what was never shared is the markup
and the inspector form.

Identical-shape blocks, measured:
- draft table block ≈ **425 lines** across six files; hop vs whirlpool differ only in
  member names over `modal-hop-editor.html:41-104` vs
  `modal-whirlpool-hop-editor.html:41-104`;
- catalogue search pane ≈ **646 lines**; `modal-malt-editor.html:161-315` vs
  `modal-trace-malt-editor.html:131-283` differ by **two** lines (`maltAtLimit`);
- inspector form ≈ **360 lines**; malt vs trace inspectors are byte-identical after
  prefix normalisation;
- drawer shell ≈ **150 lines**; section shell ≈ **100 lines**.

Genuinely non-declarative, keep bespoke: `water.js` (constraint declaration, one
214-line refresh), `style/*` (plot model + pin mirror), cooling-curve picker and
whirlpool timeline, mash rests (canonical set keyed by `rest_id`, silent discard),
sugar share mode (three-way budget with editable-column switching), dry-hop
contact/duration exclusivity.

### 4.2 Tier 2a — shared chrome (low risk, ship first)

1. Add generic handlers to the app, installed once: `inspectDraftRow(ri)`,
   `removeDraftRow(ri)`, `openDraftSearch()`, `closeDraftDrawer()`,
   `toggleDraftCategory()`, `handleDraftEscape()`, resolving the active draft from
   the state `draftEditor` already holds. The handlers are already generated once by
   `installCatalogDraft`; the new work is replacing the per-prefix drawer/search
   **state** (`${prefix}Drawer`, `${prefix}Search`, `${prefix}ActiveIndex`, filters)
   with one set, since a shared partial cannot know the prefix. Only one editor is
   open at a time, so this is safe. Keep the prefixed names as thin aliases for one
   release so the card tests keep passing.
2. Extract three partials: `partials/draft-table.html` (toolbar → table → actions →
   empty row → totals), `partials/draft-drawer.html` (scrim + header + transition
   shell), `partials/draft-search-pane.html` (search input, notes pill, category and
   family pills, result counter, item cards, Copy/Add). Include them from each
   modal; the *modal* keeps its static `aria-labelledby` id
   (`tests/guards/dialogs.test.js:47-62` requires a static id per file).
3. Delete the replaced markup from the six modals; keep each modal's inspector and
   any collection-specific footer.
4. Regenerate `docs/frontend-ownership.md`; lower the `FILE_LINE_PINS` in
   `eslint.config.js:190-199` and the pins in `tests/guards/shape-pins.test.js`.

Expected: **−900 to −1,100 lines**, no behaviour change.

### 4.3 Tier 2b — descriptor-driven form (gated, separate commit)

**Gate (measure after 2a, record before starting 2b):**

1. `wc -l frontend/src/partials/modal-*.html` — residual modal size.
2. Residual uniform markup (inspector, section shells) versus the bespoke tails
   (sugar share, mash rests, dry-hop exclusivity, water).
3. How many of the 36 `catalogDraftKeys` names and ~20 `SHARED` entries survive 2a.
4. `form[]` drafted for malt and dry-hop: plain fields versus `when`/setter cases.

Proceed if the residual is **≥ ~500 lines of uniform markup** and roughly two-thirds
of the fields are plain. Stop — or take **2b-minus-KEYS** (one inspector partial
driven by column metadata) — if the residual is mostly bespoke. 2b reads the
generated registry from W3B by path and may not move copy into the descriptor.

1. Define `collectionDescriptor` in `frontend/src/views/` (rank ≤ 3; may not import
   adapters): `id/Cap`, node ids from `views/registry/*` only, `columns`, `inputs`,
   catalogue policy (`allowDuplicates`, `maxVisible`, `canAdd`, standard-first vs
   flat), `makeRow`, `form[]` (field, kind, scale, options, `when`, setter),
   `draftHooks` (`normalize`, `footerLabel/footerValue`, `saveGuard`, `clone`),
   `readouts` (row + section-meta), `validation`.
2. Render the inspector from `form[]` in one shared partial; delete the five bespoke
   inspectors. `form[]` must emit `for`/`:for` labels (`control-states.test.js`) and
   buffer numeric inputs through `inputDraft(` (`number-input-contract.test.js`).
3. Derive `KEYS` from the descriptor; delete `catalogDraftKeys` (36 hand-listed
   names) and the five `KEYS` tails. `SHARED` in `installers.js` drops ~20 entries;
   180 of 370 declared members become machine-derived.
4. Move the section shell into one partial (`step-fermentables`, `step-hops`,
   `fermentables-sugar-section`, `hops-dry-section`).

Expected cumulative: **−1,600 to −2,000 lines**. Guards to update: `ownership`,
`installer-contract`, `alpine-handlers`, `dialogs`, `control-states`,
`number-input-contract`, `include-integrity`, `presentation-ids`,
`adapter-format-contract`, `shape-pins`. Frontend suites to re-point (not weaken):
`catalogDraft` (464 lines), `draft-discard`, `card-display`, `hops-card`,
`malt-card`, `late-addition-*` (5), `dry-hops-card`, `fermentables-sections`,
`hops-sections`, `step-lifecycle`, `step-boundaries`.

### 4.4 Tier 2c — rejected, not deferred

Sugar share mode, hop policy descriptors, mash canonical rests, dry-hop exclusivity
into `draftHooks`; water, style, cooling-curve. The descriptor grows one optional hook
group per collection, which is not obviously better than the code it replaces, and
`cards/hops.js` already sits at its `max-lines` pin. This is the point where a
descriptor stops describing and starts pretending; it does not become a later tier.

**2a′ (codegen) is also rejected:** emitting the modal shells adds a fifth generated
surface to precommit and removes hand-maintenance, not the conceptual duplication.

### 4.5 Acceptance

- Every card suite passes unchanged in behaviour (tests may be re-pointed, not
  loosened).
- `make check` green with *lower* shape pins; no new `eslint-disable`.
- Modal count 5 → 1 partial set; `grep -c "modal-workspace" partials/*` collapses.
- Fix the dangling reference at `catalogDraft.js:6` (`plans/card-refactor.md` does not
  exist) while touching that file.

---

## 5. Workstream W3 — metadata

### 5.1 Measured duplication

Registries: 17 files, 1,368 lines, **199 entries, all 199 resolve** in the artifact's
395-path space (50.4% coverage). Of the metadata:
- `unit` 55 → **41 derivable** from the dimension; only `%`/`IBU`/`pH`/`ppm` base
  symbols are missing from `views/registry/units.js`;
- `displayUnit` 52 → **25 derivable** (`pct` is the `percentage` default);
- `decimals` 40 → **23 derivable** from `units.js` `DIMENSION_DECIMALS`;
- 3 keys are declared twice and silently shadowed by `registry/index.js:16-28`
  (`batch.boil_target_ibu`, `batch.whirlpool_target_ibu`, `batch.sugar_extract_total`);
- 8 table labels exist twice (`registry/batch.js` vs `views/steps.js`), and one path
  carries three labels (`batch.sugar_extract_total`);
- checklist level labels exist 3×; hop product-form labels 3× (twice inside
  `registry/hops.js`); water ion labels 2× inside one file;
- `docs/display-precision.md:12-33` restates `units.js` with **no guard** — a wrong
  digit is invisible.

### 5.2 Decision (2026-11-02): A, then D (W3B)

| Option | Verdict |
|---|---|
| **A. Keep A3** | **Chosen for W3A.** Registries stay the label home; delete what is derivable; add a precision guard; fix the duplicates. |
| B. Relax A3 for labels only | Rejected. Spends the axiom, makes `artifact.hash` change on copy edits, and buys ≈ zero lines. |
| C. B plus `optionLabels` into taxonomies | Rejected, same reason. |
| **D. Keep A3, generate the registry** | **Chosen for W3B, committed.** One label source, one emitter, one byte-compare guard. |

Two facts settle B/C: `artifact.hash` is `sha256_canonical` of the whole
artifact, so a label edit would change the model's identity; and the freeze payload
already ships `NodePresentation.label` under a separate `catalog.hash`, so the
artifact is not the label distribution channel even in production. B would create a
third copy and blur two hashes that are deliberately distinct.

D is committed now rather than left conditional because W2b needs a stable label
source: if the registry is generated first, 2b consumes it by path and cannot
relocate copy into the descriptor. Also record in `docs/vision.md` that labels are
presentation, not domain.

### 5.3 Steps (Option A)

1. Delete the 41 redundant `unit`, 25 redundant `displayUnit`, 23 redundant `decimals`
   entries; add the five base symbols to `views/registry/units.js` so the last case is
   derivable too and `unit-menu-coverage.test.js` keeps its promise. Extend the A3
   denylist to deny `displayUnit`, `hint` and `optionLabels`; keep `unit` allowed
   (a unit id drives conversion, so it is domain; the other three are copy).
2. Delete the 3 shadowed duplicate keys and the 8 duplicated step labels; teach the
   table renderer (`views/producer/projection.js`) the "registry label wins" fallback
   that `views/registry/catalog.js:213` already implements.
3. Derive checklist level labels from `data/seeds/brew-checklist.json` (the pattern
   `views/registry/mash.js:3-7` already uses for mash rests) — removes 3 copies.
4. Collapse hop product-form labels to one table in `registry/hops.js`; collapse water
   ion labels to `WATER_IONS`.
5. Add the doc-precision guard. `tests/guards/display-precision.test.js` already
   exists and checks decimal-policy presence, not the doc; use a distinct name (for
   example `docs-display-precision.test.js`) to parse the table in
   `docs/display-precision.md` and compare it with `DIMENSION_DECIMALS` + per-unit
   decimals. Fix any drift the guard finds.
6. Delete the one-entry `CARD_UNIT_KEYS` map (`store/unitPrefs.js:13`) or add the
   comment-free justification the mapping implies; it has no artifact counterpart.
7. **Keep host-side, do not move:** unit *symbols* (typography, not domain), the
   field→unit→dimension→fallback precedence rule (collapse its five implementations
   into one helper in `units.js`, do not relocate it), `presentation.js`
   `FIELD_OVERRIDES`/`CLAMP_BOUNDS` (render-time reads of other nodes),
   `findings.js` wording (functions of resolved operands), the mode→pin routing
   (`backend/app/core/water/router.py` is authoritative; the JS `strategyForHeld` is a
   *different* function — explicit vs AUTO — already pinned by
   `tests/conformance/ion-constraints.json` and `test_water_routing.py`), and the
   equipment imperial map (seed spelling convention, not artifact vocabulary).

### 5.4 W3B — generated registry (D)

1. `data/labels.json`: path → label, plus taxonomy option labels (hop product forms
   move here from `registry/hops.js`). **No** `unit`, `displayUnit` or `decimals` —
   those are derived. Checklist level labels stay derived from
   `data/seeds/brew-checklist.json`; water ion labels stay in `WATER_IONS`.
2. `scripts/emit-registry.mjs`: read the labels, the artifact and
   `views/registry/units.js`; derive `unit` (dimension base/default), `displayUnit`
   (a pin only where it differs from the menu default) and `decimals`
   (`unitDecimals`); write `frontend/src/views/registry/generated.js`.
3. `registry/index.js` composes `...generatedRegistry`; hand-written modules keep
   only their non-label exports.
4. Guard `tests/guards/registry-generated.test.js`: byte-compare `generated.js`, fail
   on a label path that does not resolve, on a generated entry whose unit/decimals
   equals the derived default, and on a hand-written module that re-declares a
   generated path — so W3A's deletions cannot return.
5. Precommit and generation: add `generated.js` to `GENERATED_PATHS` in
   `scripts/precommit.mjs` and the emitter to `make generate`; regenerate
   `docs/frontend-ownership.md` for the new module.
6. Re-point any test that imports a registry module's label table directly.

Expected: a label edit is a one-line JSON change; the registry modules stop being
hand-editable for copy, and units/decimals have exactly one derivation path.

### 5.5 Acceptance

- Registry entry count drops 199 → ~155 with zero unresolved paths
  (`presentation-ids.test.js` + the resolve script in §7).
- `grep -c "displayUnit: \"pct\""` → 0.
- The new precision guard fails if a doc digit is edited alone.
- No artifact change; in W3B `make generate` gains the registry emitter.
- **W3B:** editing `data/labels.json` alone changes `generated.js`; the byte-compare
  guard fails if either is edited alone; `data/labels.json` contains no unit,
  displayUnit or decimals key; ownership regenerated and `make test` green.

---

## 6. Workstream W4 — documentation (executes D5, decided 2026-11-02)

### 6.1 Measured weight

`docs/`: 11,015 lines (living prose 6,840 · generated 1,612 · frozen 1,272 + 717 ·
background 574). `plans/`: open 1,403 (7 files), archived 10,963 (55 files).

Unenforced drift already present: `docs/report-bundle.md:54-55` says
`bundle_format: 5` / `schema_version: 9` while line 113 and the artifact say 7/10;
`docs/brew-session.md:27-28` says corrections "are not implemented yet" — they are
(`store/observationCorrections.js`); `README.md:35` calls `docs/belgian-knob.md`
living when it is a retirement notice; `docs/dag-artifacts/dimensions.md` omits six
declared dimensions.

### 6.2 Steps

1. **Retire three unlinked docs** (no inbound link from README, AGENTS, TODO, any
   living doc or plan):
   - `docs/solving-og-fg-abv-and-aa.md` (587) — documents a `cutaia_fermentation_solver.py`
     that does not exist and a six-pair solve the repo deliberately defers. If the
     solvability argument matters, demote it to a plan.
   - `docs/report-generation.md` (249) — superseded; fold its `bundle_integrity`
     invariant list into `report-bundle.md` and its dev loop into `report-renderer.md`.
   - `docs/ion-limits-for-brewing.md` (61) — byte-identical to
     `docs/adsco/ion-limits-for-brewing.md` (same md5).
2. **Merge, keeping the guarded anchors:**
   - `brew-checklist.md` + `brew-session.md` → one brew-log doc (−60).
   - `attenuation-model.md` + `fermentability-and-yield.md`: delete the duplicated
     composition block, prior table and late-addition text (−100 to −120).
     **Must preserve** the literal `## … Assumption register` section and A1–A18 rows
     (`attenuation-register.test.js`).
   - `belgian-knob.md` and `style-card-centroid.md` into `attenuation-model.md`
     (−14, −134).
   - `node-reference.md` into `engine.md` (−100).
3. **Trim tables that duplicate generated inventory:** `seed-substrate.md` §2 field
   tables (~150) and `dimensions.md` dimension tables (~60) become prose + a pointer
   to `dag-artifacts/inventory.md` (which already cites 122/122 nodes and every
   dimension).
4. **Fix the stale facts** listed in 6.1 in the same commit as the merges.
5. **Index the unlinked-but-live docs**: add README rows for `attenuation-model`,
   `sugar-database`, `brew-checklist`/`brew-session` (after merge), `record-library`,
   `calculator-assumed-dosing-practice`, `hops/hop-products`.
6. **Archive two landed open plans** into `plans/archive/2026-11/`:
   `plans/adsco-contract.md` (201; every Migration bullet has landed, no frontmatter)
   and `plans/brew-log-contract.md` (186; Phase 1–2 shipped, Phase 3 has its own
   plan). `archive-layout.test.js` requires lowercase-hyphen slugs in a `YYYY-MM/`
   bucket; archived plans are claim-exempt, so their `proposed` claims declarations
   drop out of `docs-claims`.
7. **Split the ownership index (D6, decided)**: `docs/frontend-ownership.md` keeps the
   12-line header, `## Installers` (25) and `## Cross-owner reads` (50) — ~75 committed
   lines; the 698-line `## Members` dump moves behind a command (`make ownership`, or
   `node scripts/emit-ownership-index.mjs --full` to stdout). Update
   `scripts/emit-ownership-index.mjs` (summary → file, full → stdout),
   `scripts/precommit.mjs:20` (`GENERATED_PATHS` keeps the summary only),
   `tests/guards/ownership.test.js:34-36` (compare the summary), and `README.md:201`.
   The other nine ownership tests are untouched — they are the ones that keep the
   surface honest.
8. **Do not hand-edit**: `dag-artifacts/inventory.md`, `report-bundle-glossary.md`,
   `report-sections.md`, `frontend-ownership.md`, `backend/app/templates/sections.json`,
   `data/sources/manifest.json` — regenerate. Do not touch `docs/historical/**`,
   `docs/adsco/**`, `plans/archive/**`. Do not rename the `grammar.md` revision
   sentence or the attenuation register anchors.

Expected: **−2,700 to −3,000 lines** with no guarded fact lost.

### 6.3 Acceptance

- `docs-claims` resolves every backticked token in the surviving docs.
- `make test` green; the archive layout guard green.
- No living doc is unlinked: every file under `docs/` is reachable from `README.md`
  or a `docs/*/README.md`.
- **D6 (decided):** `docs/frontend-ownership.md` is ~75 lines (header + installers +
  cross-owner reads); `node scripts/emit-ownership-index.mjs --full` still renders all
  698 member lines on demand; the nine property tests in
  `tests/guards/ownership.test.js` are unchanged and the summary byte-compare passes.

---

## 7. Measurement (how we will know it worked)

Run before wave 1 and after each wave; record in the wave's commit message or plan
addendum:

    find frontend/src backend/app scripts -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.py' -o -name '*.html' -o -name '*.css' \) -not -path '*/node_modules/*' -not -path '*/.venv/*' | xargs wc -l | tail -1
    find docs plans -name '*.md' -not -path '*/archive/*' | xargs wc -l | tail -1
    # registry entries vs artifact paths (199/395 baseline)
    python3 - <<'PY'
    import json,re,glob
    a=json.load(open('data/artifact.json')); paths=set(a['nodes'])
    for f in glob.glob('frontend/src/views/registry/*.js'):
        n=len(re.findall(r'^\s*"[a-z_][\w.]*"\s*:\s*\{',open(f).read(),re.M))
        print(f.split('/')[-1], n)
    PY

Targets: production JS/PY/HTML/CSS **43,636 → ~41,400**. Wave-by-wave: W1 −500
(deleting the browser host and the `useHttp` branches; backend +~40 for the timeline
output), W2a −900…−1,100, W2b −700, W3A −100, W3B line-neutral (one generated module
replaces the per-file label tables). Docs + open plans **12,418 → ~9,800**
(W4 −2,700…−3,000, including the 785 → ~75 ownership index).
Registry entries **199 → ~155**, all from one label source. Hop-math implementations
**2 → 1**. Boundary outputs **9 → 11** (`whirlpool_timeline`, `whirlpool_chills`).

---

## 8. Sequencing

| Wave | Content | Depends on | Gate |
|---|---|---|---|
| **W1** | Retire the browser host: `whirlpool_timeline` output, delete JS hop math, demote the stub to `tests/`, collapse `useHttp`, brew-day guard, TODO + vision wording, same-origin Hosting rewrites, `deploy-frontend` base assertion, README deployment contract | — | `make verify` |
| **W3A** | Derivable metadata, duplicate keys/labels, precision guard | — | `make test` |
| **W3B** | Generated registry from `data/labels.json` | W3A | `make test` |
| **W2a** | Generic handlers + one drawer state + three shared partials | W3A, W3B (stable label source) | `make test` |
| **2b gate** | Measure residual markup, prefix plumbing and `form[]` shape; record it | W2a | no commit; a written decision |
| **W2b** | Descriptor + `form[]` + derived `KEYS` — or 2b-minus-KEYS, or stop | W2a and a passing gate | `make test` |
| **W4** | Retire / merge / archive docs and plans | W2 (`frontend-ownership.md`), W3 (`adding-a-node.md`, `display-precision.md`) | `make test` |

W4's retirements (6.2 steps 1, 6) are independent of W1–W3 and can run first as a
warm-up; the merges that touch `adding-a-node.md` and the ownership doc must come last.
Do not interleave W2a and W2b in one commit: W2a is markup-only and revertable alone.

W1 is the one wave that changes the artifact, so it lands as its own commit sequence:
(1) artifact + generated docs + prose, (2) backend output, (3) frontend renderer and
deletions, (4) stub demotion and guard. Each step keeps `make test` green except the
first, which is red until the backend and the fixture follow — so land (1) and (2)
together even though they touch different trees.

---

## 9. Non-goals

- No change to solver mathematics. W1 adds one declared output (`whirlpool_timeline`)
  that the host already computes, and removes the browser copy; it adds no node and
  changes no equation.
- **No domain math in the browser, ever** — not as a fallback, not for display, not
  behind a feature flag. Offline is a state (cached bundle, queued writes), not a
  second solver. This is the rule W1 exists to establish.
- No new dependency in `package.json` or `pyproject.toml`.
- No reorganisation of `docs/adsco/`, `docs/historical/` or `plans/archive/`.
- No CSS dead-selector purge in this plan (`style.css` 2,224 lines) — measure first,
  scope separately.
- No attempt to move the mode→pin routing into the artifact: the two sides are not the
  same function, and `ion-constraints.json` already pins them.

---

## 10. Decisions

Resolved 2026-11-02:

- **D1 — hop host → D.** One host (Python). The curve becomes a declared output; the
  browser math is deleted, not consolidated.
- **D2 — water stub → dissolved.** With no offline mode there is no user-facing
  fiction; the stub becomes a shape-only test double under `tests/`.
- **D3 — A3 / labels → settled 2026-11-02 (A, then D).** W3A keeps A3: delete only
  the derivable metadata, dedupe the 3 shadowed keys and the 8 step labels, add the
  doc-precision guard, and decide `displayUnit`/`hint`/`optionLabels` in the denylist
  explicitly. W3B then generates `views/registry/generated.js` from a committed
  `data/labels.json` that holds labels only; units and decimals are derived. B/C
  rejected: they spend the axiom, make `artifact.hash` copy-sensitive, and save no
  lines. D is committed rather than conditional because W2b needs a stable label
  source and may not relocate copy into the descriptor.
- **D5 — retirements → decided 2026-11-02.** The documentation decision, executed by
  §6 (W4) as written:
  - retire `solving-og-fg-abv-and-aa.md` (587), `report-generation.md` (249),
    `ion-limits-for-brewing.md` (61 — byte-identical to the frozen `adsco/` copy);
    fold their unique reasoning first (rejection argument → `attenuation-model.md`
    §6.1; `bundle_integrity` invariants → `report-bundle.md`; dev loop →
    `report-renderer.md`);
  - merge four pairs (`brew-checklist` + `brew-session`;
    `attenuation-model` + `fermentability-and-yield`, preserving the A1–A18 register;
    `belgian-knob` + `style-card-centroid` → attenuation; `node-reference` → `engine`);
  - trim hand-maintained tables that duplicate generated inventory (`seed-substrate.md`
    §2, `dimensions.md`);
  - fix the four stale facts; index the six live-but-unlinked docs in `README.md`;
  - archive `plans/adsco-contract.md` and `plans/brew-log-contract.md`;
  - regenerate, never hand-edit, the four byte-compared files; never touch the frozen
    paths.
- **D7 — test double → shape-only**, plus at most one recorded full-solve fixture for
  a test that genuinely needs numbers. Numeric authority is Python's.
- **Brew-day guard, TODO wording, vision wording → approved.**
- **D6 — generated ownership doc → decided 2026-11-02 (option 4: keep the summary,
  drop the dump).** `docs/frontend-ownership.md` keeps the header counts, the
  `## Installers` table and the `## Cross-owner reads` justifications (~75 committed
  lines) and loses the 698-line `## Members` dump, which moves behind
  `make ownership` / `emit-ownership-index.mjs --full` on stdout. The nine property
  tests stay; only the byte-compare narrows to the summary. Why not the alternatives:
  keeping it ships a ~700-line generated diff on every card edit; moving it to
  `.local/` kills the byte-compare anyway and adds per-machine rot.
- **D8 — deployment origin → settled 2026-11-02 (option A).** Same-origin Firebase
  Hosting rewrite to the Cloud Run service: six `run` rewrites before the SPA
  catch-all, CSP untouched, no CORS middleware, `VITE_API_BASE` unset in production.
  Executed by §3 step 10, which also updates the `README.md` deployment contract.
  Why not B/C: the backend has no CORS middleware and the app is same-origin by
  construction, so a separate origin costs the CSP edit *and* a new application
  surface for no operational gain.
- **D4 — UI depth → settled 2026-11-02 (2a now, 2b gated).** W2a unifies the drawer
  state and extracts three partials (draft table, drawer shell, search pane). 2b is
  conditional on the four post-2a measurements in §4.3; 2b-minus-KEYS is the
  permitted middle outcome. 2a′ (codegen) and 2c (bespoke hooks) are rejected. If 2b
  happens, `form[]` reads the generated registry by path.

No decisions remain open. The deferred choice is D4's 2b gate, recorded with its
measurements in `plans/codebase-rationalization-decisions.md`.

---

## 11. Execution log

### 2026-11-02 — W1 and the W4 retirements landed

Commits: `Serve the whirlpool timeline from the hop boundary`,
`Retire the browser hop host and make brew day solver-free`,
`Keep the ownership summary and render the member table on demand`,
`Retire and merge the documentation D5 named`.

**W1 (complete, `make verify` green).** The boundary now declares
`whirlpool_timeline` (segments `start_min`/`end_min`/`temp_c`) and
`whirlpool_chills` (`at_min`/`from_temp_c`/`to_temp_c`); `solve_hops` returns the
timeline it already built. `views/hops.js` (54) and the math half of
`views/whirlpool.js` (294) are deleted, `stubBoundaries.js` is gone from `src`,
and `tests/fixtures/boundaryDouble.js` is the shape-only double. `useHttp` is
gone: `boundaries` (a provider map) selects in-process resolution and its
absence means HTTP — production passes nothing (`main.js`). New guard
`brew-day-solver-free` (imports + `solver.*` reads), demonstrated red then
green. `TODO.md`, `vision.md` and `engine.md` carry the approved wording.

**W4 (retirements and merges; D6 complete).** Retired
`solving-og-fg-abv-and-aa.md` (587), `report-generation.md` (249),
`ion-limits-for-brewing.md` (61), `belgian-knob.md` (14) and folded their unique
content forward; merged `node-reference.md` (139) into `engine.md` and
`style-card-centroid.md` (134) into `attenuation-model.md` §6.3; archived
`adsco-contract.md` and `brew-log-contract.md`; fixed the stale
`bundle_format`/`schema_version` copy, the "corrections not implemented" claim,
the Belgian-knob README row and the six missing dimensions; indexed the live but
unlinked docs. `docs/frontend-ownership.md` is now the 88-line summary with
`--full` on demand (guard narrowed, nine property tests untouched).

### 2026-11-02 — W3A landed

Commit: `Derive the presentation metadata and close the A3 guard holes`.

- **Derivable metadata removed.** `unit` 55 → 2 (the two `style.srm_*` pins),
  `displayUnit` 52 → 29 (the two `pts` pins kept for the attenuation derate),
  `decimals` 43 → 19 (the extract ledger's deliberate 2 dp). Four hidden
  base-symbol dimensions (`abv`, `ibu`, `ph`, `concentration`) were added to
  `views/registry/units.js` so a base-only unit derives its symbol; they are
  filtered out of the master menu.
- **Duplicates removed.** The 3 shadowed keys and the 8 duplicated step labels
  are gone; `producer/projection.js` fills a missing table label from the
  registry, keeping the deliberately different step labels.
- **One label source.** Checklist levels derive from
  `data/seeds/brew-checklist.json` (registry and `store/brewSessionModel.js`);
  hop product forms use one table in `registry/hops.js`; the water target ions
  read their labels from `WATER_IONS`.
- **A3 closed.** The purity guard now denies `displayUnit`, `hint` and
  `optionLabels`; `unit` stays allowed because a unit id drives conversion. The
  false `extra: forbid` sentence in `grammar.md` is corrected, and `vision.md`
  states that labels are presentation.
- **New guard** `tests/guards/docs-display-precision.test.js` compares
  `docs/display-precision.md` with `units.js`; it found one missing dimension
  row (`temperature_delta_per_time`), now added.
- **Kept:** `CARD_UNIT_KEYS` (`hop.mass`). It is the hop card's synthetic mass
  pill, not an artifact path; deleting it would drop a persisted preference.
- Registry entries **199 → 196** (the 3 duplicates); production lines
  **42,905 → 42,892**. `make check` and `make test` green.

### Corrections found while executing (the plan was wrong about these)

- **There is no whirlpool chart.** The timeline's only production consumer was
  `whirlpoolInferredChills` (a text line); `whirlpoolTimelineState` was rendered
  nowhere. So the wave removed less display code than planned and needed **two**
  outputs, not one: a chill's `from_temp_c` is a value on the curve, which
  segments alone cannot express without the client evaluating the exponential.
- **A shape-only double cannot satisfy the physics assertions in
  `hops-card.test.js`.** Nine tests were re-pointed, not weakened: row
  projections (`ibu = pct × target`, `minutes`) stay asserted, while mass
  monotonicity, extract/pellet ratios and cooling-constant sensitivity became
  *request* assertions (the card's job) or served-value assertions via a
  per-test injected binding. Numeric authority is now `tests/backend/`.
- **The seam needed a name.** `frontend/src/adapters/boundarySeam.js` turns the
  option into `{ boundaries, remote }`, so the branches read as "is there a
  local provider" rather than a product mode.
- Boundary outputs are **9 → 11**, not 9 → 10.

### Numbers

Production JS/PY/HTML/CSS **43,636 → 42,905** (−731; W1 alone ≈ −500, with the
backend gaining the timeline mapping). Docs + open plans **12,418 → 10,577**.
`frontend-ownership.md` **785 → 88**. Hop-math implementations **2 → 1**. Diff
across the four commits: 63 files, +946 / −2,765.

### Remainder (not started)

From D5, three duplication trims are still open — none removes an assertion, all
are prose surgery:

1. merge `docs/brew-checklist.md` + `docs/brew-session.md` into one brew-log doc;
2. delete the duplicated composition block, prior table and late-addition text
   shared by `docs/attenuation-model.md` and `docs/fermentability-and-yield.md`
   (preserving the A1–A18 register);
3. replace the field/dimension tables in `docs/dag-artifacts/seed-substrate.md`
   §2 and `docs/dag-artifacts/dimensions.md` with prose plus a pointer to the
   generated `inventory.md`.

W2 needs D4; W3A and W3B implement D3 (§5); the deployment step implements D8 (§3
step 10).
