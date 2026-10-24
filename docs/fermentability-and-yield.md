# Fermentability and yield

Two axes, often conflated by vendors:

- **`yield_fraction`** — extract yield. For malts it is the dry-basis fine-grind
  extract; the solver applies `(1 - moisture)` to get the as-is yield. For
  sugars/extracts it is the as-is sugar-point contribution (water included).
- **`fermentability_fraction`** — the fraction of that extract that is
  fermentable. This is what scales AA.

They are independent. Knowing one does not give the other.

## `yield_fraction` (extract yield)

For a malt, the COA usually gives fine-grind dry-basis extract and moisture:

`yield_as_is = extract_fgdb × (1 − moisture)`

The seed stores `extract_fgdb` in `malt.yield_fraction`; the solver applies
`(1 - mc_i)`. For a liquid extract or syrup, the vendor number is often already
an as-is sugar-point contribution; it is stored directly in
`sugar.yield_fraction` and used without a moisture factor.

Do not rename the field. Treat its basis as ingredient-type-specific:
malt = dry basis, sugar/extract = as-is.

## `fermentability_fraction` (limit of attenuation)

A maltster measures this with a Congress Mash and a standard, highly
attenuative lab yeast pushed to completion. It is a **limit**, not the user's
yeast performance:

- Base malts: ~0.78–0.83
- Crystal/caramel: ~0.40–0.60
- Roasted: ~0.10–0.20
- Acidulated: base-like, ~0.80
- Simple sugars, extracts, syrups: 1.0

The value describes the carbohydrate profile: `F` is the share of extract that
is fermentable, `1 − F` the unfermentable dextrin share.

### Category defaults

Where a scrape has no `fermentability_fraction`:

| Category | Default |
|---|---|
| `BASE` | 0.81 |
| `CRYSTAL` | 0.50 |
| `ROASTED` | 0.15 |
| `ACID` | 0.80 |

A scraped per-malt value wins over the default. The defaults are Congress-Mash
priors, not mash-schedule predictions.

## The batch AA

`AA_batch` is not an ingredient value and is not the user's mash prediction.
It is built in three stages:

1. **Extract-weighted wort baseline**

   `AA_wort = Σ(extract_i · F_i) / Σ extract_i`

   Extract-weighted, not mass-weighted. Sugars use `F = 1.0`.

2. **Yeast cap**

   `yeast_cap = yeast.attenuation_pct × batch.attenuation_derate`

   `AA_batch = min(AA_wort, yeast_cap)`

3. **Final gravity**

   `AE = OE · (1 − AA_batch)`

`F_i` appears only in step 1. It is never multiplied by `AA_batch` and never
applied again at the AE step. That would double-count attenuation.

There is no mash modifier in this iteration. The malt `F` is the Congress-Mash
limit; a future mash model may modify it relative to Congress, but that is a
separate, calibrated feature.

## Mixed worts

Malt extract and sugar extract are blended by extract mass:

`AA_wort = (s_malt · AA_malt + s_sugar · 1.0) / (s_malt + s_sugar)`

With sugars, the split depends on the solve, so `AA_wort` is computed inside
the batch solver at each candidate OG. An upstream scalar would be circular.

## Vendor pitfalls

“70 % fermentable” can mean:

- 70 % as-is yield, with 100 % fermentable solids (water content), or
- 100 % extract, with 70 % fermentable carbohydrates.

The first affects OE; the second affects AE. They are not interchangeable.

The source schema carries `yield_basis` (`extract` or `fermentability`) and an
optional `fermentability_fraction`. The seed builder must not treat a
fermentability value as extract yield.

## Data exclusions

- The two 32 % Maltoferm black extracts are excluded from the seed: their
  values cannot be reconciled as a reliable as-is yield or fermentability.
- The other 16 extract/syrup rows are restored with `yield_fraction` = vendor
  sugar-point contribution and `F = 1.0`.
- The raw source retains the original values and basis labels.

## What this is not

- Not the removed mash-schedule attenuation estimator.
- Not a claim that a malt's Congress limit is your brewery's result.
- Not a replacement for the yeast cap or the per-batch derate.

## Tests

- `F` defaults by category; scraped values win.
- Extracts carry `F = 1.0`; black extracts excluded.
- Extract-weighted AA, not mass-weighted.
- Sugar blend raises AA; cap clamps.
- Derate changes the cap, not the wort baseline.
- `AE = OE(1 − AA_batch)` with no second `F` application.
