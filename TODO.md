# TODO

## Urgent

- Why is "configure rests" in menu bar
- Cards don't advance
- Buttons don't work
- Buttons unattractive, unstyled? 


## Next (Don't process without confirmation)

- Import BJCP JSON as a seed. Andrew Scholer's version. Need Pydantic schema
- Dry hopping: See Pydantic schema( WetHopCard)  at https://share.gemini.google/o4oHUKhZUdyi
- Kettle hopping (Determines IBU.)
- Trace additions (Influences color.)
- Unit scaling: scale families + auto-display (`plans/unit-scaling.md`)
- Add IBU / SRM / Style to batch data. Gate up front on mismatch


## Lazy-load seed data

`frontend/src/store/referenceCache.js` currently `import`s all seed files, which
bundles the full catalogs (175-entry yeast list, sugars, water reports) into the
client bundle. For production, fetch seeds on demand (per selection / per slice)
instead of bundling them — keep the MWE's eager imports as-is for now.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

- `max` reduction; boolean **input** kind; list literals; map/dict value type.
- True nested boundary outputs (currently flattened to dotted keys).
