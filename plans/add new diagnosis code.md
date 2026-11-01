---
title: A named strike-ceiling diagnosis
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [truthful-bracket-diagnosis]
blocks: []
gate: the quantified strike-ceiling failure raises its own code; every taxonomy, trigger, label and doc that enumerates batch codes knows it; make check/test/build green
status: active
---

# A named strike-ceiling diagnosis

## 1. Why

`truthful-bracket-diagnosis` proved that some grist brackets fail because the
strike geometry cannot deliver the target extract at the batch's kettle volume
and mash thickness — no equipment capacity is too small. That failure still
raises `BRACKET_NO_SIGN_CHANGE`, a code whose literal meaning is "the residual
changed sign nowhere": a numerical outcome, not the physical fact. It also
carries the runoff-topology fallback, where no ceiling is provable, so two
different situations share one bucket and one label.

Measured on the standard 20 L rig: `M_max = 11.68 kg`, delivery saturates at
4.37 kg against a 5.06 kg demand at 9 % ABV.

## 2. Shape

New code `STRIKE_CEILING_EXCEEDED`, raised only when the ceiling is proven and
short:
"This mash can deliver at most A kg of malt extract; the target needs B kg.
Thicken the mash, raise the conversion efficiency, or lower the target."

Unchanged:
- `BRACKET_NO_SIGN_CHANGE` stays the unquantified fallback (no closed-form
  ceiling: `runoff_ratio`, or a non-positive denominator) and the raw
  `solve_grist_mass` failure.
- `DEGENERATE_BRACKET` stays numerical.
- `binding_constraint` mapping → `volume` (the same ceiling the probe already
  attributed to `BRACKET_NO_SIGN_CHANGE`), so `max_feasible_abv` is unchanged.

The error-code contract guard requires a literal `SolverValidationError("…")`
site in `app/core` for every declared code, and the taxonomy requires one
trigger that emits it exactly.

## 3. Execution

- [ ] 1. `data/artifact.json`: add `STRIKE_CEILING_EXCEEDED` to `solver.batch.domain.codes`, beside `BRACKET_NO_SIGN_CHANGE`.
- [ ] 2. `backend/app/schemas/boundary.py`: add the member to `BatchSolverErrorCode`.
- [ ] 3. `backend/app/core/errors.py`: map it to `"volume"` in `BINDING_BY_CODE` so the feasibility bisection still attributes the bound instead of re-raising.
- [ ] 4. `backend/app/core/batch/diagnostics.py`: the quantified branch raises the literal new code; the fallback branches keep `BRACKET_NO_SIGN_CHANGE`.
- [ ] 5. `frontend/src/utils/strings.js`: add the label ("Extract target exceeds the strike ceiling") — the label guard fails without it.
- [ ] 6. `tests/backend/conformance/test_domain_codes.py`: a `TRIGGERS` entry (`_solve(target_abv=9.0)` on the standard rig) while `BRACKET_NO_SIGN_CHANGE` keeps its `solve_grist_mass` trigger.
- [ ] 7. `tests/backend/test_batch_solver.py`: add the code to the error-surface set.
- [ ] 8. `tests/backend/conformance/test_batch_solver_orchestration.py`: the 9 % case (and its roomy-tun variant) expect the new code; the runoff fallback keeps `BRACKET_NO_SIGN_CHANGE`.
- [ ] 9. `docs/dag-artifacts/domain-equations.md`: the error-surface list and the §2.5 ceiling paragraph name the code.
- [ ] 10. `make generate` (artifact hash travels into the report fixture).
- [ ] 11. `make check`, `make test`, `make build`.
