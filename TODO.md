# TODO

## Expand artifact to full contract

`solver.batch` and `solver.water` in `data/artifact.json` currently declare only an
exemplar subset of their inputs/outputs (the artifact is `status: "exemplar"`).
Populate them to parity with `docs/dag-artifacts/domain-equations.md` §2–3 and the
sealed Pydantic contracts in `backend/app/schemas/boundary.py`:

- `solver.batch` — add all ~17 `BatchSolverRequest` inputs and all
  `BatchSolverResponse` outputs (`cascade`, `hlt`, `max_achievable_abv`, …).
- `solver.water` — add all `WaterSolverRequest` inputs and `WaterSolverResponse`
  outputs (`prescription`, `mash_additions`, `sparge_additions`,
  `post_salt_mash_ions`, `grist_buckets_kg`, …).

Until then the frontend boundary adapter assembles the full request from declared
inputs plus seed/equipment context.

## Lazy-load seed data

`frontend/src/store/referenceCache.js` currently `import`s all six seed files,
which bundles the full catalogs (175-entry yeast list, sugars, water reports)
into the client bundle. For production, fetch seeds on demand (per selection /
per slice) instead of bundling them — keep the MWE's eager imports as-is for now.
