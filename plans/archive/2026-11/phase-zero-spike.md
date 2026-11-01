---
title: Phase Zero Spike — Flat Checklist Table
status: active
program: deterministic-dag-calculator
depends_on: [brew-checklist]
blocks: []
gate: make verify
---
<!-- claims: proposed batch.brew_checklist -->

# Plan — phase-zero-spike

## Goal

Prove the riskiest integration in the brew-checklist plan before building the
catalog: a flat frozen table carrying both `kind: step` and `kind: observation`
rows, a Typst section that renders both, and bundle integrity that accepts the
table without a bundle-format bump.

This is a spike, not the Phase 1 implementation. It uses the existing
`batch.brew_day_steps` collection as the table key. Phase 1 replaces that key with
`batch.brew_checklist` and builds the real catalog.

## Non-goals

- No artifact rename, no `batch.brew_checklist` node, no migration.
- No full checklist catalog, levels, conditions or providers.
- No observation entry, session log or correction helpers.
- No observation metric catalog.
- No UI changes.
- No new bundle block or bundle-format bump.

## What the spike proves

1. `formatted_tables` can carry a row with `kind: step` and a row with
   `kind: observation` under one collection key.
2. `check_formatted_tables` accepts the extra columns.
3. The Typst section can group and render both row kinds from the same table.
4. The report registry, presence predicate and section guard accept the section.
5. The fixture generator can emit the table without changing the bundle format.

If any of these fail, stop and amend the contract before Phase 1 builds the
catalog.

## Checklist

- [x] Add `checklistRows` to `frontend/src/views/producer/reportFormat.js`; emit
  one generated step row and one blank observation row under
  `batch.brew_day_steps`.
- [x] Add a frontend test asserting two rows, the step/observation kinds, a
  generated HLT instruction, and non-empty text in every cell.
- [x] Add `backend/app/templates/sections/checklist.typ` with a presence predicate
  and a renderer for both row kinds.
- [x] Register the section in `backend/app/templates/report.typ` after Limits.
- [x] Add the checklist table to
  `backend/scripts/emit_report_bundle_fixture.py` and regenerate the bundle
  fixture.
- [x] Add backend tests: the checklist section renders; it is absent when the
  table is missing; the full report section list includes it.
- [x] Run `node scripts/emit-report-sections.mjs` to regenerate the report
  section docs and manifest.
- [x] Run `make check`.
- [x] Run `make test`; fix any failures.

## Acceptance

- The frontend freeze payload contains a `batch.brew_day_steps` table with one
  step row and one observation row.
- Every cell in every row is a formatted value with non-empty text.
- `parse_bundle` / `seal_bundle` accept the fixture with the table.
- The `checklist` report section renders in the full report and alone.
- The section is absent when the table is missing.
- No `bundle_format` change.
- `make check` and `make test` are green.

## Risks

- Typst table syntax: keep the section small and use the existing table idioms.
- Fixture drift: regenerate through the script, never hand-edit the fixture.
- Section registry drift: run the emitter, do not edit the generated docs.
- Scope creep: this spike does not add the real catalog, levels or session.
