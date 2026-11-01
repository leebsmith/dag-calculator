---
title: Topology Ratio Handoff
status: active
program: deterministic-dag-calculator
depends_on: [report-renderer]
blocks: []
gate: make verify
---

# Plan — topology-ratio-handoff

## Goal

Make the Batch Sparge liquor-to-grist and runnings-ratio fields swap between
live and read-only as the constraint topology changes. The inactive field
mirrors the solved ratio. Switching topology hands the current solved value to
the newly active root instead of resetting it to a constant default.

The Brewhouse report already prints the solved pair and is unchanged. This plan
makes the UI agree with that fact and preserves the physical mash across a
topology switch.

## Decisions

- The active ratio is editable; the inactive ratio is a readout.
- The inactive readout resolves the solved path, not the stale root.
- Switching topology inherits the current solved value into the new active root.
- There is no continuous write-back to the inactive root: the boundary declares
  both roots as inputs, so writing the inactive root would invalidate the
  boundary and change its fingerprint for a value the solver did not use.
- The report template keeps `solver.batch.mash_thickness_l_per_kg` and
  `batch.runnings_ratio`; it is already topology-independent.
- The two duplicate rows in the Derived Anchors table are removed because the
  live/read-only pair now carries both values.

## Checklist

- [x] Mark `batch.mash_thickness_l_per_kg` and `batch.runoff_ratio` in the batch
  step with their active topology and their inactive solved path.
- [x] Project the inactive field as a readout with its solved-path value and a
  derived label; keep the active field editable.
- [x] Pass the current topology into the field projector and resolve
  `valuePath` in scalar valuation, with a root fallback while a boundary is
  pending.
- [x] Replace `resetIntensiveValue` with a solved-value handoff that runs
  before the topology write.
- [x] Remove the duplicate Mash Thickness and Runnings Ratio rows from the
  Derived Anchors table.
- [x] Add frontend tests for both swap directions, both handoffs, the inactive
  readout value, and the absence of continuous root write-back.
- [x] Keep the existing report test that Brewhouse prints the solved pair under
  either topology; update docs if the UI description changes.
- [x] Run `make check`, `make test`, and `make verify`.
- [x] Archive the plan.

## Acceptance

- With `r_l_to_g` pinned, L/kg is editable and r is a readout of
  `batch.runnings_ratio`.
- With `runoff_ratio` pinned, r is editable and L/kg is a readout of
  `solver.batch.mash_thickness_l_per_kg`.
- Switching topology copies the current solved value into the newly active
  root; it does not reset to the constant default.
- The inactive root is not rewritten on every solve.
- The Brewhouse report still prints both solved ratios under either topology.
- `make verify` is green.
