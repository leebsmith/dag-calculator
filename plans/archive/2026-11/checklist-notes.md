# Checklist Notes in the Report

Objective: print a checklist step's per-batch note in the recipe report. Do not
print `done_when`.

## Execution Checklist

- [x] 1. Render the checklist note.
  - Read the `note` cell in `step-row` in `backend/app/templates/sections/checklist.typ`.
  - When it is not `—`, print a muted `Note: …` line after the step text and
    before the level line.
  - Do not read or render `done_when`.
- [x] 2. Add the render test.
  - Set a fixture checklist row's `note` cell to a unique sentinel.
  - Render the checklist section.
  - Extract the PDF text with `pypdf` and assert the sentinel appears.
  - Keep the baseline and skipped-step tests unchanged.
- [x] 3. Run `make check`.
- [x] 4. Run `make test`.
- [x] 5. Archive this plan and make the final commit.

## Acceptance

- A note saved on a checklist step is present in the rendered report.
- No `Done when:` line is added.
- No artifact, bundle, schema, or report-format change.
- `make check` and `make test` are green.

## Notes

- The bundle already carries the note in its checklist table; only the Typst
  renderer is missing it.
- Frozen reports remain immutable; a note added after freezing needs a draft
  preview or a re-freeze.
- The tabled checklist skip persistence issue is separate.
