---
title: Report Bundle Consistency — Telemetry Provenance & Checklist Text
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [report-bundle]
blocks: []
gate: a regenerated preview bundle carries telemetry from the same solve as its state; checklist text agrees with the solved batch; make check and make test green
status: implemented (salt mass unit and observation unit columns deferred)
---

# Report Bundle Consistency — Telemetry Provenance & Checklist Text

Status: implemented. The salt mass unit and observation unit-column changes are
deferred by decision; see §7.

## 1. Why

A downloaded draft bundle showed three kinds of internal inconsistency:

1. The water telemetry events were produced by an earlier solve than the
   `state.valuation` and `formatted` blocks they accompany.
2. The checklist text contradicted the solved batch in two places: the
   metabisulfite tablet count and the HLT top-up instruction.
3. Several checklist sentences repeated a unit the formatter already emitted.

The numeric state itself was consistent: hashes, artifact identity, formatted
values, tables, summaries, conformance, validation, roots, collections,
identity, and provenance all checked out.

## 2. Decisions

| # | Decision |
|---|---|
| 1 | Fix telemetry provenance in the producer; do not backfill frozen bundles. |
| 2 | Key telemetry extras by fingerprint and attach only matching extras. |
| 3 | Fix the metabisulfite tablet count at 15 US gal. |
| 4 | Hide the top-up step when `solver.batch.hlt.v_hlt_top_up` is zero; the sparge provider says “no top-up”. |
| 5 | Use `mash.enabled_max_temp_c` for the mash-out sentence instead of a hardcoded Celsius band. |
| 6 | Remove duplicated `IBU`, `SRM`, and `pH` literals from checklist templates. |
| 7 | Defer the `solver.water.total_added_salt_mass_g` grams-to-kilograms change. |
| 8 | Leave the observation unit columns unchanged. |

## 3. Findings

### 3.1 Stale water telemetry

For the example bundle, the telemetry block implied a strike/HLT split of
21.3177 L / 35.4635 L, while the state held 21.2641 L / 35.5171 L. Both sum to
the same treated volume, so the total salt mass matched while TDS, HLT surplus,
and acid volumes differed. Re-running the current solver with the bundle's
inputs reproduced the state values, not the telemetry.

The bundle's telemetry fingerprint was the current request fingerprint. The
producer had paired a current result with the last response's extras because
the engine caches results by fingerprint while the runner kept one extras slot
per boundary id.

### 3.2 Checklist contradictions

- `brew-day-setup` said “Add 2 crushed metabisulfite tablets” because
  `Math.ceil(56.78117676 / 56.781)` returned 2.
- `lauter-topup` and the sparge provider said “topped up to 8.0 gal” while
  `solver.batch.hlt.v_hlt_top_up` was zero and the HLT was already above target.
- `pre-recipe`, `pre-hops`, and `preflight-water` repeated units already emitted
  by the formatter (`IBU IBU`, `SRM SRM`, `pH 5.40 pH`).
- `mash-out` hardcoded a Celsius band in an otherwise imperial bundle.

## 4. Work

### 4.1 Telemetry provenance

- `frontend/src/adapters/boundaryRunner.js`
  - Keep an extras map keyed by request fingerprint.
  - On a response, store the extra together with its fingerprint.
  - On a cached result, restore the matching extra instead of leaving the last
    response in place.
  - Clear extras when a boundary is pending, blocked, or failed.
  - Clear the fingerprint map on reset.
- `frontend/src/store/snapshot.js`
  - Attach an extra only when its fingerprint equals the applied result
    fingerprint; otherwise emit an empty telemetry entry.
- `docs/report-bundle.md`
  - State that telemetry is tied to the applied fingerprint and must come from
    the same solve.

### 4.2 Checklist text

- `frontend/src/views/producer/checklist/providers.js`
  - Use the exact 15 US gal volume for the tablet count.
  - Branch the sparge sentence on `solver.batch.hlt.v_hlt_top_up`.
- `frontend/src/views/producer/checklist/conditions.js`
  - Add `hlt_top_up_needed`.
- `data/seeds/brew-checklist.json`
  - Condition `lauter-topup` on `hlt_top_up_needed`.
  - Remove duplicated unit literals from `pre-recipe`, `pre-hops`, and
    `preflight-water`.
  - Use `mash.enabled_max_temp_c` in `mash-out`.

### 4.3 Tests

- `tests/frontend/boundaryRunner.test.js`
  - Restore the correct telemetry when returning to a cached fingerprint.
  - Clear extras when a boundary fails.
- `tests/frontend/report-inputs.test.js`
  - Drop telemetry whose fingerprint does not match the applied result.
- `tests/frontend/checklist-consistency.test.js`
  - Assert one tablet at 15 US gal.
  - Assert no top-up text and no `lauter-topup` when the top-up is zero.
  - Assert no duplicated units.
  - Assert the mash-out sentence uses the formatted temperature.

## 5. Verification

1. Run `make check`.
2. Run `make test`.
3. Re-download a preview bundle for the same draft and confirm:
   - Water telemetry TDS, surplus, and acid volumes match the state.
   - The checklist reads one tablet, no impossible top-up, and no duplicated
     units.
4. Do not commit the user's downloaded bundle.

## 6. Commit

One commit: `Fix boundary telemetry provenance and checklist text`.

## 7. Deferred

- **Salt mass unit.** `solver.water.total_added_salt_mass_g` still carries grams
  under the artifact's kilogram base unit and still formats as a large pound
  value. The fix is the adapter division by 1000 plus a gram presentation pin in
  `data/labels.json`; the conformance fixture already encodes the correct kg
  value. Deferred by decision.
- **Observation unit columns.** The expected value is displayed in the chosen
  unit while the unit column names the canonical input unit. Left unchanged.
