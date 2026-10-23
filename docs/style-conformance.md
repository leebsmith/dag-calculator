# Style Conformance — Structural Adherence Assessor

This is the **as-built specification** of the style-conformance assessor. It is
a **structural audit only**: it measures how far a brew's realized vital
statistics drift from the picked style's envelope. It produces a Style Adherence
Index and a tiered drift status per dimension. It produces **no sensory score
and no medal tier** — those are judgments a paper audit of five numbers cannot
make, and are deliberately out of scope.

Computed in the frontend (`frontend/src/engine/styleConformance.js`) as a pure
function of the valuation; the result is frozen into the batch's freeze payload
so downstream presentation (the recipe document) reads it without recomputing.

## 1. Inputs

### 1.1 Realized vitals (node bindings)

| Dimension | Symbol | Node | Unit |
|---|---|---|---|
| Original gravity | OG | `solver.batch.sg_post_boil` | SG |
| Final gravity | FG | `batch.realized_fg` | SG |
| Alcohol by volume | ABV | `batch.realized_abv` | % |
| Bitterness | IBU | `batch.target_ibu` | IBU |
| Color | SRM | `grist.finished_beer_srm` | SRM |

IBU is the planned total bitterness; because the boil/whirlpool hop schedule is
dosed by IBU share, total realized IBU equals `batch.target_ibu` by construction.

### 1.2 Envelope

The style envelope is the ten `batch.style_*` roots (gravity in SG, ABV in %,
IBU in IBU, SRM in SRM): `og_min/max`, `fg_min/max`, `abv_min/max`,
`ibu_min/max`, `srm_min/max`. Each carries a `default` that reads the
corresponding `batch.style` field, so an untouched envelope inherits the selected
styleguide values, a hand-edited (set) envelope is an override, and an unset
envelope with no style has **no value** — conformance then skips the pillars it
cannot grade rather than scoring against zero bounds.

## 2. Realized FG and ABV

The realized gravity pair is materialized as derived nodes so the valuation, the
assessor, and the recipe document read one source.

```
OE  = sg_to_plato(OG)                      # ASBC Table 1 cubic
AE  = OE · (1 − AA),   AA = batch.apparent_attenuation
FG  = plato_to_sg(AE)                       # ASBC 3rd-order polynomial
ABV = (0.372 + 0.00357·OE)(OE − AE) · (FG / 0.7907)   # Cutaia, Reid & Speers 2009
```

`sg_to_plato`, `plato_to_sg`, and the Cutaia form are the engine's canonical
apparent-extract math (pinned frontend↔backend); `0.7907` is the ethanol density
at 20 °C.

## 3. Relational dimensions

Two implied dimensions catch recipes whose five vitals are individually in-range
but structurally off-archetype (cloying attenuation, astringent balance).

- **Apparent attenuation (AA)** — Plato-space `(OE − AE) / OE`. Its bounds are
  the exact minimum and maximum of AA over the feasible fermentation region
  (the `feasibleVertices` polygon; a linear-fractional function over a convex
  polygon attains its extrema at vertices).
- **Bitterness-to-gravity ratio (BU:GU)** — `IBU / (1000·(OG − 1))`. Its bounds
  are the exact IBU×OG rectangle ratio extrema in gravity-points space:
  `[ibu_min / (1000·(og_max − 1)), ibu_max / (1000·(og_min − 1))]`.

Neither uses a damped or corner-shrunk approximation.

## 4. Tolerance model and drift status

Each dimension has a just-noticeable-difference band `τ` in its native unit. The
excess beyond the violated boundary is normalized:

```
z = excess / τ      (0 when in range)
```

Tolerances (native units):

| Dimension | τ |
|---|---|
| OG, FG | 0.002 SG |
| ABV | 0.2 % |
| IBU | 3 IBU |
| SRM | 1.5 SRM |
| AA | 2.0 pp |
| BU:GU | 0.10 |

Four-tier status by `z`:

| z | status |
|---|---|
| 0 | Within spec |
| (0, 1] | Grace zone (≤ 1 JND) |
| (1, 2] | Noticeable drift (1–2 JND) |
| > 2 | Severe bleed (> 2 JND) |

## 5. Pillar aggregation and the SAI

The seven dimension z-scores aggregate into four pillars, each with a maximum
weight `W` and a saturating deduction `P_p = W·(1 − exp(−λ·z_p^k))`:

| Pillar | z | W | λ | k |
|---|---|---|---|---|
| Visual | `z_srm` | 3 | 0.28 | 2.5 |
| Gravity & strength | `0.65·max(z_og, z_abv) + 0.35·√((z_og²+z_abv²)/2)` | 9 | 0.24 | 2.2 |
| Fermentation & body | `0.60·z_fg + 0.40·z_aa` | 9 | 0.25 | 2.2 |
| Hop & balance | `0.55·z_ibu + 0.45·z_bugu` | 11 | 0.22 | 2.2 |

`ΣW = 32`. The **Style Adherence Index** is the fraction of the maximum possible
deduction not taken:

```
SAI = clamp(100 − 100·(ΣP / 32), 0, 100)
```

`SAI = 100` is exact adherence; `SAI = 0` is maximal structural drift. It is an
adherence index, not a quality grade.

## 6. Gating (no style / experimental)

A dimension is checked **only when its envelope is complete** (`min < max`):

- OG/FG/ABV/SRM/IBU: gated on their own `min < max`.
- AA: gated on a complete OG, FG, and ABV envelope (a valid region).
- BU:GU: gated on complete IBU and OG envelopes with `og_min > 0`.

No style selected, a stats-less style, or experimental mode therefore produces
no baseline for the missing dimensions and never a false flag. `hasBaseline` is
true when at least one dimension has a complete envelope; otherwise the assessor
reports a null SAI and the UI renders a neutral "no baseline" state.

## 7. Frozen `conformance` block

Computed at freeze time and stored verbatim on the batch:

```
conformance: {
  styleId: string | null,
  hasBaseline: boolean,
  sai: number | null,                 // 0–100
  dimensions: {
    og, fg, abv, ibu, srm, aa, bugu: {
      value, low, high,
      violatedBoundary, deviation, tau, z, status
    } | null                          // null = not gated / not applicable
  },
  pillars: {
    visual, gravity, fermentation, balance: { z, deduction, note } | null
  }
}
```

## 8. Non-goals

- No BJCP 50-point score or medal tier (structural adherence ≠ sensory judging).
- Real-extract Cutaia is **not** used: the solver and picker geometry are built
  on the apparent-extract form; a migration is a future, separately-planned
  change, not part of this assessor.
- No psychophysical modifiers (haze turbidity bonus, sulfate-finish IBU
  compression, residual-extract IBU coupling).
- AA and BU:GU are relational, reported against *implied* bounds derived from
  the style rectangle; they are not BJCP-authoritative ranges.
