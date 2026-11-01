# Record library — non-DAG records

The library holds two kinds of records:

1. **Artifact-backed records** — styles, equipment, water reports, malts, hops,
   sugars and the other catalogs declared in `data/catalogs.json`. Their fields
   are primitive schemas in `data/artifact.json`.
2. **Non-DAG records** — authored measurement documents whose schema is not part
   of the artifact grammar. Their schemas live in `data/record_schemas.json` and
   their catalog metadata in `data/record_catalogs.json`.

Both kinds use the same server collection, the same immutable create/read/delete
rules, and the same copy-forward behaviour when a batch selects a record.

## Why a separate schema layer

A measurement document is not a DAG value:

- it has a variable-length point list,
- no derived node consumes its rows,
- only a host-side reduction produces a scalar the batch can use.

Putting it in `artifact.primitive_schemas` would force a grammar change for every
new measurement kind. The record layer keeps the artifact unchanged.

## Cooling curve

The first record kind is `cooling_curve`:

- `name` — required title
- `description` — optional
- `measured_at` — required ISO date; collection time is not brew time
- `equipment_id` — optional reference to the equipment record; the curve belongs
  to a vessel
- `ambient_temp_c` — required measurement context and fit input
- `start_temp_c` — required fit input
- `points` — at least two rows of `time_min` and `temp_c`; times must be strictly
  increasing and unique
- `notes` — optional

The curve's ambient is **not** copied into a batch. Ambient is an environment
condition; a curve measured at one ambient can still inform a brew at another.
The batch keeps `batch.whirlpool_ambient_temp_c` independently, and the future
picker shows the curve's fitted ambient beside it.

## Validation

`data/record_schemas.json` is the single source for both validators:

- `frontend/src/store/userCatalog.js` validates in the browser.
- `backend/app/artifact.py` validates on the server.

They share these rules:

- declared fields only; required fields must be present
- dimensions are finite and inside their domains
- taxonomies are artifact taxonomies
- strings, booleans, and ISO dates
- flat lists only; nested lists are rejected
- `min_items`, `ordered_by`, and `unique_by`

Artifact dimensions, domains and taxonomies are reused; the record layer does
not introduce a second dimension system.

## Library editor

The library tab shows the record kinds from both registries. A record form is
built from its schema: scalar dimensions become unit-aware number inputs,
taxonomies and references become selectors, `format: "date"` becomes a date
input, and `type: "list"` becomes a point-row editor with add/remove. The row list
is sorted by its declared `ordered_by` before validation.

## Deployment

The deployed backend reads its data from `backend/app/_vendor`. `make
deploy-backend` copies `artifact.json`, `catalogs.json`, `record_schemas.json` and
`record_catalogs.json`; missing record files make the deployed validator reject
the record kind.

## What this layer does not do

- It does not make records DAG values or selections.
- It does not store a derived result in a record; a fit is host-side.
- It does not edit records; corrections create a new record.
- It does not attach records to a batch beyond the scalar roots a future host
  integration copies.
