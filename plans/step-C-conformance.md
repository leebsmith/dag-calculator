---
title: Step C — Conformance & Correctness
step: C
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
oracle_repo: ~/Development/brewing-calculator
depends_on: [Step A, Step B]
blocks: [Step D, Step E]
gate: parity report with 0 unexplained divergences; make check/test green
status: done
---

# Step C — Conformance & Correctness

**Goal:** prove the new `artifact.json` + engine reproduce the legacy *known-good*
numeric behavior across a corpus of inputs — and, where the docs mandate a
correction, assert the **expected delta**. Correctness is only real with an
**oracle**; this step builds it.

## Oracle inventory (`~/Development/brewing-calculator`)
- **O1 — pure calc modules** (ESM; only depend on `constants.js`):
  `frontend/src/utils/pureFunctions.js`, `mashSchedule.js`, `waterChemistry.js`,
  `frontend/constants.js`.
- **O2 — legacy tests with expected values** (`node --test`):
  `frontend/tests/{pureFunctions,waterChemistry,mashValidation,reactiveSolver}.test.js`.
- **O3 — legacy solver tests** (`pytest`):
  `backend/tests/test_batch_solver_{helpers,phase1,phase3,phase4,orchestration}.py`,
  `test_water_chemistry_core.py`, `test_logic.py`.

## Mapping — legacy function → artifact element
| Legacy (O1) | Artifact |
|---|---|
| `calculateStrikeWaterTempC` | `mash.strike_water_temp_base_c` / `calculate_strike_water_base_temp` |
| `calculateTunThermalOffsetC` | `mash.strike_water_tun_offset_c` / `calculate_tun_thermal_offset` |
| `calculateMetricLiterDegreesPerKg` | `grist.extract_yield_ldk` |
| `sugarGravityPoints` | `sugar_gravity_points` |
| `bicarbonateFromAlkalinity` | `bicarbonate_from_alkalinity` |
| `ionsFromReport` | host copy-in (source ions) — parity vs skip |
| `estimateSingleRestLoaPct` | `estimate_single_rest_loa_pct` |
| `allocateProportionalPercentages` | Hamilton (host-side, gap C10) — parity vs skip |
| `mashPhStatusClass` / `water.py::mash_ph_status` | `mash_ph_status` / `water.mash_ph_status` |
| (Morey, `srm-ebc-and-lovibond-reference.md`) | `morey_lovibond_to_srm`, `morey_mcu_to_srm`, `grist.finished_beer_srm` |
| `utils.py::{sg_to_plato,plato_to_sg}` | `sg_to_plato`, `plato_to_sg` |

## Harness design
- **H-C1 — frontend differential** (`tests/conformance/parity.test.js`, `node --test`):
  import the legacy O1 modules **by path** (`file://~/Development/brewing-calculator/...`)
  and the new engine; for each corpus scenario, compute both and assert equality
  within tolerance (except documented deltas). Skip gracefully if the oracle repo
  is absent (guarded by `CONFORMANCE_ORACLE` env with a default path).
- **H-C2 — backend conformance** (`tests/backend/test_conformance.py`, `pytest`):
  port the O3 solver test vectors and run them against the **new** `app.core`
  solvers; assert equality, flagging staging/HLT differences as expected deltas.
- **H-C3 — report** (`conformance-report.md`): per mapped element, oracle value vs
  engine value, delta, and status.

## Corpus
Seed from legacy fixtures (O2/O3) plus a handful of end-to-end recipes:
- strike chain: multiple `(target, grain, thickness)` triples.
- extract/color: grain bills (pct/color/yield) incl. the Morey path.
- water: the Ward Labs report + several target profiles + treatment volumes.
- mash: default schedule + single/multi-rest and disabled-rest cases.

## Expected / documented deltas (not failures)
- **Color:** legacy used a flat `EBC = 1.97·L` approximation; the artifact uses the
  authoritative Morey chain (`dimensions.md` §3.2). Assert the *documented* delta.
- **Solver staging:** the new `batch_solver.py` adds staged HLT budget logic absent
  from the legacy path — compare the shared fields; document extras.

## Steps
- **C.1** Oracle wiring + guard (path reference to the legacy repo).
- **C.2** Mapping table as data (element ↔ oracle callable ↔ tolerance).
- **C.3** Frontend differential harness (H-C1) + corpus.
- **C.4** Backend conformance (H-C2): port O3 vectors.
- **C.5** Reconcile divergences — fix artifact/engine, or record an expected delta
  with justification. Any *engine* fix here re-enters Steps A/B gates.
- **C.6** Emit `conformance-report.md`.
- **C.7** Gate.

## Deliverables
- `tests/conformance/parity.test.js`, `tests/backend/test_conformance.py`.
- `conformance-report.md`.
- Any artifact/engine corrections surfaced (with updated reports).

## Gate (definition of done)
- Every mapped element has **0 unexplained divergences** (equality or documented delta).
- `make check` and `make test` green (incl. the new conformance tests).

## Risks / decisions
- **Oracle coupling.** Path-referencing the legacy repo couples this repo to it at
  run time. Alternative: vendor a pinned snapshot under `tests/conformance/legacy/`.
  Default: path-reference + skip-guard; revisit if CI needs hermeticity.
- **Boundary interiors.** If the new solvers legitimately diverge from legacy
  (staged/HLT), the "known-good" reference for those is `boundary.py` +
  `domain-equations.md`, not the legacy app. Compare only shared fields.
- **Host-side constructs** (Hamilton, `ionsFromReport` copy-in) are not
  artifact-evaluable; test them as host functions or mark out of scope.

## Deferred
Async boundary status (Step D) · view surfacing (Step E) · map/dict type · boolean
input kind · list literals · `max`.

## Program context
A → B → **C** ‖ D → E; Steps F/G parallel.
