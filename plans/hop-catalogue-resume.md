---
title: Hop catalogue — resume dossier
status: active
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make check + make test
---

# Hop catalogue — resume dossier (2026-11-01 evening)

Status: paused for the evening. The workstream is committed up to `9c853a1`
(`832105f`…`9c853a1`, ten commits, not pushed); this dossier is the resume point
and was added on top of them. `make check` and `make test` green at `9c853a1`.

Resume at §5: answer Tier 1, then the seeding pass in §6.

---

## 1. Settled decisions (do not relitigate)

- **IBU is a design input. Period.** Never author a hop mass and produce IBU.
  Allocate the target by splits; the grams are the solved output. This is the
  product-wide mandate.
- Consequently the registry's realized-IBU alias pointing at `batch.target_ibu` is
  **correct**, not circular — conformance grades the design target.
- **Dose rates**: post-boil volume is the denominator; warn both below and above a
  published band; the report prints one muted line **per table**; units follow the
  volume preference.
- **Flavour products do not go in `hop_product`.** They are captured as the
  `### Flavor charge` subsection in `TODO.md` (committed `9c853a1`).
- **Skipped products**: CGX (Crosby — no definitive data), SubZero Hop Kief
  (no maker sheet), and the remainder of the "many more" line.
- **Critical TODO (committed `51c4f84`, extended `3e06023`)**: catalogue alphas
  disagree with the maker sheets — Incognito and Cryo/Lupomax — to be fixed in the
  advanced-product seed pass, per product and per brand, not in isolation.

---

## 2. Data & provenance

### Committed in the repo

| File | Contents | Manifest |
|---|---|---|
| `data/sources/yvh-products.json` | 17 advanced products: title, type, tags, plain-text description, **34 spec-sheet URLs**, product URL. Sorted, no timestamps. | scrape, rows 17, sha256 |
| `data/sources/hop-products.json` | 19 curated extract entries (DynaBoost 8, Incognito 10, generic 1): alpha/beta/oil, ratio, notes, 18 product-page URLs | curated |
| `data/sources/hop-products-lupulin.json` | 27 lupulin varieties (Cryo + Lupomax): slug, alpha range, manufacturers — **no URLs** | curated |
| `data/seeds/hop-products.json` | 61 products built from the two above | — |

The scraper: `scripts/scrape/yvh/scrape_yvh.py`, `make scrape-yvh`
(`OUT=` path, `CHECK=1` to diff without writing). Contract guard:
`tests/guards/yvh-products-source-contract.test.js`.

### Ephemeral — `/tmp/opencode` only (not committed, survives only if the box does)

```
cryo.pdf        YCH Cryo Hops product overview 2022 (per-variety alpha + oil table)
dynaboost.pdf   YCH DynaBoost product data sheet
noble.pdf       YCH American Noble Hops PDS 2025
hyperboost.pdf  YCH HyperBoost PDS (indiehops copy)
incognito.pdf   Haas Incognito 2026
inc-g.pdf       Haas Incognito General Use
abx-*.pdf       Abstrax Quantum / Omni / BrewGas / Skyfarm dosing guides
yvh-sheets/     23 TDS/whitepaper PDFs for the YVH products
```

### Conversation-only URLs (re-fetch these)

- Cryo Hops 2022: `https://assets.contentstack.io/v3/assets/blt01aa4a23b23249e1/bltec62496a69ac3b68/698b6bfc90094342b1f8c01a/cryo-hops-product-overview-sheet-2022.pdf`
- DynaBoost: `https://assets.contentstack.io/v3/assets/blt01aa4a23b23249e1/blta3086c9913d83f0e/69b863851cac854f8777a666/DynaBoost_Product_Data_Sheet.pdf`
- American Noble: `https://assets.contentstack.io/v3/assets/blt01aa4a23b23249e1/bltf43d70cfe34a6e2d/American%20Noble%20Hops%20Product%20Data%20Sheet%202025.pdf`
- HyperBoost: `https://indiehops.com/wp-content/uploads/2025/01/Product-Data-Sheet.pdf`
- Hop Shot: `https://morebeer.com/products/artisan-hopsreg-hop-shot-columbus-extract-10-ml`
  (the other three SKUs were found via `https://morebeer.com/search?q=hop+shot`)
- Abstrax dosing page: `https://abstraxhops.com/pages/abstrax-hops-dosing-guides`
- Incognito (YVH): `https://yakimavalleyhops.com/products/incognito`
- BeerSmith overview: `https://beersmith.com/blog/2026/05/27/an-overview-of-new-hop-products-for-beer-brewing/`
- Mr Malty calculator: `https://mrmalty.com/whirlpool-mibu-calculator.html`

### Provenance gaps to close before the seed pass

1. Non-YVH sheets have **no committed record** (Cryo, American Noble, HyperBoost,
   Hop Shot; Abstrax belongs to the flavour list, not the hop catalogue).
2. The lupulin source has **zero citations**; 27 varieties with no URL.
3. The extracted facts below live only in this file and in the PDFs until the seed
   pass writes them into the curated sources.
4. **Lupomax per-variety alphas are not published** — BarthHaas's TDS says
   "standardized to a predetermined range (variety dependent)"; the sell sheet has
   no numbers. Nominal preset + "use the lot CoA" is the honest record.

Proposed form: add a `spec_sheets: [urls]` array to the curated entries and to the
lupulin variety records (or a side file `data/sources/hop-product-sheets.json`
keyed by product id), commit URLs not PDFs, re-emit the manifest.

---

## 3. Extracted facts (do not re-derive)

### Boil / whirlpool bittering

| Product | Maker | Placement | Alpha | Dose / ratio | Model note |
|---|---|---|---|---|---|
| **Incognito** | Haas | **whirlpool** | **40–55 %** (HPLC) | 50–200 g/hL = 0.5–2.0 g/L, max 2; 1:6 T-90; 1 g ≈ 1 mL | whirlpool flowable |
| **DynaBoost** | YCH | **whirlpool** | 35–50 % (β 10–20, oil 18–22) | **0.2–0.5 g/L**; 10:1 dilution | whirlpool flowable; YCH says bitter pickup in the whirlpool is likely negligible |
| **Flex** | Haas | boil, early | ~65 % | — | 10–20 % relative utilisation vs pellets (our 1.15 sits in that band) |
| **CO₂ Hop Extract** | YVH/CTZ blend | boil | 50–65 % (on can) | 1 mL ≈ 10 IBU @ 5 gal, 1.050, 60 min | boil extract |
| **Citra CO₂ extract** | YVH | boil | same family | same | boil extract |
| **Hop Shot** (4 SKUs) | Artisan | **boil only** | ~65 % | 1 mL ≈ 10 IBU @ 5 gal, 1.050, 60 min | Columbus; Centennial; Cascade/Willamette; Cluster/Magnum (2 blends, no variety_id) |
| **Cryo Hops** | YCH | late kettle / knockout / whirlpool / dry | per-variety table below | **40–50 % of T-90 by weight** (1:2–1:2.5) | lupulin |
| **Lupomax** | BarthHaas | whirlpool / dry / late kettle | "standardized, variety dependent" | **70 % of T-90** (1:1.43) | lupulin |
| **American Noble** | YCH | kettle (best) / anywhere pellets go | **0.5–6.0 %** (β 0.5–2) | `kg = IBU/30 × hL / Alpha %` (30 % util assumed) | de-bittered bract pellet; needs `noble_pellet` or a note |

**Cryo split mix (YCH):** substitute 40 g CRYO + **25 g T-90** (or **15 g American
Noble**) for every 100 g T-90. A blend recommendation, not a ratio — belongs in
product guidance, not `t90_replacement_ratio`.

### Pre-isomerized (new chemistry; no Tinseth)

| Product | Active | Placement | Utilisation | Rule of thumb |
|---|---|---|---|---|
| **IsoHop** | 30 % iso-α | post-fermentation | 60–90 % post-ferm; 50–60 % brewhouse | — |
| **Tetrahop Gold** | 9 % THIAA (10 % variant) | post-fermentation | 70–75 % | `g/hL = BU × 0.93` |
| **Hexahop Gold 10 %** | 10 % hexa/tetra | post-fermentation | 55–80 % | `g/hL = BU × 1.10` |
| **Redihop** | 30 % rho-iso-α | kettle or post-ferm | 70–75 % / 45 % | `g/hL = BU × 0.68`; ~60 % of IAA bitterness |
| **Kettle Redi** | 38–42 % rho-iso-α | kettle | "pre-isomerized kettle" | replaces kettle extract |

### Non-bittering (moved to `TODO.md` → Flavor charge)

Spectrum (1:5–1:10; 0.5–5 mL oil/hL; ≤1 g/L), Prysma (<0.5 % α; 0.5–1.0 g/L;
1 kg ≈ 5–8 kg T-90), Aromahop OE (<0.2 % iso; 2.5 g/hL late boil), PHA (no α),
Euphorics (3–6 mL/bbl), Hop Hash (variable, cold side), HyperBoost (15–40 % α;
1:100 T-90 / 1:50 Cryo; 25–50 % of the dry hop; active fermentation),
SubZero Hop Kief (no data), Abstrax Quantum/Omni/BrewGas/Skyfarm (0.065 mL/L start;
0.3–1 / 0.5–2 oz/bbl).

### Cryo per-variety alpha (YCH 2022 sheet) vs our seed

| Variety | YCH | Ours | Δ mass |
|---|---|---|---|
| Cascade | 13–19 | 9–14 | ~39 % heavy |
| Talus | 10–14 | 15–20 | ~31 % light |
| Amarillo | 11–17 | 15–19 | ~19 % heavy |
| Cashmere | 14–17 | 12–16 | ~10 % heavy |
| Citra | 22–28 | 20–25 | ~11 % heavy |
| Sabro | 23–29 | 20–25 | ~19 % heavy |
| Columbus | 22–28 | 22–27 | close |

Nine varieties share one `20–25` band in our source. Full YCH table (alpha %):
Ahtanum 6–12, Amarillo 11–17, Cascade 13–19, Cascade Org 11–16, Cashmere 14–17,
Centennial 14–20, Chinook 20–26, Citra 22–28, Citra Org 19–25, Columbus 22–28,
Comet 15–17, Crystal 6–10, Ekuanot 20–26, El Dorado 20–25, HBC 472 14–18,
HBC 586 18–22, HBC 630 20–26, HBC 682 20–28, Idaho 7 20–26, Loral 18–24,
Mosaic 21–27, Palisade 11–17, Sabro 23–29, Simcoe 21–27, Talus 10–14,
Warrior 23–27. (Oil ranges are in the sheet, not captured here.)

---

## 4. Analyses worth keeping

- **Mr Malty comparison.** Same physical schedule, same inputs: Malty 13.0 vs ours
  13.5 at 23.2 L / 1.086; at Malty's defaults (5 gal / 1.050) both give ~22.
  The 45 % gap was inputs: volume ×1.226 and the Tinseth gravity term ×1.382 =
  ×1.69. Residual model differences: `Ea/R` 9773 vs 11858 (ours more generous
  below boiling), isothermal stand vs cooling-curve integration, post-boil vs
  average-boil gravity, lupulin ×1.10.
- **The 9 oz whirlpool.** 45 IBU from a 170 °F stand needs ~250 g; the same IBU at
  a 99 °C start is 204 g, with no chill 96 g, at a 20 % share 100 g. The driver is
  the cold stand, not the cryo potency (already in the alpha).
- **Hot/cool split.** Classified by *posted* temperature; the 30-min charges are
  27 IBU "hot" although the inferred chill puts them below 79 °C for 20 of their
  30 minutes (2.72 of 5.14 effective minutes above the floor). By locus it is
  ~32/68, not 60/40.
- **Stub helpers.** `views/whirlpool.js:whirlpoolMassKg/whirlpoolIbu` use the
  per-row curve; the boundary uses the timeline. Unused by production, but a trap.

---

## 5. Tiered questions (resume here)

### Tier 1 — blocks the seeding pass

1. **Form vs placement**: one `flowable_extract` + `applications`, or add
   `whirlpool_extract`? *Default: applications only.*
2. **Per-brand lupulin alphas**: split Cryo vs Lupomax, or keep one range per
   variety? *Default: split — but Lupomax alphas are not public, so the record may
   be "nominal + lot CoA".*
3. **`noble_pellet`** for American Noble, or label it T-90? *Default: add.*
4. **Dose units**: literal volume preference (`g/qt`, `g/mL`) or family-pinned
   (`g/L` / `g/gal`)? *Default: family-pinned.*
5. **Who gets a band**: extracts yes, lupulin rate-only (substitution note)?
6. **Boil extract records**: add Flex / CO₂ / Hop Shot as real products, keep the
   generic 45 % as fallback? *Default: add.*

### Tier 2 — blocks the model pass

7. **Whirlpool extract utilisation**: restore the temperature-dependent ramp
   deleted in `9bdca7d` (full at ≥90 °C, 0.80 at ≤75 °C), or a constant?
   *Default: restore.*
8. **Post-fermentation bitterness** (IsoHop/Tetrahop/Hexahop): separate
   "bright-beer adjustment" feature, or out of scope? *Default: separate; only
   kettle-capable Redihop and Kettle Redi enter the recipe.*
9. **`realized.ibu = target`**: keep? *Default: keep (mandate).*
10. **Retire TODO Next #1** ("schedule-derived whirlpool IBU") — it describes the
    forward model the mandate rejects. *Default: retire or reword.*

### Tier 3 — before the Flavor Charge

11. Own catalog kind + stage field, and do dry hops stay as they are?
    *Default: own kind; dry hops stay.*

### Tier 4 — process

12. Scraper cadence/coverage: YVH only, manual pages elsewhere, no auto-PDF?
    *Default: yes.*
13. Land the `docs/vision.md` §5 refusal bullet ("never author a mass to obtain a
    target")? *Default: with the seed commit.*
14. Push the 10 commits.

---

## 6. Next actions, in order

1. **Tier-0 provenance**: commit the non-YVH sheet URLs (and add URLs to the
   lupulin varieties), then re-emit the manifest.
2. **Seed pass**: answer Tier 1, fix the alphas (Incognito, per-brand lupulin),
   add `applications`, `noble_pellet`, dose bands; `make seeds`; docs atomic.
3. **Model pass**: Tier 2 (`applications` + form×process scalar + isomerized path).
4. **Flavor charge**: Tier 3.
5. **Push** (Tier 4 Q14) whenever.
