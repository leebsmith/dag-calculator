# Hop facts

Status: **contract declared, values pending.** The fields below are in the
artifact and the seed rows do not yet carry them; the synthesis that fills them
is `plans/hop-facts-synthesis.md`. This page explains what each field means and
what a reader is entitled to assume about it.

## 1. The rule a hop row must satisfy

**Every hop carries an alpha acid fraction.** Not "usually" — always. The engine
skips a boundary whose inputs hold a null, so a hop without alpha does not report
an unknown IBU; it silently disables the IBU solve for any batch that selects it.
Absence is a legal state for every other field here and for none of this one.

`tests/guards/hop-facts.test.js` enforces it, and enforces that a stored centre
sits inside its published bounds.

## 2. Fields and denominators

The denominator travels in the name, because the artifact's `percentage`
dimension is a unit and says nothing about what is counted.

| Field | Denominator | Unit |
|---|---|---|
| `alpha_acid_pct`, `alpha_acid_min_pct`, `alpha_acid_max_pct` | of hop mass | fraction |
| `beta_acid_pct`, `beta_acid_min_pct`, `beta_acid_max_pct` | of hop mass | fraction |
| `total_oil_ml_per_100g` | volume per mass | mL/100 g |
| `cohumulone_pct_of_alpha` | of alpha acids | fraction |
| `myrcene_pct_of_oil`, `humulene_pct_of_oil`, `caryophyllene_pct_of_oil`, `farnesene_pct_of_oil`, `linalool_pct_of_oil` | of total oil | fraction |

Total oil is the one field whose unit is not a fraction, which is why it carries
its unit in its name rather than in a dimension. A percentage oil figure from a
vendor is not converted into it: mL/100 g and % of mass are different
measurements, and only one of them is published in this set.

The identity and popularity fields (`id`, `name`, `synonym`, `category`,
`purpose`, `origin`, `alpha_rating`, `recipes_count`, `pairings`,
`flavor_profiles`) are not measurements and do not change basis.

## 3. Basis travels with the value

Two fields, deliberately distinct:

- **`*_provenance`** — how we know it. `alpha_provenance`, `beta_provenance`,
  `oil_provenance` each carry `kind` (`vendor`, `survey`, `aggregator`, `prior`),
  `bound` (`point`, `min`, `max`, `unknown`), the source (`vendor`, `url`,
  `retrieved_at`, `sha256` where a document exists), and the merge facts:
  `merge` (`precedence` or `mean_range`), `sources_count`, `dispersion`,
  `crop_years`.
- **`alpha_acid_basis`** — what was measured, where the source states it:
  conductometric (EBC 7.4) or spectrophotometric (ASBC Hops-6). This is the
  method, not the provenance class — the same distinction as `attenuation_basis`
  being `apparent`.

A hop row's `url` points at the evidence for the value it carries. Where a row is
crowd-only, that is the aggregator page, and the row says so.

## 4. The catalogue is permanently mixed

Measured varieties carry a vendor or survey figure with a stated bound. The tail
— experimental releases and landraces with no vendor page — keeps the crowd mean
and is marked `kind: aggregator`. That is not a migration state; no later sweep
resolves it.

The only observable difference is the basis. A reader who needs a vendor spec
should read `kind`; a reader who needs a number for the solver has one. The UI
marks anything not vendor-sourced, the way priors are already marked, and the
source sits in the tooltip.

Thin rows are flagged rather than repaired: where the crowd figure rests on fewer
than ten recipes, the count is in the provenance note. Nothing is clamped and
nothing is imputed.

## 5. A contradicted zero is not a measurement

Some sources spell absence as `0.00`. A zero that another source contradicts with
a substantial value is excluded from every synthesis — it does not enter a mean,
cannot win precedence, and does not widen the range — and stays in the ledger as
the conflict it is. A zero no source contradicts is kept as a point, because some
varieties really do carry almost no farnesene.

## 6. This row is the variety; the product is separate

`total_oil_ml_per_100g` here is the variety's oil, which for a T-90 pellet is the
dose figure. Lupulin concentrate carries roughly 2.7× the oil per gram, and that
lives on the product record, not on this one
(see [`hop-products.md`](hop-products.md) §4.1a). An oil dose computed from this
row alone is correct for T-90 and wrong for Cryo.
