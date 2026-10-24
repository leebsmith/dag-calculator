# Fermentability and the Belgian knob — reconciled design

Status: implemented. This record captures the decisions that the code and
`docs/fermentability-and-yield.md` / `docs/belgian-knob.md` follow. It
supersedes the batch-level house factor from `a3fc3c0` while keeping that
commit's yield/fermentability data correction.

## Locked decisions

1. **Two independent axes.**
   - `yield_fraction` scales extract (OE). Malts store fine-grind dry-basis
     extract; the solver applies `(1 - moisture)`. Sugars/extracts store an
     as-is sugar-point contribution.
   - `fermentability_fraction` scales attenuation (AA). It is the ingredient's
     Congress-Mash limit, never the user's yeast performance.
2. **No double-counting.** `F_i` appears only in the extract-weighted wort
   baseline. It is not multiplied by `AA_batch` and is not applied again at the
   FG step.
3. **Recipe-driven AA.**
   - `AA_wort = Σ(extract_i · F_i) / Σ extract_i`
   - `yeast_cap = yeast.attenuation_pct × batch.attenuation_derate`
   - `AA_batch = min(AA_wort, yeast_cap)`
4. **Sugar is fully fermentable.** Late additions blend at `F = 1.0`; the
   malt/sugar extract split depends on the solve, so `AA_wort` is computed
   inside the batch solver at each candidate OG.
5. **ABV remains the user knob.** The solver still inverts target ABV to OG and
   derives grist mass and row masses. Mass is never an input.
6. **AA becomes a display.** `batch.apparent_attenuation` is a derived display
   of `solver.batch.aa_batch`; `batch.wort_aa` displays the pre-cap blend.
7. **Batch is unresolved without a yeast.** `batch.yeast_cap` is null until a
   strain is selected. The boundary is blocked with an unresolved message, not
   a solver error.
8. **Derate is per batch.** `batch.attenuation_derate` defaults to 1.0 and lives
   on the Yeast step. It scales the strain cap, not the wort baseline.
9. **No mash modifier.** Category defaults are Congress-Mash priors, not
   mash-schedule predictions. A calibrated mash model is a later feature.
10. **Fixed-AA ray.** The style step constrains OE/AE to
    `AE = OE · (1 − AA_batch)`. Moving either slider drives target ABV; a ray
    that misses the style region disables the sliders and warns.
11. **Belgian knob is advisory.** It holds AE, raises OE with sucrose, and never
    mutates the recipe or calls the solver. Default target is AA; ABV is a
    readout. The kg dose uses the app's extract model
    (`S = 1000·(SG − 1)·V / 385.641`), not a raw °P delta.

## Data

- `fermentability_fraction` is carried on `malt`, `sugar`, `standard-malts`,
  `grist_row`, `sugar_row`, and `trace_malt_row`.
- Malt defaults: base `0.81`, crystal `0.50`, roasted `0.15`, acid `0.80`.
  A scraped value wins.
- Sugars/extracts are `1.0`.
- The 16 non-black extract/syrup rows whose source used a fermentability basis
  are restored as as-is yields with `F = 1.0`.
- The two 32 % Maltoferm black extracts remain excluded. The raw source keeps
  the original values and basis labels.

## Boundary contract

`BatchSolverRequest` keeps the field name `apparent_attenuation` for wire
compatibility, but its value is now the yeast cap. `solver.batch` grain-bill
rows gain `fermentability_i`. `BatchSolverResponse` adds `aa_wort` and
`aa_batch`.
`max_achievable_abv`, realized FG/ABV, and the display AA all use `aa_batch`.

## Verification

- `tests/backend/test_batch_solver.py`: extract-weighted baseline, sugar blend,
  cap clamps, derate/cap, `max_achievable_abv` agreement.
- `tests/frontend/belgian-knob.test.js`: recipe matrix (all-malt, crystal,
  20/30 % sugar, mixed, high-gravity, session), AA/ABV agreement, infeasible
  directions, zero dose, no mutation, seeded sweep.
- `tests/frontend/style-card.test.js`: fixed ray, advisory readout, no recipe
  mutation.
- `tests/frontend/step-boundaries.test.js`: no-yeast gate in offline and HTTP
  modes; no solver error.
- `make check`, `make test`, `make verify`.
