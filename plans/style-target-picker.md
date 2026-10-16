---
title: Style target picker (OE/AE region navigator)
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [Step G]
blocks: []
gate: make check/test green
status: done
---

# Style Target Picker — OE/AE region navigator

**Goal:** let the brewer pick a fermentation target *within* a style's feasible
OE/AE region instead of always taking the centroid. Two mutually-bounded sliders
(OE horizontal, AE vertical, in °P) move a point over the region polygon, seeding
the batch's apparent attenuation and target ABV, with a live risk readout.

## Locked decisions

1. Axes: **OE horizontal, AE vertical**, in °P (native).
2. AA convention: **Plato-space** `(OE − AE) / OE`.
3. Clamping: **mutual, dynamic bounds** — each slider's min/max is the region
   slice imposed by the other's current value.
4. Reset: to the **envelope** region centroid (WYSIWYG, not the style seed).
5. Preview: **SVG polygon** + marker + safest point.
6. Risk: **model-free margin** (nearest-limit headroom + normalized safety).
7. Source of truth: the `batch.apparent_attenuation` / `batch.target_abv` roots;
   the slider positions are their inverse. Region from the `batch.style_*` roots.

## Risk model (model-free)

- `d` = distance from the picked point to the region boundary (OE/AE °P).
- `R` = the region's max in-region margin (Chebyshev / pole of inaccessibility).
- **Safety** = `d / R ∈ [0,1]`; the SVG heatmap colours by it.
- **Nearest limit** = the six style limits' smallest normalized headroom,
  reported in native units (OG/FG in SG, ABV in %).
- Scope: gravity/ABV only; IBU/SRM separate. A true probability needs process-σ
  (deferred).

## Checklist

### Geometry (`frontend/src/engine/fermentation.js`)
- [x] `oeExtent` / `aeExtent`
- [x] `oeSliceAt` / `aeSliceAt` (polygon edge scan)
- [x] `pointInRegion`
- [x] `edgeMargin` (point-to-edge)
- [x] `chebyshevCenter` (grid + refinement)
- [x] `targetFromExtract` / `extractFromTarget` (forward + inverse)
- [x] `limitHeadroom` (nearest of the six limits)

### Adapter (`frontend/src/adapters/stepAdapter.js`)
- [x] In `compute()`: `styleRegion`, `styleSafestPoint`, `styleExtract`, `styleEnvelope`
- [x] Getters: `styleOeBounds`, `styleAeBounds`, `styleTargetInfo`, `styleTargetRisk`
- [x] `setStyleTargetOe` / `setStyleTargetAe` (clamp + seed)
- [x] `applyStyleExtract` / `resetStyleTarget`

### UI (`frontend/src/partials/step-style.html` + `style.css`)
- [x] OE slider (horizontal), AE slider (vertical)
- [x] SVG preview: heatmap fill, polygon, marker, safest point, axis labels
- [x] Live `AA% · ABV%` readout
- [x] Risk line (safety + nearest limit)
- [x] Reset button

### Tests & docs
- [x] `tests/frontend/fermentation.test.js`: slices, margins, chebyshev, inverse round-trip
- [x] `tests/frontend/style-card.test.js`: reset, clamp, seeding, envelope reshape
- [x] `docs/style-card-centroid.md`: navigator + risk model
- [x] `make check` + `make test` green

## Deferred

- Probabilistic out-of-style risk (process variance).
- Draggable polygon (the sliders + marker are the stepping-stone).
