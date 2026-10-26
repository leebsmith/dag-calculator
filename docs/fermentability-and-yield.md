# Fermentability and yield

Two axes, often conflated by vendors:

- **`yield_fraction`** — extract yield. For malts it is the dry-basis fine-grind
  extract; the solver applies `(1 - moisture)` to get the as-is yield. For
  sugars/extracts it is the as-is sugar-point contribution (water included).
- **`fermentability_fraction`** — the share of that extract that ferments. It
  is a **real** mass fraction; `1 − F` is the unfermentable (dextrin) share.

They are independent. Knowing one does not give the other. The composition model
that consumes `F` is stated in [`attenuation-model.md`](attenuation-model.md).

## `yield_fraction` (extract yield)

For a malt, the COA usually gives fine-grind dry-basis extract and moisture:

`yield_as_is = extract_fgdb × (1 − moisture)`

The seed stores `extract_fgdb` in `malt.yield_fraction`; the solver applies
`(1 - mc_i)`. For a liquid extract or syrup, the vendor number is often already
an as-is sugar-point contribution; it is stored directly in
`sugar.yield_fraction` and used without a moisture factor.

Do not rename the field. Treat its basis as ingredient-type-specific:
malt = dry basis, sugar/extract = as-is.

## `fermentability_fraction` (real fermentable share)

A maltster measures the share of the malt's extract that its standard
attenuative lab fermentation consumes. The figure is published under different
names and on different bases:

- **Real** (a fraction of extract): Bairds/Crisp IoB, Simpsons un-boiled
  fermentability, Briess extracts. Stored as-is.
- **Apparent** (a Congress-mash attenuation, which can exceed the real share):
  Dingemans' "Final attenuation". Converted to real at 12 °P where the data is
  ingested (see below).

The source schema carries `fermentability_basis` (`real` | `apparent` |
`unspecified`) and `fermentability_method` (the source's own label). The consumer
converts `apparent` rows once, in the boundary request builder, at the fixed
12 °P reference; the wire and the solver speak real fractions only.
`unspecified` is treated as real and flagged (assumption A1 in
`attenuation-model.md`).

Typical **real** values:

- Base malts: ~0.60–0.65 for ordinary pale malt; distilling malts publish ~0.85–0.87
- Crystal/caramel: ~0.40–0.50
- Roasted: ~0.10–0.20
- Acidulated: base-like, ~0.64
- Simple sugars, extracts, syrups: 1.0

### Category defaults

Where a scrape has no `fermentability_fraction`:

| Category | Prior (real) | Old apparent observation |
|---|---|---|
| `BASE` | 0.643 | 0.810 |
| `CRYSTAL` | 0.398 | 0.500 |
| `ROASTED` | 0.121 | 0.150 |
| `ACID` | 0.635 | 0.800 |
| `sugar` | 1.000 | 1.000 |

The priors are the old apparent observations converted at 12 °P, so a recipe
resolved from priors displays the same apparent attenuation as before (A7). A
scraped per-malt value wins over the prior.

## The batch attenuation block

`AA_batch` is not an ingredient value and is not a mash-schedule prediction. The
solver evaluates extract composition at the candidate `OE`:

```
cap_real   = apparent_to_real(OE, yeast_cap_apparent)
F_malt_eff = min(F_malt, cap_real)
UE         = E_malt·(1 − F_malt_eff)·(1 − d) + E_sugar·(1 − F_sugar)
RE         = OE · UE / E
AE         = inverse_cutaia(RE)
AA_app     = (OE − AE) / OE          # may exceed 1
```

`F_malt` is the extract-weighted real fermentability of the grain bill. The
yeast cap applies to **malt only**, in real space; sugar keeps `F_sugar = 1.0`
and is never clamped, so a sugar addition can lift apparent attenuation past the
cap. `d` is the diastaticus dextrin-consumption share (D5); it acts on the malt
residue only.

`AE = OE · (1 − AA)` is no longer a model step: `AE` comes from inverting the
Cutaia real-extract regression, and may be ≤ 0. `F_i` appears exactly once, in
the residue term; it is never applied again at the AE step.

## Mixed worts

Malt extract and sugar extract are composed by extract mass. Sugar contributes
`E_sugar` fully fermentable extract and no residue; malt contributes
`E_malt · (1 − F_malt_eff)` residue. Because the extract split depends on the
solve, the composition block is evaluated inside the batch solver at each
candidate OG. An upstream scalar would be circular.

## Vendor pitfalls

“70 % fermentable” can mean:

- 70 % as-is yield, with 100 % fermentable solids (water content), or
- 100 % extract, with 70 % fermentable carbohydrates.

The first affects OE; the second affects AE. They are not interchangeable.

The source schema carries `yield_basis` (`extract` or `fermentability`) and an
optional `fermentability_fraction`. The seed builder must not treat a
fermentability value as extract yield. Briess publishes fermentability (not
extract) for some extracts; those rows keep the number in `yield_fraction` with
`yield_basis: "fermentability"` and a `fermentability_basis` tag, and the
importer reinterprets it.

## Data exclusions

- The two 32 % Maltoferm black extracts are excluded from the seed: their
  values cannot be reconciled as a reliable as-is yield or fermentability.
- The other 16 extract/syrup rows are restored with `yield_fraction` = vendor
  sugar-point contribution and `F = 1.0`.
- The raw source retains the original values and basis labels.

## What this is not

- Not the removed mash-schedule attenuation estimator.
- Not a claim that a maltster's limit is your brewery's result.
- Not a time-dependent diastaticus model: `d = 1` is a limit, not a rate.

## Vendor yeast source (White Labs)

`data/sources/whitelabs-yeasts.json` is a committed vendor scrape of
`https://www.whitelabs.com/yeast-bank` (`make scrape-whitelabs`). It exists
because the aggregator gives one attenuation number per strain, while the model
needs an **apparent range** and the **STA1** status:

| Field | Meaning |
|---|---|
| `strain`, `name` | `WLP001`, `California Ale Yeast` |
| `attenuation_text` | the page's verbatim range (`73% - 85%`) |
| `attenuation_low_pct`, `attenuation_high_pct` | the range in percent |
| `attenuation_basis` | `apparent` — the vendor publishes apparent attenuation |
| `flocculation`, `alcohol_tolerance`, `temp_low_c`, `temp_high_c` | display data |
| `sta1_text` | the page's QC line (`Positive` / `Negative`) |
| `sta1` | tri-state: `true` (positive), `false` (negative), `null` (not published) |
| `url`, `sha256`, `retrieved_at` | the page and the hash/time it was read |

The vendor range uses the **high end** as the malt cap (A14 in
`attenuation-model.md`); the low end is stored for display. `sta1: null` is not
a negative: D5 models it as `d = 0` and raises an advisory, because a silent
"assume negative" would hide a diastaticus risk. The seed builder does not
consume this file yet (D4b); the guard
`tests/guards/whitelabs-yeast-contract.test.js` pins the shape and
`tests/guards/sources-manifest.test.js` pins the content hash.

## Provenance and priors

A catalog record carries the figure it was captured with, and a citation for it:
`fermentability_provenance`/`yield_provenance` (and `attenuation_provenance`
for yeasts) record the source URL, the cached document's `sha256`, the retrieval
time, the vendor, and the **bound** the source states — `point`, `min`, `max`,
or `unknown` (used for published extracts whose qualifier is not parsed yet).
A `null` figure means the source is silent; the export never imputes.

Priors live in the artifact, not in the seed builder or an adapter table
(`fermentability_prior_*`, `yield_prior_*`). They resolve **copy-forward**: when
a catalog record is added to a batch, the row is written with the resolved value
and `kind: "prior"` provenance. A frozen batch therefore records whether each
number was measured or assumed, and changing a prior later never rewrites
batches that already exist.

`bound: "min"` is a floor, not a point estimate. The solver uses the printed
value as a point; the bound travels in provenance and the ingredient tables mark
it as a floor (`≥`), an apparent conversion as `≈`, and an assumed prior as `~`
(D3, assumption A8). `docs/adsco/ui.md` §"Ingredient figures" is the display
contract.

Yeast provenance is **aggregator-level** in Pass 1: `kind: "aggregator"` with
the profile URL and no per-page hash, because the beer-analytics scrape caches
no pages. The vendor fetch (STA1, attenuation ranges) upgrades it to a
per-document citation (D4).

## Tests

- `F` defaults by category in real space; scraped values win.
- Apparent figures convert at 12 °P and round-trip to the old display.
- Extracts carry `F = 1.0`; black extracts excluded.
- The composition block reproduces the four regimes.
- Sugar raises apparent attenuation past the yeast cap.
- The derate changes the cap before conversion, not the malt baseline.
- `AE` is inverted from `RE`: no second `F` application.
