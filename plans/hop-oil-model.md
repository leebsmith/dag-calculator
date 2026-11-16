---
title: Hop oil model — per-form oil yield and retention
status: proposed
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: make check + make test; the oil dose is reproducible from the seed and the declared constants, and no solver reads a null
---

# Hop oil model — per-form oil yield and retention

Level 2 of the hop roadmap: the whirlpool allocates by **oil mass** rather than
by IBU share. `plans/hop-layering-strategy.md` already drafts the authoring — a
hot/cool IBU split plus a cool-side mass ratio. This plan supplies the two things
that authoring cannot work without.

## 1. Why

The bitterness model is complete: alpha × load × form utilisation. The oil side
has facts but no model.

- `PRODUCT_FORM_UTILIZATION` is **alpha-specific**. It answers "how much of this
  gram's alpha isomerises", not "how much of this gram's oil survives". Oils
  volatilise and adsorb; alpha isomerises. They are different curves over the
  same temperature and time.
- A mass ratio is only meaningful in oil terms if the oil concentration per form
  is known. A gram of Cryo carries roughly 2.7× the oil of a gram of T-90
  (measured: `docs/hops/hop-products.md` §4.1a), so "60/40 by mass" is a
  different oil split for every pair of forms.

## 2. What exists

| Piece | Where | State |
|---|---|---|
| Per-variety total oil | `data/seeds/hops.json` after the synthesis plan | 233 varieties from the sweep |
| Per-form oil | `data/seeds/hop-products.json` | 26 Cryo varieties, mL/100 g; extracts have none |
| Alpha form scalars | `PRODUCT_FORM_UTILIZATION`, JS and Python | complete for four leaves |
| Temperature bands | `data/seeds/whirlpool-notes.json` | three bands, qualitative |
| Cooling curve, t_eff | `docs/hops/whirlpool-hopping-model.md` | complete for bitterness |

## 3. The model

**Oil mass per charge.**

```
oil_mL = grams × oil_ml_per_100g / 100 × oil_form_multiplier
```

`oil_ml_per_100g` is the variety figure; `oil_form_multiplier` is the form's
ratio against T-90, and the only one we can currently measure is lupulin at
≈2.7. Extract is absent: no per-variety sheet exists, so the multiplier must be
declared or the form must be excluded from oil authoring rather than guessed.

**Retention.**

```
oil_retained = oil_mL × r(T, t)
```

`r` starts as a scalar per temperature band, using the same three bands the
whirlpool notes already define, and is promoted to a curve when there is a basis
for one. It is a **declared function with stated bounds**, not a fitted curve
invented in a card — the same discipline as the cooling curve.

**Output.** An oil dose, in mL per litre or (with a declared density) mg/L. The
choice matters: brewers quote oil in mg/L, but the sources publish mL/100 g, so
the conversion constant is visible either way.

## 4. Shape

- A paired constant table `OIL_FORM_MULTIPLIER` in JS and Python, mirroring
  `PRODUCT_FORM_UTILIZATION`, with the existing `engine-read-mirrors` guard
  extended to it.
- Retention as a declared function; the bands come from the whirlpool notes seed,
  not from a new table.
- If the oil dose is report-visible, it is a derived node, not a stored value —
  nothing derived is persisted.
- The density constant lives beside the model, not in the seed: it converts a
  published unit, it is not a fact about a hop.

## 5. Guards

- `engine-read-mirrors` covers the new constant table.
- A unit test per temperature band: monotonic in `t`, monotonic in `T`, and zero
  only when the charge is zero.
- No solver reads a null: a hop without oil data cannot enter an oil allocation,
  and the UI must exclude it rather than substitute a variety average.

## 6. Out of scope

- Sensory prediction. The model allocates oil mass and says so.
- Extract forms until a per-variety oil figure exists.
- Any change to the IBU path.

## 7. Open decisions

1. Oil units: mL/L displayed, mg/L displayed, or both with a density toggle.
   Recommendation: compute in mL, display mg/L where the density is declared.
2. Retention basis: literature constant, internal band scalar, or deferred until
   a measurement exists. Recommendation: band scalars first, labelled as
   assumptions.
3. Whether the oil dose appears in the report at all in this plan, or only when
   the layering assistant lands.
4. Whether `oil_form_multiplier` is one number per form or a range carried with
   provenance. Recommendation: a point with a note, since only one form has a
   measured ratio.

## 8. Checklist

- [ ] Declare the oil multiplier table in JS and Python; extend the mirror guard.
- [ ] Declare retention as a function over the whirlpool bands.
- [ ] Add the derived oil dose (if report-visible) and regenerate the catalog.
- [ ] Tests: monotonicity, null exclusion, unit round-trip.
- [ ] Document the model in `docs/hops/whirlpool-hopping-model.md`.
- [ ] Run `make check` and `make test`.
