# TODO

## Now

**Style targets: ±2 JND sliders** — the IBU and SRM sliders on the Style card reach
two just-noticeable differences past the style envelope (SRM ±3, IBU ±6, from the
assessor's `TAU`), so a deliberate deviation is possible; an out-of-style target
shows a note with the deviation and the band the score will use. Scoring is
unchanged: it grades the realized value against the absolute envelope.

## Next (in order)

1. **Schedule-derived whirlpool IBU** — the hop math now lives in the sealed
   backend boundary `solver.hops` (`docs/hops/whirlpool-hopping-model.md`); the
   remaining work is replacing the manual `batch.whirlpool_ibu_fraction` with a
   schedule-derived IBU split. The JS `views/whirlpool.js` / `views/hops.js`
   copies are the offline stub only.
2. **Footer bar** — style-conformance readouts (gravity/ABV/SRM/IBU) + LIFO
   warnings (`plans/warnings.md`).

## Before 1st printed recipe

* Staged notes (the brew-day checklist):
  * Day before
  * Day of
  * Before underletting
  * Before topping up
  * Before sparging
  * Before boiling
  * Before whirlpooling
  * Before knockout
  * Before sealing the fermenter

## Later

* **Surface and fit the grain thermal factor** — `mash_thermal_factor` (0.41)
  drives `mash.strike_water_temp_base_c` but has no readout. Surface it near
  Strike Water Temp, then move it toward an equipment-scoped value estimated
  from observed strike-water outcomes (rolling average / regression). Needs a
  rig-level observation record.
* **Dry hopping** — the schedule renders (`batch.dry_hops` rows with
  `hop_product_type` / `hop_addition_stage`); see the `## Next` card rebuild.
* **Per-field taxonomy subsets** — a `domain: { in: [...] }` form for
  taxonomy-typed schema fields, so a row type can restrict a universal taxonomy
  to its valid members (e.g. a dry-hop row to `fermentation`). Needs grammar,
  validator, backend parity, and the inventory emitter to agree.
* Realtime cross-tab / multi-device sync (Firestore `onSnapshot`)
* Offline resilience (IndexedDB write-ahead overlay)
* Unit scaling (`plans/unit-scaling.md`)
* Lazy-load seed data (bundle size)
* **Cooling curves** — named kettle ΔT-over-time profiles feeding the whirlpool model;
  the first record-library catalog using the non-DAG record schema layer
  (`plans/cooling-curve-determination.md`).
* **Style-conformance water axis** — nothing scores water against the chosen style today:
  `styleConformance.js` covers only `og`/`fg`/`abv`/`ibu`/`srm` and `styles.json` carries
  no water fields. Needs a desired water character, a realized character derived from the
  batch, a verdict layer, and a granularity decision (per style / category / water family).
* **App shell navigation** — the wizard toolbar mixes navigation (`Recipes`), per-recipe
  verbs (`Freeze`, `Move to trash`), a tool (library), and settings (`Units`, sign out) at
  equal weight; move to a labeled nav that collapses to a hamburger below a breakpoint,
  with verbs in a row overflow and settings top-right.
* **View recompute granularity** — wholesale `produce()` recompute is by design (A9
  determinism / A1 no-reactivity). Production runs HTTP-debounced; the synchronous path
  (`boundaryRunner.js` scheduleSolve) is tests-only. Revisit only if profiling shows jank
  as field count grows (cooling curves, style-water axis).
* **Water grid status chips** — `docs/adsco/ui.md` specifies Exact / Floor / Buffer /
  Floating / Compromise / Below-buffer per ion; the card renders `Target` / `Best fit` /
  `Buffer` / `Auto` / `No value`. Needs the remaining states surfaced from the
  boundary (telemetry still carries only free-text messages).
* **Artifact-declared routing** — the mode → pin-set mapping lives in the presentation
  registry, pinned to the Python router by a fixture. Moving it into `data/artifact.json`
  would remove the duplication outright, but `constants` is scalar-only today, so it
  needs a non-scalar value kind (grammar + `schema_version` + inventory + docs).

### Report sections

Five sections have landed — Brewhouse, Batch Facts, Yeast, Volume Ledger and
Liquor Ledger — with the bundle and the render service (`GET`/`POST
/batches/{id}/report`). One bullet per remaining section; the presence predicates
are in `plans/report-renderer.md` §6.4. Queue order is the order below.

* **Boil hops section** — `batch.boil_hops` rows; addition list with alpha, boil
  remaining, and IBU share. Needs the schedule-derived split (Next #1) before the
  share is meaningful. The deferred Boil section, when it lands, is where this
  schedule and the pre/post gravity pair sit.
* **Whirlpool hops section** — `batch.whirlpool_hops` rows; duration, initial
  temperature, product form, IBU share. Same split dependency.
* **Dry hops section** — `batch.dry_hops` rows; variety, quantity/unit, contact
  duration, application stage.
* **Mash rests section** — `mash.rests` rows; step, temperature, duration, enabled.
  Strike temperature already prints in Brewhouse.
* **Pinned ions section** — `water.pinned_ions` rows; the checked targets and their
  values, so a reader can see what constrained the water solver.
* **Salt dosing section** — `solver.water` present and `total_added_salt_mass_g > 0`;
  mash and sparge additions against their dose volumes (`cascade.v_strike`,
  `batch.sparge_salted_volume`).
* **Water chemistry section** — `solver.water` present; predicted mash pH and the
  realized ion profile against the target.
* **Style conformance section** — `conformance` is not `null`; SAI and the
  per-pillar verdicts already captured at freeze.

### Low priority

* **Shape-pin burn-down** — the complexity ratchet and its guard landed with the
  lint program (`tests/guards/shape-pins.test.js` re-measures every pin, so a
  ceiling can only be lowered). What is left is the residue it recorded: 45
  functions in 26 `frontend/src` files above `complexity 12`, seven files above
  400 lines, plus the script layer's pins from the drift-gates program. The
  interpreter leads (`views/producer/projection.js` 39, `engine/validate.js` 34,
  `views/producer/scalar.js` 33, `engine/ast.js` 22 — dispatch over the grammar,
  so the split is a table per node kind), then the solve and refresh paths
  (`boundaryRunner.js` 35 / 210 lines, `cards/water.js` 38 / 639 lines,
  `stepView.js` 19) and the stores (`userCatalog.js` 33, `unitPrefs.js` 27,
  `library.js` 18). Each split lowers its pin in the same commit and deletes it
  once the file is under the ceiling. Cleanup, not a gate: `engine/units.js` (93)
  was the one that mattered and is now under the ceiling.


## Engine robustness follow-ups

* **Non-finite propagation (L4):** `÷0` → `NaN/∞` is only flagged for root/choice
  domains, not derived nodes. Consider a global "derived values finite" guard.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

* `max` reduction; boolean **input** kind (roots need a dimension, choices a
  taxonomy — no boolean toggle node yet); list literals; map/dict value type.
* True nested boundary outputs (currently flattened to dotted keys).

## Done

* **Dry-hopping card** — the generic collection table became a bespoke schedule
  on three axes: application event, contact time, and hop type. The row carries
  `hop_application_event` and `hop_contact_until` taxonomies, the contact
  duration is authored in hours and stored in base minutes, and the two contact
  fields are mutually exclusive by construction (each setter clears the other).
  Descriptive only: no fermentation model exists, so neither the event nor the
  trigger is presented as a prediction (`plans/hops-documentation-and-dry-hop-card.md`).

* **Optimize local testing** — seven phases (0–6): a per-file test-cost ledger;
  `make quick` (check, then the suites the diff can reach, with a declared coupling
  table, a full-suite fallback and a pre-push gate hook while `make test` stays the
  gate); the frontend suites at 3 × available parallelism; memoized artifact
  validation and graph build; reset instead of rebuild in the harness
  (`sharedTestApp` / `withFreshApp`, 37 of the 41 app-booting suites sharing an
  app); and one compile per paper in the backend report suite. Measured on this box
  (i3-6100U, 2C/4T): `make test` 56.9 → 43.1–45.8 s across the closing runs, `make verify`
  54.0 s; the
  closing ledger is 156 frontend files / 960 tests in 47.9 s serial and 51 backend
  files / 698 tests in 19.8 s; `make quick` runs 1 of 156 suites in 9.6 s on a
  docs-only diff and 84 of 156 in 23.3 s on a synthetic 12-module diff. Coverage
  holds at 96.11 / 86.56 / 91.52 % frontend and 96 % of 3207 backend statements.
  No dependency was added: `pytest-xdist` stays deferred and the pre-push refusal
  stays manual — `plans/archive/optimize-local-testing.md` §7. The shape-pin
  burn-down stays queued below.

* **Drift gates** — the script layer joined the lint contract (`scripts/**` under
  eslint rules plus the shape caps for `.mjs`, ruff for the `.py` scrapers; the
  guard suite runs under the full source rules), test discovery is recursive, and
  `make check` re-checks the two pre-commit rules a `--no-verify` commit would
  bypass (`scripts/check-hygiene.mjs`: frozen paths, manifest/lock pairs — with
  the lock demanded only when the dependency blocks actually change). Every shape
  pin is now re-measured against the linter (`scripts/shape-pins.mjs`), so a pin
  must be lowered in the commit that improves its file. Prose docs are held to the
  paths they cite: every backticked dotted token in a living doc must resolve to
  the artifact, the report catalog, or the bundle fixture
  (`tests/guards/docs-claims.test.js`), which found and fixed six stale
  citations. CI (`.github/workflows/verify.yml`) runs `make check`, `make test`,
  and `make build` on every push and PR.

* **Alpine maintainability and module linting** — five phases: a lint contract over
  `frontend/src` (semantic rules, DOM scoped to `adapters`/`main.js`, console output
  routed through `reportError`); the generated ownership index and `SHARED`
  interface over 567 members; eight card-group formatter extractions into
  `views/producer/`; the style-target and scale-preview splits plus the declared
  `CARD_REFRESHES` pipeline; the size and complexity ratchet (48 pins and three
  grouped overrides, all named); and the store's three client imports inverted at
  the composition root —
  `plans/archive/alpine-maintainability-and-module-linting.md`.

* **Decomposition & display contract** — nine phases: the adapter-format allowlist
  is empty and every numeric readout routes through `views/producer/cell.js`
  (`formatCell` / `cellLabel`); backend errors and capacity limits share one class
  and one table in `core/errors.py`; collections declare row-scoped computed
  `fields` (grammar 10, payload 3) and the fermentable rows read
  `grist_row.mass_kg` / `extract_kg` / `sugar_row.resolved_mass_kg` from the
  artifact; `core/batch_solver.py` became the ten-module `core/batch/` package and
  `core/water.py` the nine-module `core/water/` package, with
  `core/water/telemetry.py` the only findings channel; the style card split into
  `adapters/cards/style/` over a pure `views/producer/stylePlot.js`; and
  `services/bundle_integrity.py` owns the bundle's twelve cross-reference checks
  behind `parse_bundle` / `seal_bundle` —
  `plans/archive/decomposition-and-display-contract.md`.

* **Report bundle** — the freeze-time, self-sufficient render input: guarded
  schema, the server-side assembly that owns the artifact and the canonical
  content hash, and the committed fixture — `plans/archive/report-bundle.md`.
* **Report render service** — `report_render.py` plus `GET`/`POST
  `/batches/{id}/report`: temp-root compile with the pinned binary, PDF or one PNG
  page, section/page headers, an `ETag` for frozen renders, and 422/409/503
  mapping — `docs/report-renderer.md`.
* **Report section picker** — `GET /report/sections` from the generated manifest, and a
  Build report… modal on frozen rows and in the editor: Preview opens a tab, Download saves
  `<batch>-<n>-sections.pdf` — `docs/report-renderer.md`.
* **Report process sections** — Brewhouse (first) and Liquor Ledger (last), the HLT
  target/required outputs, brewhouse efficiency, the display-only sparge-water target,
  and a ledger that closes on the sparge demand (the top-up target is a floor, so a
  full HLT reads as available liquor plus surplus, never a negative underlet) —
  `plans/archive/report-process-sections.md`.
* **Report fermentable readouts** — the extract-contribution table, the below-cap grist
  attenuation row, and the sugar lift collapsed onto the artifact node — same plan, phase 2.
* **Scale pins and audited sugar database** — ABV/OG/FG recipe pins, the live
  pin-preview matrix, effective sugar fermentability, and the three-tier sugar
  source — `plans/archive/pin-matrix.md`, `docs/sugar-database.md`,
  `docs/attenuation-model.md` §6.1.
* **Attenuation refactor (Passes 2–3)** — extract-composition model, real/apparent
  basis conversion, malt-only cap, diastaticus dextrin consumption, and the
  late-addition intent pin (dose \| share of extract) —
  `plans/archive/attenuation-refactor.md`, `plans/archive/late-addition-intent.md`,
  `docs/attenuation-model.md`.
* **Fermentability provenance (Pass 1)** — `malt_database` basis/method tags and
  the vendored source contract; commit record in
  `plans/archive/fermentability-provenance.md`.

* Batch solver correctness (absorption, transfer loss, physical floor, capacity
  findings, feasible ABV, findings enumeration, freeze gate) —
  `plans/archive/batch-solver-correctness.md`
* Fermentability and the Belgian knob (reconciled design) — `plans/archive/fermentability-and-belgian-knob.md`
* Off-graph identity (equipment, water source, and style as immutable context records) — `plans/archive/off-graph-identity.md`
* Model honesty (absence vs. defaults, selection types, seed defaults) — `plans/archive/model-absence-and-seed-defaults.md`
* Landing page & batch setup — `plans/archive/landing-and-batch-setup.md`
* Mash ramp time (`mash.ramp_time_min`, equipment ramp rate) + minimum-LGR warning
* Hop bitterness boundary (`solver.hops`, Tinseth + Arrhenius) with offline stub
* On-blur numeric input formatting (raw draft text, live solve)
* Record library foundation (server records, copy-forward, Google allowlist, user-scoped batches) — `plans/archive/record-library-foundation.md`
* Water chemistry cleanup (read-only records, copy-forward ions, RO-as-report, treated-water vs target, SO4:Cl intent, dose basis + brew-day instruction) — `plans/archive/water-chemistry-cleanup.md`
* Bounded buffer-capacity mash pH model (`plans/archive/mash-ph-buffer-capacity.md`)
* Selector option labels everywhere (`plans/archive/selector-option-labels.md`)
* Flowable whirlpool hop-product seeds (`hop_product` catalog, DynaBoost/Incognito/generic presets, inspector T-90 equivalent) — `plans/archive/hop-product-whirlpool-seeds.md`
* CSS consolidation & drift guardrails (`plans/archive/css-consolidation.md`)
* Water chemistry step card (`solver.water` boundary + full card)
* Whirlpool hop schedule (IBU-share boil/whirlpool pools, Arrhenius cooling integral) — `docs/hops/whirlpool-hopping-model.md`
* Parallel seed builders (malts, sugars, hops, yeasts, styles)
* Batch/recipe CRUD + menu
* Recipe landing page (freeze rail, sortable library, row menus, inline rename)
* Batches view (scope filters, identity columns, lineage), Library Sources/Ingredients
  split, style as a catalog kind with fork/seal, selection-only new-batch dialog,
  read-only workspace identity, batch-scoped hop alpha — `plans/archive/batches-view-and-record-layer.md`
* Water pin visibility & coverage (pin/float rendering from one ion registry, profile
  intent, Mode 5 cap, beer × water × settings test matrix) —
  `plans/archive/water-pin-visibility-and-test-matrix.md`
