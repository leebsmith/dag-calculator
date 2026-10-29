---
title: Cooling Curve Determination
status: proposed
program: deterministic-dag-calculator
depends_on: [water-pin-visibility-and-test-matrix, whirlpool-hopping-model]
blocks: []
gate: make verify
---
<!-- claims: proposed batch.cooling_curve_id batch.cooling_curve batch.records -->

# Plan — Cooling curve determination

## Goal

Replace the hard-coded whirlpool cooling decay with an empirically derived value.
A user authors a cooling curve record from measured time/temperature points; the app
fits Newton cooling and copies the resulting time constant into the batch. In the
absence of a selected curve, the existing `0.0092 min⁻¹` default remains.

The durable part of this work is a **non-DAG record schema layer** for authored
measurement documents. Cooling curves are its first consumer; sparge runoff tables and
similar measurement records can reuse the same layer.

## Why

`k` is the most impactful uncertain input in the whirlpool model. The current default is
a literature-style lumped constant; the same kettle changes it with fill volume,
headspace, insulation, evaporation, and drafts. A measured curve is more useful than
more kinetic theory until `k` is calibrated.

## Non-goals

- Adding nested lists to the artifact grammar or bumping the artifact schema version.
- Making the cooling curve a DAG node or engine-evaluated value.
- Replacing the Tinseth/Arrhenius model with the consecutive-kinetics model.
- Product-form oil retention or perceived-bitterness modelling.
- Equipment-level thermal simulation (surface area, heat-transfer coefficients).
- Editing immutable records; corrections create a new record.
- Automatic sensor ingestion.

## Architectural boundary

The artifact remains the DAG-evaluable business-logic model: scalar roots, choices,
flat collections, selections, derived values, and boundary contracts. A cooling curve
is a **measurement document**, not a DAG value:

- variable-length time series,
- no DAG consumer,
- no dimension inference or reduction over its rows,
- only a host-side fit that produces one scalar `k`.

Therefore the curve points live in a separate record schema layer, not in
`artifact.primitive_schemas`. The artifact gains only a scalar reference root for
provenance. The artifact `schema_version` does not change.

## Current state

- `batch.whirlpool_ambient_temp_c` is a root.
- `batch.whirlpool_cooling_time_constant_min` is a root, default `108.7` min
  (`k = 0.0092 min⁻¹`).
- `frontend/src/views/whirlpool.js` uses that time constant to derive `k` and
  integrate `t_eff`.
- The record library supports flat artifact-backed catalog records with
  create/read/delete.
- `TODO.md` identifies cooling curves as the first record-library catalog.

## Record schema layer

Add two data files:

- `data/record_schemas.json` — schemas for non-DAG records.
- `data/record_catalogs.json` — catalog kinds backed by those schemas.

Schema shape:

```json
{
  "cooling_curve": {
    "fields": {
      "name": { "type": "string", "required": true },
      "description": { "type": "string" },
      "ambient_temp_c": {
        "dimension": "temperature",
        "domain": { "gte": -20, "lte": 50 }
      },
      "start_temp_c": {
        "dimension": "temperature",
        "domain": { "gte": 0, "lte": 100 }
      },
      "points": {
        "type": "list",
        "min_items": 2,
        "item": {
          "time_min": { "dimension": "time", "domain": { "gte": 0 } },
          "temp_c": {
            "dimension": "temperature",
            "domain": { "gte": -20, "lte": 100 }
          }
        }
      },
      "notes": { "type": "string" }
    }
  }
}
```

Record schemas reference artifact dimensions, domains, and taxonomies so units and
validation stay single-sourced. The record layer does not introduce a second dimension
system.

Catalog shape:

```json
{
  "cooling_curve": {
    "label": "Cooling Curve",
    "schema": "cooling_curve",
    "schema_source": "records",
    "id_field": "id",
    "title_field": "name",
    "references_key": null,
    "seed_key": "coolingCurves"
  }
}
```

Implementation points:

- Frontend `store/userCatalog.js` merges `data/catalogs.json` and
  `data/record_catalogs.json` into `CATALOGS`; each meta carries its schema source.
- Backend `app/artifact.py` exposes both catalog registries and a
  `validate_record_component` function.
- `catalog_service`/`validate_component` dispatch by schema source.
- Library tabs include the merged kinds; artifact-backed records keep their current
  behaviour.
- Seed data: `data/seeds/cooling_curves.json`, wired through `referenceCache`.

### Nested list validation

The list support is limited to a list of flat rows. That is enough for cooling curves
and sparge runoff tables and keeps the record layer simple.

Validate recursively:

- list item count (`min_items`),
- unknown item fields,
- numeric dimensions, finite values, domains,
- taxonomies,
- strings/booleans,
- no nested lists inside list items (reject explicitly).

This validator is separate from artifact grammar validation. The artifact validator
stays unchanged.

## Cooling curve records

Fields:

- `id` (server-assigned)
- `name` (title)
- `description` (optional)
- `ambient_temp_c`
- `start_temp_c`
- `points`: `[{ time_min, temp_c }]`
- `notes` (optional)

Records are immutable: create/read/delete. Corrections create a new curve.

## Fit

Add a pure host-side helper, e.g. `frontend/src/views/coolingCurve.js`:

```text
fitCoolingCurve({ startTempC, ambientTempC, points })
  -> { kPerMin, tauMin, r2, pointCount, ignored, valid }
```

Use a log-linear least-squares fit:

```text
y_i = ln((T_i - T_env) / (T_start - T_env))
k = -slope(t_i, y_i)
tau = 1 / k
```

Rules:

- require `startTempC > ambientTempC`,
- require at least two usable points with `time_min > 0`,
- require `temp_c > ambientTempC`,
- require strictly increasing times; reject duplicates,
- return `valid: false` when fewer than two points or a non-positive slope,
- report `R²`; warn below `0.98` but still allow the fit.

The raw points stay canonical. Do not store a derived `k` in the record.

## Batch integration

The artifact gains one additive root:

- `batch.cooling_curve_id` (`dimension: "reference"`, default `""`)

There is **no** `batch.cooling_curve` selection node. The curve is not a DAG value.

Behaviour:

1. The hops card shows a `Cooling curve` picker with `Default cooling`, seed curves, and
   user curves.
2. Selecting a curve:
   - fits `k`,
   - copies `ambient_temp_c` into `batch.whirlpool_ambient_temp_c`,
   - copies `1/k` into `batch.whirlpool_cooling_time_constant_min`,
   - stores `batch.cooling_curve_id`.
3. `Default cooling` resets the time constant to `108.7` and clears the id.
4. Manually editing the time constant clears the id and shows `Custom`.
5. Deleting the library curve does not change the batch; the copied roots remain.
6. If a saved id no longer resolves, the picker shows `Missing curve` but the batch
   still uses its copied values.

The existing time constant remains the solver input. No DAG selection snapshot is
needed because the curve is authoring-only.

## UI

### Library

Add a `Cooling Curves` tab. The generic record form gains a list editor:

- start temperature, ambient temperature, name, notes,
- point rows with time and temperature,
- add/remove row,
- sort by time on save,
- validation errors for bad ordering, non-positive times, temperatures at or below
  ambient, and fewer than two points.

Because records are immutable, the UI says “Saved. Corrections create a new curve.”

The list renderer is generic so future record kinds can use it without artifact
changes.

### Hops card

In the whirlpool settings block:

- `Cooling curve` selector with `Default cooling` + seed/user curves,
- `Manage library` link,
- selected curve name, `k`, `tau`, and `R²`,
- warning when the fit is poor or ambient/start values are inconsistent.

## Future reuse

The record schema layer is the reusable piece:

- sparge runoff tables (time/volume or volume/temperature rows),
- fermentation logs,
- hop sensory panels or other measurement documents.

If a future record must be displayed inside a batch rather than reduced to scalars,
add a generic `batch.records` attachment map later. That is a separate plan; cooling
curves only need the derived scalar roots.

## Tests

Record layer:

- nested list validation accepts valid rows and rejects unknown fields, missing items,
  bad dimensions, domains, taxonomies, and nested lists inside items,
- JS and Python validators agree,
- artifact-backed catalogs are unaffected,
- library create/read/delete for a cooling curve,
- seed curves listed read-only.

Fit:

- exact synthetic Newton cooling recovers `k`,
- noisy points recover `k` within tolerance,
- one point is invalid,
- temperatures at or below ambient are rejected,
- non-increasing times are rejected,
- `R²` reflects a poor fit.

Batch:

- selecting a curve copies ambient and `tau`,
- `Default cooling` restores `108.7`,
- editing `tau` clears the selection,
- deleting a library curve does not change a loaded batch,
- saved values survive save/load/freeze.

Docs/gates:

- regenerate the artifact inventory (new root only),
- update `docs/hops/whirlpool-hopping-model.md` with the empirical `k` workflow,
- update `docs/dag-artifacts/seed-substrate.md` or the record-library docs for
  non-DAG records,
- `make verify`.

## Phases

1. **Record schema layer** — data files, JS/Python validation, catalog merge, library
   form list renderer. Acceptance: a non-DAG record can be created and validated
   without changing the artifact grammar.
2. **Cooling curve catalog** — seed, library tab, point-row editor, immutable CRUD.
   Acceptance: a curve can be created, read, and deleted.
3. **Fit and batch integration** — pure fit helper, `batch.cooling_curve_id` root,
   picker, copy/detach/default. Acceptance: the card uses the selected curve and falls
   back to `108.7`.
4. **Hardening** — fit-quality warnings, tests, docs, `make verify`.

## Risks

- The record schema layer duplicates some validation concepts from the artifact; keep
  dimensions, domains, and taxonomies single-sourced from the artifact.
- A generic library list editor is a moderate UI change; keep it limited to flat rows.
- A poor measurement or inconsistent ambient produces a misleading `k`; surface `R²`
  and the raw points, and allow manual override.
- Fit `k` is only as good as the temperature sensor and the single-lumped-temperature
  assumption.
- Copy-forward means a corrected library curve does not retroactively change an
  existing batch.

## Open questions

- Require `R² >= 0.98`, or warn only? (Current recommendation: warn only.)
- Seed one reference curve, or rely solely on the `0.0092` fallback?
- Should the curve’s ambient override `batch.whirlpool_ambient_temp_c`, or only feed
  the fit? (Current recommendation: copy it, like a water report.)
- Should duplicate time points be rejected or averaged?
- Should the first reusable record type after cooling curves be sparge runoff, or wait
  for a second consumer before generalizing further?
