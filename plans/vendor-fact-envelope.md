---
title: Vendor fact envelope — availability, basis and precedence for hop attributes
status: proposed
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: the coverage matrix, the per-field verdicts and the disagreement ledger exist and are reproducible from the probe; make check and make test stay green; no seed, artifact or frontend change
---

# Vendor fact envelope

A **measurement plan**, not a build. It establishes which of ten hop attributes
can be published, from whom, against which denominator, and for how many
varieties — before any of them enters `data/artifact.json`.

The name is historical. The "envelope" is not the maximum of everything the
vendors publish; it is a **closed set of ten attributes** chosen for this
workstream, and the test's job is to verify that set is obtainable rather than
to discover a larger one.

## 1. Why

The hop variety catalogue carries `alpha_acid_pct`, `alpha_acid_min_pct`,
`alpha_acid_max_pct` and `beta_acid_pct`, all of which are statistics over
recipes that brewers typed into other people's software. They have no bounds
semantics, no composition, and no traceable source: `alpha_acid_pct` is the mean
of the site's displayed range, and the range is the observed spread across
crowd-entered values, so a single bad entry widens a variety's range. The `notes`
field is generated prose with no upstream at all.

Meanwhile the vendors publish real specs, with stated methods, and the
association snapshot publishes an industry-wide survey. The question this plan
answers is narrow and answerable: for these ten attributes, what is actually
obtainable, in what unit, from which source, and for how many varieties?

## 2. What this plan is not

- No `data/artifact.json` change, no `data/seeds/` change, no frontend change.
- No prose: `notes` is untouched, and nothing here synthesises or repairs it.
- No committed vendor documents. We commit the extraction we derive, never the
  third party's file — the same rule `data/sources/beer-analytics-hops.json`
  already follows.
- No production scraper. The probe is deleted on completion; see §9.
- No challenge bypass. Where a source gates automated access, that is recorded
  as a gap, not routed around.

## 3. The field set

Eleven attributes. The denominator is part of the meaning and travels in the
field name, because the artifact's `percentage` dimension is a unit (a fraction
with a `pct` factor) and says nothing about what is being counted.

| Attribute | Proposed field(s) | Denominator | Bound kinds seen |
|---|---|---|---|
| Total oil | `total_oil_ml_per_100g`, possibly `total_oil_pct` | volume per mass, or of hop mass | range, `up to` |
| Myrcene | `myrcene_pct_of_oil` | of total oil | range |
| Humulene | `humulene_pct_of_oil` | of total oil | range |
| Caryophyllene | `caryophyllene_pct_of_oil` | of total oil | range |
| Farnesene | `farnesene_pct_of_oil` | of total oil | range, point |
| Linalool | `linalool_pct_of_oil` | of total oil | range |
| Alpha | `alpha_acid_min_pct`, `alpha_acid_max_pct` | of hop mass | range, and `up to` |
| Beta | `beta_acid_min_pct`, `beta_acid_max_pct` | of hop mass | range, point |
| Co-humulone | `cohumulone_pct_of_alpha` | of alpha acids | range, point, `~` |

Eleven attributes, twelve candidate fields, because total oil is published in two
conventions that do not convert exactly. The verdict decides whether it becomes
two fields or one field plus a document note.

The order is deliberate. The consumers in §3.1 dose by **oil**, so total oil and
the fractions lead; alpha is the bitterness axis and sits where it belongs, on
the layering plan's IBU side rather than as the anchor.

**Bound vocabulary.** `point`, `min`, `max`, `unknown` — the same four the yeast
provenance already carries. `up to 1.4 ml/100 g` is `bound: max` with no
minimum; it is not a range with a zero floor. Point values are recorded as
`min = max` with `value_kind: point`.

**Document-only candidates, tracked but not schema fields:** geraniol (BarthHaas
only), and the humulene/caryophyllene ratio (HPA full blocks only, and derivable
from two fields we already carry). Both get a verdict so the matrix shows they
were considered.

**Excluded by this plan, deliberately:** hard resins, polyphenols, xanthohumol,
ketones, isobutyrates, hop storage index, genetic origin, yield, maturity,
disease ratings, acreage, aroma descriptors and narrative descriptions. Hop
storage index is the notable one: **no source in this set publishes it**. It is a
model constant or a prior, not a scraped fact, and it belongs to the retention
work in `docs/hops/whirlpool-hopping-model.md`.

### 3.1 What consumes this

Two features, named so a verdict can be justified by a consumer rather than by
availability.

| Consumer | Reads | Where it is specified |
|---|---|---|
| Layered whirlpool — authored hot/cool IBU split and a cool-side mass ratio | alpha for the IBU side; the mass ratio is an oil dose, so total oil and the fraction profile decide what the ratio means | `plans/hop-layering-strategy.md` |
| Whirlpool dosing by oil concentration | total oil (mL/100 g), the aroma-active fractions, vintage, and the form's oil per gram | `docs/hops/whirlpool-hopping-model.md` |

Two consequences that are not optional:

- **Vintage is load-bearing.** Oils degrade faster than alpha, so a variety's oil
  figure without its crop year is weaker than its alpha figure without one.
  `mean_range` must not cross vintages (§6), and a single-source record has to say
  which year it came from.
- **The unit stays the source's.** Dosing wants mg/L; total oil is published in
  mL/100 g, and the conversion needs a density (~0.85 g/mL). That is a model
  constant, not a hop fact — the field keeps the unit in its name and the
  conversion lives in the whirlpool model.

## 4. Sources

| Id | Document | Access | Varieties | Attributes | Vintage |
|---|---|---|---|---|---|
| `hga-2020` | USA Hops Variety Snapshot 2020 (`https://www.usahops.org/cabinet/data/HGA_VS_2020.pdf`) | PDF, `pdftotext -layout` | ~56 listed | alpha, beta, cohumulone, total oil (mL/100 g) | 2020 |
| `hga-2017` | USA Hops Variety Snapshot 2017 (`https://www.usahops.org/cabinet/data/USAHops_VarietySnapshot_2017_SinglePage.pdf`) | PDF, `pdftotext -layout` | ~66 listed | same | 2017 |
| `hopsteiner-vf` | `https://hopsteiner.us/variety-data-sheets/?data=1` | one HTTP GET | 100 | alpha, beta, cohumulone, total oil, humulene, farnesene, linalool | per record, `last_changed` |
| `barthhaas-variety` | `https://www.barthhaas.com/hops-and-products/hops/<slug>` | HTML, one page per variety | portfolio | alpha, beta, total oil, all four fractions | "medium range of the last 4 years" |
| `crosby-variety` | `https://www.crosbyhops.com/hops/varieties/<slug>` (index at `/hops/varieties/`) | HTML, one page per variety | 56 listed | alpha, beta, total oil (unit stated), co-humulone, myrcene, caryophyllene, farnesene, humulene on some | unstated |
| `haas-sheet` | `https://hops.com.au/downloads/data-sheet/america/<Variety>-Data-Sheet.pdf`, 25 documents | PDF, label/value pairs | 22 of 25 carry all eight | alpha, beta, co-humulone, total oil, all four fractions, linalool, polyphenols | unstated |
| `barthhaas-sheet` | `https://hops.com.au/downloads/data-sheet/europe/<Variety>-Data-Sheet.pdf`, 15 documents | PDF, label/value pairs | 15 | alpha, beta, total oil, myrcene, linalool | unstated |
| `hpa-catalogue` | `https://hops.com.au/downloads/products/HPA-Product-Catalogue.pdf` | PDF, table plus 3 full blocks | Australian portfolio | summary: alpha, total oil (mL/100 g); 3 blocks carry composition | unstated |
| `nzhops-products` | `https://nzhops.co.nz/collections/new-zealand-hops/products.json` | Shopify JSON | 20 | alpha range, stated in prose as `(10 – 13 % AA)` | per variant, crop year |
| `hopslist` | `https://www.hopslist.com/hops/<category>/<slug>/`, 268 pages | HTML | 268 | all ten | ~2016; **aggregator** |
| `usda-cultivars` | `https://www.ars.usda.gov/pacific-west-area/corvallis-or/forage-seed-and-cereal-research-unit/people/john-henning/cultindex/` | HTML, one page per accession | ~230 | identity and pedigree **only** | 2007 |
| `british-hops` | `https://www.britishhops.org.uk/varieties/` | HTML | 34 | alpha range | current |
| `ych-variety` | `https://www.yakimachief.com/variety/<slug>` | **blocked** | — | — | — |

Two deliberate splits. The HPA sheet library is **two sources, not one**:
`haas-sheet` and `barthhaas-sheet` are different templates with different field
sets, and the provenance has to say whose sheet a number came from. The HPA
catalogue is a third, because its summary table covers the whole Australian
portfolio while only three of its blocks carry composition.

`hopslist` is the **aggregator** tier (§6.1). `usda-cultivars` is identity only:
the cultivar pages carry accession, selection, pedigree, origin and the
registration references, and no chemistry — Cascade's page cites the 1972 Crop
Science registration rather than reproducing it.

Pinned at the time of writing:

```
HGA_VS_2020.pdf                                d6007cd0b90b9d3a8baf9f9e94ab061c76e141c82494d2c4016757f077253365
USAHops_VarietySnapshot_2017_SinglePage.pdf    88e1523a549b42821b3643b4e209c4dbfadae574e36a2667f1069c05a95fc1fc
hopsteiner variety-filter payload              e79fa170fc0a460e205596da95269ab6a22514d330363f1696908b7d1ba5d25f
```


### 4.1 Access notes the probe must encode

**`hopsteiner-vf` needs a `Referer`.** Without one the endpoint returns `200` with
a zero-byte body, which reads as success to a naive client. With
`Referer: https://hopsteiner.us/variety-data-sheets/` it returns 143,639 bytes of
`text/javascript` defining `_vf` on the page's `window`. Parse it by
brace-matching the `_vf = { … }` literal and shimming `$()` as the identity
function; do not execute the page's other scripts. The object is
`{ alpha_low, alpha_high, regions, aromas, varieties }`, one entry per variety.

**`ych-variety` is gated.** Every path returns `429` with a Vercel Security
Checkpoint, including `robots.txt`. The site delivers its data through Next.js
flight data (`__next_f` pushes), which is unstable across deploys even when
reachable. YCH is therefore out of the probe. The legitimate substitute is now a
real one rather than a fallback: HPA distributes the **John I. Haas** variety
sheets at `haas-sheet`, first party and with stated denominators. The coverage
table is complete without YCH (see §4.2).

**`crosby-variety` is the tidiest of the HTML sources.** Units are stated inline
(`Total Oils 0.7-1.4 ml/100g`), open bounds appear as prose (`Up to 2.8 ml/100g`
for Citra), and values are published **per product form on the same page** — a
T-90 block and a CGX block — which reinforces the form separation in §7 rather
than complicating it. Two wrinkles: humulene is present on some varieties and
absent on others (present for Citra, Azacca, Belma, Cashmere, Centennial;
absent for Cascade, Amarillo, Chinook in the sample), and the slugs are not
always the variety name (`czsaaz`, `hallertaublanc`), so a guessed slug 404s.

**The HPA sheet library is the best-documented source in the set.** Each sheet is
a label/value document, not a table: `Alpha (%)`, `Beta (%)`, `Cohumulone (% of
Alpha Acids)`, `Total Oil (ml/100g)`, `Myrcene (% of Total Oil)`, and so on, with
the America sheets carrying all eight attributes in 22 of 25 cases and the Europe
sheets carrying four. The two BarthHaas sheets and the `barthhaas-variety` pages
state the same methods note (conductometric titration EBC 7.4 in Europe,
spectrophotometry ASBC Hops-6 in the USA; oil composition by gas chromatography
ASBC Hops-17 / EBC 7.12), so the basis is documented rather than inferred.
`Farnesene (% of Total Oil)  <1` is another open bound.

**`nzhops-products` is JSON or nothing.** The HTML collection and product pages
return `429` behind Shopify's bot protection; the `products.json` endpoint
returns the full catalogue. Twenty products, an alpha range inside the prose
(`(10 – 13 % AA)`) and no beta, co-humulone or oil data at all. The variants
carry **crop year** (2019, 2020), which is the first source to expose vintage as
a product dimension rather than a note.

**`hopslist` is an aggregator, and the record says so.** 268 pages, all ten
attributes, values mixed between points and ranges, page dates around 2016, and a
References block pointing at hopunion, nzhops and ychhops URLs that are largely
dead. It is a secondary compilation: it fills a field only when no vendor or
breeder publishes it, it never contributes to a mean (§6.1), and it is recorded
with `basis: aggregator`.

**Identity sources do not measure.** `usda-cultivars` gives 230-odd names with
accession, pedigree and registration references — that is where the tail
(`Cekin`, `Dunav`, `Vojvodina`, `Zlatan`, `Bullion 10A`) is identified — but no
chemistry. `british-hops` gives an alpha range for 34 British varieties. Neither
may contribute a number to a field another source already publishes.

**A dead page is cited through the archive.** Several varieties in the tail are
documented only on pages that no longer resolve (old Hopsteiner PDF directories,
YCH's 2013 variety PDFs, past nzhops variety pages). A web.archive.org snapshot
is an acceptable citation, recorded with `archived: true` and the snapshot date,
and the field is otherwise treated as published.

**PDFs are table-only.** `pdftotext -layout` captures both the table and the
surrounding brochure. The 2017 sheet contradicts itself: its Cascade highlight box
says 5.5–8.5 % alpha while its own table says 4.5–7.0 %. Extract from the table
region and cite the page.

**Units are per field, per vendor — never per source.** Hopsteiner reports
Cascade `humulen: "0.32"` (a fraction) beside `farnesen: "4.00 - 8.00"` (a
percent) in the same record. BarthHaas literally labels composition
`(% OF TOTAL OIL)`. USA Hops footnotes `* OILS = ML/100G`. Hopsteiner's `oils`
carries no unit on the page and must be resolved against their data sheet legend
before it is normalised; the other three are mL/100 g.

**Vintage is per record where the source offers one.** Hopsteiner's `last_changed`
spans 2020-01-09 to 2026-03-12, so the endpoint is maintained unevenly: Cascade
is a 2020 record. BarthHaas states its figures are a four-year medium range, so
its "range" is already an average. Both are recorded as they are, never silently
re-dated.

### 4.2 Coverage measured before the sweep

| Attribute | HGA 2020 | HGA 2017 | Hopsteiner | BarthHaas | Crosby |
|---|---|---|---|---|---|
| Alpha min/max | ✅ | ✅ | ✅ 97/100 | ✅ | ✅ |
| Beta min/max | ✅ | ✅ | ✅ 97/100 | ✅ | ✅ |
| Total oil | ✅ mL/100 g | ✅ mL/100 g | ✅ 100/100, unit open | ✅ mL/100 g | ✅ mL/100 g |
| Co-humulone | ✅ | ✅ | ✅ 100/100 | ✗ | ✅ |
| Myrcene | ✗ | ✗ | ✗ | ✅ | ✅ |
| Humulene | ✗ | ✗ | ✅ 81/100 | ✅ | partial, per variety |
| Caryophyllene | ✗ | ✗ | ✗ | ✅ | ✅ |
| Farnesene | ✗ | ✗ | ✅ 79/100 | ✅ | ✅ |

Two consequences. The set is obtainable, but **no single source covers it for
every variety**: BarthHaas publishes no co-humulone, Hopsteiner publishes no
myrcene and no caryophyllene, and Crosby's humulene is per-variety. Per-field
precedence is therefore a requirement, not a refinement.

### 4.3 The southern hemisphere and the tail

The pilot's ten varieties are all northern-hemisphere or HBC. Checked against the
current four sources, half the southern catalogue has no coverage at all:

```
Enigma, Topaz, Superdelic, Luna, Nectaron, Wakatu, Kohatu, Taiheke,
Pacifica, Pacific Gem, Pacific Jade, Green Bullet, Dr Rudi, Southern Cross
```

and the ones that are covered are covered once — Galaxy, Eclipse, Vic Secret,
Pacific Sunrise, Vista and Krush by Crosby only; Ella, Pride of Ringwood and
Summer by Hopsteiner only — which under the n ≥ 3 rule means no synthesis, ever.

The new sources close it:

| Added source | Varieties | Attributes it brings |
|---|---|---|
| `haas-sheet` | 25 (22 with all eight) | full composition for the HBC catalogue: Citra, Mosaic, Simcoe, Sabro, Strata, Talus, Krush, Idaho 7, HBC 472/522/1134, Ekuanot, Cashmere, Azacca, Bru-1, Dolcita, Nugget, Warrior, Willamette, El Dorado, Amarillo, Cascade, Centennial, Chinook, Columbus |
| `barthhaas-sheet` | 15 | alpha, beta, total oil, myrcene for the European portfolio, from the same publisher as `barthhaas-variety` |
| `hpa-catalogue` | Australian portfolio | alpha and total oil for every HPA variety; composition for three |
| `nzhops-products` | 20 | alpha range plus the crop-year structure |
| `hopslist` | 268 | all ten, as the aggregator tier, reaching landraces (`Cekin`, `Dunav`, `Vojvodina`, `Zlatan`) |
| `usda-cultivars` | ~230 | identity and pedigree only |
| `british-hops` | 34 | alpha range |

Counted from the documents rather than parsed: the 41 HPA sheets split 22 all
eight fields, 4 with seven, 1 with five, 12 with four, and 2 with three. The
working assumption for `hopslist` is all ten on every page, verified on one page
and to be confirmed in the sweep.

The coverage ceiling moves accordingly. The vendor union covered roughly 220–300
of the 401 current ids; adding the HBC sheets, the Australian and New Zealand
portfolios and the aggregator tier is what makes the 300-plus end plausible.


## 5. Precedence

Order is global; the election is **per field, per variety**, because the breeder
differs by variety.

```
1. HGA, newest vintage (2020)      industry-wide survey
2. HGA, older vintage (2017)       fills absences only
3. Breeder                         AU: HPA. NZ: NZ Hops. US: John I. Haas / USDA.
                                   DE-CZ: BarthHaas, Hopsteiner, Hüll. UK: British Hops.
                                   SI: Slovenian Institute of Hop Research.
4. Widest merchant coverage        Crosby (US), BarthHaas/Hopsteiner (DE-CZ)
5. hopslist                        aggregator; fills only, never a contributor
```

The breeder tier is no longer a placeholder: the AU and NZ cells are named, and
the US cell now has a first-party sheet through HPA rather than only the gated
YCH site. The authoritative breeder map is still a downstream deliverable — the
probe records `origin` and the candidate programme per variety and marks the ones
it cannot name — but the ladder is executable for the major portfolios without
one.

## 6. Synthesis rules

The objective is a synthetic record for as many varieties as possible, with a
range wherever a range can be defended. These rules make the synthesis
deterministic and auditable; they are the part of the design the verdicts must
support, not a licence to blend.

| Source count | Rule | Recorded as |
|---|---|---|
| n = 1 | `precedence` — as published | `merge: precedence`, `sources_count: 1` |
| n = 2 | `precedence`; the second source becomes a ledger entry | `merge: precedence`, `sources_count: 2` |
| n ≥ 3 | `mean_range`: mean of the minimums, mean of the maximums | `merge: mean_range`, `sources_count: n`, `dispersion` |

`mean_range` requires **three** sources. With two, a mean manufactures a range
neither source states and there is no way to distinguish disagreement from
error. The motivating case: Adeena myrcene is `27.3 – 29.4 %` at Crosby and
`19.4 – 55 %` at BarthHaas; the mean-of-bounds is `23.4 – 42.2 %`, which is
wider than one source and narrower than neither. Two sources go in the ledger,
not through the blender.

The **union envelope** (min of minimums, max of maximums) is always computed and
always recorded in the ledger. It is not the published value, because it grows
with source count and is therefore not comparable across varieties.

Other rules:

- **Normalise before deriving.** Fraction → percent is exact. mL/100 g is not
  converted to a percentage without a stated density, so it stays its own field.
- **Never average across form or vintage.** A 2022 lupulin figure and a 2026
  T-90 figure are different measurements. Same for a stated crop year and a
  four-year medium range; a blend is permitted only when flagged (`vintages`).
- **Absence is not zero.** A field with no published value is omitted. It is not
  imputed and not filled from another form.
- **Every synthetic value says so.** `merge`, `sources_count` and `dispersion`
  travel with the value, so a consumer can tell four agreeing vendors from one
  stale page, and the UI can mark a derived figure the way priors and
  conversions are already marked.
- **An archived citation counts as published.** When the live page is gone, the
  web.archive.org snapshot supplies the value, recorded with `archived: true`
  and the snapshot date. It ranks in the ladder as the live source would have.

### 6.1 The aggregator tier

`hopslist` is a secondary compilation: 268 varieties with all ten attributes,
page dates around 2016, mixed points and ranges, and references that have mostly
rotted. It is worth having because it is the only thing that names and measures
the landrace tail, and worth distrusting for the same reason.

So it does not enter the blend:

- it **fills** a field only when no vendor, breeder or survey publishes that
  field for that variety;
- it **never** contributes to `mean_range`, and its `sources_count` is recorded
  separately as `aggregator_fills`;
- a record whose value comes only from it carries `basis: aggregator`, and the
  verdict table marks the field `in (aggregator)`, so a reader can see that the
  number is second hand;
- it never outranks a source at any tier above it, even when its value is closer
  to the consensus — this is a provenance rule, not a statistical one.

## 7. Form spaces

| Form | Sources | n | Attributes obtainable |
|---|---|---|---|
| variety (cone / T-90) | HGA ×2, Hopsteiner, BarthHaas, Crosby, the HPA sheet pair, the HPA catalogue, NZ Hops, `hopslist` (fill only) | 1–8 | up to 10 |
| lupulin pellet | YCH Cryo 2022 only | 1 | alpha min/max, total oil mL/100 g |
| flowable extract | five curated lines (CO₂, Hop Shot, Flex, DynaBoost, Incognito) | — | no per-variety sheet; no synthesis |

The southern-hemisphere varieties are **not** a separate form or portfolio
space — they are more varieties in the same one, with the ladder choosing HPA or
NZ Hops at the breeder tier.

Forms are separate records, so the form filter cannot be forgotten: a lupulin
value can never leak into a variety field. This also settles the total-oil split
— `total_oil_ml_per_100g` is the lupulin convention and the HGA/BarthHaas
convention, and `total_oil_pct` exists only if a source states a percentage.

**Per-form oil is a gap, and the dosing feature needs it.** A gram of lupulin
concentrate carries roughly twice the oil of a gram of T-90, and the `hop_product`
rows carry alpha only. The YCH Cryo sheet publishes oils per variety and the HPA
sheets are per-form documents, so it is obtainable — but until it is captured, an
oil dose computed from a variety's oil figure is only correct for T-90.

**Lupomax is to be dropped**, leaving lupulin as one line (YCH Cryo 2022, 26
varieties). That is a separate change and this plan does not execute it: it
removes 16 rows from `data/sources/hop-products.json`, 16 from the seed, the
§4.2/§4.3 tables and the "2025 wins on disagreement" sentence in
`docs/hops/hop-products.md`, the expectations in `hop-product-tables`, and the
manifest entry. Recording it here so it is not lost.

## 8. Protocol

**Pilot — ten varieties, all sources.** Cascade, Citra, Mosaic, Simcoe, Amarillo,
Centennial, Chinook, Saaz, Magnum, Hallertau Mittelfrüh. Chosen for two US and two
continental programmes, high and low alpha, and one variety (Saaz) whose name
transliterates. The pilot's job is to break the parsers and the identity matching
before the sweep, and to fix each vendor's unit conventions in writing.

**Sweep.** All rows from each source, parsed as printed. One observation per
(source, variety, field) carrying `stated_value`, `stated_unit`, `stated_basis`,
`value_kind`, `page` or field label, and the source's own vintage claim.

**Second pass over the added sources — done.** The pilot ten plus the southern
ten (Galaxy, Vic Secret, Enigma, Eclipse, Superdelic, Nelson Sauvin, Motueka,
Riwaka, Nectaron, Pacific Jade) against all eleven sources: 432 observations.
The HPA sheets parse as label/value, the Haas template returns seven attributes
and the BarthHaas template four, and the NZ catalogue supplies alpha only. Two
identity bugs surfaced and are fixed in the probe: `™` decomposes to `TM` under
NFKD and broke every trademarked name, and `hopslist` disambiguates origin in the
title (`Cascade (US)`, `Cascade (Australia)`), so a plain lookup silently dropped
the variety.

**Identity.** Match by name and the existing `synonym` field (`ADHA-1940`,
`HBC 394`, …). Target ≥95 % resolve against the vendor-covered core; publish the
unmatched list, which is the tail that will never resolve. Source slugs are not
names — Crosby serves `czsaaz` and `hallertaublanc`, and a guessed slug 404s — so
the probe resolves through the index page, never by constructing a URL.
`usda-cultivars` supplies the name and pedigree for the tail even where no source
measures it, so the unmatched list distinguishes *unknown variety* from *known
variety with no published figure*.

**Verdicts.** For each attribute: `in` (≥2 sources, ≥20 varieties, one
normalisable basis), `in (aggregator)` (obtainable only through `hopslist`),
`document only` (passes coverage but not the basis test), or `blocked` (no
obtainable source). Coverage ceiling is reported as a number, not a promise: the
original four vendors reached roughly 220–300 of the 401 current ids, and the HBC
sheets, the Australian and New Zealand portfolios and the aggregator tier are
what make the 300-plus end plausible. The remainder is identity-only.

## 9. Outputs

| Output | Contents | Committed |
|---|---|---|
| `docs/hops/vendor-fact-envelope.md` | coverage matrix, per-field verdicts, per-vendor parser notes, disagreement ledger, excluded-attributes appendix, measured ceiling | yes — this is the living artefact |
| `tests/conformance/fixtures/hop-facts/pilot-sample.json` | the ten pilot varieties against the original five sources, each observation carrying the value **as printed** and the **normalised** result | yes, as a fixture |
| `tests/conformance/fixtures/hop-facts/expanded-sample.json` | the pilot ten plus the southern ten against all eleven sources — the second pass | yes, as a fixture |
| `tests/guards/hop-facts-pilot.test.js` | shape and validity of the fixture only | yes |
| `scripts/scrape/probe_vendor_facts.py` | the probe | yes, deleted on completion |
| extracted rows for the full sweep | the measurement | no — ephemeral |

### 9.1 The fixture is a fixture, not a source

The pilot sample is vendored so the matrix stays checkable once the probe is
deleted, and so the production scrape has a golden sample to regress against. It
is **not** an ingredient catalogue: it lives under `tests/conformance/fixtures/`,
it never appears in `sources/manifest.json`, and no seed builder reads it. A
vendored source is rebuild input; this is a contract artefact.

Each observation carries both halves of the measurement:

```
stated_value:  "0.32"          stated_unit:  "fraction"   stated_basis: "of total oil"
normalised:     0.32            value_kind:   "point"      source_label: "HUMULENE"
stated_value:  "4.00 - 8.00"   stated_unit:  "percent"    stated_basis: "of total oil"
normalised:    [0.04, 0.08]     value_kind:   "range"      source_label: "FARNESEN"
```

Stated-then-normalised is the point: it turns the mixed-convention trap into a
regression test, so the normaliser is pinned by evidence rather than by a note in
prose. A fixture of pre-normalised numbers would test the parser and nothing
else.

The probe script is committed so the matrix is reproducible from repo history,
then deleted, the way the yvh scraper and its guard were removed when the
collapse landed. The extracted rows are not committed because they are the
production scrape's output, not the test's.

The living doc will need a `<!-- claims: proposed … -->` declaration for the
field names it proposes, because `docs-claims` requires every backticked dotted
token to resolve to something that exists.

## 10. Guard and gate

- `docs-claims` passes on the new doc.
- `hop-facts-pilot` asserts: every range has `min ≤ max`; normalised oil
  fractions sum to ≤ 1; co-humulone sits in a plausible band; every observation
  names a source, a unit and a basis; no lupulin or extract row appears in a
  variety field; every observation carries both a `stated_value` and a
  `normalised` result; and **no seed builder reaches the fixture** — the guard
  reads `scripts/build-*.mjs` and fails if any of them references
  `pilot-sample`, so the fixture cannot drift into becoming a source.
- `make check` and `make test` stay green. Nothing else changes, so a failure in
  `seed-rebuild`, `hop-product-tables` or `sources-manifest` means this plan
  touched something it said it would not.

Gate: matrix, verdicts and ledger exist; each verdict is defensible from the
numbers in the doc; the fixture is green.

## 11. Relationship to other documents

- `plans/assets-library.md` — **repo-internal, not a second repo.** Its §4.3 and
  §4.4 (source records, provenance sidecar, absence-is-not-zero, facts-not-prose)
  are adopted here as conventions. Its out-of-repo assets app, fragment/view/manifest
  split and layer-1/layer-2 migration are superseded: nothing being acquired is
  private, the product enumeration it was built around has collapsed to seven
  variants, and splitting would remove the rebuild-and-diff guarantee that makes
  the seeds auditable. Recording that supersession in `assets-library` is a
  follow-up, not an edit this plan makes. Its §9 pilot also predates the
  treatment collapse and needs a revision pass before anyone executes it.
- `docs/hops/hop-products.md` — the living product document, and the model for
  the doc this plan produces. Untouched here except by the separate Lupomax
  removal.
- `docs/hops/vendor-fact-envelope.md` — the living measurement record this plan
  produces; the pilot's coverage table and findings are already there, and the
  sources in §4 are added to it as they are probed. The index row in
  `docs/hops/README.md` landed with it.

## 12. Risks

- **YCH is gated.** Its substitute is now first party (`haas-sheet`), so the gap
  only bites where YCH publishes something the Haas sheets do not.
- **Unit ambiguity.** Hopsteiner's `oils` and Crosby's total oil have no stated
  unit; resolving them against databook legends is part of the sweep, and the
  verdict may split the attribute in two.
- **Mixed conventions inside one record.** Mitigated by per-field normalisation
  and the fraction-sum guard.
- **Two templates in one sheet library.** The HPA sheets are Haas-style (eight
  fields) or BarthHaas-style (four). A parser that assumes one will silently
  record a European sheet as having no co-humulone *value* rather than no
  co-humulone *field*. The field-presence count per sheet is recorded so the two
  cannot be confused.
- **Aggregator staleness.** `hopslist` is 2016-era with rotted references. It is
  quarantined to fills (§6.1), but a fill is still a published value to a reader,
  so the verdict marks it.
- **`nzhops-products` is JSON-only.** The HTML 429s; a future probe that tries the
  page will look like a blocked source rather than a malformed request.
- **Precedence needs a breeder map.** Deferred; the probe measures how much the
  rule matters before anyone builds it.
- **Compounding averages.** BarthHaas's four-year medium range means `mean_range`
  over three such sources averages averages. Acceptable if documented; not
  acceptable to present as a measurement of a single crop.
- **Per-form oil is unwritten.** The dosing feature consumes oil per form; the
  product rows carry alpha only. Either the sweep captures oils on the product
  kind too, or the dose calculation is restricted to T-90 and says so.
- **Unit conversion is a model constant.** mL/100 g to mg/L needs a density that
  no source publishes. It belongs in the whirlpool model, and inventing it in the
  seed would make a fact out of an assumption.
- **Coverage expectation.** ~300 of 401 is the realistic ceiling, and the tail
  that remains is identity-only. A plan that promises all 401 will fail.

## 13. Open decisions

1. Total oil: one field in mL/100 g with the percentage convention documented, or
   two fields. Recommendation: two only if a source states a percentage
   explicitly; otherwise one field.
2. Inclusion threshold: proposed ≥2 sources **and** ≥20 varieties **and** one
   normalisable basis. Adjust before the verdicts are written, not after.
3. Crosby's CGX block is a second concentrate line alongside YCH Cryo. Out of
   scope here, since §7 fixes lupulin to the YCH Cryo sheet; recording it because
   the data is already on the page if the form space ever widens.
4. Whether the long-term home of the matrix is `docs/hops/` or an appendix in the
   archived plan. Recommendation: `docs/hops/`, since the parser notes outlive
   the verdicts.
5. Whether an aggregator-filled field is displayable at all, or recorded and
   hidden. Recommendation: displayable with the existing `~` marking, since a
   second-hand number that says it is second hand is better than a blank.

### 13.1 Decided while scoping the southern hemisphere

- **The HPA sheet library is two sources**, `haas-sheet` and `barthhaas-sheet`,
  because the templates carry different field sets and provenance must say whose
  sheet a number came from. They are not one `hpa-sheets`.
- **`hopslist` is the aggregator tier**, not a vendor: fills only, never blends.
- **Southern-hemisphere varieties are more varieties in the existing space**, not
  a new form or portfolio dimension.
- **The breeder tier is named**: HPA (AU), NZ Hops (NZ), John I. Haas / USDA (US),
  BarthHaas / Hopsteiner / Hüll (DE–CZ), British Hops (UK), Slovenian Institute
  (SI).
- **Linalool joins the closed set**, taking it to eleven, because both future
  features dose by oil and linalool is the fraction most associated with
  whirlpool aroma impact. Every composition source already publishes it, so the
  cost is a label in parsers we already run. Geraniol and the
  humulene/caryophyllene ratio stay document-only candidates.
- **Hop storage index stays out**: no source publishes it, so it is a model
  constant for the retention work, not a fact to scrape.

## 14. Execution checklist

- [x] Write the probe: `scripts/scrape/probe_vendor_facts.py`, one parser per
      source, `OUT=` path override.
- [x] Run the pilot over the ten varieties against the original five sources.
- [x] Add the pilot fixture and the `hop-facts-pilot` guard.
- [x] Write the living doc and add the index row to `docs/hops/README.md`.
- [ ] Add a `TODO.md` line pointing here.
- [x] Add the `haas-sheet` and `barthhaas-sheet` parsers; the template difference
      shows up as field presence per sheet.
- [x] Add the `hpa-catalogue` summary-table parser for the Australian portfolio.
- [x] Add the `nzhops-products` parser over the JSON endpoint, including crop year.
- [x] Add the `hopslist` parser, marked aggregator in every observation.
- [x] Add `usda-cultivars` identity resolution for the tail; no measurements.
- [x] Run the second pass: the pilot ten against the added sources, plus the
      southern ten.
- [ ] Capture linalool in the probe: the Haas and BarthHaas sheet labels, the
      Hopsteiner `linalool_oil`, and the HPA full blocks; re-run the second pass.
- [ ] Decide whether the sweep also captures oils on the `hop_product` kind, so a
      dose is correct for lupulin as well as T-90.
- [ ] Resolve the two unstated oil units against the vendors' own legends.
- [ ] Run the sweep; record observations as printed.
- [ ] Write the coverage matrix and the per-field verdicts, including
      `in (aggregator)`.
- [ ] Write the disagreement ledger, with the union envelope beside each
      synthesised value.
- [ ] Write the excluded-attributes appendix and the measured ceiling.
- [ ] Run `make check` and `make test`.
- [ ] Delete the probe; record the deletion in the plan.
- [ ] Archive this plan when the matrix lands.
