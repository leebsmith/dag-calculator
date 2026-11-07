---
title: Ranged yeast attenuation — normalize the cap and the above-cap readout
status: done
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make check + make test
---

# Ranged yeast attenuation — normalize the cap and the above-cap readout

> **Status (2026-11-07).** Done.

## Why

A user clone of Belgian Tripel M31 carried a published range of 82–92 % and a
stored cap of 85 %. Two symptoms followed:

- The yeast card hides **Set attenuation…** unless the cap equals the published
  high, so the inconsistent clone fell back to the numeric derate input and the
  solver used 85 %, not 92 %.
- The above-cap row read **+41.3 %**. The artifact value is percentage points
  (`apparent_attenuation − batch.yeast_cap`), and the report already prints
  `pts`; the card rendered it with a percent sign.

The frontend save path enforced cap = high, but the backend validator did not,
so a record could still land in the stale shape (or predate the invariant). No
read path repaired it.

## Decisions

1. **Normalize automatically.** A ranged record's cap is the published high at
   every state boundary, without rewriting the stored document.
2. **The above-cap gap is points.** Render it as `+34.3 pts`, unit-menu
   independent, matching the report and the derate control.
3. **Enforce the invariant on both sides** and put the cases in the shared
   validation corpus, so the frontend and backend cannot diverge.

## Execution checklist

- [x] Normalize ranged yeast records on backend catalog reads (`list_items`,
      `get_item`) without mutating the stored document.
- [x] Normalize yeast selection snapshots in `session.setSelection` so a newly
      chosen record enters the engine with cap = high.
- [x] Extend the load-time yeast selection migration so existing drafts and
      snapshots are repaired before the first solve.
- [x] Add the cap/high cross-field rule to the backend and frontend component
      validators, add shared corpus cases, and remove the duplicate
      Library-only check.
- [x] Render the above-cap gap in points and clarify in the card explainer that
      sugar extract is never capped, so apparent attenuation may exceed 100 %.
- [x] Cover the pure normalizer, the card readouts, the selection migration, the
      backend read normalization and the validation corpus.
- [x] Run `make check` and `make test`.

## Files touched

- `backend/app/artifact.py`
- `backend/app/services/catalog_service.py`
- `frontend/src/adapters/cards/yeastAttenuation.js`
- `frontend/src/adapters/libraryUi.js`
- `frontend/src/adapters/session.js`
- `frontend/src/partials/step-yeast.html`
- `frontend/src/store/batchMigrations.js`
- `frontend/src/store/userCatalog.js`
- `frontend/src/views/producer/yeastRows.js`
- `tests/backend/test_catalog.py`
- `tests/conformance/fixtures/validation-cases.json`
- `tests/frontend/batch-migrations.test.js`
- `tests/frontend/yeast-card.test.js`
- `tests/frontend/yeast-rows.test.js`

## Verification

1. `make check` — eslint, stylelint, ruff, tach, hygiene.
2. `make test` — 883 backend tests passed; frontend suites and guards passed.
3. Manual: reload the affected batch; the card exposes **Set attenuation…**, the
   target cap reads 92 %, and the above-cap row reads points.
