# TODO

## In flight

* **Alpine maintainability and module linting** — **next: Phase 3, split the two
  ~50-line card computations and declare the refresh pipeline** (`fieldActions`
  landed: `views/producer/authoring.js` holds the input-draft key composer
  (`fieldInputKey`), the parts → pct Hamilton normalization both collection kinds
  repeated (`normalizedRowShares`), and the type-appropriate blank-row defaults
  (`rowDefaults`); `clampToSelection` now returns the strict `utils.js` `clamp`
  result over its resolved bounds, the adapter is 276 lines from 293, every
  member keeps its name and `KEYS` entry and delegates; covered by
  `tests/frontend/authoring.test.js` (6 cases) with `number-input.test.js` and
  `selection-validation.test.js` pinning the app paths. Phase 2 is complete,
  eight of eight). `catalogDraft`
  landed: `views/producer/catalogDrawer.js` holds the drawer readouts the four
  catalogue cards share — the two meta composers, the draft set (`activeCatalogIds`)
  and the inspected row (`activeDraftRow`), the category/family pill tables, the
  standard browser (`catalogStandardGroups`) and its selection name, the
  brand/name product matches, the filtered → visible → truncated chain, and the
  two filter toggles; the adapter is 319 lines from 333, every member keeps its
  name and `KEYS` entry and delegates, and `catalogDraftKeys` is untouched;
  covered by `tests/frontend/catalog-drawer.test.js` (10 cases) with
  `catalogDraft.test.js` (25) and the four card suites pinning the strings.
  `mash` landed: `views/producer/mashRows.js` holds the rest catalogue labels, the advisory
  temperature band, the canonical row defaults + canon↔schedule join, the
  1dp/2dp/whole-unit temperature labels, and the time and LGR summary lines; the
  adapter is 349 lines from 378, every member keeps its name and `KEYS` entry
  and delegates; covered by `tests/frontend/mash-rows.test.js` (7 cases);
  `trace-malts` landed: `views/producer/traceMaltRows.js` holds the catalogue→draft row default
  (`makeTraceMaltRow`: zero mass, the provenance/basis/method/colour/notes the
  boundary reads, no parts or moisture); the drawer subtitle and group line were
  byte-identical to the grain bill's, so they went to `gristRows.js` as
  `maltItemMeta` / `maltGroupMeta` and both cards import them; the adapter is 68
  lines from 90, `malt.js` 173 from 175, every member keeps its name and `KEYS`
  entry and delegates; covered by `tests/frontend/trace-malt-rows.test.js` (3
  cases) plus two drawer-formatter cases in `malt-rows.test.js`. `yeast`
  landed: `views/producer/yeastRows.js` holds the attenuation label and its bare
  percent form, the band classifier + `YEAST_ATTENUATION_TIERS`, the tri-state
  STA1 bucket + counted pills, the temperature band label, and the chooser cap
  (`YEAST_ROW_LIMIT` / `isYeastListTruncated` / `yeastResultLabel`); the adapter
  is 187 lines from 211, every member keeps its name and `KEYS` entry and
  delegates with the state it reads; covered by
  `tests/frontend/yeast-rows.test.js` (8 cases). `malt` landed:
  `views/producer/gristRows.js` holds the trace threshold, the fermentable label
  with its provenance marker, the summary ordering, the parts/percent totals, the
  balance badge, and the 8-row limit; the adapter is 175 lines from 201 and every
  getter keeps its name and delegates with the state it reads; covered by
  `tests/frontend/malt-rows.test.js`. `late-additions` landed:
  `views/producer/lateAdditionRows.js` holds the nine pure readouts — the
  dose-effect labels, the table/catalog counters, the `sugarActive` derivation,
  the display-unit join, and the preview pin labels + envelope classes; the
  adapter is 452 lines from 494 and keeps `syncScalePreviewState` for Phase 3;
  covered by `tests/frontend/late-addition-rows.test.js`. `hops` landed:
  `views/producer/hopRows.js` holds the 9 pure row readouts plus the whirlpool
  form label table; the adapter delegates in one line, 535 → 522 lines, and
  `hopTemp` stays because it reads the display unit; covered by
  `tests/frontend/hop-rows.test.js`). Phase 1 landed in `55f6485`: the surface
  check walks own properties, so the 179 hidden members are governed too;
  `docs/frontend-ownership.md` is generated from the new `modules`/`partials`
  declarations on `installers.js`, with one owner per member; and today's 47
  cross-owner keys sit in a reasoned `SHARED` interface — 15 of 19 installers,
  135 reader/key pairs — that the ownership guard checks exactly. Phase 2 is
  closed; the last group was `fieldActions` (5 helpers). Phases 3–5
  remain: split the two ~50-line card computations and declare the refresh
  pipeline, ratchet size and complexity, and invert the store's three client
  imports.
  Measured at `55f6485`: 19 installers declare 567 members (388 enumerable, 179
  hidden); 353 adapter methods, 28 hot. Each phase lands its own `Landed.` note; the program
  archives to `plans/archive/` when closed — every phase, gate, read fence and
  commit is in `plans/alpine-maintainability-and-module-linting.md`.

## Next (in order)

1. **Schedule-derived whirlpool IBU** — the hop math now lives in the sealed
   backend boundary `solver.hops` (`docs/whirlpool-hopping-model.md`); the
   remaining work is replacing the manual `batch.whirlpool_ibu_fraction` with a
   schedule-derived IBU split. The JS `views/whirlpool.js` / `views/hops.js`
   copies are the offline stub only.
2. **Report sections** — the bundle, the render service (`GET`/`POST
   /batches/{id}/report`), and five sections have landed; the rest are queued in
   Later, starting with the hop sections once the schedule-derived IBU split
   lands.
3. **Footer bar** — style-conformance readouts (gravity/ABV/SRM/IBU) + LIFO
   warnings (`plans/warnings.md`).

## Before 1st printed recipe

* Staged notes (the brew-day checklist, queued in Later):
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

* **Deferred local-view save** — the advisory target and style ABV input still call
  the batch autosave hook; move them to a deferred/queued save after the
  cache-only render fix is settled.
* **Surface and fit the grain thermal factor** — `mash_thermal_factor` (0.41)
  drives `mash.strike_water_temp_base_c` but has no readout. Surface it near
  Strike Water Temp, then move it toward an equipment-scoped value estimated
  from observed strike-water outcomes (rolling average / regression). Needs a
  rig-level observation record.
* Dry hopping (computed WetHopCard; currently description-only)
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
  Floating / Compromise / Below-buffer per ion; the card renders only `Target` / `Auto`.
  Needs per-ion constraint state surfaced from the boundary (telemetry now carries only
  free-text messages).
* **Artifact-declared routing** — the mode → pin-set mapping lives in the presentation
  registry, pinned to the Python router by a fixture. Moving it into `data/artifact.json`
  would remove the duplication outright, but `constants` is scalar-only today, so it
  needs a non-scalar value kind (grammar + `schema_version` + inventory + docs).

### Report sections

One bullet per remaining section; the presence predicates are in
`plans/report-renderer.md` §6.4. Queue order is the order below.

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
* **Brew-day checklist enhancement** — settle what the checklist *is* before
  authoring it. Today `batch.brew_day_steps` is a seeded list of nine moments with
  static instructions. The open idea is carry-forward: inline the batch's own facts
  per step — HLT fill and target temperature, first underlet volume, mash salt and
  acid doses, top-up, sparge volume and temperature, boil time, hop additions,
  knockout volume — so the sheet is executable without cross-reading the ledgers.
  Needs decisions on which section owns each fact, copy vs reference, and
  draft-vs-frozen behaviour; potentially a large change to the seeds and the data
  model. Deliberately last.


## Engine robustness follow-ups

* **Non-finite propagation (L4):** `÷0` → `NaN/∞` is only flagged for root/choice
  domains, not derived nodes. Consider a global "derived values finite" guard.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

* `max` reduction; boolean **input** kind (roots need a dimension, choices a
  taxonomy — no boolean toggle node yet); list literals; map/dict value type.
* True nested boundary outputs (currently flattened to dotted keys).

## Done

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
* Whirlpool hop schedule (IBU-share boil/whirlpool pools, Arrhenius cooling integral) — `docs/whirlpool-hopping-model.md`
* Parallel seed builders (malts, sugars, hops, yeasts, styles)
* Batch/recipe CRUD + menu
* Recipe landing page (freeze rail, sortable library, row menus, inline rename)
* Batches view (scope filters, identity columns, lineage), Library Sources/Ingredients
  split, style as a catalog kind with fork/seal, selection-only new-batch dialog,
  read-only workspace identity, batch-scoped hop alpha — `plans/archive/batches-view-and-record-layer.md`
* Water pin visibility & coverage (pin/float rendering from one ion registry, profile
  intent, Mode 5 cap, beer × water × settings test matrix) —
  `plans/archive/water-pin-visibility-and-test-matrix.md`
