---
title: Hopping strategy notes and hop purchase table
status: active
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make verify
---

<!-- claims: proposed report.hop_strategy report.hop_purchases -->

# Hopping strategy notes and hop purchase table

Two report-facing additions that share one mechanism:

1. a batch-level prose **hopping strategy** at the top of the Hops card and the
   Hops report section;
2. a per-product **purchase table** at the end of the Hops report section,
   summing boil, whirlpool and dry-hop usage and rounding up to whole ounces.

Neither adds an artifact node, a boundary or a solver input. The prose is batch
metadata; the purchase table is derived at freeze from the frozen hop rows. Both
reach the report as named report tables inside the existing `formatted_tables`
map, so no report-bundle field or canonical-hash migration is needed.

## Locked decisions

- **Strategy is batch-level**, not a hop-row note: it spans stages, forms and a
  sensory objective.
- **Strategy storage:** optional `hop_strategy` on the draft and batch record,
  default `""`, max 4,000 characters. No payload-schema bump.
- **Strategy card:** textarea at the top of the Hops step, before Boil Hops, with
  a muted note: "Blank lines separate paragraphs; single line breaks are
  ignored."
- **Strategy report:** a **Hopping Strategy** block at the top of the Hops
  section, before Boil Hops. Blank lines split paragraphs; single newlines
  collapse to spaces; empty prose emits no block.
- **Purchases group only identical products:** `hop_id` + `product_form` (name +
  form fallback). T-90 and Cryo are separate lines.
- **Purchases sum across boil, whirlpool and dry hops**, then round **up** once
  per product to a whole ounce. Buy-only column; no exact-used column.
- **Unresolved mass and `ml`** are separate lines: `—` in Purchase for
  unresolved, summed millilitres for volume. They do not mark the table
  "incomplete".
- **Report-only purchase table.** No Hops card summary.
- **Named report tables:** `report.hop_strategy` and `report.hop_purchases` are
  allowlisted by `check_formatted_tables`; all other non-collection keys still
  fail.

## Execution checklist

- [x] Add named-report-table support to `backend/app/services/bundle_integrity.py`
      for `report.hop_strategy` and `report.hop_purchases`; add positive and
      negative tests in `tests/backend/test_report_bundle.py`.
- [x] Add the pure purchase aggregation helper
      `frontend/src/views/producer/hopPurchases.js`: grouping, resolved-mass
      summing, dry-hop unit conversion, volume rows, unresolved rows, and
      whole-ounce round-up. Add `tests/frontend/hop-purchases.test.js`.
- [x] Emit `report.hop_purchases` from
      `frontend/src/views/producer/reportFormat.js` with `name`, `form` and
      `purchase` `FormattedValue` cells; cover it in
      `tests/frontend/report-format.test.js`.
- [x] Render the **Hop Purchases** table at the end of
      `backend/app/templates/sections/hops.typ`, after Overall Hops; add a
      presence probe/render test in `tests/backend/test_report_sections.py`.
- [x] Add `hop_strategy` to `DraftPayload` and `BatchRecord`, copy it in the
      frozen-record snapshot, and carry it through `persistence` save/open/fork,
      `draftState()` and `loadState()`.
- [x] Add the strategy state and setter in a small
      `frontend/src/adapters/cards/hopsStrategy.js` installer, wire it through
      `hops.js`/`installers.js`, regenerate `docs/frontend-ownership.md`, and
      add the textarea block at the top of `step-hops.html`.
- [x] Emit `report.hop_strategy` from `reportFormat.js` as one paragraph per
      blank-line-separated block; render the **Hopping Strategy** block at the
      top of `hops.typ` and include it in the section-presence check.
- [x] Add a sample strategy and purchase table to
      `backend/scripts/emit_report_bundle_fixture.py`; regenerate the fixture.
- [x] Update `docs/report-bundle.md`, `docs/report-renderer.md`, and the
      generated ownership docs.
- [x] Run `make check`, `make test`, and `make verify`.

## Purchase aggregation details

Normalise each hop row to `{ id, name, form, massKg | null, volumeMl | null }`:

- boil/whirlpool: solved `mass_kg`;
- dry: `quantity` with `g` or `oz` converted to kg; `ml` becomes volume;
- missing or non-finite mass is unresolved.

Group key: product identity + form + basis (`mass`, `volume`, `unresolved`).
Sum masses and volumes separately. A product with both mass and unresolved rows
produces a mass line and an unresolved line. A zero resolved total produces no
mass line. Sort by name, then form.

Formatting:

- mass: `totalKg / ozKg`, `buyOz = ceil(totalOz - 1e-9)`, printed as whole
  ounces with the `oz` symbol;
- volume: summed millilitres;
- unresolved: `—`;
- form: the product-form label from the registry.

## Strategy formatting details

`hop_strategy.trim()` empty → no rows. Otherwise split on blank lines, collapse
single newlines and runs of whitespace inside each paragraph, drop empty
paragraphs, and emit `{ text: { text: paragraph } }` rows. The report template
prints each row as a paragraph.

## Snapshot note

The purchase table and strategy are freeze-time values. Reports preview drafts
from the browser-built bundle and read frozen batches from their stored bundle.
A bundle without either named key renders without the corresponding block.
