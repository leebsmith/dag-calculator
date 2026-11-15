# Vendor fact envelope

Status: **pilot complete, sweep pending.** This is the living measurement record
for `plans/vendor-fact-envelope.md`. It says what the vendors actually publish,
in what unit, for how many varieties. It does not change the artifact, the seeds
or the frontend, and nothing here is a value the app consumes yet.

The plan fixes a closed set of ten attributes. The question this page answers is
whether that set is obtainable, and where.

## 1. The ten attributes

| Attribute | Denominator | Bound kinds observed |
|---|---|---|
| alpha | of hop mass | range, `up to` |
| beta | of hop mass | range, `up to` |
| total oil | mL/100 g, or unstated | range, `up to` |
| co-humulone | of alpha acids | range |
| myrcene | of total oil | range |
| humulene | of total oil | range, fraction |
| caryophyllene | of total oil | range |
| farnesene | of total oil | range, fraction |

Ten attributes, eight rows: alpha and beta are min/max pairs. The denominator is
part of the meaning and travels in the field name, because the artifact's
`percentage` dimension carries a unit and says nothing about what is counted.

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

## 6. Deliberately excluded

Hard resins, polyphenols, xanthohumol, linalool, geraniol, ketones, isobutyrates,
hop storage index, genetic origin, yield, maturity, disease ratings, acreage,
aroma descriptors and narrative descriptions. Most are published and cheap to
take; none is consumed, so none is in scope. The list is here so a later reader
knows the set was chosen rather than exhausted.

## 7. What the sweep still owes

- The remaining ~45 Crosby pages, the whole Hopsteiner payload, and every HGA
  row, not just the pilot ten.
- The Hopsteiner total-oil legend, so 4.5 resolves one way or the other.
- Per-field verdicts: in, document only, or blocked, against the threshold.
- The measured coverage ceiling across the 401 current hop ids.
- The disagreement ledger at variety scale, with the union envelope beside each
  synthesised value.
