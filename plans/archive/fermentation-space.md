# Fermentation space: shape, level, and the square

Status: **complete**. The Style card's plot is `views/producer/stylePlot.js` over
the geometry in `engine/fermentation.js`, with the spec's 1 % contour cadence.

The Style card's fermentation graph showed a moving dot with no axes, no scale,
and a fixed-AA ray drawn only under the ABV pin. Cycling the pin moved the dot,
which reads as a bug because nothing on the chart said what the dot *is*.

## The model this has to express

Composition is **intensive**: it fixes the ratio `AE/OE`, not the level. So one
composition is a **locus** in the (OE, AE) plane, and a scale pin selects one
point on it. Two parameters, always: shape (authored) and level (solved).

```
plane of (OG, FG)     2-D    ABV is a function on it, not an axis
  + composition       1-D    fixes AE/OE: one locus remains
  + pin               0-D    selects the level
```

Consequences the chart must not contradict:

- The dot's projections are **realized** OG and FG, never the stored targets.
  The dormant targets are not in this space.
- ABV is a scalar field over the plane, so a pinned ABV is a **contour**, not an
  axis. Only OG and FG can be read by projection.
- Cycling pins moves the dot because the level changes. The locus does not move.
- In dose mode the locus bends slightly, because `share = dose / E(OE)`.

## Rendering

A square plot with **independent axis scales** (the data spans ~8 °P by ~2 °P, so
a square is a 4× vertical stretch). The distortion is accepted because the
iso-ABV contours fill the area with the third variable, which is otherwise
invisible; contour slope (~1.13 in data units) and locus slope (~0.18) remain
visually distinct after the stretch.

| Element | Object | Behaviour when cycling |
| --- | --- | --- |
| Style region | OG band ∧ FG band ∧ ABV band | fixed |
| Iso-ABV contours, every 1 % | `AE = f(OE, ABV)` | fixed |
| Composition locus | constant real extract, swept over OE | fixed |
| Pinned locus | vertical (OG), horizontal (FG), contour (ABV) | which one |
| Solved dot | realized (OE, AE) | moves along the locus |
| Safest point | Chebyshev centre of the region | fixed |

Reading grammar: **OG = vertical projection, FG = horizontal projection, ABV =
which contour**. No pin is read by projecting onto an axis except the two that
are axes.

Geometry: 320 px square plot, margins 44/34/12/12, total 376 × 366, rendered
through a static `viewBox` so CSS can scale it. Both axes tick five times and
label in °P; the readout row below still carries SG and the exact ABV.

## Non-goals

- Drawing the dormant OG/FG targets (they are not this batch).
- Hover-only numbers (fails touch and screen readers); the readout row remains
  the source of truth.
- Volume (this plane is intensive).
- Solver behaviour: the chart is host-side geometry over the existing solve.

## Revert

One commit, host-only. `git revert` restores the polygon-plus-dot chart; the
solver, artifact, and boundary wire are untouched.
