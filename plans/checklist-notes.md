---
title: Checklist Notes in the Report
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [report-bundle]
blocks: []
gate: a checklist note appears in the rendered recipe report; done_when remains unprinted; make check and make test green
status: active (approved; not implemented)
---

# Checklist Notes in the Report

Status: approved; not implemented.

## Goal

Print a checklist step's per-batch note in the recipe report. Do not print
`done_when`.

## Findings

`frontend/src/views/producer/checklist/table.js` already writes the note into
the frozen checklist table:

```js
note: cell(row.note || "—"),
```

`backend/app/templates/sections/checklist.typ`'s `step-row` renders only
`title`, `text`, and `level`. It never reads `cell(row, "note")`, so a note in
the bundle is dropped at print time. `done_when` is omitted by the same
renderer, but it stays out of scope by decision.

## Work

### 1. Render the note

File: `backend/app/templates/sections/checklist.typ`

- Read `cell(row, "note")` inside `step-row`.
- When the value is not `—`, print a muted `Note: …` line after the step text
  and before the level line.
- Do not read or render `done_when`.

### 2. Test

File: `tests/backend/test_report_render.py`

- Set a fixture checklist row's `note` cell to a unique sentinel.
- Render the checklist section.
- Extract the PDF text with `pypdf`.
- Assert the sentinel appears.
- Keep the baseline checklist render test and the skipped-step omission test
  unchanged.

## Acceptance

- A note saved on a checklist step is present in the rendered report.
- No `Done when:` line is added.
- No artifact, bundle, schema, or report-format change.
- `make check` and `make test` are green.

## Notes

- Frozen reports remain immutable; a note added after freezing needs a draft
  preview or a re-freeze.
- The tabled checklist skip persistence issue is separate.
- The renderer still omits `done_when` by decision.
