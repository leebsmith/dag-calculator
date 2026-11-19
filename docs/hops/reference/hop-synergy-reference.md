# Hop synergy, chemometric screening, and data provenance

Background reference, supplied 2026-11-19 as the input brief for an external
notebook. Reproduced here so the reasoning behind the hop-allocation and
tie-break decisions stays auditable; **not maintained**, and no code reads it.
Where this page and `data/artifact.json` disagree, the artifact wins.

## 1. Purpose and scope

Consolidates the chemical, sensory, mathematical and data-engineering frameworks
used for analysing hop synergies, for ab initio hop-pairing discovery, for merging
multi-vendor oil datasets, and for wiring terpene-alcohol metrics into brewing
calculations.

## 2. Three mechanisms of hop synergy

Synergy is an umbrella term, not one physical effect. Three mechanisms:

### 2.1 Supra-additive cross-class amplification

Perceived intensity exceeding the linear combination of individual Odor Activity
Values (`OAV = concentration / perception threshold`), prominent across three
interacting classes:

1. **Monoterpene alcohols.** Linalool (low threshold, floral/citrus); geraniol
   (rose, muted alone, supra-additive with excess linalool); β-citronellol (lime,
   largely formed by yeast reduction of geraniol, likewise amplified by linalool).
2. **Polyfunctional thiols.** 4-MMP, 3-MH, 3-MHA — active at ng/L and below; trace
   amounts act as perceptual catalysts over a terpene and ester foundation.
3. **Branched-chain aliphatic esters.** Isobutyl isobutyrate, 2-methylbutyl
   isobutyrate, ethyl 2-methylbutyrate, ethyl hexanoate — apricot, peach,
   pineapple, melon; they shift perception from sharp citrus peel toward ripe
   stone and tropical fruit.

### 2.2 Orthogonal spectral partitioning

Two hops with near-identical volatile profiles compress sub-additively (receptor
saturation). Pairing across distinct volatility/solubility/class distributions
lets each occupy a perceptual band:

- **Base/structural:** sesquiterpenes (humulene, caryophyllene, farnesene,
  selinenes) and their oxidation products — woody, cedar, herbal, tea, spice.
- **Midrange:** oxygenated monoterpenoids (linalool, geraniol, nerol, citral) and
  esters — floral, orchard, melon, sweet fruit.
- **Top:** hydrocarbon monoterpenes (myrcene, β-pinene, limonene) and thiols —
  resinous pine, zest, tropical/cassis lift.

### 2.3 Intra-band micro-complementation ("chord voicing")

Even within one broad category, synergy can emerge when each hop supplies
different sub-components — peel terpenes, oxygenated aldehydes and alcohols,
sweet esters — that together reconstruct a fuller chord.

## 3. The L/G algebra

For hop *i* with mass `m_i`, total oil `O_tot,i`, linalool fraction `L_i` and
geraniol fraction `G_i`:

```
(L/G)_blend = Σ_i (m_i · O_tot,i · L_i) / Σ_i (m_i · O_tot,i · G_i)
```

With `w_i = m_i · O_tot,i · G_i` (geraniol oil-mass weight) and `r_i = L_i / G_i`:

```
(L/G)_blend = Σ_i (w_i / Σ_j w_j) · r_i
```

**Implications.**

1. **Interpolation, not extrapolation.** The weights are non-negative and sum to
   one, so the blend ratio is a convex combination:
   `min r_i ≤ (L/G)_blend ≤ max r_i`. A pair cannot exceed its higher member.
2. **Rescuing low-L/G precursors.** Pair a geraniol-dense, low-L/G hop with a
   linalool-rich, high-L/G hop to pull the blend into a balanced zone (about
   1.0–1.5) while still supplying both masses.
3. **Denominator dominance.** Because `w_i` includes `G_i`, a high-geraniol
   cultivar pulls the blend toward its own lower ratio unless the partner
   contributes enough oil mass to lift the weighted average.

## 4. Ab initio pairing pipeline

Cosine similarity and Euclidean distance on oil fractions find **substitutes**,
not synergies; maximising distance everywhere yields incoherent pairs. The
four-step framework:

**Step 1 — dose-weighted mass conversion.** Convert fractions to yields:
`y_i,k = O_tot,i × p_i,k`. When only a subset of constituents is measured,
define an unaccounted residual
`u_i = max(0, 1 − Σ_measured p_i,k)`, `y_i,U = O_tot,i × u_i` as a structured
proxy for un-tabulated volatile mass. Keep availability masks so missing is never
read as zero. Optionally log-compress: `x_i,k = ln(1 + w_k · y_i,k)`.
(Production calculators that hold a no-retention line report gross added mass and
do not invent transfer multipliers.)

**Step 2 — functional axes.** Hydrocarbon top-end (myrcene, β-pinene, limonene);
sesquiterpene base (H+C+F, and the H/C ratio); farnesene as a heritage marker;
terpene-alcohol balance (linalool, geraniol, L/G); and the unmodelled residual as
a proxy for minor constituents.

**Step 3 — composite objective.**

```
S(A,B,α) = λ1·Φ_cross + λ2·Φ_orth + λ3·Φ_hull − λ_nov·Φ_cliché
```

- `Φ_cross` rewards complementary chemical roles and penalises redundant
  over-concentration of harsh traits.
- `Φ_orth` is a **bandpass** on similarity — extreme similarity is clones, extreme
  dissimilarity is incoherence.
- `Φ_hull` is Shannon-entropy gain across axes versus the better member:
  gap-filling.
- `Φ_cliché` down-weights ubiquitous flagship pairings.

**Step 4 — ratio selection.** Scan α across mass splits (e.g. 0.05 steps over
0.15–0.85) for `α* = argmax S`, accounting for total-oil and
linalool/geraniol differences so one hop does not swamp the other.

## 5. Data architecture, provenance, merge rules

### 5.1 Schema and coverage

- Oil fractions stored as unit fractions in [0,1], not percentages.
- Total oil spans noble hops to concentrates (about 0.41–11.2 mL/100 g); mixing
  forms without accounting for total oil skews raw mass comparisons.
- Vendor coverage is asymmetric: some publish total oil and the four major
  hydrocarbons, some add linalool and geraniol, some omit geraniol or publish it
  only for a subset.
- Absent compounds stay absent; schema follows actual consumers.

### 5.2 None versus 0.0, and per-attribute provenance

- Distinguish unmeasured (null) from measured zero; treating a missing value as
  0.0 distorts averages, ratios and completeness counts.
- Provenance belongs per attribute (`*_provenance`), never one shared object:
  sharing clobbers the vendor, URL, source or bound of earlier fields.
- `bound: "max"` for "up to X" with range `[null, high]`; never fabricate a 0.0
  floor. When a max-bound value centres at the bound, keep `bound: "max"`.
- **Do not discount a max bound by a fixed factor** (e.g. ×0.5): no empirical
  basis, contradicts the stated bound, and distorts L/G asymmetrically.
- **Direction of a max-bound geraniol on L/G:** geraniol is the denominator, so a
  larger geraniol yields a *smaller* ratio — a max-bound geraniol makes the
  reported L/G a conservative **lower** bound, not an upper one.

### 5.3 Same-rank tie-breaking

Rank by source trust first, so a lower-trust source never overrides a higher one.
Within a rank, break ties on completeness and boundedness: prefer a point or a
two-sided range over a one-sided upper bound, and a readable value over an
unreadable one.

### 5.4 Calculator boundaries

- Compute gross added oil from mass, oil yield, form multiplier, density and
  volume.
- Hold the **no-retention** line: report oil added, never oil retained, and do not
  invent stage-retention constants inside that calculator.
- Component masses (mg/L) come from null-propagating multiplication
  (`oilChargeMgPerL × fraction`); build buckets across measured fractions plus the
  remainder; compute recipe L/G as an oil-mass-weighted ratio over additions that
  carry both fractions, and report priced/total counts so partial coverage is
  visible.

## 6. Case studies

### 6.1 Bravo + Loral

Rarely paired commercially — Bravo reads as a high-alpha bittering hop, Loral as a
noble-leaning aroma hop — but chemically they are structural counterparts: Bravo
carries high total oil, substantial geraniol and comparatively low linalool;
Loral carries high linalool relative to geraniol. Roughly 50–60 % Bravo /
40–50 % Loral brings the blend L/G into the 1.0–1.3 zone while supplying both
geraniol precursor and linalool lift. Weight Bravo toward cool whirlpool and
active fermentation (geraniol dissolution, β-citronellol biotransformation) and
Loral toward late/cold addition to preserve linalool.

### 6.2 L/G after the tie-break

Applying same-rank two-sided preference reshapes several cultivars without
changing coverage: **Galena** moved from a max-bound linalool (1.6 %, L/G ≈ 3.2)
to a two-sided centre (0.2 %, L/G ≈ 0.40), joining the geraniol-leaning group with
**Summit** (≈0.30), **Talus** (≈0.33) and **Cascade** (≈0.44). High-L/G linalool
donors include **Aurora** (≈13), **Monroe** (≈12), **Galaxy** (≈7.5), **Saaz**
(≈7) and **Comet** (≈4).

Asymmetric bridge pairs, avoiding the overused flagships:

1. **Galena + Aurora** — low-L/G geraniol structure against high-L/G linalool.
2. **Talus + Comet** — favouring a larger Comet share to reach about 1.0–1.5.
3. **Summit + Monroe** — wide contrast; Summit's geraniol mass calls for a large
   Monroe share.
4. **Cascade + Galaxy** — classic geraniol leaning against high-L/G tropical
   lift, without defaulting to Citra + Mosaic.
