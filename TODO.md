# TODO

## Program status

| Step | Status |
|---|---|
| A — grammar v2 + loadable artifact | done |
| B — engine enforcement (relations + domains) | done |
| C — conformance & correctness | done |
| D — JSON seam (async boundary adapter) | done |
| E — product/views | done |
| E-e1 — remaining 3 steps + horizontal stepper + unit switcher | done |
| F — persistence / freeze / auth (`plans/step-F-*.md`) | done (F-e deferred) |
| G — seed/schema conformance | done |

**Now:** — program complete. Remaining optional/deferred items below.

## Deferred (E-e1)

All E-e1 deferrals are now **done**:
- per-node unit preferences (per-field unit badge, cycle toggle, `unitMode[field.id]` override);
- unit-preference persistence (localStorage, schema-version stamped, sanitized on load);
- live-HTTP boundary debounce + in-flight coalescing (`engineAdapter.js`);
- `solver.water` salt-addition readouts (mash + sparge, `g`/`ml` via registry `displayUnit`).

## Deferred (Step F)

- F-e — drift reconcile (reset-to-seed / keep-custom) on opening a frozen batch.

## Lazy-load seed data

`frontend/src/store/referenceCache.js` currently `import`s all seed files, which
bundles the full catalogs (175-entry yeast list, sugars, water reports) into the
client bundle. For production, fetch seeds on demand (per selection / per slice)
instead of bundling them — keep the MWE's eager imports as-is for now.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

- `max` reduction; boolean **input** kind; list literals; map/dict value type.
- True nested boundary outputs (currently flattened to dotted keys).
