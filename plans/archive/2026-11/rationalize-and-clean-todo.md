---
title: Rationalize and clean TODO.md
status: active
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make check + make test
---

# Rationalize and clean TODO.md

`TODO.md` has one cleared item still listed as current, three entries whose facts
have drifted, and a Done section that retells 35 completed plans in prose. This
plan removes the cleared item, corrects the drifted entries, and collapses Done
to one-line links.

## Steps

- [x] Remove the cleared `## Now` item (style targets ±2 JND, landed in `7e5866f`)
      and record it under Done
- [x] Reword the footer item to the work that remains
- [x] Refresh the shape-pin burn-down counts and record the backend gate
- [x] Fix the "below" cross-reference in the Optimize-local-testing entry
- [x] Promote the still-open catalog-duplicate residual to `## Later`
- [x] Collapse Done to one-line entries with their plan links
- [x] `make check` and `make test` green

## Decisions

- **The cleared item moves to Done rather than being deleted**, so the intent
  record survives.
- **The catalog-duplicate caveat moves to `## Later`.** The Done entry for hop
  catalogue repeats notes that malts, sugars and trace malts still hide what is
  already in the draft. That is open work, so collapsing the entry would lose it.
- **`plans/hops-documentation-and-dry-hop-card.md` is `status: shipped` but still
  sits in the plans root.** Archiving it is out of scope here and is recorded as an
  observation only; moving it would change the links living docs cite.
- **The burn-down counts are re-measured, not copied.** They were recorded at an
  older revision; the plan-entry counts are what the linter reports today.

## Result

`TODO.md` fell from 251 to 159 lines; the Done section went from 125 lines of
prose to 36 one-line entries, each keeping its plan link. `make check` and
`make test` are green (762 backend tests, the frontend suite, the guards).

- **Cleared item:** the style-targets entry moved to Done with its commit
  (`7e5866f`). `## Now` is gone because it held nothing else. The caveat recorded
  there: `tests/frontend/style-target.test.js` never names `ALLOWANCE_JND`,
  `allowanceBounds` or `targetDrift`, so the allowance path is not directly
  pinned by a test.
- **Footer:** reworded to what shipped (save state, step position, boundary
  status, violation count, SAI, findings) and what remains (the four conformance
  readouts, LIFO ordering).
- **Burn-down:** re-measured, not copied. 47 functions in 25 files (was 45/26);
  `projection.js` 34 (was 39), `scalar.js` 21 (was 33), `userCatalog.js` 32 (was
  33), `boundaryRunner.js` 213 lines (was 210); eight files above 400 lines (was
  seven). The entry now also records that the backend is a hard ceiling at 10
  with no pins, so the queue is frontend-only.
- **"Below" cross-reference:** gone with the collapse; the Optimize-local-testing
  entry is one line and no longer points at the burn-down.
- **Catalog duplicates:** the open residual (malts, sugars and trace malts still
  hide what is already in the draft) is now a `## Later` bullet rather than a
  caveat buried in a Done paragraph.

One rationalization lead left alone: four terminal plans still sit in the plans
root — `brew-checklist.md` (shipped), `cooling-curve-determination.md`
(implemented), `hop-math-promotion.md` (superseded) and
`hops-documentation-and-dry-hop-card.md` (shipped). Archiving them would change
the links living docs cite, so it belongs to a separate pass.
