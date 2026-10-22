# ADSCO core-up — execution plan

Status: draft for review. Implements `plans/adsco-contract.md` behind the
existing sealed boundary. Each phase is a committable, gate-green unit.

## Principles

- The sealed boundary `solve_water_chemistry(WaterChemistryInput) ->
  WaterChemistryOutput` is preserved; only the interior changes.
- Every artifact change ships with its re-emitted inventory and doc updates in
  the same commit (AGENTS.md).
- `make check` and `make test` stay green at every commit.
- Telemetry never enters the DAG; it rides the host-side response.

## Phase A — contract layer (artifact + schema + seeds + adapters)

Atomic; the existing cleanup-plan constraints apply (boundary-inputs /
manifest-integrity / stub-outputs / roots-only move together).

- `data/artifact.json`
  - `strategy` taxonomy += `AUTO`, `HYBRID`, `BASELINE`, `CUSTOM`.
  - reintroduce `water.target.*` roots (concentration, `gte 0`, default `0`).
  - add `water.pinned_ions` collection + primitive schema (`ion` taxonomy).
  - `water.strategy` default → `AUTO`.
  - `solver.water.outputs` += `post_dose_mash_ions.*`, `total_added_salt_mass_g`,
    `added_mineral_tds_ppm`.
  - `primitive_schemas.water_target` += `mode` (taxonomy) + `calcium_floor_ppm`
    stays.
- `backend/app/schemas/boundary.py`
  - `WaterStrategy` += `AUTO/HYBRID/BASELINE/CUSTOM`; `strategy` default `AUTO`.
  - `SourceProfile` (ions + optional `k/fe/mn/no3`); `target` stays `IonProfile`
    (all default `0`); `custom_pinned_ions: list[str]`.
  - `WaterSolverResponse` += `post_dose_mash_ions`, `total_added_salt_mass_g`,
    `added_mineral_tds_ppm`, `telemetry`.
  - `WaterSolverErrorCode` per the contract.
- `backend/app/services/water_solver_service.py`: `_to_input`/`_to_response`
  mappings; `_to_short_ions` handles `None`; `assert_field_parity` updated.
- `data/seeds/water_target_profiles.json`: new values + `mode`; `soft-pilsner`
  floor 15.
- `frontend/src/adapters/boundaryRequest.js`: `WATER_FIELDS` reads editable
  `water.target.*`, `water.pinned_ions` → `custom_pinned_ions`.
- `frontend/src/adapters/stubBoundaries.js`: new outputs.
- Tests/guards: `boundary-output-parity` `ALLOW` += `telemetry`;
  `artifact_constants`; `boundary-wire-keys`; `stub-outputs`; `roots-only`.
- Re-emit `docs/dag-artifacts/inventory.md`.

## Phase B — core engine

Rewrite `backend/app/core/water.py` as one constrained optimizer over the unified
vector. Keep the constants, stoichiometry, carbonate speciation, `resolve_grist`,
`predict_mash_ph`, acid/agent helpers.

- `WaterChemistryInput`/`Output` per contract.
- `infer_mode(strategy, custom_pinned_ions)` → mode + canonical code; raise
  `UNKNOWN_STRATEGY` for unknown explicit strategy.
- One evaluation: post-dose ions → corrected pH → acid/agent dose.
- Mode 1/2/4/5 linear; Mode 3 SLSQP with the agent/acid in the ion balance so
  alkalinity is reachable.
- Guardrails + `TelemetryEvent` emission (corrected triggers, not unconditional).
- Update `tests/backend/test_water_solver.py`, `test_water_chemistry_core.py`.

## Phase C — host-side telemetry + runner

- `boundaryRunner`: retain raw response extras keyed by boundary; token-safe;
  clear on reset/supersede/error.
- `app.waterTelemetry` (or `boundaryTelemetry`) view model + `KEYS`.
- Test: winning-solve retention, supersede does not overwrite, reset clears.

## Phase D — UI

- Water card rewrite (5-mode radios, editable target grid with lock/floating,
  template quick-fill, delta-first target-vs-actual grid, telemetry banner +
  audit log, brew-day prescription) per `docs/adsco/ui.md`.
- `steps.js`, `registry/water.js`, `partials/step-water.html` (new), style/state
  handlers; library `mode` handling.
- Template quick-fill maps record → mode + values + floor.

## Phase E — living docs + gates

- `docs/dag-artifacts/domain-equations.md`, `docs/engine.md`,
  `docs/dag-artifacts/seed-substrate.md`, `docs/calculator-assumed-dosing-practice.md`.
- `make verify`.

## Risks

- **Editable targets vs read-only copy-forward** — deliberate reversal; the
  copy-forward provenance semantics must be re-documented.
- **Mode 2/3 alkalinity coupling** — the agent/acid in the ion balance makes
  these nonlinear; fall back to staged (agent → acid) if joint solve is unstable.
- **`water.pinned_ions` collection** — collections as boundary inputs are proven
  (grist); the `ion` taxonomy must be locked.
- **Default change (`CALCIUM_FLOOR` → `AUTO`)** — existing drafts carry
  `CALCIUM_FLOOR`; both resolve to Mode 1 (flavor floor), so behavior is
  preserved for legacy drafts.
- **Reference `.py` drift** — treat `docs/adsco/reference/*` as frozen input;
  the implementation is `backend/app/core/water.py`.
