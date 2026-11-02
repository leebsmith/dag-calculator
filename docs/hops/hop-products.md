# Hop products

Status: living — **the authoritative product record**. `data/artifact.json` owns
the leaves, the scalars and the schemas; `data/sources/hop-products.json` carries
the seven variant presets; this document owns every number a product sheet
supplies.

A number lives in exactly one place. If it appears here and in the seed, the seed
is a preset and this page is the source.

<!-- claims: proposed batch.cone_utilization -->

## 1. The four leaves

Bitterness is `load × yield`, `load = alpha × mass / volume`, and the yield is
`gravity × time × form`. The leaf is the form, and the form changes only one
thing: how much of the alpha reaches the wort.

| Leaf | Stored value | `c` | Covers |
|---|---|---|---|
| Whole cone | `whole_cone` | supplied per batch, `0 < c ≤ 1` | fresh, wet and dried cones |
| Pellets | `t90_pellet` | 1.00 | T-90 and lupulin-enriched T-45/55 |
| Lupulin concentrate | `lupulin_pellet` | 1.10 | Cryo Hops, Lupomax |
| Extract | `flowable_extract` | 1.15 | CO₂ extract, Flex, DynaBoost, Incognito |

`c` is a **yield** scalar, never a concentration correction. Concentration is
already in `alpha`: a pellet at 11 % and an extract at 55 % differ fivefold in
alpha before any scalar applies. What `c` carries is the residual loss — how much
iso-alpha the vegetative matter adsorbs, and how accessible the resin is. T-90 is
Tinseth's own baseline, so it is 1.00 by definition.

The three sourced scalars are assumptions with a basis, not measurements: 1.00 is
Tinseth's pellet fit, 1.15 is the hot-side reference's figure above 90 °C, and
1.10 is the gland-versus-bract difference. They are documented as such so that a
future calibration has somewhere to land.

### Whole cone demands its own scalar

There is no source for the cone penalty — no maker publishes it, no bag carries
it, and there is no lot to assay. So the tool does not invent it: a batch with a
cone charge will not solve until `batch.cone_utilization` is supplied, and the
boundary emits `CONE_UTILIZATION_REQUIRED` until it is. The value is a method and
rig property, entered once per batch, bounded to `0 < c ≤ 1` because cone beating
pellets is the thing the scalar exists to deny.

This is the line between the two kinds of unknown:

- **A product fact** may be nominalised. An unpublished alpha is still a
  declaration about a real thing, and the brewer can override it with the number
  on their own bag.
- **A model parameter** may not. The brewer can only measure it or own a guess,
  so the tool makes them own it.

## 2. The extract leaf holds two families

CO₂ extract and flowable extract share `c` because the difference is the carrier,
not the yield: both are resin with no vegetative matter. The carrier changes how
the product is dosed — grams versus millilitres, viscosity, whether it pours at
room temperature — and that is a row property, not a model property.

The leaf also holds products the makers place on opposite sides of flameout:
Flex is dosed early in the kettle, DynaBoost and Incognito in the whirlpool. That
is why stage is seeded per variant and never enforced by the leaf.

## 3. Variants

Seven presets. Alpha is a **preset**, not a lot value; the published range is
present only where the product as a whole has one.

| Variant | Leaf | Maker | Alpha preset | Published range | Dose guidance | Substitution |
|---|---|---|---|---|---|---|
| Cryo Hops | lupulin concentrate | Yakima Chief | 22 % | variety-dependent — §4.1 | — | 40–50 % of T-90 by weight |
| Lupomax | lupulin concentrate | BarthHaas | 18 % | variety-dependent — §4.2 | — | 50–70 % of T-90 by weight |
| CO₂ extract | extract | Yakima Valley | 57.5 % | 50–65 % | 1 mL ≈ 10 IBU at 5 gal, 1.050, 60 min | — |
| Hop Shot | extract | Artisan | 65 % | — | 1 mL ≈ 10 IBU at 5 gal, 1.050, 60 min | — |
| Flex | extract | John I. Haas | 65 % | — | dose by IBU | — |
| DynaBoost | extract | Yakima Chief | 42.5 % | 35–50 % | 0.2–0.5 g/L | 1:10 |
| Incognito | extract | John I. Haas | 47.5 % | 40–55 % | 0.5–2.0 g/L, 2.0 max | 1:6 |

Cryo's and Lupomax's presets are the **medians of their per-variety tables** in
§4, rounded, so that a brewer without a certificate starts near the middle of the
range rather than at one end. They are not product specifications and the card
says so.

Flex and Hop Shot are boil-only by maker guidance. Hop Shot's two blend SKUs
(Cluster/Magnum) carry no variety.

### Sheets

- Cryo Hops 2022 overview:
  `https://assets.contentstack.io/v3/assets/blt01aa4a23b23249e1/bltec62496a69ac3b68/698b6bfc90094342b1f8c01a/cryo-hops-product-overview-sheet-2022.pdf`
- Lupomax 2025 sell sheet:
  `https://cdn.shopify.com/s/files/1/0365/4598/6693/files/25-08_LupoMAX-SELL_SHEET-1.pdf`
- Lupomax technical data:
  `https://cdn.shopify.com/s/files/1/0365/4598/6693/files/Tech_Data_-_LupoMAX.pdf`
- DynaBoost product data:
  `https://assets.contentstack.io/v3/assets/blt01aa4a23b23249e1/blta3086c9913d83f0e/69b863851cac854f8777a666/DynaBoost_Product_Data_Sheet.pdf`
- Incognito 2026:
  `https://cdn.shopify.com/s/files/1/0365/4598/6693/files/Haas_Incognito_2026.pdf`
- Incognito general use:
  `https://cdn.shopify.com/s/files/1/0365/4598/6693/files/Haas_Incognito-GeneralUse_082520.pdf`
- Flex best practice:
  `https://www.johnihaas.com/wp-content/uploads/2019/07/Haas_FLEX-BestPractices_070319.pdf`
- CO₂ extract (Yakima Valley):
  `https://yakimavalleyhops.com/products/co2-hop-extract`
- Citra CO₂ extract (Yakima Valley):
  `https://yakimavalleyhops.com/products/citra-co2-hop-extract`
- Hop Shot (MoreBeer):
  `https://morebeer.com/products/artisan-hopsreg-hop-shot-columbus-extract-10-ml`

## 4. Per-variety alpha

These tables are why the per-variety products are not seeded. They are crop-year
figures, they change at every harvest, and a seed row would go stale silently.

### 4.1 Cryo Hops — YCH 2022

| Variety | Alpha % | Variety | Alpha % |
|---|---|---|---|
| Ahtanum | 6–12 | Loral | 18–24 |
| Amarillo | 11–17 | Mosaic | 21–27 |
| Cascade | 13–19 | Palisade | 11–17 |
| Cascade Organic | 11–16 | Sabro | 23–29 |
| Cashmere | 14–17 | Simcoe | 21–27 |
| Centennial | 14–20 | Talus | 10–14 |
| Chinook | 20–26 | Warrior | 23–27 |
| Citra | 22–28 | Comet | 15–17 |
| Citra Organic | 19–25 | Crystal | 6–10 |
| Columbus | 22–28 | HBC 472 | 14–18 |
| Ekuanot | 20–26 | HBC 586 | 18–22 |
| El Dorado | 20–25 | HBC 630 | 20–26 |
| Idaho 7 | 20–26 | HBC 682 | 20–28 |

The sheet also carries oil ranges per variety, not transcribed here.

### 4.2 Lupomax — BarthHaas 2025 sell sheet

| Variety | Alpha % |
|---|---|
| BRU-1 | 20.0 |
| Amarillo | 13.5 |
| Azacca | 19.0 |
| Cascade | 15.5 |
| Centennial | 13.0 |
| Chinook | 15.5 |
| Citra | 18.5 |
| El Dorado | 18.0 |
| HBC 586 | 18.0 |
| Mosaic | 18.5 |
| Sabro | 18.0 |
| Talus | 10.5 |

The sheet lists Columbus, Cashmere, Dolcita, Ekuanot, HBC 1019, Idaho 7 and Krush
without a figure.

### 4.3 Lupomax — 2023 crop

| Variety | Alpha % | Beta % | Oils mL/100 g |
|---|---|---|---|
| BRU-1 | 20.0 | 12.5 | 2.2 |
| Amarillo | 14.0 | 8.9 | 2.1 |
| Azacca | 17.0 | 5.8 | 2.0 |
| Cascade | 12.0 | 10.2 | 1.5 |
| Cashmere | 13.5 | 8.8 | 1.5 |
| Centennial | 14.0 | 5.0 | 2.2 |
| Chinook | 18.0 | 4.0 | 2.1 |
| Citra | 18.5 | 4.1 | 2.7 |
| Columbus | 20.5 | 6.2 | 3.3 |
| Ekuanot | 19.0 | 5.6 | 2.8 |
| El Dorado | 19.5 | 7.8 | 2.9 |
| HBC 586 | 16.5 | 10.1 | 1.5 |
| Idaho 7 | 20.0 | 5.7 | 2.8 |
| Mosaic | 18.0 | 4.9 | 2.2 |
| Sabro | 19.5 | 7.3 | 2.1 |
| Talus | 12.0 | 11.1 | 2.2 |

Transcribed from the maker's page copy. Where the page and the PDF differ, the
PDF wins.

### 4.4 The correction this records

The catalogue this document replaces carried one range per variety for both
brands, matching neither sheet. Against the tables above:

- Cryo Cascade was `9–14` against `13–19` — 39 % heavy on mass.
- Cryo Talus was `15–20` against `10–14` — 31 % light.
- Nine varieties shared one `20–25` band.
- Lupomax was identical to Cryo per variety, and mostly 18–50 % high: Talus at a
  `17.5` midpoint against `10.5`, Chinook `22.5` against `15.5`, Centennial
  `17.5` against `13.0`.

Because mass is the inverse of the allocated IBU through alpha, every one of
those errors scaled a real charge.

## 5. Recorded disagreements

**Incognito against the cooling curve.** Haas publishes a 1:6 replacement, which
implies meaningful whirlpool conversion. The model prices a cool stand at a few
per cent, so an Incognito whirlpool charge solves heavier than the substitution
rule suggests. The model is not special-cased for a brand: one yield model applies
to every leaf, and the disagreement is recorded here instead.

**DynaBoost against its own guidance.** YCH states that bitter pickup from
DynaBoost in the whirlpool is likely negligible, which agrees with the cooling
curve and with the guardrail that the whirlpool is a flavour stage for this
product. Dosing it for bitterness and dosing it for flavour are different
intentions; the card prices the former.

**Cone.** See §1. The tool refuses rather than guesses.

## 6. Exclusions

- **American Noble** — a bulking agent: low alpha, high vegetative load, and the
  maker's own linear rule rather than Tinseth. Out of the bitterness model.
- **Hash** — seasonal, unique, and published without brewing values by the maker,
  who recommends the cold side. Dropped.
- **CGX** and **SubZero Hop Kief** — no definitive data.
- **Pre-isomerised products** (IsoHop, Tetrahop Gold, Hexahop Gold, Redihop,
  Kettle Redi) — already-isomerised bitterness is a linear model with no Tinseth
  term, and is a separate workstream.
- **Flavour products** (Spectrum, Prysma, Aromahop OE, PHA, Euphorics,
  HyperBoost, Abstrax) — no alpha, no IBU. They belong to the flavour charge,
  tracked in `TODO.md`.

## 7. Using a lot certificate

The card's alpha field is the **lot assay**, and the catalogue preset is a
placeholder. Replace it: the harvest differs, the certificate is authoritative,
and the mass is solved from whatever alpha is in the field. Where a published
range exists the card prints it beside the input; where it does not, it prints
"nominal" and names this document.
