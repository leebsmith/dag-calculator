# Finish the yeast panel

**Status:** in progress
**Scope:** close out the in-flight yeast-surface work recorded in
`plans/rationalize-yeast-surface.md` — the yeast card, the attenuation panel,
the Library range invariant, and the picker.
**Gate:** `make generate`, `make check`, `make test`.

## Why

The working tree holds the yeast-surface implementation, but two things are
stale:

- The report still labels `batch.yeast.attenuation_cap_pct` as “Typical
  attenuation”, a name that described the pre-rename point value. The value is
  the strain cap, and `data/labels.json` already says **Attenuation cap**.
- The parent plan's execution checklist is unticked even though the card,
  Library invariant, and picker are implemented and covered by tests.

The card and picker themselves need no redesign; this plan finishes the record
and the one surface the rename missed.

## Steps

- [ ] Align the report yeast section with the cap rename: relabel the
  `batch.yeast.attenuation_cap_pct` presentation in
  `backend/scripts/emit_report_bundle_fixture.py` and the two headings in
  `backend/app/templates/sections/yeast.typ`, then regenerate the fixture.
- [ ] Refresh the execution checklist in `plans/rationalize-yeast-surface.md`:
  tick the five step-1 items and the four step-2 items that the working tree
  implements, and note the report relabel as their follow-up.
- [ ] Run `make generate`, `make check`, and `make test`; resolve any failure.
- [ ] Confirm the ranged-strain popover and the point-only derate fallback still
  write `batch.attenuation_derate_points` through the yeast-card suite.

## Out of scope

- Redesigning the yeast card or picker.
- Changing the attenuation model, `sta1` semantics, or the derate root.
- Archiving `plans/rationalize-yeast-surface.md`; it keeps its own lifecycle.
- POF backfill, Library paging, and blend behaviour.

## Verification

1. `make generate` leaves the bundle fixture at
   `tests/conformance/fixtures/report-bundle.json` with the **Attenuation cap**
   label.
2. `make check`.
3. `make test`.
4. `node --test tests/frontend/yeast-card.test.js` covers the ranged popover,
   the point-only fallback, the legacy snapshot read, and the cause labels.
