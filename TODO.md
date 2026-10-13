# TODO

## Next

- Dry hopping: See Pydantic schema( WetHopCard)  at https://share.gemini.google/o4oHUKhZUdyi
- Kettle hopping (Determines IBU.)
- Trace additions (Influences color.)
- Unit scaling: scale families + auto-display (`plans/unit-scaling.md`)


## Lazy-load seed data

`frontend/src/store/referenceCache.js` currently `import`s all seed files, which
bundles the full catalogs (175-entry yeast list, sugars, water reports) into the
client bundle. For production, fetch seeds on demand (per selection / per slice)
instead of bundling them — keep the MWE's eager imports as-is for now.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

- `max` reduction; boolean **input** kind; list literals; map/dict value type.
- True nested boundary outputs (currently flattened to dotted keys).
