# TODO

## Resume (2026-10-12)

E-e1 is committed: 7-step workflow complete (horizontal wrapping stepper, menu
bar + sticky footer, generic `step-card` partial, global dimension-level unit
switcher), plus the seam work (schema-aware references, seed normalizers,
empty-selection guard, per-card violation markers). `make check` / `make test`
green.

Next up:
- **Step F** (persistence/freeze/auth) and **Step G** (seed/schema conformance)
  — parallel; no `plans/step-F-*` / `step-G-*` files yet.
- **Deferred from E-e1** (see `plans/step-E-product-views.md` E-e1 addendum):
  - live-HTTP boundary debounce + in-flight coalescing (`engineAdapter.js`);
  - per-node unit preferences (extend `uiStore.unitMode` with per-field override);
  - `solver.water` salt-addition readouts (blocked on the C14 serialization-unit gap).

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
