# Read-Only Draft View and Report Checklist Fixes

Objective: make a draft open read-only in the editor with no copy, omit skipped
checklist steps from the report, hide IBU Splits when there are no whirlpool
hops, and fix the Batches button save failure caused by Alpine proxies.

## Execution Checklist

- [ ] 1. Omit skipped checklist steps from the report.
  - Filter rows whose `skipped` cell is not `—` in `checklist.typ`.
  - Add a render test that a skipped sentinel row is absent.
  - Add a frontend table test that the bundle row still carries the reason.
- [ ] 2. Hide the IBU Splits section when there are no whirlpool hops.
  - Guard the block on `present-formatted-table(WHIRLPOOL)`.
  - Add render tests for the absent and present cases.
- [ ] 3. Detach draft snapshots from Alpine proxies.
  - Replace `structuredClone` with a JSON detach in `shapeDraftState`.
  - Add a Proxy regression test.
- [ ] 4. Add the draft-only read-only entry.
  - Add `openDraftReadOnly` and `readOnly` to the recipes store.
  - Add the draft row-menu action in the chooser.
- [ ] 5. Guard session mutations.
  - Add `readOnly` and `setReadOnly` to the session facade.
  - Guard `setRoot`, `unsetRoot`, `setCollection`, `setSelection`,
    `setIdentity`, and `setReferences`.
- [ ] 6. Wire persistence and the step adapter.
  - `persistence.open(id, { readOnly })` records the flag and calls the app.
  - Guard save, freeze, rename, trash, create, fork, and clear paths.
  - `stepAdapter.setReadOnly` delegates to the session and resets on teardown.
- [ ] 7. Add the read-only UI.
  - Read-only banner, readonly title, hidden Freeze/Trash.
  - Fieldset around the step card content; keep navigation, units, bundle, and
    report actions enabled.
  - Add the fieldset CSS reset.
- [ ] 8. Add read-only tests.
  - Persistence: no save/freeze/rename/trash in read-only mode.
  - Session: mutation guards block writes and release them.
  - Recipes: `openDraftReadOnly` enters the editor read-only.
- [ ] 9. Run `make check`.
- [ ] 10. Run `make test`.
- [ ] 11. Archive this plan and make the final commit.

## Acceptance

- A skipped step is omitted from the rendered checklist.
- A batch with no whirlpool hops renders no IBU Splits section.
- Clicking Batches returns to the landing page without a console error.
- A draft opens read-only from the row menu; controls are disabled; the batch
  can be navigated, bundled, and reported; no save occurs.
- No new frozen or draft copy is created.
- `make check` and `make test` are green.

## Notes

- The read-only mode is for drafts only; frozen viewing is out of scope.
- The report checklist level behavior is unchanged.
- The salt mass unit fix remains deferred.
