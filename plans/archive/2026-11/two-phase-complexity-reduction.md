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

Measured before the change (ruff `C901` at threshold 1 over `backend/app`, plus
the two scraper functions the repo-wide gate also reaches at 15):

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

- **Scope is every tree `make check` lints.** `make check` runs
  `ruff check . ../tests/backend ../scripts` from `backend/`, and ruff resolves a
  single config for the invocation: the backend `pyproject.toml`. The gate is
  therefore repo-wide for Python, not `backend/app` only. That is stricter than
  the scope recorded when this plan was written, and it caught two scraper
  functions, `parse_bjcp_directory` (18) and the yeast scraper `main` (16). Both
  were split in phase 1 rather than exempted, so the gate lands with zero
  suppressions.
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

- [x] Add `C901` to the ruff select list in `backend/pyproject.toml`
- [x] Add the mccabe block with `max-complexity = 15`
- [x] Extract the field-kind dispatch from `validate_component` and the component
      field walk, preserving every message string and its order
- [x] Split `parse_bjcp_directory` and the yeast scraper `main`, which the
      repo-wide gate also covered
- [x] `make check` green at ceiling 15, zero suppressions

## Phase 2 — ceiling 12

- [x] Share the dimension and taxonomy field validators with the record path
- [x] Split `_validate_record_scalar` to 12 or below
- [x] Split `_validate_record_list` to 12 or below
- [x] Split `_resolve_gravity` into one helper per pin, lifting the nested
      residual and grid probe to module functions
- [x] Replace the hop solver `_validate` if-chain with per-group validators
- [x] Split `_solve_linear_minimalist` into assembly, solve and telemetry phases
- [x] Replace the strategy and ion if-chains in `infer_adsco_mode` with lookup
      tables
- [x] Lower `max-complexity` to 12
- [x] `make check` and `make test` green at ceiling 12

## Result

Landed at ceiling 12 across every tree `make check` lints, with zero
suppressions. `make check` and `make test` are green (762 backend tests, frontend
suite, 68 guard suites). The measured distribution went from 7 functions above 12
in `backend/app` to 0, and the scrapers' `parse_bjcp_directory` from 18 to 4.

Three functions sit exactly at the ceiling, so the next branch added to any of
them fails: `_feasible_bound`, and the already-simple scrapers `main` in
`scripts/scrape/bjcp/scrape_bjcp.py` and `parse_detail_info` in
`scripts/scrape/hop_scraper.py`. That is the intended shape of a rung — the gate
is the forcing function, and the next function over it gets split rather than
pinned.

Two guard interactions shaped the refactors and are worth remembering:

- **C901 counts branch statements, not booleans or ternaries.** A function with
  only `and`/`or`/conditional expressions reports 1. This makes a backend 12
  stricter in branch terms than the frontend's eslint 12, which counts both.
- **`tests/backend/conformance/test_boundary_error_contract.py` requires a
  literal error code at every `SolverValidationError` raise site.** A shared
  `_require(condition, code, message)` helper is therefore illegal in the hop
  solver, so `_validate` split by input group (targets, gravity, boil rows,
  whirlpool rows) instead of collapsing to a table. The failure arrived from
  `make test`, not from lint.

## Not in scope

- **Ceiling 10.** One function, `_feasible_bound` (12), would need splitting. Cheap
  enough to fold into phase 2 if the six go smoothly; otherwise a later rung.
- **Length-only splits.** `resolve_stage_cascade` (166 lines) and `_solve_pipeline`
  (164) are already under 12. Readability work, no gate pressure.
- **Frontend burndown.** 47 functions above `complexity 12` in 25 files, already
  pinned and tracked in `TODO.md`. Picking up `validateArtifactComponent` is the
  natural first move once the Python validator's shape is settled.
- **Script pins.** The frontend records its script layer at today's count instead
  of fixing it. The Python scrapers are fixed instead of pinned: the whole tree had
  two functions above the ceiling, and a per-function pin mechanism would be more
  machinery than the fix.
