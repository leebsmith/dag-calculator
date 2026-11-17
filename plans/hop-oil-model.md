---
title: Hop oil model — per-form oil charge
status: implemented (card and report lines landed)
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: make check + make test; the oil charge reproduces from the seed and the declared constants, and no charge counts a missing figure as zero
---

# Hop oil model — per-form oil charge

**What this is:** the oil a hop bill adds, per litre. Not the oil that reaches
the glass — that needs a retention curve, and no source publishes one.

The draft framed this as the prerequisite for oil-based layering. That was
wrong, and the correction matters:

- the layering *authoring* is a mass ratio — authored, not derived — so it needs
  no oil numbers;
- what needs oil numbers is **reporting** what the ratio amounts to.

So this is a legibility layer, and it stands on its own: every batch already
solves hop masses from IBU, so the oil charge is computable today for any bill.

## 1. Why

- The bitterness model is complete: alpha × load × form utilisation.
- `PRODUCT_FORM_UTILIZATION` is alpha-specific. It answers "how much of this
  gram's alpha isomerises", not "how much oil this gram carries".
- A mass ratio is only an oil statement if the per-form concentration is known:
  a gram of lupulin carries ≈2.7× the oil of a gram of T-90, measured.

## 2. The model

One equation:

```
oil_mg_per_L = mass_kg × 1000 × oil_ml_per_100g × form_multiplier / 100
               × density_g_per_ml × 1000 / volume_L
```

Read as: grams → mL of oil (variety × form) → mg of oil (density) → mg/L of the
batch.

**No retention term.** Oils volatilise and adsorb, but nothing in the source set
measures it, so the number is a **charge** and the copy says "oil added". When a
retention basis appears, it multiplies this value; the charge itself does not
change.

**Constants live in the artifact**, not in the code, so both languages read one
copy:

| Constant | Value | Basis |
|---|---|---|
| `oil_density_g_per_ml` | 0.85 | a unit conversion, not a hop fact |
| `oil_form_multiplier_lupulin` | 2.7 | measured, YCH 2022, 26 varieties |

Form multipliers as a table:

| Form | Multiplier | Basis |
|---|---|---|
| T-90 pellets | 1 | reference by definition |
| Whole cone | 1 | assumed — no measured ratio |
| Lupulin concentrate | 2.7 | measured |
| Extract | none | no per-variety oil figure exists, so it is unpriced |

## 3. What landed

- The two artifact constants, with the JS card as their consumer.
- `total_oil_ml_per_100g` on `boil_hop_row` and `whirlpool_hop_row`, copied at
  selection like alpha.
- `frontend/src/views/producer/hopOil.js` — the pure model: `oilChargeMgPerL`,
  `oilChargeSummary`, `oilFormMultiplier`, `oilFormBasis`.
- The hop card's boil line: `oil added 2.4 mg/L`, plus `n of m charges priced`
  when some hops have no figure. An unpriced hop is not a zero.
- `tests/frontend/hop-oil.test.js` — the arithmetic, the null cases, the form
  table and its basis, and the summary count.

## 4. What remains

**The report line — landed.** The charge rides in `formatted_summaries`, one per
hop table (`batch.boil_hops`, `batch.whirlpool_hops`), because the bundle
integrity check accepts only a collection node or `overall` as a summary key.
The hops section prints `Oil added: …` beside the IBU notes, and a table with no
priced charge prints nothing rather than a zero.

**Python, when there is a consumer.** The solver does not price oil yet, so
mirroring the model in `backend/app/core/` now would be dead code. It becomes
the solver's when oil starts influencing a solve — which is the layering
authoring, not this plan.

**Scope: kettle only.** The charge covers the boil and the whirlpool. Dry hops are
not priced, which is the larger omission in an aromatic beer — a hazy's dry hop
adds more oil than its entire kettle. The mechanics for pricing it are known
(contact-time saturation, stage losses, form), and a v1 shape is sketched in
`docs/hops/whirlpool-hopping-model.md` §8; neither is in this plan.

**Not in scope:** retention, dry-hop extraction, extract forms, any claim about
oil in beer, and any change to the IBU path.

## 5. Guards

- `artifact-consumers`: both constants have a consumer (the card).
- `hop-oil` test: arithmetic, null-not-zero, form table, summary count.
- `hop-row-schema`: the oil field is declared on both row schemas.
- No solver reads a null: a hop without oil contributes nothing to a summary.

## 6. Open decisions

Resolved:

1. **Units** — mL/100 g on the ingredient (the published unit), **mg/L** for the
   charge (the derived quantity).
2. **Retention** — deferred until measured; the model stops at the charge.
3. **Report** — yes, as its own line beside the IBU notes, never a column in the
   IBU table. Pending (§4).
4. **Multiplier** — a point per form with a basis, not a range.

Resolved too:

5. **Whole cone's assumed 1.0 is named, not marked `~`.** The card line appends
   `whole cone assumed` rather than a tilde: the charge is computed, only the
   multiplier is a guess, and a mark on the number would say the wrong thing.

## 7. Checklist

- [x] Artifact constants and the row oil field.
- [x] The pure model and its tests.
- [x] Copy oil at selection; the hop card line.
- [x] Rewrite this plan around the charge rather than retention.
- [x] The report line: summary per table, template note, fixture regeneration.
- [x] Surface the assumed-basis mark for whole cone: the line says `whole cone assumed`.
- [ ] `make check`, `make test`, `make verify`.
