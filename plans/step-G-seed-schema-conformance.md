---
title: Step G — Seed / Schema Conformance
step: G
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [Step A, Step F]
blocks: []
gate: every seed file conforms to its primitive_schema; make check/test green
status: ready
---

# Step G — Seed / Schema Conformance

**Goal:** make the seed substrate provably conform to the artifact's
`primitive_schemas` — each catalog seed normalized to a flat id-keyed map of
schema-conforming components, validated by a `node --test` harness — and resolve
the C14 boundary serialization-unit gap.

## Locked decisions

1. **Normalize** (not validate-and-document): rewrite the four outlier seed files
   to flat id-keyed maps; `referenceCache` loads them with no per-file adapters.
2. **Id-keyed maps** as the catalog convention; `mash-schedules.json` stays a
   `{ schedule_id → rests[] }` template (ordered rests, not a catalog).
3. **C14** resolved by base-unit serialization (option A): boundary emits `mass`
   in **kg** and `volume` in **L**; `g`/`ml` are display-only.
4. **Harness** on the frontend (`tests/conformance/`, `node --test`) — the
   artifact + schemas + seeds all live frontend-side.

## Sub-milestones

- **G-a — Normalize seeds.** `yeasts.json`, `sugars.json`,
  `water_target_profiles.json` (arrays) → id-keyed maps; flatten `water_target`
  `ions.*`; un-envelope `water_reports.json` (`{source_id,…,reports[]}` →
  `{report_id → report}`). Delete `indexById`/`flattenTargets`/`indexReports` from
  `referenceCache.js`. Note the hash change in `provenance.md`.
- **G-b — Conformance harness.** `tests/conformance/seed-conformance.test.js`:
  every catalog seed is a flat id-keyed map; each component matches its schema
  (fields, dimensions, domain bounds, taxonomy values); `mash-schedules` validates
  `mash_rest` rows.
- **G-c — C14 base-unit serialization.** Backend `core/water.py` +
  `schemas/boundary.py` emit kg/L for salt additions/acid; update backend
  conformance tests + frontend `stubBoundaries.js`/`helpers.js`; the view layer
  renders `g`/`ml` via the existing unit system (unblocks the E-e1 `solver.water`
  salt readouts).

## Completion

- [x] G-a Normalize seeds to id-keyed maps; drop referenceCache normalizers
- [x] G-b Seed-conformance harness (node --test)
- [x] G-c C14 base-unit serialization (kg/L)

## Acceptance / gate

- `make check` + `make test` green (frontend + backend + conformance).
- Seed conformance harness passes against the normalized seeds.

## Program context

A → B → C ‖ D → E → F → **G** (final step; F-e drift reconcile deferred).
