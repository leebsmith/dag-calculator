---
title: Implement Mash Rests Report Section
status: active
program: deterministic-dag-calculator
depends_on: [report-renderer]
blocks: []
gate: make verify
---

# Plan — implement-mash-rests-report-section

## Goal

Add the `mash-rests` report section. It prints the enabled mash schedule as a
compact brew-sheet table — Step, Temperature, Time — with the total mash time.
Disabled canonical rests stay out of v1; there is no State column and no audit
table.

## Decisions

- Only enabled rests are emitted into the report table.
- The table lives in `formatted_tables["mash.rests"]`; Typst does no conversion
  or rounding.
- Step names come from the rest catalog, not raw `rest_id` values.
- The total comes from `mash.total_time_min` and includes ramp time.
- Presence is `present-formatted-table("mash.rests")`, not “the collection has
  rows”; the collection always carries the disabled canonical rows.
- The section renders after Batch Facts and before Hops.

## Checklist

- [ ] Add `mash.rests` labels and `rest_id` option labels to the mash registry,
  sourced from `data/seeds/mash-rests.json`.
- [ ] Emit enabled `mash.rests` rows from `buildReportTables`: `name`, `temp`,
  and `time` display cells in canonical order.
- [ ] Add `backend/app/templates/sections/mash-rests.typ`: presence predicate,
  total-time line, three-column table, and a short ramp note.
- [ ] Register `mash-rests` in `report.typ` after `batch-facts`; regenerate the
  section manifest and `docs/report-sections.md`.
- [ ] Add `formatted_tables["mash.rests"]` and `mash.total_time_min` to the
  committed report-bundle fixture.
- [ ] Add frontend tests for enabled-only filtering, catalog labels, and display
  units.
- [ ] Add backend tests for section isolation, presence, absence, and the
  section metadata list.
- [ ] Update `docs/report-renderer.md`, `plans/report-renderer.md`, and
  `TODO.md` so the section inventory is current.
- [ ] Run `make generate`, `make check`, `make test`, and `make verify`.
- [ ] Mark this checklist complete and archive the plan.

## Acceptance

- A batch with enabled rests renders Step, Temperature, and Time rows plus the
  total mash time.
- Disabled canonical rests never appear.
- A batch with no enabled rests omits the section rather than rendering a blank
  table.
- The section renders alone and in the full report.
- `make verify` is green.
