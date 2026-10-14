# TODO

## Before 1st printed recipe

*  Need staged notes 
  * Day before
  * Day of
  * Before underletting
  * Before topping up
  * Before sparging
  * Before boiling
  * Before whirlpooling
  * Before knockout
  * Before
  * Before sealing the fermenter

## Next (Don't process without confirmation)

- Import BJCP JSON as a seed. Andrew Scholer's version. Need Pydantic schema
- Dry hopping: See Pydantic schema (WetHopCard) at https://share.gemini.google/o4oHUKhZUdyi
- Kettle hopping (Determines IBU.)
- Trace additions (Influences color.)
- Unit scaling: scale families + auto-display (`plans/unit-scaling.md`)
- Add IBU / SRM / Style to batch data. Gate up front on mismatch

## Lazy-load seed data

`frontend/src/store/referenceCache.js` `import`s every seed file, bundling the
full catalogs (115-entry malt list, 175-entry yeast list, sugars, water reports)
into the client bundle. For production, fetch seeds on demand (per selection /
per slice) instead of bundling them.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

- `max` reduction; boolean **input** kind (roots need a dimension, choices a
  taxonomy — no boolean toggle node yet); list literals; map/dict value type.
- True nested boundary outputs (currently flattened to dotted keys).

## Engine robustness follow-ups

- **Freeze shape (M1):** `freezePayload` snapshots boundary nodes as the internal
  `{ outputs, fingerprint }` wrapper, not the outputs. Unwrap to `get(id).outputs`
  before any frozen read-view/reconcile consumes the valuation.
- **Non-finite propagation (L4):** `÷0` → `NaN/∞` is only flagged for root/choice
  domains, not derived nodes. Consider a global "derived values finite" guard.
