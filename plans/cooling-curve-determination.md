---
title: Cooling Curve Determination
status: proposed
program: deterministic-dag-calculator
depends_on: [water-pin-visibility-and-test-matrix, whirlpool-hopping-model]
blocks: []
gate: make verify
---

# Plan — Cooling curve determination

## Goal

Replace the hard-coded whirlpool cooling decay with an empirically derived value.
A user authors a cooling curve record from measured time/temperature points; the app
fits Newton cooling and copies the resulting time constant into the batch. In the
absence of a selected curve, the existing `0.0092 min⁻¹` default remains.

## Why

`k` is the most impactful uncertain input in the whirlpool model. The current default
is a literature-style lumped constant; the same kettle changes it with fill volume,
headspace, insulation, evaporation, and drafts. A measured curve is more useful than
more kinetic theory until `k` is calibrated.

## Non-goals

- Replacing the Tinseth/Arrhenius model with the consecutive-kinetics model.
- Product-form oil retention or perceived-bitterness modelling.
- Equipment-level thermal simulation (surface area, heat-transfer coefficients).
- Editing immutable library records (corrections create a new record).
- Automatic sensor ingestion.

## Current state

- `batch.whirlpool_ambient_temp_c` is a root.
- `batch.whirlpool_cooling_time_constant_min` is a root, default `108.7` min
  (`k = 0.0092 min⁻¹`).
- `frontend/src/views/whirlpool.js` uses that time constant to derive `k` and
  integrate `t_eff`.
- The record library already supports flat catalog records with create/read/delete.
- The artifact primitive schema does not yet support nested lists.
- `TODO.md` already identifies cooling curves as the first record-library catalog and
  the trigger for nested-list grammar.

## Decisions

1. **Ambient temperature is part of the curve.** Newton cooling cannot determine `k`
   without `T_env`. Selecting a curve copies both `ambient_temp_c` and the derived
   time constant into the batch.
2. **Use log-linear least squares.** Fit
   `ln((T_i - T_env) / (T_start - T_env))` against `t_i`; `k = -slope`,
   `tau = 1/k`. Report `R²`; warn below a quality threshold but do not block.
3. **Raw points are canonical.** Derive `k` host-side; do not store a derived `k` in
   the library record. Persist the copied time constant in the batch.
4. **Fallback is explicit.** No curve or invalid fit → `108.7 min` /
   `0.0092 min⁻¹`.
5. **Copy-forward, like a water report.** Selecting a curve stores
   `batch.cooling_curve_id` and a selection snapshot, then copies values into the
   batch roots. Deleting the library record does not change the batch.
6. **Manual edit detaches.** Editing the cooling time constant clears the curve
   selection (or shows “Custom”); choosing “Default cooling” resets `108.7`.
7. **Records are immutable.** Create/read/delete only; corrections create a new
   curve.

## Prerequisite: nested-list primitive grammar

User-administrable point rows require a schema field that is a list of structured
items, for example:

```json
"cooling_curve": {
  "name": {},
  "ambient_temp_c": { "dimension": "temperature", "domain": { "gte": -20, "lte": 50 } },
  "start_temp_c": { "dimension": "temperature", "domain": { "gte": 0, "lte": 100 } },
  "points": {
    "list": {
      "item": {
        "time_min": { "dimension": "time", "domain": { "gte": 0 } },
        "temp_c": { "dimension": "temperature", "domain": { "gte": -20, "lte": 100 } }
      },
      "min_items": 2
    }
  }
}
```

This is the substantial part of the plan:

- artifact grammar and schema validation for nested lists,
- JS and Python component-validation mirrors,
- library form rendering for add/remove point rows,
- inventory and grammar docs,
- artifact `schema_version` bump and the associated tests/migration notes.

Do not fake this with fixed point fields or a CSV text field.

## Record and selection model

Catalog kind: `cooling_curve`

Fields:

- `id` (server-assigned)
- `name` (title)
- `description` (optional)
- `ambient_temp_c`
- `start_temp_c`
- `points`: `[{ time_min, temp_c }]`
- `notes` (optional)

Seed catalog: `data/seeds/cooling_curves.json` (at least one reference curve).

Artifact additions:

- `batch.cooling_curve_id` root (`reference`, default `""`)
- `batch.cooling_curve` selection (`schema: cooling_curve`, `ref: batch.cooling_curve_id`)
- Keep the existing `batch.whirlpool_ambient_temp_c` and
  `batch.whirlpool_cooling_time_constant_min` roots as the batch-owned copied values.

Selection behaviour:

1. User picks a curve (or “Default cooling”).
2. Copy `ambient_temp_c` and `1/k` into the existing batch roots.
3. Store the selection snapshot and reference id.
4. Show the curve name, derived `k`, `tau`, and fit quality.
5. Editing the time constant clears the selection; selecting “Default cooling”
   resets `tau = 108.7` and leaves ambient unchanged.

## Fit function

Add a pure host-side helper, e.g. `frontend/src/views/coolingCurve.js`:

```text
fitCoolingCurve({ startTempC, ambientTempC, points })
  -> { kPerMin, tauMin, r2, pointCount, ignored, valid }
```

Rules:

- require `startTempC > ambientTempC`,
- require at least two usable points with `time_min > 0`,
- require `temp_c > ambientTempC`,
- require strictly increasing times; ignore or reject duplicates,
- compute log-linear least squares,
- return `valid: false` when fewer than two points or a non-positive slope,
- `r2` reports fit quality; the UI warns below `0.98` but still allows the curve.

`tauMin = 1 / kPerMin`. The whirlpool card continues to consume
`batch.whirlpool_cooling_time_constant_min`; no model rewrite is required.

## UI

### Library

Add a `Cooling Curves` tab. The generic form gains a list editor:

- start temperature, ambient temperature, name, notes,
- point rows with time and temperature,
- add/remove row,
- sort by time on save,
- validation errors for bad ordering, non-positive times, temperatures at or below
  ambient, and fewer than two points.

Because records are immutable, the UI says “Saved. Corrections create a new curve.”

### Hops card

In the whirlpool settings block, next to ambient and cooling time constant:

- a `Cooling curve` selector with `Default cooling` plus seed and user curves,
- a `Manage library` link,
- a readout of the selected curve’s `k`, `tau`, and `R²`,
- a warning when the fit is poor or the ambient/start values are inconsistent.

Selecting a curve populates the two batch roots. Manual time-constant edits detach.

## Tests

Pure fit:

- exact synthetic Newton cooling recovers `k`,
- noisy points recover `k` within tolerance,
- one point is invalid,
- temperatures at or below ambient are rejected,
- non-increasing times are rejected,
- R² reflects a poor fit.

Library:

- create/read/delete a cooling curve,
- nested-list validation in JS and Python,
- immutable records,
- seed curves listed read-only.

Batch:

- selecting a curve copies `ambient` and `tau`,
- selecting “Default cooling” restores `108.7`,
- editing `tau` clears the selection,
- deleting a library curve does not change a loaded batch,
- copy-forward survives save/load/freeze.

Docs/gates:

- regenerate the artifact inventory,
- update `docs/whirlpool-hopping-model.md` with the empirical `k` workflow,
- update `docs/adding-a-node.md`/grammar docs for nested lists,
- `make verify`.

## Phases

1. **Nested-list grammar** — artifact schema, JS/Python validation, inventory, docs,
   schema-version/migration notes. Acceptance: `make test` with a nested fixture.
2. **Cooling curve catalog** — `data/catalogs.json`, seed catalog, reference cache,
   library tab and row editor. Acceptance: create/read/delete through the library.
3. **Fit and selection** — pure fit helper, batch roots/selection, selector UI,
   copy-forward, detach/default. Acceptance: card uses the selected curve and falls
   back to `108.7`.
4. **Hardening** — fit-quality warnings, tests, docs, `make verify`.

## Risks

- Nested-list grammar is a real schema extension, not a form-only change; it touches
  the artifact, both validators, the library renderer, inventory, and docs.
- An artifact `schema_version` bump can invalidate older stored preferences; follow
  the existing version-gate tests and migration policy.
- A poor measurement or inconsistent ambient produces a misleading `k`; surface
  `R²` and the raw points, and allow a manual override.
- Fit `k` is only as good as the temperature sensor and the assumption of a single
  lumped temperature.
- Copy-forward means a corrected library curve does not retroactively change an
  existing batch.

## Interim option

If the nested-list grammar is too large for the next slice, a stateless
“cooling calibration” helper in the hops card could accept start/ambient plus a few
time/temp pairs, derive `k`, and write the time constant without persisting a record.
That delivers the empirical determination now and leaves CRUD for the grammar phase.
It is not a substitute for the catalog plan.

## Open questions

- Require `R² >= 0.98`, or warn only? (Current recommendation: warn only.)
- Seed one reference curve, or rely solely on the `0.0092` fallback?
- Should the curve’s ambient override `batch.whirlpool_ambient_temp_c`, or only feed
  the fit? (Current recommendation: copy it, like a water report.)
- Should duplicate time points be rejected or averaged?
