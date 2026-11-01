---
title: Cooling Curve Cleanup
status: active
program: deterministic-dag-calculator
depends_on: [cooling-curve-determination]
blocks: [brew-measurement-promotion]
gate: make verify
---
<!-- claims: proposed batch.cooling_curve_id -->

# Plan — cooling-curve-cleanup

## Goal

Finish the cooling-curve feature: fit authored `cooling_curve` records with
Newton cooling, add the `batch.cooling_curve_id` provenance root, and give the
hops card a picker that copies only the fitted time constant. The curve's
ambient stays in the record; the batch keeps its own brew-day ambient.

## Decisions

- The fit is host-side and pure; the record keeps its raw points.
- `k = -slope(t, ln((T - T_amb) / (T_start - T_amb)))` by least squares.
- `tau = 1/k` is the only value copied into
  `batch.whirlpool_cooling_time_constant_min`; `ambient_temp_c` is **not**
  copied into `batch.whirlpool_ambient_temp_c`.
- `batch.cooling_curve_id` is a reference root, default `""`; there is no
  selection node and no engine consumer.
- `Default cooling` resets the time constant to the artifact default (`108.7`)
  and clears the id.
- A manual time-constant edit clears the id and shows `Custom`.
- A missing or deleted curve keeps the copied roots and shows `Missing curve`.
- R² below `0.98` warns; it never rejects a curve.
- Deleted records are not recreated; corrections are new records.

## Checklist

- [x] Add the pure fit helper `frontend/src/views/coolingCurve.js`: finite
  start/ambient, `start > ambient`, usable points with `time > 0` and
  `temp > ambient`, at least two points, strictly increasing unique times,
  positive `k`, `tau`, point count, ignored count, and R².
- [x] Add `tests/frontend/coolingCurve.test.js`: exact synthetic recovery, a
  noisy recovery within tolerance, too few points, temperatures at or below
  ambient, non-increasing times, a non-cooling slope, and low-R² reporting.
- [x] Add `batch.cooling_curve_id` as a `reference` root with default `""` in
  `data/artifact.json`.
- [x] Register the new root in `frontend/src/views/registry/hops.js` and add it
  to the hops step in `frontend/src/views/steps.js`.
- [x] Add `frontend/src/adapters/cards/hopsCoolingCurve.js`: curve options,
  selected record and fit, Default/Custom/Missing status, ambient-mismatch and
  poor-fit warnings, `selectCoolingCurve`, `editWhirlpoolCooling`, and
  `openCoolingCurveLibrary`.
- [x] Wire the picker into `frontend/src/adapters/cards/hops.js` and the hop
  installer contract, including the shared `openLibrary` read.
- [x] Add the picker, fit summary, warnings, `Manage library` link, and
  manual-time-constant handler to `frontend/src/partials/step-hops.html`.
- [x] Add picker tests to `tests/frontend/hops-card.test.js`: selection copies
  `1/k` only, Default resets, manual tau clears the id, ambient edit keeps the
  id, and a missing curve keeps the copied roots.
- [x] Add persistence tests: the id and time constant survive
  `draftState`/`loadState` and the id appears in `freezePayload`.
- [x] Update `docs/hops/whirlpool-hopping-model.md`, `docs/record-library.md`,
  `plans/cooling-curve-determination.md`, and `TODO.md`.
- [x] Run `make generate`, `make check`, `make test`, and `make verify`.
- [x] Mark this checklist complete and archive the plan.

## Acceptance

- A selected curve writes `1/k` to the time constant and its id to
  `batch.cooling_curve_id`; the batch ambient is unchanged.
- `Default cooling` restores the artifact default time constant and an empty id.
- Manual time-constant edits clear the id and read as `Custom`.
- Missing curves still use the copied values and read as `Missing curve`.
- Poor fits and material ambient differences warn without blocking.
- The artifact validates with the additive reference root, generated docs are
  current, and `make verify` is green.
