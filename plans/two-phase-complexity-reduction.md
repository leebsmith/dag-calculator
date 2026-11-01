---
title: Two-phase cyclomatic-complexity reduction (backend gate + burn-down)
status: active
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make check + make test
---

# Two-phase cyclomatic-complexity reduction

The frontend has a complexity ratchet (`complexity 12` plus per-file pins,
re-measured by `tests/guards/shape-pins.test.js`). The backend has none: ruff
selects `E`, `F`, `I`, `W`, `UP` and `B`, so nothing observes branch growth. This
plan closes that gap in two rungs rather than one large refactor.

Measured before the change (ruff `C901` at threshold 1 over `backend/app`):

| Ceiling | Functions failing | Who |
|---|---|---|
| 15 | 1 | `validate_component` (19) |
| 12 | 7 | the above plus `_validate_record_list` 15, `_resolve_gravity` 15, `_validate_record_scalar` 14, `_validate` 14, `_solve_linear_minimalist` 14, `infer_adsco_mode` 14 |
| 10 | 8 | the above plus `_feasible_bound` (12) |

Phase 1 lands the gate at 15 and splits one function. Phase 2 splits the
remaining six and lowers the ceiling to 12. The rung is the forcing function: a
ceiling that fails hard needs no pin table, because the step down is one integer
in a config file.

## Decisions

- **Scope is `backend/app`.** There is no root `pyproject.toml` or `ruff.toml`, and
  none in `tests/` or `scripts/`, so ruff resolves defaults for those trees and
  this gate does not cover them. Accepted: fixtures and seed builders legitimately
  branch per record or column shape, and the frontend's equivalent contract treats
  its scripts separately too.
- **No pin mechanism.** The backend's debt is one function, then zero. Pins exist
  on the frontend because 25 files must stay allowed at 12 while remaining
  visible; that problem does not arise here.
- **The frontend validator stays out of phase 1.** `validateArtifactComponent` in
  `frontend/src/store/userCatalog.js` mirrors the Python validator at complexity
  32. Phase 1 splits the Python side only; the shared
  `tests/conformance/fixtures/validation-cases.json` corpus and
  `tests/backend/conformance/test_validation_parity.py` keep the two honest while
  their shapes differ. The frontend side joins the frontend burndown.

## Phase 1 — ceiling 15

- [ ] Add `C901` to the ruff select list in `backend/pyproject.toml`
- [ ] Add the mccabe block with `max-complexity = 15`
- [ ] Extract the field-kind dispatch from `validate_component` and the component
      field walk, preserving every message string and its order
- [ ] `make check` green at ceiling 15, zero suppressions

## Phase 2 — ceiling 12

- [ ] Share the dimension and taxonomy field validators with the record path
- [ ] Split `_validate_record_scalar` to 12 or below
- [ ] Split `_validate_record_list` to 12 or below
- [ ] Split `_resolve_gravity` into one helper per pin, lifting the nested
      residual and grid probe to module functions
- [ ] Replace the hop solver `_validate` if-chain with a check table
- [ ] Split `_solve_linear_minimalist` into assembly, solve and telemetry phases
- [ ] Replace the strategy and ion if-chains in `infer_adsco_mode` with lookup
      tables
- [ ] Lower `max-complexity` to 12
- [ ] `make check` and `make test` green at ceiling 12

## Not in scope

- **Ceiling 10.** One function, `_feasible_bound` (12), would need splitting. Cheap
  enough to fold into phase 2 if the six go smoothly; otherwise a later rung.
- **Length-only splits.** `resolve_stage_cascade` (166 lines) and `_solve_pipeline`
  (164) are already under 12. Readability work, no gate pressure.
- **Frontend burndown.** 47 functions above `complexity 12` in 25 files, already
  pinned and tracked in `TODO.md`. Picking up `validateArtifactComponent` is the
  natural first move once the Python validator's shape is settled.
- **`tests/backend` and `scripts` Python.** No config resolution, see Decisions.
