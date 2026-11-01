---
title: Extract ledger, honest kettle basis, and ABV limit dimensions
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [report-renderer]
blocks: []
gate: the report's Limits section prints a closing extract ledger and a kettle-basis brewhouse efficiency; the two ABV limits no longer print 100x; make check/test/build green
status: active
---

# Extract ledger, honest kettle basis, and ABV limit dimensions

## 1. Defect

`solver.batch.max_feasible_abv` and `max_achievable_abv` arrive from the boundary
in percent points (`cutaia_abv` → 8.0) but are declared `dimension: percentage`,
whose base unit is the fraction. `buildReportFormatted` therefore runs
`fromBase(percentage, pct, 8.0)` and the report prints `800.0%`. The frontend
formatter was verified directly: stub value `10.0` → `"text": "1000.0%"`. The
render fixture hard-codes `"7.2%"`, so no Typst gate exercises the freeze path.

The same latent mismatch sits on `primitive_schemas.scale_preview_row.abv`
(percent points declared as a fraction; only safe because the host formats it by
hand).

## 2. Model correction

`S_post` is sized at `V_kettle_cold = V_ferm + dead·(1 − shrink)` while `V_pre` is
reversed from `(V_ferm + dead + transfer + trub)/(1 − shrink)`. The mismatch is
not cosmetic: for `standard_inputs` the batch's own extract and post-boil volume
imply SG 1.0462 while `sg_post_boil` reports 1.0505 (target basis 21.44 L, actual
cold kettle 22.5 L).

Fix: `V_kettle_cold = V_ferm + V_kettle_dead + V_kettle_transfer + V_trub` — the
cold pre-loss volume the volume ledger already closes on, with no shrink factor
(those losses are subtracted after shrinkage). Kettle dead space, transfer and
trub all carry extract. The packaged beer is unchanged; the grist grows by the
extract lost with those volumes (~5% for 2.5 L of losses at 20 L) and the
efficiencies fall accordingly.

Brewhouse efficiency is redefined in place to the kettle basis, which is the
conventional meaning and factors as conversion × lauter × transfer:

    BE = (S_post − S_late) / (M · E) = s_kettle / s_potential

The numerator is the malt-only kettle extract; late additions are excluded from
both sides. This supersedes the fermenter basis recorded in
`plans/archive/report-process-sections.md` §2 (which stays as history).

## 3. Ledger

The Limits section's "Solved Extract" becomes a closing ledger, in the volume
ledger's idiom (frozen display strings, subtraction rows in parentheses, bold
thresholds, no arithmetic in the generator):

    Potential extract (dry basis)   s_potential
    Conversion inefficiency        (s_potential − s_converted)
    Converted extract               s_converted
    Mash tun and transfer losses   (s_converted − s_kettle)
    Extract into the kettle         s_kettle
    Late additions                  s_late
    Post-boil extract               s_post_boil_target
    Kettle losses                  (s_post_boil_target − s_fermenter)
    Extract into the fermenter      s_fermenter
    Brewhouse efficiency            brewhouse_efficiency

Muted captions carry the merged-row breakout with figures (retention vs hose
transfer, from `s_tun`) and name the kettle losses (dead space + transfer + trub
at the post-boil concentration).

## 4. Execution

### A. ABV limit dimensions

- [ ] 1. `data/artifact.json`: `solver.batch.max_feasible_abv` and `max_achievable_abv` → `dimension: "abv"`; `primitive_schemas.scale_preview_row.abv` → `dimension: "abv"`.
- [ ] 2. `frontend/src/views/registry/batch.js`: pin `unit: "%"` on both limit entries (the `abv` dimension has no menu symbol, so the field falls through to `pct`).
- [ ] 3. `backend/scripts/emit_report_bundle_fixture.py`: the two catalog `NodePresentation`s follow the artifact (`dimension="abv"`, `unit="pct"`, `symbol="%"`).
- [ ] 4. `tests/frontend/report-format.test.js`: assert the two limits' `.number`, not just `.unit`, so a freeze-path regression fails.

### B. Kettle basis carries dead space, transfer and trub

- [ ] 5. `backend/app/core/batch/volumetric.py`: `kettle_cold_volume(v_ferm, v_kettle_dead, v_kettle_transfer, v_trub)` = `v_ferm + dead + transfer + trub`; drop `f_shrink`; `resolve_volumetric_reversal` passes both new volumes.
- [ ] 6. `backend/app/core/batch/orchestration.py`: thread transfer/trub into `_abv_ceiling`, `_preview_rows`, `_solve_pipeline` and the capacity probe.
- [ ] 7. Tests: `sg_post_boil` reconciles with the solved extract at the cold kettle volume; update the plausible-anchor assertions.

### C. Extract chain on the boundary

- [ ] 8. `backend/app/schemas/boundary.py`: `BatchExtractOutputs { s_potential, s_converted, s_tun, s_kettle, s_late, s_fermenter }` nested as `extract`; field on `BatchSolverResponse`.
- [ ] 9. `backend/app/core/batch/orchestration.py`: compute the six values from `E`, `eta_conv`, the cascade and `V_kettle_cold`; add `extract` to `BatchSolverResult`; `batch_solver_service.py` passes it through.
- [ ] 10. `backend/app/core/batch/helpers.py`: `brewhouse_efficiency` becomes `(extract_total − sugar) / (m_grist · E)`; update its docstring.
- [ ] 11. `data/artifact.json`: declare the six outputs; add derived loss nodes `batch.extract_loss_conversion`, `batch.extract_loss_mash`, `batch.extract_loss_kettle` as mass differences.
- [ ] 12. `frontend/src/adapters/stubBoundaries.js`: add the six stub values; `frontend/src/views/registry/batch.js`: labels for the new nodes.
- [ ] 13. Registry hint, `sections/brewhouse.typ` caption, `docs/dag-artifacts/domain-equations.md` §2.2/§2.5/§2.6: kettle-basis BE and the corrected `V_kettle_cold`.

### D. Ledger renderer

- [ ] 14. `backend/app/templates/sections/limits.typ`: replace "Solved Extract" with the ledger table (number + unit columns, parentheses on subtractions, bold thresholds); gate the block on `present-formatted("solver.batch.extract.s_potential")`.
- [ ] 15. Muted captions: merged-row breakout with figures from `s_tun`, kettle-loss naming, BE definition.

### E. Fixture, docs and gates

- [ ] 16. Rebuild the fixture's solver block from a real solve of the fixture's own roots so gravity, runnings, extract chain and limits reconcile; emit `extract.*` valuation, catalog and formatted records.
- [ ] 17. `make generate` (inventory, glossary, sections manifest, seeds, fixture).
- [ ] 18. `docs/report-renderer.md` status paragraph; `TODO.md` current-work line.
- [ ] 19. Backend tests: ledger closure (`s_kettle + s_late = s_post`, `s_fermenter = s_post·V_ferm/V_kettle_cold`, `sg_post` agreement, `s_potential = M·E`), BE formula pin.
- [ ] 20. Report section tests: ledger presence/absence probe, row-list probe, standalone render.
- [ ] 21. `make check`, `make test`, `make build`.
