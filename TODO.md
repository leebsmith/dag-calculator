# TODO

## Next (in order)

1. **Whirlpool IBU engine** — promote the host-side Tinseth boil math
   (`views/hops.js`) into a first-class engine path and add a whirlpool
   utilization model (temp/time decay), replacing the manual
   `batch.whirlpool_ibu_fraction`.
2. **Summary reporting** — rendered recipe document (`plans/recipe-pipeline.md`,
   `plans/recipe-yaml-grammar.md`) + staged brew-day checklist.
3. **User-authored catalog items (CRUD)** — `plans/user-authored-items.md`;
   local-first (localStorage), Firestore later.
4. **Footer bar** — style-conformance readouts (gravity/ABV/SRM/IBU) + LIFO
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
* Unit scaling (`plans/unit-scaling.md`)
* Lazy-load seed data (bundle size)
* Firestore for user-authored items

## Engine robustness follow-ups

* **Freeze shape (M1):** `freezePayload` snapshots boundary nodes as the internal
  `{ outputs, fingerprint }` wrapper, not the outputs. Unwrap to `get(id).outputs`
  before any frozen read-view/reconcile consumes the valuation.
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
