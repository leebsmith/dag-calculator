# TODO

## Next (in order)

1. **Schedule-derived whirlpool IBU** — the hop math now lives in the sealed
   backend boundary `solver.hops` (`docs/hops/whirlpool-hopping-model.md`); the
   remaining work is replacing the manual `batch.whirlpool_ibu_fraction` with a
   schedule-derived IBU split. The JS `views/whirlpool.js` / `views/hops.js`
   copies are the offline stub only.
2. **Footer bar** — the shell landed: save state and conflict recovery, step
   position, boundary status, violation count, SAI, and the enumerated findings
   list. What remains is the gravity/ABV/SRM/IBU readouts and the LIFO ordering
   of soft warnings (`plans/warnings.md` W.1–W.5, still proposed).

## Before 1st printed recipe

* Brew checklist (the staged-notes replacement) — Phase 1 shipped: the
  generated pre/brew/post checklist with three levels and a printed blank
  appendix. Phase 2 shipped: frozen-batch sessions, checklist state, live and
  deferred observations, raw/corrected/method, automated hydrometer and
  refractometer corrections, variance, sealing and the printable Brew Sheet.
  Phase 3 (calibration and cooling-curve promotion) remains. See
  `plans/brew-checklist.md`, `plans/brew-session.md` and
  `plans/brew-measurement-promotion.md`.

## Later

* **Surface and fit the grain thermal factor** — `mash_thermal_factor` (0.41)
  drives `mash.strike_water_temp_base_c` but has no readout. Surface it near
  Strike Water Temp, then move it toward an equipment-scoped value estimated
  from observed strike-water outcomes (rolling average / regression). Needs a
  rig-level observation record.
* **Per-field taxonomy subsets** — a `domain: { in: [...] }` form for
  taxonomy-typed schema fields, so a row type can restrict a universal taxonomy
  to its valid members (e.g. a dry-hop row to `fermentation`). Needs grammar,
  validator, backend parity, and the inventory emitter to agree.
* Realtime cross-tab / multi-device sync (Firestore `onSnapshot`)
* Offline resilience (IndexedDB write-ahead overlay)
* Unit scaling (`plans/unit-scaling.md`)
* Lazy-load seed data (bundle size)
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
* **Recipe critiquers** — two prose-only LLM assistants (mash/yeast/style and
  boil/whirlpool) that critique a completed recipe against the background
  documents in `docs/mashing/reference/` and `docs/hops/reference/`; on demand,
  independently invokable, memoized, never fed back into the model. The program,
  the shared completion flag, the assistant registry, the dossier contract and
  the provider decisions are in `plans/recipe-critiquers.md`.
* **Catalog duplicate visibility** — malts, sugars and trace malts still hide a
  variety already in the draft, unlike the hop drawers, which keep it and show the
  row count (`allowDuplicates` on the shared catalog-draft mixin).

### Report sections

Ten sections have landed — Brewhouse, Batch Facts, Mash Rests, Hops, Yeast,
Volume Ledger, Liquor Ledger, Water Chemistry, Limits and the Brew Checklist —
with the bundle and the render service (`GET`/`POST /batches/{id}/report`).
Brewhouse prints the two solved mash ratios (L/kg and r); Mash Rests prints only
the enabled schedule plus the total mash time; Water Chemistry carries the source
report, the target profile, the source-to-final ion table, the mash and sparge
treatment doses, predicted mash pH and solver telemetry; and Limits carries the
feasibility ceiling and binding capacity plus a closing extract ledger:
potential, conversion inefficiency, converted, mash tun and transfer losses,
into the kettle, late additions, post-boil, kettle losses, into the fermenter,
and the kettle-basis brewhouse efficiency. One bullet per remaining section; the
presence predicates are in `plans/report-renderer.md` §6.4. Queue order is the
order below.

* **Pinned ions section** — `water.pinned_ions` rows; the checked targets and their
  values, so a reader can see what constrained the water solver.
* **Style conformance section** — `conformance` is not `null`; SAI and the
  per-pillar verdicts already captured at freeze.

### Low priority

* **Shape-pin burn-down** — the complexity ratchet and its guard landed with the
  lint program (`tests/guards/shape-pins.test.js` re-measures every pin, so a
  ceiling can only be lowered). What is left is the residue it recorded: 47
  functions in 25 `frontend/src` files above `complexity 12`, eight files above
  400 lines, plus the script layer's pins from the drift-gates program. The
  interpreter leads (`views/producer/projection.js` 34, `engine/validate.js` 34,
  `views/producer/scalar.js` 21, `engine/ast.js` 22 — dispatch over the grammar,
  so the split is a table per node kind), then the solve and refresh paths
  (`boundaryRunner.js` 35 / 213 lines, `cards/water.js` 38 / 639 lines,
  `stepView.js` 19) and the stores (`userCatalog.js` 32, `unitPrefs.js` 27,
  `library.js` 18). Each split lowers its pin in the same commit and deletes it
  once the file is under the ceiling. The backend equivalent is now a hard
  ceiling — `max-complexity 10` in `backend/pyproject.toml`, no pins — so this
  queue is frontend-only.

## Engine robustness follow-ups

* **Non-finite propagation (L4):** `÷0` → `NaN/∞` is only flagged for root/choice
  domains, not derived nodes. Consider a global "derived values finite" guard.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

* `max` reduction; boolean **input** kind (roots need a dimension, choices a
  taxonomy — no boolean toggle node yet); list literals; map/dict value type.
* True nested boundary outputs (currently flattened to dotted keys).

## Done

* **Style targets ±2 JND** — SRM/IBU sliders reach two JNDs past the style envelope with a deviation note; scoring still grades the absolute envelope (`7e5866f`).
* **Dry-hopping card** — event / contact-time / hop-type schedule with a catalog editor, descriptive only — `plans/hops-documentation-and-dry-hop-card.md`.
* **Hop catalogue repeats** — the boil and whirlpool drawers keep a variety already in the draft and show the row count.
* **Optimize local testing** — test-cost ledger, `make quick`, suite parallelism, memoized validation and graph build, one compile per paper — `plans/archive/2026-10/optimize-local-testing.md`.
* **Drift gates** — scripts under the lint contract, recursive test discovery, pre-commit rules re-checked in `make check`, re-measured shape pins, docs-claims, CI on every push.
* **Alpine maintainability and module linting** — lint contract, ownership index, formatter extractions, style-target split, size and complexity ratchet — `plans/archive/2026-10/alpine-maintainability-and-module-linting.md`.
* **Decomposition & display contract** — empty adapter-format allowlist, one `cell.js` readout path, the batch and water packages, the style card split, bundle integrity — `plans/archive/2026-10/decomposition-and-display-contract.md`.
* **Report bundle** — freeze-time self-sufficient render input with a guarded schema and a committed fixture — `plans/archive/2026-10/report-bundle.md`.
* **Report render service** — `GET`/`POST /batches/{id}/report`, pinned Typst binary, ETag, 422/409/503 mapping — `docs/report-renderer.md`.
* **Report section picker** — `GET /report/sections`, a Build report… modal, preview and download — `docs/report-renderer.md`.
* **Report process sections** — Brewhouse and Liquor Ledger, HLT targets, the ledger closing on sparge demand — `plans/archive/2026-10/report-process-sections.md`.
* **Report fermentable readouts** — extract-contribution table, below-cap attenuation row, sugar lift — same plan, phase 2.
* **Scale pins and audited sugar database** — ABV/OG/FG pins, the pin-preview matrix, effective sugar fermentability, the three-tier sugar source — `plans/archive/2026-10/pin-matrix.md`.
* **Attenuation refactor (Passes 2–3)** — extract-composition model, basis conversion, malt-only cap, diastaticus dextrin consumption, late-addition intent pin — `plans/archive/2026-10/attenuation-refactor.md`.
* **Fermentability provenance (Pass 1)** — `malt_database` basis and method tags plus the vendored source contract — `plans/archive/2026-10/fermentability-provenance.md`.
* **Batch solver correctness** — absorption, transfer loss, physical floor, capacity findings, feasible ABV, freeze gate — `plans/archive/2026-10/batch-solver-correctness.md`.
* **Fermentability and the Belgian knob** — the reconciled design — `plans/archive/2026-10/fermentability-and-belgian-knob.md`.
* **Off-graph identity** — equipment, water source and style as immutable context records — `plans/archive/2026-10/off-graph-identity.md`.
* **Model honesty** — absence vs. defaults, selection types, seed defaults — `plans/archive/2026-10/model-absence-and-seed-defaults.md`.
* **Landing page & batch setup** — `plans/archive/2026-10/landing-and-batch-setup.md`.
* **Mash ramp time** — `mash.ramp_time_min`, the equipment ramp rate and the minimum-LGR warning.
* **Hop bitterness boundary** — `solver.hops`, Tinseth plus Arrhenius, with an offline stub.
* **On-blur numeric input formatting** — raw draft text with a live solve.
* **Record library foundation** — server records, copy-forward, Google allowlist, user-scoped batches — `plans/archive/2026-10/record-library-foundation.md`.
* **Water chemistry cleanup** — read-only records, copy-forward ions, RO-as-report, treated-water vs target, SO4:Cl intent, dose basis — `plans/archive/2026-10/water-chemistry-cleanup.md`.
* **Bounded buffer-capacity mash pH model** — `plans/archive/2026-10/mash-ph-buffer-capacity.md`.
* **Selector option labels everywhere** — `plans/archive/2026-10/selector-option-labels.md`.
* **Flowable whirlpool hop-product seeds** — `hop_product` catalog, DynaBoost/Incognito presets, the inspector T-90 equivalent — `plans/archive/2026-10/hop-product-whirlpool-seeds.md`.
* **CSS consolidation & drift guardrails** — `plans/archive/2026-10/css-consolidation.md`.
* **Water chemistry step card** — `solver.water` boundary and the full card.
* **Whirlpool hop schedule** — IBU-share pools and the Arrhenius cooling integral — `docs/hops/whirlpool-hopping-model.md`.
* **Parallel seed builders** — malts, sugars, hops, yeasts, styles.
* **Batch/recipe CRUD + menu**.
* **Recipe landing page** — freeze rail, sortable library, row menus, inline rename.
* **Batches view** — scope filters, identity columns, lineage, the Library Sources/Ingredients split, style as a forkable catalog kind — `plans/archive/2026-10/batches-view-and-record-layer.md`.
* **Water pin visibility & coverage** — pin/float rendering from one ion registry, Mode 5 cap, the beer × water × settings matrix — `plans/archive/2026-10/water-pin-visibility-and-test-matrix.md`.
