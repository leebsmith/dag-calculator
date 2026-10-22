# Backend Conformance (vendored oracle suites)

These test files are **copied verbatim** from the legacy "known-good" repo
(`~/Development/brewing-calculator/backend/tests/`) and run unchanged against the
new `app.core` solvers. Their presence here is the *conformance oracle* for the
sealed boundary interiors: if the new solvers ever diverge behaviorally from the
legacy implementation, these fail.

Vendored files:

- `test_batch_solver_phase1.py`
- `test_batch_solver_phase3.py`
- `test_batch_solver_phase4.py`
- `test_batch_solver_helpers.py`
- `test_batch_solver_orchestration.py`
- `test_water_chemistry_core.py`
- `test_utils.py`

They import `app.core.*` (same module paths), so they exercise the new solvers
directly. At Step C the new `app.core/{batch_solver,water,utils}.py` are
**behaviorally identical** to the legacy modules (the only diffs are modernized
type annotations: `typing.Dict`→`dict`, `typing.Sequence`→`collections.abc.Sequence`).

Result: **110 passed.**

To refresh after an intentional solver change, re-copy from the legacy repo and
re-run; any failure is a real behavioral divergence to reconcile.

## Non-vendored water suites

These are **ours** (not legacy copies) and document behaviour the vendored
oracle cannot express:

- `test_water_routing.py` — the AUTO truth table over all 64 target shapes, the
  explicit-strategy mapping, and the generated
  `tests/conformance/fixtures/ion-constraints.json` (observed pin sets; refresh
  with `UPDATE_FIXTURES=1`). `make test` fails if the fixture goes stale.
- `test_water_matrix.py` — beers × source waters × settings, asserting invariants
  (non-negative doses, pH band or explicit out-of-range flag, vessel distribution
  rules, residual HLT, additions-only, determinism) plus per-scenario
  expectations (held ions, telemetry, expected failures).
- `test_water_fuzz.py` — seeded generative sweep, skipped unless
  `WATER_FUZZ_CASES` is set; run it with `make test-fuzz`.

