---
title: Fix Solver Bracketing
status: active
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make verify
---

# Plan — fix-solver-bracketing

## Goal

Fix the batch-sparge root-finder so a reachable extract target is not reported
as unreachable when the grist bracket's upper bound lies beyond the strike
ceiling. The user's `1.75 qt/lb` case is a valid mash; the solver must solve it.

## Decisions

- The upper bracket is clipped at the strike ceiling before the sign-change
  test under `r_l_to_g`.
- The strike-ceiling formula lives in one helper in `grist.py`; diagnostics
  reuse it.
- A ceiling below the perfect-recovery lower bound is still a genuine
  unreachability; the existing `STRIKE_CEILING_EXCEEDED` diagnosis remains.
- `runoff_ratio` keeps its unquantified `BRACKET_NO_SIGN_CHANGE` behaviour.
- No frontend change is needed: the solve succeeds and the report/UI follow.

## Checklist

- [x] Add a shared `strike_ceiling_mass` helper to `backend/app/core/batch/grist.py`
  with the existing ceiling formula.
- [x] Clip the upper bracket at that ceiling in `solve_grist_mass` when the
  topology is `r_l_to_g` and the ceiling is above the lower bound.
- [x] Refactor the diagnostics ceiling helper (`strike_ceiling_l`) to call the
  shared helper.
- [x] Add a regression test for the `1.75 qt/lb` case: target 7.0%, conversion
  0.90, intensive 3.6511125 L/kg, solving with positive sparge.
- [x] Add a pure Phase 3 test that the clipped bracket still contains the root
  and a genuinely unreachable target still raises.
- [x] Update `docs/dag-artifacts/domain-equations.md` to say the bracket is
  clipped at `M_max`.
- [x] Run `make check`, `make test`, and `make verify`.
- [x] Archive the plan.

## Acceptance

- The 3.6511125 L/kg case returns a finite grist mass and a positive sparge.
- A target that exceeds the strike ceiling still returns
  `STRIKE_CEILING_EXCEEDED` with delivered/demand figures.
- The runoff-topology failure still returns `BRACKET_NO_SIGN_CHANGE`.
- Existing solver and conformance suites remain green.
