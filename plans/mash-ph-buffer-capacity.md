---
title: Bounded buffer-capacity mash pH model
step: next
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [water-pin-visibility-and-test-matrix]
blocks: []
gate: make verify
status: accepted
revision: 1
revised: 2026-10-22
supersedes: —
---

# Plan — Bounded buffer-capacity mash pH model

## Why

The linear `predict_mash_ph` extrapolates without an upper bound: as residual
alkalinity dominates grist acidity the "acidity index" `i26` goes negative
without limit and `pH = 5.76 − 0.17·i26` climbs to 17, 55, … The seeded sweep in
`test_water_matrix.py` hit this five times in forty random-but-plausible vectors,
one of them under `BASELINE` (no salt dosing at all) — so the defect is the pH
model, not the salt solver. It matters beyond a bad readout: the stage-1 pH feeds
`acid_required_meq_l`, so the acid/agent prescription is derived from a
non-physical starting point.

The current mitigation (`GUARDRAIL_PH_MODEL_OUT_OF_RANGE`) flags the nonsense but
leaves the dose wrong. This plan replaces the unbounded term with a bounded one.

## Decision

- **Option A, not B.** Keep the bucketed grist and lumped acidity; no per-malt
  buffer terms, no new inputs, no seed/artifact schema.
- **Global refit is acceptable** (only one recipe exists; no back-compat burden).
- **Constants stay solver-internal** (`backend/app/core/water.py`), not artifact
  constants — so no `emit-artifact-inventory.mjs`, no `schema_version` bump.

## Model

Replace `pH = max(5.76 − 0.17·i26, 0.10)` with a logistic that saturates between a
floor and a ceiling over the same `i26`:

```
pH = MASH_PH_FLOOR + (MASH_PH_CEIL − MASH_PH_FLOOR) · σ((MASH_PH_MID − i26) / MASH_PH_SCALE)
σ(z) = 1 / (1 + e^−z)
```

- `MASH_PH_FLOOR = 4.0` (schema domain `target_mash_ph ≥ 4.0`; acid grist),
- `MASH_PH_CEIL = 6.0` (carbonate-saturated mash; malt phosphate buffering caps it),
- `MASH_PH_MID = 4.0` (the `i26` at which pH = midpoint 5.0),
- `MASH_PH_SCALE = 2.0` (steepness).

Chosen so the curve tracks the old linear fit in the realistic band (base-malt
anchor `i26 ≈ 1.33` lands ~5.58, within the optimal window) and diverges only at
the extremes, where the old model was lying. The old `MASH_PH_INTERCEPT` /
`MASH_PH_SLOPE` constants are removed.

## Constraints that must keep holding

- Vendored `tests/backend/conformance/test_water_chemistry_core.py`
  `test_predict_mash_ph_reasonable` asserts `4.0 < pH < 6.5` for
  `acidity=20, ra=0, v=15, thickness=3.0`. Cannot be edited; the new curve passes.
- `test_predict_mash_ph_invalid_volume_raises` still raises `INVALID_MASH_VOLUME`.
- `mash_ph_status` thresholds (`5.20`/`5.60`) are artifact constants; unchanged.

## Blast radius

`predict_mash_ph` feeds both the stage-1 and corrected pH, which feed
`acid_required_meq_l` and the acid/agent prescription. `test_water_chemistry_core.py`
and `test_water_solver.py` assert only band/positivity/status-membership for pH,
so they pass without re-anchoring. `GUARDRAIL_PH_MODEL_OUT_OF_RANGE` becomes a
defensive net (the model now never leaves its band) — kept, not the acceptance
criterion.

## Tests to add

- Directed extreme: RO source + 300 ppm alkalinity target (HYBRID) → finite pH,
  `pH ≤ MASH_PH_CEIL`.
- Monotonicity on a grid: pH decreases in grist acidity, increases in RA.
- Matrix invariant tightened to a hard band `3.5 < pH < 7.5` (the model is now
  bounded, so "or flagged" would pass vacuously).
- The two anchors above.

## Docs

- `plans/adsco-contract.md` § pH and ion coupling: note the bounded form and that
  the out-of-range flag is now defensive.
- `TODO.md`: move the "Mash pH model validity band" follow-up to Done.

## Gates

`make check` then `make test`; `make verify` before done. No artifact change.
