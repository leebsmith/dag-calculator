# Hop facts

Status: **populated.** The fields below are in the artifact and the seed; the
synthesis that filled them is `plans/archive/2026-11/hop-facts-synthesis.md` and the builder is
`scripts/build-hops-seed.mjs`. This page explains what each field means and what
a reader is entitled to assume about it.

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

## 3.1 The rules the builder applies

In order, per field:

1. **Identity** — the scrape supplies the row; the facts attach to it by name.
2. **A hard zero** is not a measurement where a hop cannot be zero. Alpha, beta,
   total oil and co-humulone drop a `0` outright: Hopsteiner's payload carries
   `0 - 0` for three experimental varieties, and a zero there would be a hop that
   contributes no bitterness. The oil fractions are exempt — a variety really can
   carry almost no farnesene — so a zero stands unless another source contradicts
   it.
3. **Rank** — survey newest, survey older, first-party sheets, breeder sites,
   regional merchants, aggregator last.
4. **Merge** — three or more usable sources produce the mean of the bounds
   (`mean_range`); fewer fall back to the top-ranked single source
   (`precedence`). Max-only and unit-unresolved observations never enter a mean.
5. **Record** — `sources`, `sources_count`, `merge`, `dispersion`, `bound`, the
   printed range and the source URL; the row's `url` points at the winning
   source, or at the aggregator page for the tail.

What that yields across 401 rows: alpha is vendor or survey for 155 varieties and
an aggregator figure for 246 (150 with no vendor sheet at all, 96 where the
aggregator was the only source). 224 rows carry total oil, 213 co-humulone, and
94 linalool. Every row has an alpha.

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
