# Retire `d = 1` from the primary attenuation solve

**Status:** complete
**Scope:** the batch boundary contract, the composition block, the yeast card's
derate control, the above-cap cause, STA1 recapitulation, the report, docs, and
tests.
**Gate:** `make generate`, `make check`, `make test`.

This plan supersedes decision 9 of
`plans/archive/2026-11/rationalize-yeast-surface.md` ("No STA1 model change") and
retires the range popover from decisions 5/6 and §1.3 of that plan. It does not
reopen the rest of the yeast surface.

## Why

`batch.yeast.sta1` currently sets `d = 1`, which zeroes the malt residue in
`UE`, severs the cap and derate, and lets the ABV pin solve a 9 % tripel at
1.055 OG / 0.986 FG. A vendor's published attenuation already embeds primary
diastatic activity, so `d = 1` double-counts and substitutes an infinite-horizon
packaging bound for a primary prediction.

The fix is to treat the published attenuation — the high end of a range, or the
single point — as the cap for every strain, and to keep the derate as the sole
process lever. `sta1` remains a QC field for display and the report; it is not a
solver input.

## Locked decisions

1. Remove the range editor; keep one numeric derate control, default 0.
2. Relabel STA1 options to `STA1+` / `STA1−` / `STA1?`; the library field becomes
   "STA1 (vendor QC)".
3. Remove the report STA1 warning block; keep the status suffix.
4. Rename the binding readout "mash-limited" to "grist-limited".
5. Remove the STA1-specific below-1.000 FG gate; keep `FG_UNREACHABLE`.
6. Fold `docs/current-attenuation-model.md` into `attenuation-model.md`; do not
   add it as a second living doc. Remove the README row for it.
7. Remove the unused `selectedYeastBand` descriptor.
8. Keep the `≤ 1.000` FG display floor; update its hint for the near-1.0-cap plus
   sugar edge case.

## Workstream 1 — contract and core

- [x] Remove the `sta1` input from the `solver.batch` boundary declaration.
- [x] Remove `FG_BELOW_ZERO_WITHOUT_STA1` from the `solver.batch` domain codes.
- [x] Remove the `sta1` request field from the boundary schema and drop it from
      the service's input construction.
- [x] Remove `sta1` from the batch solver input type.
- [x] Remove `dextrin_consumption` from the composition block and the OE solver;
      `UE = E_malt·(1 − F_eff) + E_sugar·(1 − F_sugar)`.
- [x] Remove the `dextrin_consumption` parameter from every orchestration helper
      and both call sites.
- [x] Remove the below-1.000 FG gate; a target the composition cannot reach still
      returns `FG_UNREACHABLE`.
- [x] Update the negative-AE docstring: the cause is a near-1.0 cap plus sugar,
      not diastaticus.
- [x] Update the labels: the above-cap hint is uncapped sugar only; the real
      attenuation hint loses "dextrin consumption"; the cap hint says "less the
      derate", not "×".

## Workstream 2 — frontend controls

- [x] Remove the `sta1` field from the batch request builder. The yeast record
      keeps it for display and the report.
- [x] Remove the attenuation editor state and handlers: open, close, draft, set,
      use, range validity, target min/max/percent, draft label, derate draft, and
      use label. Keep the numeric derate commit and its readout.
- [x] Remove the "Set attenuation…" button and popover from the yeast step; show
      the derate input for every strain.
- [x] Remove the "or use Set attenuation" clause from the help; keep the mash
      guidance as prose.
- [x] Rewrite the STA1 help paragraph: the status is a vendor QC recapitulation;
      it does not change the primary solve.
- [x] `attenuationAboveCapCause` returns sugar only; remove the diastaticus and
      diastaticus-plus-sugar branches.
- [x] `attenuationBinding` returns `grist-limited` / `yeast cap` / `sugar`.
- [x] Relabel the picker's STA1 buckets and reword the picker help; remove the
      `d = 0` claim.
- [x] Rename the library field label to "STA1 (vendor QC)".
- [x] Reword the unknown-STA1 advisory; keep it as a missing-data advisory.
- [x] Remove the obsolete below-1.000 error string.
- [x] Update the FG-floor comment.
- [x] Remove the unused popover CSS if the style guard flags it.

## Workstream 3 — report

- [x] Remove the STA1 warning block and its gate function from the yeast section;
      keep the status suffix.
- [x] Update the above-cap comment: sugar is the only cause.
- [x] Regenerate the report-bundle fixture.

## Workstream 4 — docs

- [x] `docs/attenuation-model.md`: remove `d` from the block and notation;
      rewrite the STA1 regime and §5.1; update A4, A5 and A11; add a short
      "retired `d = 1` path" section with the 9 %/6.1 gal worked example and its
      exact inputs.
- [x] `docs/current-attenuation-model.md`: fold, then do not add it; remove its
      README row.
- [x] `docs/dag-artifacts/domain-equations.md`: remove `(1 − d)`; update the
      negative-AE note and the error-code list.
- [x] `docs/adsco/ui.md`: above-cap cause = sugar; binding = grist; remove the
      range control; reword the STA1 help; update the FG-floor parenthetical.
- [x] `docs/fermentability-and-yield.md`: remove the `d` references; rewrite the
      STA1 paragraphs.
- [x] `docs/engine.md`: confirm the cap formula wording; no structural change.

## Workstream 5 — tests and fixtures

- [x] Backend: composition regimes, scale pins, domain codes, batch solver,
      fingerprints, report sections, boundary fixtures.
- [x] Frontend: step boundaries, import gate, yeast card, card display, yeast
      rows, the above-cap comment, and the FG-floor test.
- [x] Fixtures: boundary wire keys, the canonical batch request, and the report
      bundle.
- [x] Regenerate once with `make generate`.

## File matrix

| Layer | Files | Action |
|---|---|---|
| Artifact | `data/artifact.json` | remove the `sta1` input and the error code |
| Labels | `data/labels.json` | above-cap, real-attenuation and cap hints |
| Boundary | `backend/app/schemas/boundary.py`, `backend/app/services/batch_solver_service.py`, `backend/app/core/batch/inputs.py` | remove `sta1` and the error code |
| Core | `backend/app/core/batch/composition.py`, `backend/app/core/batch/orchestration.py`, `backend/app/core/utils.py` | remove the dextrin term and the FG gate |
| Request | `frontend/src/adapters/boundaryRequest.js` | remove the `sta1` field |
| Yeast card | `frontend/src/adapters/cards/yeast.js`, `frontend/src/adapters/cards/yeastAttenuation.js`, `frontend/src/partials/step-yeast.html` | remove the editor; keep one derate control |
| Picker/library | `frontend/src/partials/modal-yeast-picker.html`, `frontend/src/adapters/libraryFields.js`, `frontend/src/views/producer/yeastRows.js` | relabel STA1 |
| Advisories | `frontend/src/views/registry/findings.js`, `frontend/src/adapters/stepView.js` | remove the `d = 0` wording |
| Strings | `frontend/src/utils/strings.js` | remove the obsolete error string |
| Report | `backend/app/templates/sections/yeast.typ` | remove the warning block |
| Docs | `docs/attenuation-model.md`, `docs/current-attenuation-model.md`, `docs/dag-artifacts/domain-equations.md`, `docs/adsco/ui.md`, `docs/fermentability-and-yield.md`, `README.md` | rewrite and fold |
| Generated | inventory, ownership, registry, glossary, sections, report bundle | `make generate` once |

## Acceptance criteria

- A STA1+ strain with cap X solves identically to a STA1− strain with cap X.
  There is no dextrin term anywhere in the solve.
- The 9 % / 6.1 gal / 1 lb candi tripel at WLP570's 85 % cap solves near
  1.076 OG / 1.009 FG, not 1.055 / 0.986.
- The derate moves the result; default 0 uses the published high end.
- An FG target of 1.010 succeeds with a normal cap; 0.995 returns
  `FG_UNREACHABLE`; the below-1.000 STA1 error no longer exists.
- The above-cap row appears only with sugar, and the cause says sugar.
- STA1 status appears on the card and report; there is no warning block.
- No `sta1` on the solver wire; no `dextrin_consumption` in code.
- `make test` is green.

## Out of scope

`deff`, `dbound`, `fnd`, tiers, a mash model, test-wort provenance, any packaging
section, seed changes, style-card rework, picker rebuild, and any new root or
field.

## Risks and migration

- Removing a boundary input changes the frozen request shape. Regenerate the
  fixtures and verify an old frozen bundle still renders from its embedded
  artifact.
- Legacy stored requests may carry `sta1`; it is ignored, so no migration is
  required.
- The report fixture's synthetic STA1-positive US-05 becomes a status suffix
  only; removing the warning avoids the oddity.
- Artifact changes are atomic with docs and tests: one commit, not a series that
  leaves the UI or the docs inconsistent.

## Verification

1. `make generate` after the artifact and label changes.
2. `make check`.
3. `make test`.
4. Manual: select a ranged STA1+ strain; confirm the published band is shown, the
   derate defaults to 0, the cap equals the high end, the above-cap row appears
   only with sugar, and the report prints the STA1 suffix without a warning.
