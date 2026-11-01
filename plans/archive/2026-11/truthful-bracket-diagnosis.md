---
title: Truthful bracket diagnosis, a closing fixture, and readable solver errors
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [report-renderer]
blocks: []
gate: a failed grist bracket never names a capacity it cannot prove; the strike ceiling names its kg; every declared solver code has a human label; the fixture's two ledgers close; make check/test/build green
status: active
---

# Truthful bracket diagnosis, a closing fixture, and readable solver errors

## 1. The defect

When `solve_grist_mass` cannot bracket the grist, `_diagnose_bracket` evaluates the
cascade at the bracket's **upper** bound `b = (S_post − S_late)/(0.5·E)` — the mass
that assumes 50 % recovery, roughly twice the theoretical minimum — and names
whatever capacity that artificial batch overflows. Measured on the standard 20 L
test rig at 9 % ABV: the tun measures 24.8 L of 40 L at the *lower* bound `a` but
49.6 L at `b`, so the solver reports `MASH_TUN_TOO_SMALL`; raising the tun to 400 L
**and** the kettle to 400 L still fails, because the real cause is geometric — at a
fixed kettle volume and 3 L/kg the first runnings fill the kettle and the sparge
collapses. The advice ("tun too small") is false and unactionable.

The extract-basis correction that landed in `plans/archive/2026-11/update-limits-subsection.md`
raised required grist ~5 %, so more marginal batches reach this branch and the false
positive is now common.

The fixture has a matching truthfulness gap: `v_run2`/`v_sparge` are 17.2 L while the
model's identities require 17.7 L (`v_run2 = v_drain − v_run1`, `v_sparge = v_run2`),
so the volume ledger's first + second − transfer = 24.9 L against a printed kettle of
25.4 L. `domain-equations.md` §2.4 carries the same stale identities.

Finally, the editor prints the raw code (`Solver error: MASH_TUN_TOO_SMALL`), so a
failure's meaning depends on the reader knowing the taxonomy.

## 2. Evidence the fix is safe

- 9 % ABV, standard rig: `a` → tun 24.8 L (fits), `b` → 49.6 L (overflows). The tun is
  not the limit: 400 L tun + 400 L kettle still fail. Thickening to 2.5 L/kg solves it;
  raising `v_ferm` does **not** (more volume at the same gravity needs more extract).
- 12 % ABV, 10 L tun: `a` → tun 32.2 L > 10 L, so the capacity diagnosis is genuine and
  survives the lower-bound probe (and `test_domain_codes`' trigger with it).
- Strike ceiling for the 9 % case: `M_max = 11.68 kg`, delivery saturates at 4.37 kg
  against a demand of 5.06 kg, and delivery is strictly monotone on `[a, M_max]`.

## 3. Decisions

- Capacity is diagnosed **only** at the lower bound (perfect recovery); capacity
  exceeded there is definitive, capacity not exceeded there proves nothing.
- The fallback message states what is provable: no capacity is exceeded at the minimum
  grist, so the limit is the extraction itself. No false "raise the volume" advice.
- The strike ceiling is closed-form under `r_l_to_g`; `runoff_ratio` is exempt because its
  lauter fractions are mass-independent (delivery is linear in `M`).
- Solver error codes get a human label map; the editor alert shows the label, the
  message stays the backend's. No new error code in this plan (reported at the end).

## 4. Execution

### Step 0 — Fixture truthfulness

- [x] 1. `backend/scripts/emit_report_bundle_fixture.py`: `cascade.v_sparge` and `cascade.v_run2` → 17.7; HLT `required`/`target` 18.7, `top_up` 3.7, `deliverable` 17.7, `surplus` 0.0; `batch.runnings_ratio` 0.46; recompute runnings and the extract chain from the corrected split (run1 1.641807, run2 1.149739, tun 2.791546, kettle 2.737655, post 3.137655, fermenter 2.852413, losses 0.37152/0.552134/0.053891/0.606025/0.285241, BE 0.736880, pre-boil SG 1.041565) in both the valuation and the formatted block.
- [x] 2. `docs/dag-artifacts/domain-equations.md` §2.4: `V_run2 = V_sparge` and `V_run1 + V_run2 = V_pre + mash_transfer_loss`.
- [x] 3. `backend/app/core/batch/cascade.py`: `second_runnings_volume`'s first parameter and docstring name `v_drain` (callers already pass the drain).
- [x] 4. `tests/backend/conformance/test_report_bundle_fixture.py`: a test asserting the bundle's own runnings, HLT and extract-chain identities (including the derived loss nodes and the kettle basis).
- [x] 5. Regenerate the fixture, then render the report to confirm both ledgers close.

### Step 1 — Truthful diagnosis (a + b) and readable codes

- [x] 6. `backend/app/core/batch/diagnostics.py`: probe capacity at the bracket's lower bound; a capacity exceeded there names the limit, otherwise make no capacity claim.
- [x] 7. Same module: return the actionable `BRACKET_NO_SIGN_CHANGE` message when no capacity is definitive (leave `DEGENERATE_BRACKET` alone; the original code is passed in).
- [x] 8. `backend/app/core/batch/orchestration.py`: pass the failing code into `_diagnose_bracket`.
- [x] 9. `tests/backend/conformance/test_batch_solver_orchestration.py`: flip the 9 % case to the honest outcome, assert the tun/kettle are not blamed even when raised to 400 L, and keep a capacity case that still names the tun.
- [x] 10. `frontend/src/views/registry/errors.js`: the code → label map plus `solverErrorLabel`; `frontend/src/adapters/stepAdapter.js` decorates the boundary error; `frontend/src/partials/editor.html` shows the label instead of the assembled code.
- [x] 11. `tests/guards/solver-error-labels.test.js`: every declared boundary code has a label and the map has no stale entries.
- [x] 12. `docs/dag-artifacts/domain-equations.md`: note the lower-bound rule on the error surface.

### Step 2 — Quantified strike ceiling (c)

- [x] 13. `backend/app/core/batch/diagnostics.py`: `strike_ceiling_l` — `M_max = (V_drain + V_dead) / (R + MC + v_bar·eta·E − k_abs)` under `r_l_to_g`, `None` when the denominator is non-positive or the topology is `runoff_ratio`.
- [x] 14. Same module: at `M_max`, compare kettle delivery with the malt demand; when short, raise `BRACKET_NO_SIGN_CHANGE` quoting both masses; otherwise keep the step 1 message.
- [x] 15. `tests/backend/conformance/test_batch_solver_orchestration.py`: the 9 % case quotes 4.37 kg against 5.06 kg; the ceiling helper returns 11.68 kg; a runoff-topology failure keeps the unquantified message.
- [x] 16. `docs/dag-artifacts/domain-equations.md` §2.5/§2.6: the strike ceiling and why the runoff topology has none.

### Close

- [x] 17. `make generate`, `make check`, `make test`, `make build`.
- [x] 18. Report the suggested new error code (its name, what it would say, and what adding it would touch) without implementing it.
