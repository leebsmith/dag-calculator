---
title: Step D2 — Real Boundary Requests (batch + water)
step: D.2
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [Step D, Step E]
blocks: []
gate: the UI assembles full BatchSolverRequest / WaterSolverRequest bodies, posts them over the seam, and a real `make local-dev` solve returns a recipe; make check/test green
status: ready
---

# Step D2 — Real Boundary Requests (batch + water)

**Goal:** make a *real* recipe solvable end-to-end. Step D wired the async seam
but assumed the artifact's declared boundary `inputs` already match
`backend/app/schemas/boundary.py`. They don't. The engine resolves inputs into
**frontend** shapes (flat roots, collection rows); the backend uses `extra="forbid"`
Pydantic models with **different** shapes. This step adds the missing
**boundary request adapter**, plus the host-side grist normalization and the HTTP
opt-in needed to actually run it.

Scope: **solver.batch + solver.water.** Hops/IBU/style/dry-hop are later.

## Correction to Step D

`engine.boundaryRequest(nodeId).inputs` returns raw resolved DAG values. It does
**not** produce a valid request body:

| Request field | Backend (`boundary.py`) | Frontend `boundaryRequest` output | Gap |
|---|---|---|---|
| `batch.grain_bill` | `[{ w_i, yield_i, mc_i }]` (`GristBillRow`) | `grist.major_malts` rows `{catalog_id,name,category,parts,pct,yield_fraction,color_lovibond,moisture_pct}` | keys differ; no normalized `w_i` |
| `water.grist` | `[{ mass_kg, color_lovibond, grain_type }]` (`WaterGristRow`) | same collection rows | no `mass_kg`/`grain_type` |
| `water.source` / `water.target` | nested `IonProfile` objects | flat keys `source.calcium_ca`, `target.calcium_ca`, … | must be nested + renamed |
| enums (`topology`, `strategy`, `acid_medium`, …) | `StrEnum` members | taxonomy strings (artifact) | must match member values |

With `extra="forbid"`, a raw post is a 422. Net: the seam is correct, the
*translation* is missing.

## Decisions

1. **HTTP enablement = Option C.** The browser entry (`main.js`) passes
   `useHttp: true` explicitly; API base = `import.meta.env.VITE_API_BASE ?? ""`.
   Dev uses the existing Vite proxy (`/solve`, `/api` → `127.0.0.1:8000`,
   same-origin, no CORS). `createStepApp()` (tests) keeps defaulting to **stubs**,
   so node tests stay offline. "Enabled" is an explicit boolean, never the
   truthiness of the base string (which is the `Boolean("")===false` trap).
2. **Derive the adapter purely from `boundary.py`** — not from legacy `compose.js`.
   The Pydantic models are the deployed contract.
3. **Conform to a backend dump.** Verification is a committed JSON fixture of
   `model_dump(mode="json")` produced by the backend, asserted against the
   adapter output (shape + fingerprint parity). No hand-maintained expectation.
4. **Hamilton stays host-side** (per TODO/L3): `parts → pct`/`w_i` normalization
   is a frontend formulation rule, not an artifact function. Reused by later
   features.

## Design

### D2.1 — Boundary request adapter (`frontend/src/adapters/boundaryRequest.js`)
Pure functions that reshape already-resolved engine values into the Pydantic
contracts. No engine/domain logic beyond mapping; called by `solveNow()` in
`stepAdapter` (and reusable by `engineAdapter`).

- `buildBatchRequest(engine) -> BatchSolverRequest`:
  - scalars passed through: `target_abv`, `apparent_attenuation`, `v_ferm`,
    `topology`, `intensive_value`, `s_late_add`, `v_kettle_dead`,
    `delta_v_evap`, `v_dead`, `eta_conv`, `f_shrink`, `hlt_starting_volume_l`,
    `hlt_dead_space_l`, `hlt_transfer_loss_l`, `hlt_coil_floor_l`,
    `max_hlt_volume_l` (17 total — matches `BatchSolverRequest`).
  - `grain_bill = gristRows.map(r => ({ w_i: r.pct, yield_i: r.yield_fraction,
    mc_i: r.moisture_pct }))`.
- `buildWaterRequest(engine) -> WaterSolverRequest`:
  - `grist = gristRows.map(r => ({ mass_kg: r.pct * m_grist,
    color_lovibond: r.color_lovibond, grain_type: r.category }))`, where
    `m_grist = engine.resolve("solver.batch.m_grist")` (batch precedes water in
    topo order).
  - `source`/`target` = `IonProfile` assembled from the six flat roots
    (`calcium_ca, magnesium_mg, sodium_na, sulfate_so4, chloride_cl,
    alkalinity_as_caco3`).
  - pass through `v_mash_treat_l`, `v_hlt_treat_l`, `v_hlt_debt_l`,
    `v_sparge_demand_l`, `mash_thickness_l_per_kg`, `target_mash_ph`,
    `strategy`, `salt_distribution`, `acid_medium`, `gypsum_form`, `cacl2_form`,
    `preferred_alkaline_agent`, `calcium_floor_ppm`.
- `solveNow()` uses `buildBatchRequest`/`buildWaterRequest` (keyed by binding)
  instead of `boundaryRequest(id).inputs`; fingerprints are computed over the
  **adapted** body so they match the backend's `canonical_fingerprint`.

### D2.2 — Grist normalization (host-side)
Implement the Hamilton largest-remainder `parts → pct` (summing to exactly 100%
at 0.1% resolution, ties by larger `parts` then index) on grist edits, so the
grain bill is authorable and `w_i` is real. Keep it in a host module
(`frontend/src/views/hamilton.js` or similar); reuse-ready for later features.
Default `DEFAULT_GRIST` remains the seed until the user edits.

### D2.3 — HTTP opt-in
- `frontend/src/main.js`: `createStepApp({ useHttp: true })` for the product
  entry; base via `VITE_API_BASE ?? ""`.
- Prod: set `VITE_API_BASE` to the backend origin at build (enable CORS there if
  cross-origin). Dev: no `.env` needed — the existing proxy handles it.
- Tests: unchanged default (stubs).

### D2.4 — Conformance fixture
- A tiny backend script/test dumps `BatchSolverRequest` / `WaterSolverRequest`
  `model_dump(mode="json")` for a canonical input into
  `tests/conformance/fixtures/*.json` (committed).
- A node test builds the same request from a matching engine state and asserts
  deep-equality with the fixture (shape + values + fingerprint).

## Steps (commits)

1. **D2.1 adapter + tests** — `boundaryRequest.js`, wire `solveNow`, mock-fetch
   test asserting posted bodies (grain rows mapped; `source`/`target` nested).
2. **D2.2 grist normalization** — Hamilton `parts → pct`; tests.
3. **D2.3 HTTP opt-in** — `main.js` `useHttp: true`; confirm `make local-dev`.
4. **D2.4 conformance** — backend dump fixtures + node equality test.
5. **Docs** — `step-D-json-seam.md` correction note; `engine.md` seam section;
   `TODO.md`.

## Acceptance / gate
- `make local-dev` → fill a recipe → real `/solve/batch` then `/solve/water`
  return; boundary readings render; no 422.
- Mock-fetch test asserts exact request shapes; conformance fixture test green.
- `make check` (eslint/stylelint/ruff/tach) and `make test` green.

## Risks
- **Enum drift:** artifact taxonomy strings must equal the `StrEnum` members
  (`topology`, `strategy`, `salt_distribution`, `acid_medium`,
  `preferred_alkaline_agent`, hydrate forms). Verified by the conformance fixture.
- **`mass_kg` ordering:** water's grist needs `solver.batch.m_grist`; topo order
  guarantees batch first — the adapter must read the cached batch output.
- **Fingerprint parity:** adapt *before* fingerprinting so frontend/backend
  hashes agree.
- **Auth:** routes require a bearer (Firebase). Dev uses the emulator token via
  the existing `setTokenProvider`; document if a solve fails auth.

## Out of scope (later)
Hops/IBU, dry-hop, trace additions, style gating; the `max` reduction / boolean
input kind; unit scale families. Freeze-shape (M1), non-finite derived guard (L4).
