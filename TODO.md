# TODO

## In progress

* **Water pin visibility & coverage** (`plans/water-pin-visibility-and-test-matrix.md`)
  — pin/float rendering from one ion registry, profile intent, Mode 5 cap, and the
  beer × water × settings test matrix.

## Next (in order)

1. **Whirlpool engine promotion** — the host-side cooling model and IBU-share
   schedule landed (`docs/whirlpool-hopping-model.md`, `views/whirlpool.js`);
   remaining work is promoting Tinseth/whirlpool math into the artifact and
   replacing the manual `batch.whirlpool_ibu_fraction` with schedule-derived
   IBU.
2. **Summary reporting** — rendered recipe document (`plans/recipe-pipeline.md`,
   `plans/recipe-yaml-grammar.md`) + staged brew-day checklist.
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
