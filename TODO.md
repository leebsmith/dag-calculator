# TODO

## Lazy-load seed data

`frontend/src/store/referenceCache.js` currently `import`s all seed files, which
bundles the full catalogs (175-entry yeast list, sugars, water reports) into the
client bundle. For production, fetch seeds on demand (per selection / per slice)
instead of bundling them — keep the MWE's eager imports as-is for now.

## Real Firebase auth on the `/solve` routes

`backend/app/auth/deps.py::get_current_user` is a permissive stub. Replace it with
Firebase Admin `verify_id_token`, and enforce the bearer token on `POST /solve/batch`
and `/solve/water`. (See `tech-stack.md` §3–4.)

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

- `max` reduction; boolean **input** kind; list literals; map/dict value type.
- True nested boundary outputs (currently flattened to dotted keys).
