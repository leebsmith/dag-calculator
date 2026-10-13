---
title: Dry Hopping step card
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [Step G]
blocks: []
gate: make check/test green
status: done
---

# Dry Hopping — description-only step card

**Goal:** a final, description-only "Dry Hopping" step card capturing a list of
hop additions per the `WetHopCard` schema. It is an **isolated** artifact node —
no inputs, no downstream dependents, no computation.

## Decisions (finalized)

1. **Enum values** — verbatim lowercase snake (schema values).
2. **`quantity`/`unit`** — `quantity` = `dimensionless` number; `unit` = taxonomy.
3. **`contact_duration_hours`** — `dimension: "time"`, with new `hr` + `day` units;
   cell conversion via a per-column `displayUnit` (decision b).
4. **Taxonomy columns** — free text in the table.
5. **Variety** — free-text `variety` column (added beyond the schema); multiple
   additions via the generic collection-table (add/delete rows).

## Model

- **Collection** `batch.dry_hops` (item schema `dry_hop_row`).
- `dry_hop_row`: `product_type` (taxonomy), `variety` (text), `quantity`
  (dimensionless), `unit` (taxonomy `hop_unit`), `application_stage` (taxonomy),
  `time_of_application` (text), `contact_duration_hours` (dimension `time`),
  `notes` (text).

## Artifact changes (additive — no `schema_version` bump)

- `time` dimension gained `hr` (60) + `day` (1440) units.
- New taxonomies: `wet_hop_product_type`, `wet_hop_application_stage`, `hop_unit`.
- New schema `dry_hop_row`; new collection node `batch.dry_hops`.

## Frontend

- **Collection cell conversion (b):** `collectionField` now emits per-column
  `dimension`/`displayUnit`; `valuate` converts cells to display units
  (`fromBase`), `editCell` converts back to base (`toBase`).
- **`views/steps.js`** — `dry-hops` step appended **last**.
- **`views/registry/dry-hops.js`** — labels; `contact_duration_hours` gets
  `displayUnit: "hr"`.
- **`store/referenceCache.js`** — seeds `batch.dry_hops: []`.

## Completion

- [x] Artifact: time hr/day, taxonomies, `dry_hop_row`, `batch.dry_hops`
- [x] Producer: per-column dimension/displayUnit + cell conversion
- [x] Adapter: `editCell` base-unit write
- [x] Registry + manifest (step last) + referenceCache seed
- [x] Tests (A8e) + `make check`/`make test` green

## Out of scope (separate `## Next` items)

- Kettle hopping (IBU) · Trace additions (color) · Unit scaling (`plans/unit-scaling.md`).
