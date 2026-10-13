# Conformance Report — Step C

Proves the new `artifact.json` + engine reproduce the legacy **known-good**
behavior, with documented corrections as expected deltas. Oracle repo:
`~/Development/brewing-calculator` (`$BREWING_ORACLE_REPO`).

## 1. Frontend differential (artifact functions ↔ legacy pure modules)
`tests/conformance/parity.test.js` imports the legacy `pureFunctions.js`,
`mashSchedule.js`, and `waterChemistry.js` and compares on a shared corpus.

| Artifact function | Legacy oracle | Result |
|---|---|---|
| `extract_yield_ldk` | `calculateMetricLiterDegreesPerKg` | ✅ equal (tol 1e-9) |
| `sugar_gravity_points` | `sugarGravityPoints` | ✅ equal |
| `calculate_strike_water_base_temp` | `calculateStrikeWaterTempC` | ✅ equal |
| `calculate_tun_thermal_offset` | `calculateTunThermalOffsetC` | ✅ equal |
| `bicarbonate_from_alkalinity` | `bicarbonateFromAlkalinity` | ✅ equal |
| `estimate_single_rest_loa_pct` | `estimateSingleRestLoaPct` | ✅ equal (64–70 °C) |

**0 divergences.** (Skips gracefully if the oracle repo is absent.)

## 2. Backend oracle suites (vendored, run unchanged)
`tests/backend/conformance/` contains the legacy solver suites, run verbatim
against the new `app.core` solvers:

- `test_batch_solver_{phase1,phase3,phase4,helpers,orchestration}.py`
- `test_water_chemistry_core.py`, `test_utils.py`

**Result: 110 passed.** The new `app.core/{batch_solver,water,utils}.py` are
behaviorally identical to the legacy modules — the only diffs are modernized type
annotations (`typing.Dict`→`dict`, `typing.Sequence`→`collections.abc.Sequence`).

## 3. Boundary contract parity (vs `boundary.py`)
See `validation-report.md` §2: `solver.batch` 17 in / 19 out / 13 codes;
`solver.water` 26 in / 31 out / 10 codes — exact field-for-field match.

## 4. Expected / documented deltas (not failures)
- **Color:** legacy used a flat `EBC = 1.97·L` approximation; the artifact (schema
  v3) splits color into `grain_color` (Lovibond) and `beer_color` (SRM), each
  linear `EBC = 1.97·` — and the finished-beer color uses the MCU→Morey power law
  (`morey_mcu_to_srm`, `1.4922·MCU^0.6859`), asserted directly against the
  reference formulas. The single-malt `morey_lovibond_to_srm` bridge was removed
  (v2→v3); see `dimensions.md` §3.2.
- **Solver extras:** the new `batch_solver.py` adds staged HLT-budget outputs not
  in the legacy path; the legacy suites exercise only the shared surface and pass.

## 5. Coverage / not covered
- **Covered:** the client-derived equations above; the two boundary interiors (via
  the vendored solver suites); boundary I/O contract shape.
- **Not covered here (host-side / later steps):** Hamilton
  `allocateProportionalPercentages` (host-side, gap C10 — not artifact-evaluable);
  `ionsFromReport` copy-in; async boundary status (Step D); view surfacing (Step E).

## 6. How to run
```
cd frontend && npm test            # includes tests/conformance/parity.test.js
cd backend  && uv run pytest ../tests/backend/   # includes tests/backend/conformance/
```
Set `BREWING_ORACLE_REPO=/path/to/brewing-calculator` to point at the oracle.
