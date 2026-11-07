---
title: Report Skip Omission, Batches Save Fix, and Read-Only Draft View
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [report-bundle]
blocks: []
gate: skipped checklist rows are omitted from the report; no-whirlpool batches hide IBU Splits; Batches returns to the landing page; a draft opens read-only with no copy; make check and make test green
status: active (approved; not yet implemented)
---

# Report Skip Omission, Batches Save Fix, and Read-Only Draft View

Status: approved for implementation; not yet implemented.
Scope: frontend read-only draft mode, report checklist skip filtering, and the
draft save clone failure behind the inoperative Batches button.

## Decisions

1. A skipped checklist step must be **omitted** from the printed report, not
   marked as skipped. The frozen table keeps the row; the renderer filters it.
2. The read-only mode is for **drafts only**. It opens the draft in the normal
   editor with mutations disabled and creates no copy.
3. The Batches button failure is fixed at the snapshot seam, not by bypassing
   the save.
4. The report checklist level behavior is unchanged; only skipped rows change.

## Findings

### Skipped steps

`frontend/src/views/producer/reportFormat.js` already writes
`skipped: "Skipped: <reason>"` into the frozen checklist table. The Typst
renderer in `backend/app/templates/sections/checklist.typ` iterates every table
row and renders each one, so a skipped step still prints.

The expected behavior is omission: a skipped step is not part of the plan the
report prints.

### IBU Splits without whirlpool hops

`backend/app/templates/sections/hops.typ` guards the IBU Splits block on
`present-formatted("batch.boil_ibu_share")`, which is always present. It does
not check the whirlpool table. A batch with no whirlpool hops therefore still
prints an IBU Splits section whose whirlpool half is zero.

### Batches button

`recipes.backToBatches()` calls `persistence.flushSave()`, which calls
`performSave()` and `snapshot.draftState()`. `shapeDraftState` uses
`globalThis.structuredClone(collections)` and
`globalThis.structuredClone(selections)`. When any collection row is an Alpine
reactive proxy, `structuredClone` throws `DataCloneError`, the save rejects, and
the view never changes. The button itself is not broken; the save path throws
before navigation.

The fix is to detach the maps with a proxy-safe JSON clone. The collections and
selections are JSON payloads by contract; `JSON.parse(JSON.stringify(...))`
reads through the proxy and produces a plain payload. The existing tests that
assert detachment from later edits remain valid.

### Read-only draft view

The batch list opens drafts editable and frozen batches only through the row
menu. The user wants a draft opened in the normal editor, read-only, without
freezing or forking. The persistence manager can already load any draft; the
missing pieces are a read-only flag, mutation guards, and UI affordance.

## Work

### 1. Omit skipped steps from the report

File: `backend/app/templates/sections/checklist.typ`

- Move the `cell` helper above the `rows` binding.
- Read the full table, then filter out any row whose `skipped` cell is not `—`.
  Observation rows are unaffected because their `skipped` cell is always `—`.
- Keep `present-checklist()` based on the filtered rows, so a checklist made
  entirely of skipped steps hides the section.
- Do not change the bundle table; the skip state stays a recorded fact.

Tests:

- Frontend: set a step skipped with a reason, build `reportFormattedTables()`,
  and assert the row still carries `Skipped: <reason>` in the bundle table.
- Render: append a sentinel skipped row to the fixture bundle table, render the
  checklist section, extract the PDF text with `pypdf`, and assert the sentinel
  title/text is absent while a non-skipped sentinel is present.
- Optional: assert the section still renders when at least one non-skipped row
  remains.

### 2. Hide the IBU Splits section without whirlpool hops

File: `backend/app/templates/sections/hops.typ`

- Guard the IBU Splits block on the whirlpool table being present:
  `present-formatted("batch.boil_ibu_share") and present-formatted-table(WHIRLPOOL)`.
- Keep the Overall Hops block; it still carries the total IBU and mass.
- No artifact or bundle change.

Tests:

- Render the hops section from the fixture with the whirlpool table removed,
  extract the PDF text with `pypdf`, and assert `IBU Splits` is absent while
  `Overall Hops` remains.
- Render the baseline fixture and assert `IBU Splits` is present when whirlpool
  hops exist.

### 3. Fix the Batches save clone

File: `frontend/src/views/snapshotFormatters.js`

- Add a local `detach(value)` helper using
  `JSON.parse(JSON.stringify(value))`.
- Use `detach` for `collections` and `selections` in `shapeDraftState`.
- Keep the existing comment about detaching from live session state; explain
  that JSON cloning is deliberate because Alpine proxies cannot be
  `structuredClone`d.
- Leave `identity`, `roots`, and `hop_strategy` behavior unchanged.

Tests:

- `snapshot-formatters.test.js`: pass a Proxy-wrapped collection and selection,
  assert `shapeDraftState` returns plain data and does not throw.
- Keep the existing "detaches collections and selections from later edits" test.
- Optional integration: boot `withFreshApp`, set a collection from a Proxy,
  call `app.draftState()`, and assert it returns JSON data.

No change to `recipes.backToBatches()` or `persistence.flushSave()` is needed
once the clone is safe. A genuine save conflict still surfaces through the
existing persistence error path.

### 4. Add a read-only draft view

#### Entry

- `frontend/src/partials/chooser.html`: add a draft-only row-menu action
  **Open read-only**. The primary name click stays editable.
- `frontend/src/store/recipes.js`: add `openDraftReadOnly(id)`, and add
  `readOnly` to the store, synchronized from the active record.

#### State and persistence

- `frontend/src/store/persistence.js`
  - `open(batchId, { readOnly = false } = {})` records `readOnly` on the active
    record, loads the state, then calls `app.setReadOnly(readOnly)`.
  - `queueSave`, `saveNow`, `performSave`, `freezeActive`, `renameActive`, and
    `trashActive` no-op when the active record is read-only.
  - `createWithIdentity`, `createUnsavedDraft`, `fork`, and `clearActive` reset
    the flag.
- `frontend/src/adapters/session.js`
  - Add a `readOnly` flag and `setReadOnly`.
  - Guard the mutation facade: `setRoot`, `unsetRoot`, `setCollection`,
    `setSelection`, `setIdentity`, and `setReferences`.
  - Leave `applyBoundaryResult`, `markBoundaryUnavailable`, and all read
    methods alone so solving and rendering still work.
- `frontend/src/adapters/stepAdapter.js`
  - Add `readOnly` and `setReadOnly(value)`, delegating to the session.
  - Reset to false in `teardown`.
- `frontend/src/store/recipes.js`
  - `syncActive` copies `readOnly` from the active record.
  - Guard `freeze`, `trash`, and `rename` on `readOnly` as a second defense.

#### UI

- `frontend/src/partials/editor.html`
  - Add a "Read-only view — changes are disabled" banner.
  - Make the title input `:readonly`.
  - Hide **Freeze** and **Move to trash** when read-only.
  - Keep **Batches**, **Download bundle**, **Build report**, and **Units**.
- Wrap the step card content (inside the step viewport, not the rail or top
  stepper) in
  `<fieldset class="readonly-field" :disabled="$store.recipes.readOnly">`.
- Add a CSS reset for the fieldset and a muted read-only treatment. Custom
  clickable elements are covered by the session guards; optionally add
  `pointer-events: none` on the card slot for affordance.

#### Tests

- `tests/frontend/persistence.test.js`: read-only open, queue a save, assert no
  `upsert`; `freezeActive`, `renameActive`, and `trashActive` make no client
  calls.
- `tests/frontend/read-only.test.js`: `setReadOnly(true)` blocks `setRoot`,
  `setCollection`, `setSelection`, and `setIdentity`; `setReadOnly(false)`
  restores writes.
- `tests/frontend/recipes.test.js`: `openDraftReadOnly` enters the editor with
  `readOnly` true; normal `openDraft` is writable.
- Reset test: open read-only, then open a normal draft, and confirm writes work.

## Commit split

1. **Report checklist and IBU-split fixes**
   - Omit skipped checklist steps: `checklist.typ`, render test, frontend table
     test.
   - Hide IBU Splits without whirlpool hops: `hops.typ`, render tests.
2. **Fix draft saves and add a read-only draft view**
   - First the Batches fix: `snapshotFormatters.js` proxy-safe detach plus its
     regression test.
   - Then the read-only mode: persistence, session, step adapter, recipes store,
     editor/chooser partials, CSS, tests.

The Batches fix leads the second commit because the read-only mode depends on
the save guards and because the fix must land before the mode is usable.

## Verification

1. Targeted tests for the checklist render, snapshot formatters, persistence,
   recipes, and read-only mode.
2. `make check`.
3. `make test`.
4. Manual draft check:
   - Mark a step skipped, build a report, confirm the step is absent.
   - Build a report for a batch with no whirlpool hops and confirm the IBU
     Splits section is absent while Overall Hops remains.
   - Click **Batches**; confirm the landing page opens with no console error.
   - Open a draft read-only; confirm the banner, disabled controls, navigation,
     bundle download, and report build.
   - Go back, open the same draft editable, and confirm an edit saves.

## Risks and guardrails

- JSON cloning drops `undefined` values. The persisted draft payload is JSON;
  absence is equivalent for these maps.
- Read-only must not block `applyBoundaryResult`; solving still needs it.
- Guard `setReferences` to keep the read-only view stable; library edits are a
  separate surface and do not write the draft.
- Reset `readOnly` on every open, create, fork, clear, and teardown so a later
  editable draft is not accidentally locked.
- The fieldset must exclude the rail/top stepper and the toolbar so navigation
  and read actions remain available.
- No backend changes for read-only; no bundle format changes for skip filtering.

## Deferred

- Read-only viewing of a **frozen** batch in the editor.
- Changing the checklist level at report time.
- The salt mass unit fix.
