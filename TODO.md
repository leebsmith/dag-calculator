# TODO

## Next (in order)

1. **Record library foundation** — server-persisted immutable record collections,
   copy-forward into the batch, Google sign-in with a build-time email allowlist, and
   batches moved under `users/{uid}/` (`plans/record-library-foundation.md`).
2. **Water chemistry cleanup** — water records become read-only copies, the twelve
   duplicated ion roots go, `calcium_floor_ppm` moves onto the target record, RO becomes
   a source report, and desired SO4:Cl is shown against the kettle ratio
   (`plans/water-chemistry-cleanup.md`).
3. **Whirlpool IBU engine** — promote the host-side Tinseth boil math
   (`views/hops.js`) into a first-class engine path and add a whirlpool
   utilization model (temp/time decay), replacing the manual
   `batch.whirlpool_ibu_fraction`.
4. **Summary reporting** — rendered recipe document (`plans/recipe-pipeline.md`,
   `plans/recipe-yaml-grammar.md`) + staged brew-day checklist.
5. **Footer bar** — style-conformance readouts (gravity/ABV/SRM/IBU) + LIFO
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
  the first catalog authored on the record library, and the trigger for the artifact's
  nested-list grammar.
* **Style-conformance water axis** — nothing scores water against the chosen style today:
  `styleConformance.js` covers only `og`/`fg`/`abv`/`ibu`/`srm` and `styles.json` carries
  no water fields. Needs a desired water character, a realized character derived from the
  batch, a verdict layer, and a granularity decision (per style / category / water family).
* **App shell navigation** — the wizard toolbar mixes navigation (`Recipes`), per-recipe
  verbs (`Freeze`, `Move to trash`), a tool (library), and settings (`Units`, sign out) at
  equal weight; move to a labeled nav that collapses to a hamburger below a breakpoint,
  with verbs in a row overflow and settings top-right.

## Engine robustness follow-ups

* **Non-finite propagation (L4):** `÷0` → `NaN/∞` is only flagged for root/choice
  domains, not derived nodes. Consider a global "derived values finite" guard.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

* `max` reduction; boolean **input** kind (roots need a dimension, choices a
  taxonomy — no boolean toggle node yet); list literals; map/dict value type.
* True nested boundary outputs (currently flattened to dotted keys).

## Done

* Water chemistry step card (`solver.water` boundary + full card)
* Parallel seed builders (malts, sugars, hops, yeasts, styles)
* Batch/recipe CRUD + menu
* Recipe landing page (freeze rail, sortable library, row menus, inline rename)
