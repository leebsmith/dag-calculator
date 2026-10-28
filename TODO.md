# TODO

## In flight

* Nothing in flight; the attenuation refactor closed at P3c.

## Next (in order)

1. **Schedule-derived whirlpool IBU** — the hop math now lives in the sealed
   backend boundary `solver.hops` (`docs/whirlpool-hopping-model.md`); the
   remaining work is replacing the manual `batch.whirlpool_ibu_fraction` with a
   schedule-derived IBU split. The JS `views/whirlpool.js` / `views/hops.js`
   copies are the offline stub only.
2. **Summary reporting** — Typst-rendered recipe report (`plans/report-renderer.md`)
   + staged brew-day checklist. Landed: the freeze bundle
   (`plans/report-bundle.md` R1–R4), the template scaffold, the registry contract
   and its guards, the formatting parity vector, and the local loop
   (`make report-dev` / `report-pages`, `docs/report-renderer.md`). Next: sections
   one at a time (`docs/adding-a-section.md`), then `report_render.py` + routes.
3. **Footer bar** — style-conformance readouts (gravity/ABV/SRM/IBU) + LIFO
   warnings (`plans/warnings.md`).

## Before 1st printed recipe

* Staged notes (covered by "Summary reporting" above):
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

* **Below-cap attenuation readout** — the report (and the Style card) surface the lift above the
  malt cap, but not the opposite case: the solver clamps malt fermentability one-sided
  (`F_eff = min(F_grist, cap_real)`), so a grist less fermentable than the yeast's ceiling yields
  realized AA *below* the cap with nothing on the page explaining it. The honest figure is the
  grist's extract-weighted real fermentability (`composite_fermentability_fraction` in
  `core/batch_solver.py`) against `cap_real`; `aa_malt` exists only inside the solver request, and
  neither a boundary output nor an artifact node exposes it. Needs either a `malt_fermentability`
  boundary output or an artifact `grist.weighted_fermentability` (extract-weighted: parts × yield ×
  (1 − moisture)), plus the OE-dependent real→apparent conversion if it is to join the apparent
  chain without mixing bases. Deferred when the above-cap row landed
  (`batch.attenuation_above_cap`).
* **Above-cap: one definition** — the Style card still derives the lift in
  `views/producer/attenuationCap.js` (`max(0, blend − cap)`), while the artifact now carries the
  same delta as `batch.attenuation_above_cap`. Point the card at the node so the readout and the
  report cannot drift; keep "Sugar lift above cap" as the card's wording (the node is neutral about
  the cause).
* **Extract-contribution table** — the fermentable tables report mass; an extract view would
  recapitulate every mash component by its extract contribution (`mass × yield × (1 − moisture)`
  for malt, `mass × yield` for sugar, trace excluded — A9) with each row's share of total extract.
  That is where a sugar's 9.8 % of grist mass and 9.4 % of extract become two visible numbers.
  Needs producer extract columns and a home: a fourth table in Batch Facts, or its own section.
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


## Engine robustness follow-ups

* **Non-finite propagation (L4):** `÷0` → `NaN/∞` is only flagged for root/choice
  domains, not derived nodes. Consider a global "derived values finite" guard.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

* `max` reduction; boolean **input** kind (roots need a dimension, choices a
  taxonomy — no boolean toggle node yet); list literals; map/dict value type.
* True nested boundary outputs (currently flattened to dotted keys).

## Done

* **Report process sections** — Brewhouse (first) and Liquor Ledger (last), the HLT
  target/required outputs, brewhouse efficiency, and the display-only sparge-water target —
  `plans/report-process-sections.md`.
* **Scale pins and audited sugar database** — ABV/OG/FG recipe pins, the live
  pin-preview matrix, effective sugar fermentability, and the three-tier sugar
  source — `plans/pin-matrix.md`, `docs/sugar-database.md`,
  `docs/attenuation-model.md` §6.1.
* **Attenuation refactor (Passes 2–3)** — extract-composition model, real/apparent
  basis conversion, malt-only cap, diastaticus dextrin consumption, and the
  late-addition intent pin (dose \| share of extract) —
  `plans/attenuation-refactor.md`, `plans/late-addition-intent.md`,
  `docs/attenuation-model.md`.
* **Fermentability provenance (Pass 1)** — `malt_database` basis/method tags and
  the vendored source contract; commit record in
  `plans/fermentability-provenance.md`.

* Batch solver correctness (absorption, transfer loss, physical floor, capacity
  findings, feasible ABV, findings enumeration, freeze gate) —
  `plans/batch-solver-correctness.md`
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
  read-only workspace identity, batch-scoped hop alpha — `plans/batches-view-and-record-layer.md`
* Water pin visibility & coverage (pin/float rendering from one ion registry, profile
  intent, Mode 5 cap, beer × water × settings test matrix) —
  `plans/water-pin-visibility-and-test-matrix.md`
