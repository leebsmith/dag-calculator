# Style Card — Feasible-Region Centroid

The Style card derives a single fermentation target — **apparent attenuation (AA)**
and **ABV** — from a BJCP style's gravity and alcohol ranges. It does so by finding
the **centroid of the feasible fermentation region** in original/apparent extract
(OE/AE) space, then converting that point back to AA and ABV. Implemented in
`frontend/src/engine/fermentation.js` (`styleCentroid`).

## 1. Inputs

Per style, the seed carries ranges (as numbers):

- `og_min`, `og_max` — original gravity (SG)
- `fg_min`, `fg_max` — final gravity (SG)
- `abv_min`, `abv_max` — alcohol by volume (%)

Styles without stats (the specialty styles) produce no centroid.

## 2. Map to extract space

`OE = P(OG)` and `AE = P(FG)` via the ASBC Table 1 cubic:

```
P(SG) = -616.868 + 1111.14·SG - 630.272·SG² + 135.997·SG³
```

Because `P` is monotonic, the SG ranges map **exactly** onto the rectangle:

```
OE ∈ [P(og_min), P(og_max)],  AE ∈ [P(fg_min), P(fg_max)]
```

## 3. The ABV function (Cutaia 2009)

`ABV(OE, AE) = (0.372 + 0.00357·OE) · (OE − AE) · (plato_to_sg(AE) / 0.7907)`

`plato_to_sg` is the ASBC 3rd-order Plato→SG polynomial (not the cubic inverse);
the ethanol density is `0.7907` (single source of truth, post-reconciliation).

The feasible region is the box intersected with `{abv_min ≤ ABV ≤ abv_max}`.

## 4. Vertices

The region is bounded by the 4 box edges and the two ABV level curves. Its
vertices are:

- the 4 box corners, each kept iff its ABV is within the band;
- each ABV level curve's crossings with the 4 edges, found by 1D solve:
  - **horizontal edge** (AE fixed) — `ABV` is quadratic in OE, closed-form roots;
  - **vertical edge** (OE fixed) — `ABV` is monotone decreasing in AE, so a single
    bracketed bisection.

`ABV` is monotone increasing in OE and decreasing in AE over the physical range
(equivalent to the solver's `∂ABV/∂FG < 0` bracket), so each curve crosses each
edge at most once. The vertices are deduplicated and ordered by polar angle.

## 5. Centroid (linear-sided n-gon)

The ABV level curves are treated as straight chords. Measured sag vs the chord is
≤ 0.004 °P across the BJCP spread (typically ~0.0005 °P), far below display
precision, so the linear-sided approximation is exact for practical purposes. The
centroid is the shoelace polygon centroid.

Degenerate cases: when a bound is non-binding the region collapses to the box
(or one clipped corner) and the centroid is the box center.

## 6. Convert back

```
OG* = plato_to_sg(OE*),  FG* = plato_to_sg(AE*)
AA* = (OE* − AE*) / OE*          # Plato-space (solver-native)
ABV* = ABV(OE*, AE*)
```

`AA*` seeds `batch.apparent_attenuation`; `ABV*` seeds `batch.target_abv`.

## 7. Conformance

`tests/frontend/fermentation.test.js` pins `styleCentroid` against the backend
`app.core.utils.calculate_abv_and_attenuation` for representative styles
(21A, 22C, 25B, 1A) and asserts the centroid's ABV always falls inside the
style's band. Any change to the Cutaia/ASBC constants must be regenerated there.
