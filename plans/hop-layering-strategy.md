---
title: Hop layering strategy
status: draft
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make verify
---

<!-- claims: proposed batch.whirlpool_authoring batch.whirlpool_hot_ibu_fraction batch.whirlpool_hot_target_ibu batch.whirlpool_cool_target_ibu -->

# Layered whirlpool: authored hot/cool IBU split and cool-side weight ratios

## 1. Motivation

The current whirlpool authoring answers "how are the whirlpool IBUs divided
between hop rows?" The brewer's sensory intent is a different question:

- **Bitterness** is alpha acids × utilization; it is an IBU budget.
- **Layering** is oils; it follows the **mass** of the hops, not their IBU
  share.
- A cool-side 6:4 mass ratio between a dominant and a supporting hop is a
  deliberate sensory dose. If the same ratio is expressed as IBU shares, the
  physical weights move with alpha and utilization, and the oil dose moves with
  them. The intent is lost.
- The brewer already knows the two independent constraints:
  1. how much of the whirlpool IBU belongs to the hot side versus the cool side;
  2. the cool-side mass ratio (dominant : supporting).

The engine should solve the masses that satisfy both, and report the emergent
IBU split inside the cool side. That is the inversion: author the sensory/weight
ratio and the IBU target; solve the physical masses.

The current UI cannot express this. Its `parts` are normalized **IBU shares**,
one number per row across the whole whirlpool. That field cannot mean both "IBU
share" and "weight share" without breaking every existing batch and the import
path.

## 2. What the current model does

- Total whirlpool IBU: `W = batch.target_ibu × batch.whirlpool_ibu_fraction`.
- Each row authors `parts`, normalized to `pct`, an IBU share of the whirlpool
  pool.
- The solver solves each row independently:
  `IBU_i = pct_i × W`;
  `mass_i = IBU_i / (alpha_i × utilization_i × form_i)`.
- The hot/cool split is **not authored**. `_split_ibu` classifies each row by
  posted `initial_temp_c > 79 °C` and sums the IBUs.
  `batch.whirlpool_hot_ibu_share` and `batch.whirlpool_cool_ibu_share` are
  derived from that result.
- The cooling curve determines each row's effective time; a cool row still
  contributes some IBUs below 79 °C. The floor is a reporting/pool boundary, not
  a zero-IBU cutoff.

So the current model can say "60 % of the whirlpool IBUs come from this hop,"
but not "60 % of the cool-side mass is this hop."

## 3. Proposed authoring model

Keep the existing boil/whirlpool split untouched. Add a second, explicit split
inside the whirlpool.

### Authored values

- `W` — unchanged, from the boil/whirlpool split.
- Hot fraction `f` (e.g. 0.75) — the hot side's share of `W` by IBU.
- Cool fraction `1 − f` (e.g. 0.25).
- Hot rows — per-row **IBU shares within the hot pool** (current behaviour; a
  single bittering hop is 100 parts).
- Cool rows — per-row **weight parts** within the cool pool (e.g. 6 and 4),
  normalized to mass shares.
- Optional per-row sensory labels: `role` (`dominant`/`supporting`) and
  `attribute` free text. These are authoring/report metadata; the solver only
  needs the weight parts.
- Explicit pool membership (`hot`/`cool`) per row.

### Solve

```text
H = f × W
C = (1 − f) × W

Hot pool:
  hot_pct_i = hot_parts_i / Σ hot_parts
  IBU_i = hot_pct_i × H
  mass_i = IBU_i / (alpha_i × u_i × c_i)

Cool pool:
  w_i = weight_parts_i / Σ weight_parts
  M_cool = C / Σ (w_i × alpha_i × u_i × c_i)
  mass_i = w_i × M_cool
  IBU_i = mass_i × alpha_i × u_i × c_i
  Σ IBU_i = C
```

`u_i` is the existing cooling-curve utilization for that row; `c_i` the form
scalar. The cool masses are exactly 6:4. The cool IBUs will not be 6:4 unless
alpha and utilization match; that is the intended separation between oils and
bitterness.

The cool pool still uses the Arrhenius integral below 79 °C. The 25 % is an
actual IBU target, not zero.

### Example

Whirlpool target 40 IBU, hot/cool 75/25 → 30 hot IBU, 10 cool IBU. Cool side 6
parts A / 4 parts B → A and B masses are 60/40 of the solved cool-pool mass. A
and B contribute whatever IBUs their alpha, form and exposure produce, summing
to 10.

## 4. Artifact and boundary changes

### Artifact

- New choice root `batch.whirlpool_authoring`: `ibu_share` (default, current) and
  `pooled_weight` (new).
- New percentage root `batch.whirlpool_hot_ibu_fraction` (0..1; default e.g.
  0.75).
- Derived `batch.whirlpool_hot_target_ibu` and
  `batch.whirlpool_cool_target_ibu`.
- New taxonomy `whirlpool_pool`: `hot`, `cool`.
- Optional taxonomy `hop_sensory_role`: `dominant`, `supporting`.
- `whirlpool_hop_row` gains:
  - `pool` (taxonomy, default `hot` for compatibility),
  - `weight_parts` (dimensionless, `>= 0`),
  - optional `sensory_role`, `sensory_attribute`.
- The existing `parts`/`pct` remain the hot-side IBU shares in pooled mode and
  the current IBU shares in legacy mode.
- Boundary `solver.hops` inputs gain `whirlpool_authoring` and
  `whirlpool_hot_ibu_fraction`; the row fields travel in the collection.
- The existing `batch.whirlpool_hot_ibu_share`/`cool` remain the **solved**
  shares. In pooled mode they equal the authored target; in legacy mode they
  remain temperature-derived.
- `make generate`: inventory, glossary, manifest, seeds/fixtures, report bundle
  fixture.

### Boundary contract

- `WhirlpoolHopRow` gains `pool` and `weight_parts`; `pct` stays for hot rows.
- `HopSolverRequest`/`HopSolverInput` gain the mode and hot fraction.
- Solver branch:
  - legacy: current `pct`/temperature classification;
  - pooled: hot pool by new share, cool pool by weight;
  - both use the same timeline and utilization.
- Validation:
  - hot fraction in `[0, 1]`;
  - hot pool present only when `f > 0`; cool pool present only when `f < 1`;
  - hot `pct` sums to 1 within the hot pool;
  - cool weight parts sum > 0;
  - alpha/utilization permit a finite mass;
  - a pool/temperature mismatch policy: either reject a `hot` row at/below
    79 °C and a `cool` row above it, or warn and report both the authored pool
    and the temperature-classified actual. This is a decision.
- Error codes: add named codes for invalid authoring, empty/overfilled pools,
  invalid weight shares, and impossible utilization. The current
  `INVALID_HOP_INPUT` catch-all would be enough functionally but hides the cause.

The existing boundary output rows stay `mass_kg`, `ibu`, `effective_minutes`.
The report can compute weight percentages from solved masses; no new output row
field is strictly required.

## 5. Frontend: new composer, not the current modal

The current Whirlpool Hop Editor stays for legacy batches. A new **Layered
Whirlpool** composer:

- selects the mode for the batch;
- shows total whirlpool IBU `W` read-only;
- authors the hot/cool IBU ratio (75/25);
- has a **Hot** pane: hop, alpha, form, addition time, temperature, hot IBU
  parts;
- has a **Cool** pane: hop, alpha, form, addition time, temperature, weight
  parts, optional dominant/supporting label and attribute;
- shows the solved preview: per-row mass, weight %, IBU, and pool totals;
- writes the same `batch.whirlpool_hops` collection plus the new roots, so the
  purchase table and report see one source of truth;
- disables or redirects the old modal when the mode is `pooled_weight`, so
  `parts` and `weight_parts` cannot be edited as if they meant the same thing.

The old modal remains the editor for `ibu_share` batches.

The composer is deliberately separate; the current UI's cross-row `parts`
normalization and "IBU share" vocabulary do not fit the weight model.

## 6. Report

Keep the boil/whirlpool split as it is. In the Hops section:

- print the authored hot/cool target (75/25 of `W`);
- print the cool-side dominant/supporting rows with their **weight
  percentages**, solved mass and IBU;
- print the solved hot/cool totals; in pooled mode they should equal the target;
- optionally print the temperature-classified split as a diagnostic if it
  differs from the authored pools;
- the existing purchase table already sums solved masses, so it works unchanged;
  the weight ratio appears through the solved masses and, if added, a
  weight-percent column;
- the hopping-strategy prose remains the place for the sensory rationale and
  attribute names.

The report template can branch on the authoring mode from `state.roots`; legacy
batches keep the current Whirlpool table.

## 7. Compatibility and migration

- Default mode `ibu_share`; existing rows and frozen batches keep current
  semantics.
- New fields are optional/defaulted; no migration of old rows.
- Imported recipes (IBU contributions) remain legacy mode. A future import path
  could map a printed weight ratio, but that is out of scope.
- The current UI remains functional for legacy batches; pooled batches use the
  new composer.
- `data/artifact.json` is canonical; artifact changes are atomic with inventory,
  glossary, report-bundle fixture and `docs/hops/whirlpool-hopping-model.md`.
- Old frozen report bundles do not carry pooled fields; their renderer keeps the
  old path.

## 8. Tests

- Solver:
  - 75/25 with one hot hop and two cool hops 6/4; masses 6/4 and cool IBUs sum to
    25 % of `W`;
  - different cool alphas/utilizations: mass ratio holds, IBU ratio does not;
  - hot pool multiple hops by IBU parts;
  - `f = 0` and `f = 1`; empty pool validation;
  - weight parts missing/zero/normalization;
  - pathologically low alpha/utilization;
  - legacy mode regression against the current vectors.
- Boundary/wire: request builder parity, response schema, error codes,
  conformance fixtures.
- Artifact: engine validation, defaults, inventory/glossary/docs sync.
- UI: composer state, mode switch, old modal guard, catalog/alpha/form handling,
  solved preview.
- Report: target split, weight %, per-row mass/IBU, legacy table unchanged,
  purchase table integration.
- `make verify`.

## 9. Open decisions

1. **Hot side:** keep per-row IBU shares inside the hot pool (recommended and
   assumed above), or also make the hot pool weight-driven?
2. **Pool membership:** explicit `hot`/`cool` on each row (recommended), or
   derive the pool from start temperature and treat 75/25 as a target that may
   not match the physical classification?
3. **Pool/temperature coherence:** reject a hot row at/below 79 °C and a cool
   row above it, or allow it and report both the authored and
   temperature-classified splits?
4. **Sensory roles:** structured `dominant`/`supporting` plus attribute text, or
   just weight parts and free-text notes?
5. **Report:** show the authored target only, or target plus the
   temperature-classified diagnostic?

## 10. Acceptance criteria

- A pooled batch with `W = 40 IBU`, hot/cool `75/25`, and cool `A:B = 6:4`
  solves A and B to a 6:4 **mass** ratio, with hot IBU 30 and cool IBU 10.
- The cool IBU split is reported from the solved masses, not forced to 6:4.
- Legacy `ibu_share` batches produce byte-identical solver outputs and reports.
- The purchase table and hopping strategy remain consistent with the pooled
  rows.
- `make verify` is green.
