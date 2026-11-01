---
title: Non-DAG Record Schema Layer
status: active
program: deterministic-dag-calculator
depends_on: [brew-log-contract]
blocks: [cooling-curve-determination, brew-measurement-promotion]
gate: make verify
---
<!-- claims: proposed batch.cooling_curve_id -->

# Plan — non-DAG-record-schema-layer

## Goal

Add the reusable record-schema layer for authored measurement documents. The first
record kind is `cooling_curve`; the layer must accept a flat record with a flat
point list, validate it in JS and Python from one schema, and let the existing
library create/read/delete it without changing the artifact grammar.

This is the prerequisite for `plans/cooling-curve-determination.md` and
`plans/brew-measurement-promotion.md`.

## Decisions

- The record layer is general, but only `cooling_curve` is implemented now.
- `cooling_curve.measured_at` is **required** (ISO date) so collection time and
  brew time are visibly separate.
- `cooling_curve.equipment_id` is **optional** and references the equipment
  catalog; it identifies the vessel the curve belongs to.
- The curve's ambient is stored in the record and used by the fit. It is **not**
  copied into the batch.
- No seed curve: `data/seeds/cooling_curves.json` is an empty catalog.
- Duplicate or non-increasing point times are rejected.
- R² is a future fit concern; the record layer only validates the raw points.

## Schema

`data/record_schemas.json`:

```json
{
  "cooling_curve": {
    "fields": {
      "name": { "type": "string", "required": true },
      "description": { "type": "string" },
      "measured_at": { "type": "string", "format": "date", "required": true },
      "equipment_id": { "type": "string", "reference": "equipment" },
      "ambient_temp_c": {
        "dimension": "temperature",
        "required": true,
        "domain": { "gte": -20, "lte": 50 }
      },
      "start_temp_c": {
        "dimension": "temperature",
        "required": true,
        "domain": { "gte": 0, "lte": 100 }
      },
      "points": {
        "type": "list",
        "required": true,
        "min_items": 2,
        "ordered_by": "time_min",
        "unique_by": "time_min",
        "item": {
          "time_min": {
            "dimension": "time",
            "required": true,
            "domain": { "gt": 0 }
          },
          "temp_c": {
            "dimension": "temperature",
            "required": true,
            "domain": { "gte": -20, "lte": 100 }
          }
        }
      },
      "notes": { "type": "string" }
    }
  }
}
```

`data/record_catalogs.json`:

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

## Checklist

- [ ] Add `data/record_schemas.json` and `data/record_catalogs.json`.
- [ ] Add `data/seeds/cooling_curves.json` and wire `coolingCurves` into the
  reference cache.
- [ ] Merge the record catalogs into `frontend/src/store/userCatalog.js`; carry
  `schemaSource` on every catalog meta.
- [ ] Add the JS record validator: required fields, unknown fields, dimensions,
  domains, taxonomies, strings, booleans, date format, flat lists, `min_items`,
  ordered/unique point times, and nested-list rejection.
- [ ] Merge the record catalogs and validator into `backend/app/artifact.py`;
  switch `catalog_service` to the merged registry.
- [ ] Add the library list editor for `type: "list"`, a date input, and an
  optional equipment reference select.
- [ ] Add the record files to the `deploy-backend` vendor copy.
- [ ] Add JS and Python tests for the record schema, validator parity, catalog
  CRUD, and the library create/read/delete path.
- [ ] Add `docs/record-library.md` and update the cooling-curve plan with the
  ambient/no-copy and `measured_at`/`equipment_id` decisions.
- [ ] Run `make check`, `make test`, and `make verify`.

## Acceptance

- `POST /catalog/cooling_curve` creates a valid curve and rejects invalid ones
  with field-level errors.
- The library shows a Cooling Curves tab; the user can add and remove point rows,
  enter the measured date, and pick an optional equipment record.
- JS and Python validators agree on the same fixtures.
- Artifact-backed catalogs are unchanged.
- The empty seed catalog lists as read-only.
- `make verify` is green.
