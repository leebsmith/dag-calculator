# Vendor fact envelope

Status: **sweep complete; verdicts recorded.** This is the living measurement record
for `plans/archive/2026-11/vendor-fact-envelope.md`. It says what the vendors actually publish,
in what unit, for how many varieties. It does not change the artifact, the seeds
or the frontend, and nothing here is a value the app consumes yet.

The plan fixes a closed set of ten attributes. The question this page answers is
whether that set is obtainable, and where.

## 1. The attributes

| Attribute | Denominator | Bound kinds observed |
|---|---|---|
| total oil | mL/100 g, or unstated | range, `up to` |
| myrcene | of total oil | range |
| humulene | of total oil | range, fraction |
| caryophyllene | of total oil | range |
| farnesene | of total oil | range, fraction |
| linalool | of total oil | range |
| alpha | of hop mass | range, `up to` |
| beta | of hop mass | range, `up to` |
| co-humulone | of alpha acids | range |

Eleven attributes in nine rows: alpha and beta are min/max pairs. The denominator
is part of the meaning and travels in the field name, because the artifact's
`percentage` dimension carries a unit and says nothing about what is counted.

The order is the consumers' order: the two features this feeds — layered
whirlpool mass ratios and whirlpool dosing by oil concentration — read oil first
and alpha on the bitterness side.

## 2. Sources reached

| Id | Document | Varieties | Reached how |
|---|---|---|---|
| `hga-2020` | USA Hops Variety Snapshot 2020 | ~56 listed | PDF, coordinate parse |
| `hga-2017` | USA Hops Variety Snapshot 2017 | ~66 listed | PDF, coordinate parse |
| `hopsteiner-vf` | variety data sheets, one payload | 100 | one GET, `Referer` required |
| `barthhaas-variety` | one page per variety | portfolio | HTML labels |
| `crosby-variety` | one page per variety | 55 listed | HTML labels |
| `ych-variety` | one page per variety | — | **gated**: 429 on every path |

Documents are not committed. The probe records each response's `sha256`, and the
pilot fixture carries the source ids so every number is traceable to a URL and a
hash. Pinned at the pilot run:

```
HGA_VS_2020.pdf                                d6007cd0…b253365
USAHops_VarietySnapshot_2017_SinglePage.pdf    88e1523a…a95fc1fc
hopsteiner payload                             e79fa170…ba5d25f
```

## 3. Pilot coverage

Ten varieties: Cascade, Citra, Mosaic, Simcoe, Amarillo, Centennial, Chinook,
Saaz, Magnum, Hallertau Mittelfrüh. Counts are varieties out of ten.

| Attribute | HGA 2020 | HGA 2017 | Hopsteiner | BarthHaas | Crosby |
|---|---|---|---|---|---|
| alpha | 9 | 9 | 7 | 6 | 10 |
| beta | 9 | 9 | 7 | 6 | 10 |
| total oil | 9 | 9 | 7 | 6 | 10 |
| co-humulone | 9 | 9 | 7 | 0 | 1 |
| myrcene | 0 | 0 | 0 | 6 | 7 |
| humulene | 0 | 0 | 7 | 6 | 4 |
| caryophyllene | 0 | 0 | 0 | 6 | 5 |
| farnesene | 0 | 0 | 7 | 5 | 2 |

Read the rows, not the totals: **no source covers the set for every variety**,
and the gaps are structural rather than incidental.

Linalool joined the set after this measurement, so it is absent from the table
rather than absent from the sources; its coverage is in §8.3.

## 4. Findings

### 4.1 Portfolio decides coverage, not field support

Hopsteiner lists 100 varieties and BarthHaas lists its own portfolio, but
neither carries the Hop Breeding Company varieties. Citra, Mosaic and Simcoe are
absent from both — so for the three most-used US aroma hops the vendor evidence
is Crosby plus the HGA snapshots only. Coverage is split by hemisphere and by
breeder, which is a different axis from the field split the plan anticipated.

### 4.2 Co-humulone is the thinnest field, not the richest

The plan expected Hopsteiner to be the only source. The pilot says HGA publishes
it for nine of ten, Hopsteiner for seven, BarthHaas for none, and Crosby for
exactly one — Cascade on the T-90 block. A field that looks universal in one
source is optional in another, so the verdict has to be per source, not per
attribute.

### 4.3 Hopsteiner mixes two conventions inside one record

Cascade: `humulen` is `0.32` — a fraction, 32 % of oil — beside `farnesen`
`4.00 - 8.00`, a percentage. Both fields were parsed with the unit inferred from
magnitude and flagged `unit_inferred`, because the source states neither. This is
why normalisation has to be per field per vendor, and why the fixture carries the
value as printed beside the normalised result.

### 4.4 Open bounds cannot enter a mean

BarthHaas writes `TOTAL OIL up to 1.4`, Crosby writes `Up to 2.8`, and BarthHaas
does the same for beta and for three of the four fractions. A mean of bounds is
undefined without imputing a floor, so a max-only observation is recorded as
`value_kind: max`, normalised as `[null, high]`, and excluded from a mean
contribution. It stays in the ledger.

### 4.5 One unit is still unresolved

Hopsteiner's `oils` prints `0.8 - 1.5` with no unit anywhere on the page, and its
magnitude matches the mL/100 g convention used by HGA, BarthHaas and Crosby. It
is recorded as `stated_unit: unstated` with `normalised: null` and takes no part
in synthesis until the datasheet legend is read. The probe refused to guess, and
the guard refuses a null normalised value that claims a unit.

### 4.6 The PDFs needed coordinates, not text order

A line-oriented parse of `pdftotext -layout` produced confidently wrong values:
the three-column table interleaves, so Cascade inherited Cashmere's alpha and a
co-humulone range was read as beta. The working extraction anchors on the
`VARIETY`, `COHUM`, `OILS*` and `AROMA` header coordinates and reads each column
by x-band, matching a variety name to the nearest alpha line within ten points.
The 2017 sheet also contradicts itself — its Cascade highlight box says 5.5–8.5 %
against a table value of 4.5–7.0 % — so extraction is table-only and the page is
recorded.

### 4.7 Identity is a naming problem, not a matching problem

Every source names varieties differently: `Saazer` (Hopsteiner), `czsaaz`
(Crosby), `SAAZ (US)` (HGA), `Saazer` (BarthHaas); `Hallertauer Magnum` for
Magnum; `Hallertauer Mittelfrueh` for Hallertau Mittelfrüh; a trailing `®` on
Amarillo, Mosaic, Simcoe and Citra. Resolution went through a normalised name
plus a small alias table; the probe never constructs a URL from a variety name,
because a guessed slug 404s.

### 4.8 YCH stays out

Every path on the vendor site returns a Vercel Security Checkpoint, including
`robots.txt`. The pilot does not attempt a challenge, and the coverage table is
complete without them. Their published sheets remain the legitimate substitute.

## 5. Worked example

Cascade, from the rules in the plan: a mean of bounds at three or more usable
sources, precedence below that, open bounds and unresolved units excluded.

| Attribute | Sources | Rule | Result |
|---|---|---|---|
| alpha | 5 | mean_range | 4.50–7.18 % |
| beta | 5 | mean_range | 4.74–7.04 % |
| total oil | 3 usable (BarthHaas max-only, Hopsteiner unit open) | mean_range | 0.70–1.40 mL/100 g |
| co-humulone | 4 | mean_range | 33–40 % |
| farnesene | 3 | mean_range | 3.53–7.40 % |
| myrcene | 2 | precedence | BarthHaas 19.4–55 % or Crosby 40–60 % |
| humulene | 2 | precedence | BarthHaas 10.9–22.1 % or Hopsteiner 0.32 |
| caryophyllene | 2 | precedence | BarthHaas 4.5–9 % or Crosby 3–6 % |

Every one of those two-source rows is a real disagreement, not noise: myrcene at
BarthHaas is nearly three times the span of Crosby's. Under the rules they go to
the ledger and one wins on precedence, which is why the precedence ladder matters
more than the arithmetic.

## 6. Sources added after the pilot

These were found while scoping the southern hemisphere. They are counted from
the documents, not yet parsed, so their numbers are coverage facts rather than
observations.

### 6.1 The HPA sheet library — the HBC gap closes

The HPA hop page links **41 per-variety data sheets** (25 America, 15 Europe, 1
Australia). Two templates, and the difference is structural:

| Template | Sheets | Fields |
|---|---|---|
| John I. Haas | 22 | alpha, beta, co-humulone (% of α), total oil (ml/100 g), myrcene, humulene, caryophyllene, farnesene, plus linalool and polyphenols |
| BarthHaas | 12 | alpha, beta, total oil, myrcene — no co-humulone |
| between | 5 | seven, five or three of the eight |

Citra, verbatim:

```
Alpha (%)                       11.0-13.0
Beta (%)                          3.5-4.5
Cohumulone (% of Alpha Acids)        22-24
Total Oil (ml/100g)                2.2-2.8
Myrcene (% of Total Oil)             60-65
Humulene (% of Total Oil)            11-13
Caryophyllene (% of Total Oil)        6-8
Farnesene (% of Total Oil)             <1
```

This is the first-party source for the Hop Breeding Company catalogue — Citra,
Mosaic, Simcoe, Sabro, Strata, Talus, Krush, Idaho 7, HBC 472/522/1134, Ekuanot,
Cashmere, Azacca, Bru-1, Dolcita, Nugget, Warrior, Willamette, El Dorado,
Amarillo, Cascade, Centennial, Chinook, Columbus — which neither Hopsteiner nor
BarthHaas lists. It also carries the same methods note as BarthHaas
(conductometric titration EBC 7.4 / spectrophotometry ASBC Hops-6; oil
composition by gas chromatography ASBC Hops-17, EBC 7.12).

The coverage table in §3 was measured before this source; the HBC varieties there
should be read as "absent from the European vendors" rather than "unobtainable".

### 6.2 New Zealand and Australian portfolios

nzhops.co.nz serves its catalogue as Shopify JSON (`products.json`); the HTML
429s behind bot protection. Twenty products, each with an alpha range inside the
prose (`(10 – 13 % AA)`), no beta, co-humulone or oil data, and variants that
carry **crop year** — the first source to expose vintage as a product dimension.

The HPA product catalogue adds the Australian summary table: variety, profile,
use, alpha range, and total oil in mL/100 g, with full composition for three
varieties.

### 6.3 The aggregator and the identity sources

hopslist.com publishes all ten attributes for 268 varieties, including the
landrace tail. It is ~2016-era, mixes points and ranges, and its references point
at dead URLs, so it is the **aggregator tier**: fills only, never blended.

`usda-cultivars` is the identity source for the tail — accession, pedigree,
origin and registration references for ~230 cultivars, with no chemistry.
`british-hops.org.uk` adds an alpha range for 34 British varieties.

### 6.4 The gap these close

Measured against the original five sources, half the southern catalogue had no
coverage at all:

```
Enigma, Topaz, Superdelic, Luna, Nectaron, Wakatu, Kohatu, Taiheke,
Pacifica, Pacific Gem, Pacific Jade, Green Bullet, Dr Rudi, Southern Cross
```

and the covered ones were covered exactly once — Galaxy, Eclipse, Vic Secret,
Pacific Sunrise, Vista and Krush by Crosby; Ella, Pride of Ringwood and Summer by
Hopsteiner — which under the n ≥ 3 rule meant no synthesis at all.

## 7. Deliberately excluded


Hard resins, polyphenols, xanthohumol, ketones, isobutyrates, genetic origin,
yield, maturity, disease ratings, acreage, aroma descriptors and narrative
descriptions. Most are published and cheap to take; none is consumed, so none is
in scope. The list is here so a later reader knows the set was chosen rather than
exhausted.

Two near-misses stay tracked as document-only candidates: geraniol (BarthHaas
only) and the humulene/caryophyllene ratio (HPA full blocks only, and derivable
from two fields already carried). Hop storage index is the one exclusion worth
naming: no source in this set publishes it, so it is a model constant for the
retention work rather than a scraped fact.

## 8. Second pilot: the added sources

Twenty varieties — the pilot ten plus Galaxy, Vic Secret, Enigma, Eclipse,
Superdelic, Nelson Sauvin, Motueka, Riwaka, Nectaron, Pacific Jade — against
eleven sources. **446 observations** in `expanded-sample.json`.

Varieties reached per source, out of twenty:

| Source | Varieties | Notes |
|---|---|---|
| `hopsteiner-vf` | 10 | the three NZ varieties, no Australian ones |
| `crosby-variety` | 10 | the pilot ten only |
| `barthhaas-variety` | 6 | European portfolio |
| `hga-2020` / `hga-2017` | 9 | US only |
| `haas-sheet` | 7 | US/HBC only |
| `barthhaas-sheet` | 3 | European only |
| `hpa-catalogue` | 10 | Australian plus the US varieties HPA distributes |
| `nzhops-products` | 5 | NZ only, alpha only |
| `hopslist` | 15 | broadest, aggregator tier |
| `usda-cultivars` | 3 identity | Cascade, Centennial, Chinook |

Attribute totals across the twenty: total oil 80, myrcene 38, humulene 41,
caryophyllene 32, farnesene 37, **linalool 14**, alpha 85, beta 69, co-humulone
50.

### 8.1 Southern coverage is real, and thin

| Variety | Sources |
|---|---|
| Nelson Sauvin, Motueka, Riwaka | 3 — Hopsteiner, NZ Hops, hopslist |
| Galaxy, Vic Secret | 2 — HPA catalogue, hopslist |
| Enigma, Eclipse | 1 — HPA catalogue |
| Superdelic, Nectaron | 1 — NZ Hops |
| Pacific Jade | 1 — hopslist |

So the gap is closed in the sense that nothing is invisible any more, but only
three southern varieties reach the n ≥ 3 rule, and only for alpha. The rest are
`precedence` records or single-source. That is the honest shape of it: the
southern hemisphere is covered, not saturated.

### 8.2 Two identity bugs the second pilot found

**`™` normalises to `TM`.** NFKD decomposes U+2122 into "TM" before the
non-alphanumeric strip, so `Vic Secret™` became `vic secret tm` and never
matched `Vic Secret`. `®` has no compatibility decomposition, so `Galaxy®` did
match — which is why the failure looked random. The fix is to strip `® ™ ©`
before normalising. Same trap will hit `Hüll Melon™` and any other trademarked
name.

**hopslist disambiguates origin in the title.** Its index holds `Cascade (US)`,
`Cascade (Australia)`, `Cascade (Argentina)` and `Cascade (New Zealand)`, and
packs sub-names into the title (`Amarillo™ VGXP01`). A plain `Cascade` lookup
returns nothing and the variety is silently dropped rather than reported
unmatched. The probe now prefers the `(US)` entry and records the alias, but the
general lesson is that a miss must be visible: the unmatched list is part of the
output, not a silent skip.

### 8.3 Linalool is published, and sparse

Fourteen observations across eleven varieties, from three sources: Hopsteiner
(10), BarthHaas sheets (3), one Haas sheet (1). The Haas template prints
`Linalool (% of Total Oil)` with an em dash for most varieties, which is data —
"not published for this variety" — and the parser correctly records nothing
rather than a zero.

That is the honest verdict input: linalool is in the set because the dosing
feature needs it, but it will not clear a coverage threshold on its own. It is
either a `document only` field or an aggregator fill, and whichever it becomes,
a dose calculation cannot assume it exists.

### 8.4 HPA and NZ Hops are the breeder tier, confirmed

`hpa-catalogue` parsed all six Australian rows with alpha and total oils, and the
sheets parsed cleanly as label/value — the Haas template returns seven attributes
per variety, the BarthHaas template four. `nzhops-products` returned five
varieties with alpha ranges and `crop_years` (2018–2021), which is the only
vintage structure in the whole set.

`usda-cultivars` resolved three of twenty by exact name. The index is a 157-entry
snapshot from 2007, so the miss rate is expected; it is identity debt, not a
parser bug, and it belongs with the alias table rather than the sweep.

## 9. The sweep

All 401 seed ids against the ten measuring sources plus the identity index:
**3,475 observations** after the alias fixes — the entity-decoding and apostrophe normalisation recovered six varieties, and two more ('Red Earth', 'Willow Creek') exist in the aggregator with every value blank.

| Source | Varieties |
|---|---|
| `hopslist` | 199 |
| `hopsteiner-vf` | 84 |
| `barthhaas-variety` | 81 |
| `hga-2020` | 51 |
| `hga-2017` | 48 |
| `crosby-variety` | 45 |
| `hpa-catalogue` | 27 |
| `haas-sheet` | 24 |
| `nzhops-products` | 16 |
| `barthhaas-sheet` | 9 |
| `usda-cultivars` | 76 identity, no measurement |

**256 of 401 varieties carry at least one measurement (64 %)**, 231 carry alpha
and total oil, and **74 carry all nine**. The vendor union was expected to reach
290–300; it reached 256. The shortfall is the alias ceiling — Crosby serves 55
pages, Hopsteiner 100, and the seed's 401 include 140 names no measuring source
lists.

### 9.1 Per-field verdicts

Threshold from the plan: at least two sources and twenty varieties on one
normalisable basis.

| Field | Observations | Varieties | ≥2 sources | ≥3 sources | Verdict |
|---|---|---|---|---|---|
| alpha | 580 | 254 | 124 | 89 | **in** |
| beta | 529 | 246 | 110 | 82 | **in** |
| total oil | 552 | 237 | 115 | 88 | **in** |
| co-humulone | 392 | 213 | 90 | 47 | **in** |
| humulene | 379 | 217 | 95 | 49 | **in** |
| farnesene | 340 | 198 | 88 | 42 | **in** |
| myrcene | 313 | 205 | 75 | 22 | **in** |
| caryophyllene | 287 | 198 | 65 | 16 | **in** |
| linalool | 103 | 95 | 8 | 0 | **document only** |

Eight of the nine rows clear the threshold. Linalool does not, and its shape is
what predicted it: published widely enough to exist for 95 varieties, but by a
single source for 87 of them, because the Haas sheets print an em dash where
BarthHaas prints a value.

### 9.2 A cell that prints its unit leaked the unit into the number

`hopslist` writes the unit inside the value cell — `1.1 mL/100g` — and the number
scanner read the `100` from the denominator as a measurement. Total oil came out
as `[1.1, 100]`, the midpoint of which is **50.6 mL/100 g**: 95 of 224 oil figures
were inflated by roughly 50, and a hop that carries 1.1 looked like it carried 50.

The parser now strips `ml/100g` and `mls/100 grams` before reading numbers, and
the source guard fails on any total-oil observation above 20 mL/100 g. The
running fix is the reason the shapes above are stated as "printed value" — the
unit belongs to the cell's metadata, never to its number.

### 9.3 A printed zero is not a measurement

61 observations state a hard zero, 60 of them from Hopsteiner. **18 of those
contradict a non-zero value from another source** for the same variety and
field:

```
Amarillo   humulene    hopsteiner 0.00        vs  haas-sheet 9–11 %
Chinook    farnesene   hopsteiner 0.00–1.00   vs  barthhaas  up to 6.2 %
Aramis     humulene    hopsteiner 0.00        vs  hopslist   21 %
```

A single source reporting `0.00` where another reports a substantial fraction is
a placeholder, not a measurement — the payload has a field and no value. The rule
that follows: **a hard zero contradicted by a non-zero is excluded from
synthesis and recorded in the ledger**; a hard zero that no one contradicts is
kept as a point. This is the same principle as "absence is not zero", applied to
a source that spells absence as a number.

### 9.4 The ledger

The union envelope and the source values for every field are computed; the
standing disagreements worth naming:

- **Cascade myrcene** — BarthHaas 19.4–55 %, Crosby 40–60 %: a 2.7× span
  difference on the same variety.
- **Amarillo humulene** — 0.00 at Hopsteiner against 9–11 % at the Haas sheet.
- **Cascade farnesene** — 4.00–8.00, 3–7, 3.6–7.2 depending on source, which is
  agreement in shape and disagreement in level.

Where the spread is this wide and the sources are at n = 2, §6 puts the value on
`precedence` and the disagreement in the ledger. That is the designed outcome,
not a failure: a range neither source published is worse than one of them.

## 10. What remains

- The Hopsteiner total-oil legend, so its `oils` unit stops being `unstated` —
  the last unresolved unit in the set.
- An alias table for the ~140 unmatched names, so the ceiling can be raised
  without another sweep. The misses are structural rather than mysterious:
  Crosby and BarthHaas serve fewer varieties than the seed carries.
- The hard-zero rule implemented in the synthesis, not only recorded here: a
  zero contradicted by another source is excluded, a zero nobody contradicts is
  a point.
- The verdicts turned into the artifact and seed change — a separate plan, since
  it moves `alpha_acid_pct` semantics and every IBU in the app.
- The probe deleted when this plan archives.
