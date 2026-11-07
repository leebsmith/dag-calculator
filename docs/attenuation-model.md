# The attenuation model

**Status:** D1, D2 and the STA1 retirement landed. This document is the canonical
statement of the model; the code implements it. Pass 1 made the ingredient data
honest (`F` is now a real mass fraction) and D1 makes the solver consume it:
extract composition is the primitive, and both real and apparent attenuation are
derived from it.

The wire speaks `malt_attenuation_cap` on the request and emits
`real_attenuation` + `apparent_attenuation` on the response.

## 1. The primitive

A malt's published fermentability is the share of its **extract** that is
fermentable. Call it `F`, a real mass fraction. Everything else follows:

```
E        = extract mass                       # kg, post-boil
E_malt   = extract from the grain bill        # kg
E_sugar  = s_late_add                         # kg (late-addition extract)
UE       = unfermented extract                # kg
FE       = E − UE                             # kg, fermented
RE       = UE                                 # real extract, by definition
```

`OE` is the post-boil original extract in °P. Because °P is extract mass per
solution mass, `RE/OE = UE/E`; the composition block can therefore work in
masses and scale once.

### The block

```
cap_real   = apparent_to_real(OE, yeast_cap_apparent)
F_malt_eff = min(F_malt, cap_real)
UE         = E_malt·(1 − F_malt_eff) + E_sugar·(1 − F_eff)
RE         = OE · UE / E
AE         = inverse_cutaia(RE)               # may be ≤ 0
ABW        = Cutaia(OE, AE)
ABV        = ABW · plato_to_sg(AE) / 0.7907
AA_app     = (OE − AE) / OE                   # may exceed 1
RDF        = (OE − RE) / OE
```

`F_eff` is the extract-weighted **real** fermentability of the late-addition
blend (see `docs/sugar-database.md`); it is `1.0` only when every sugar in the
blend is fully fermentable. The inversion solves the Cutaia real-extract
regression for `AE`; when a near-1.0 cap and a sugar addition leave the residue
small enough, `AE < 0` is the only solution, so `plato_to_sg` evaluates the ASBC
polynomial on a small negative domain. A vendor's published attenuation already
embeds the strain's primary diastatic activity; there is no separate dextrin
term.

The ABV-first inversion is the default pin. The same composition block also
supports an OG pin (the target fixes `OE`; the grist absorbs the remainder) and
an FG pin (root-find `OE` so the composition's apparent extract matches the
target). In every case the active target is the only scale constraint, and the
other two gravity/strength values are solved.

## 2. The model cases

| Case | What must hold | Test |
|---|---|---|
| pure grist | real-basis rows round-trip: `F = 0.643` displays `AA_app = 0.810` at 12 °P | `test_basis_conversion.py` |
| + sugar (`F = 1`) | `UE` (mass) flat, `OE` up, `AA_app` up, `ABV` up; the yeast cap cannot suppress sugar | `test_composition_regimes.py` |
| + STA1 | the vendor cap is the observation; no dextrin term; above-cap is sugar-driven | `test_composition_regimes.py` |
| + both | sugar adds fermentable extract only; the cap still clamps the malt fraction | `test_composition_regimes.py` |

The first case is *why* the priors do not move the default recipe: the old
apparent prior `0.810` and the new real prior `0.643` are the same observation.

## 3. Basis audit

Ingredient `F` is real. The producer tags each captured figure with the basis it
was published on and the verbatim method label; the audit that decided the
basis is:

| Source | Basis | Method (verbatim) | Evidence |
|---|---|---|---|
| Bairds | real | `IoB` | extract 77.5 × 0.870 = 67.4 vs published fermentable extract 67.3 (4/4, Δ ≤ 0.1) |
| Crisp | real | `IoB` | 78.6 × 0.872 = 68.5; PSY 410 laa/t ≈ 68.5 × 6.0 |
| Simpsons | real | `Fermentability % (un-boiled)` | 82.9 × 0.87 = 72.1; dry PSY 430 ≈ 72.1 × 5.96 |
| Briess extracts | real | `Fermentability` | vendor terminology; no yield published, assumption recorded |
| Dingemans | apparent (assumed) | `Final attenuation` | uniform `min 80.0 %` on 15 products; `0.80` apparent → `0.635` real |

`fermentability_basis` and `fermentability_method` travel with every captured
figure; the consumer treats `unspecified` as real (A1) and converts only
`apparent` rows.

## 4. The apparent→real conversion

There is exactly **one** ingredient conversion point: the request builder, at a
fixed 12 °P reference (`frontend/src/engine/fermentation.js:
apparentToRealAttenuation`). The wire carries real `F`; the solver converts the
yeast's apparent cap per candidate `OE` because `cap_real` is a wort property
that moves with gravity.

The Cutaia regression fixes the conversion:

```
apparent 0.810 → real 0.643
apparent 0.800 → real 0.635
apparent 0.500 → real 0.398
apparent 0.150 → real 0.121
```

The old category priors were apparent observations. They are stored in real
space (converted at 12 °P), so displaying them reproduces today's numbers:

| Prior | Old (apparent) | New (real) |
|---|---|---|
| `fermentability_prior_base` | 0.810 | 0.643 |
| `fermentability_prior_acid` | 0.800 | 0.635 |
| `fermentability_prior_crystal` | 0.500 | 0.398 |
| `fermentability_prior_roasted` | 0.150 | 0.121 |
| `fermentability_prior_default` | 0.810 | 0.643 |
| `fermentability_prior_sugar` | 1.000 | 1.000 |

**Error bound (A2).** Assuming the 12 °P reference when the actual wort is
8–24 °P moves the displayed apparent attenuation by at most **0.022** for these
priors (worst at 24 °P), asserted in `test_basis_conversion.py`. The conversion
is a display/audit convenience, not a claim that a malt's limit is
gravity-invariant.

## 5. The cap and sugar

- The cap is the yeast's **apparent** attenuation, less the batch derate. It
  converts to real space at the candidate `OE` and clamps **malt** fermentability
  only: `F_malt_eff = min(F_malt, cap_real)`.
- Sugar extract keeps its own `F_eff` and is never clamped by the yeast cap, so
  a sugar addition can push apparent attenuation past the malt cap (the sugar
  case).
  A non-fermentable blend (`F_eff < 1`) leaves its own residue; the sugar share
  is total extract, not fermentable extract.
- A non-fermentable late addition (lactose) keeps its own residue; sugar is
  never touched by the malt cap (A6).
- `bound: "min"` is reported, not propagated: the solver uses the printed value
  as a point and the UI labels it a floor (A8, D3).

### 5.1 Diastaticus

`sta1` is a tri-state vendor field (D4b). It is **not** a solver input: a
vendor's published attenuation already embeds the strain's primary diastatic
activity, so the primary solve uses the published cap for every strain. `true`
adds no dextrin term; `false` is an ordinary strain; `null` (not published) is
surfaced as the host advisory `sta1_unknown`, because a missing QC result must
never be silent. The status is recapitulated on the yeast card and in the
report for packaging decisions; no packaging bound is computed.

The yeast picker exposes the same tri-state as filters (`STA1+`, `STA1−`,
`STA1?`), so QC coverage is visible before a strain is chosen: a missing result
is a filterable bucket, never a silent "no".

## 6. Late-addition intent (P3b)

The batch solver is ABV-first: `target_abv` is the scale constraint and total
grist is an output. Sugar is an input (`s_late_add`), so "solve sugar mass for a
target ABV" has no residual. The missing degree of freedom is **composition**,
and it already exists inside the block:

```
sugar_share = (sugar extract) / (total post-boil extract)
```

`batch.late_addition_intent` (`dose | share`) selects which representation is
authored. In dose mode the request carries the authored `s_late_add`; in share
mode it carries `sugar_extract_share = s` and `s_late_add = 0`, and the solver
evaluates `S = s · E(OE)` per candidate. No equation changes: this is the D1
composition block with a different source for `S`.

- `0` is the dose sentinel on the wire. A positive share must be `< 1`; a
  malt-free share raises `INVALID_SUGAR_SHARE`. The UI bounds the root at 0.95
  and warns above 0.90.
- Share mode supports mixed blends through `F_eff`; a non-fermentable sugar
  (lactose) is represented by its row RDF, not by forcing dose mode. Per-row
  F on the wire is unnecessary: the solver consumes the blend scalar.
- Rows carry both representations: `mass_kg` (authored dose) and `parts` (share
  weights). The active mode decides which is authored. Share mode derives
  `resolved_mass_kg` from the solved sugar budget with Hamilton allocation; it
  never overwrites `mass_kg` except through the explicit "adopt" action.
- A share needs weights. Catalog rows start at `parts = 10` and the first
  `dose → share` switch seeds each row's extract; when that dose is zero it
  seeds an equal weight per row instead of zeros. A positive share whose rows
  carry no weights is completed on save and repaired on load, so the derived
  masses always account for the budget; a zero share is how sugar is removed.
- The first `dose → share` switch seeds the share from the current dose and the
  row parts from each row's current extract. After that, switching does not
  overwrite either side, so both authored states round-trip exactly. Explicit
  "adopt current dose" / "adopt share into masses" re-sync on request.
- `batch.sugar_extract_total` is the operative sugar extract for readouts and
  weighted color; `batch.s_late_add` remains the authored dose.
- The frozen bundle records the mode, the share, the parts, and the resolved
  masses. A frozen batch never re-solves.

### 6.1 Scale pins

Three recipe pins are supported:

| Pin | Fixed | Solved | Sugar-share increase |
|---|---|---|---|
| ABV | target ABV | OG, FG | OG ↓, FG ↓, ABV = |
| OG | target OG | ABV, FG | OG =, FG ↓, ABV ↑ |
| FG | target FG | OG, ABV | OG ↑, FG =, ABV ↑ |

The targets live on batch roots (`target_abv`, `target_og`, `target_fg`) and
default from the immutable style midpoints. The active pin is
`batch.scale_pin`; dose/share stays a separate composition axis. When sugar is
authored, one preview call returns the three rows at their persisted targets;
previews hold the authored composition and never drive the active solve. Each
row also carries the sugar-extract share it actually holds: the authored
fraction in share mode, `dose / E(OE)` in dose mode, because a fixed dose is a
different share at each candidate gravity. Style envelope conflicts are
warnings (A18).

The Belgian knob is retired. It was a special-case inversion — hold apparent
extract, raise original extract with sucrose to a target apparent attenuation or
ABV — and it assumed sucrose (`F = 1`), a single dose, and the old fixed-AA ray.
The three scale pins plus the authored sugar composition replace it; the
fermentation-space graph stays pin-aware and shows the ray only when ABV is the
pin.

The general ABV+FG composition-solving mode is deferred. Its design covers six
input pairs (any two of OG, FG, AA,
ABV) with forward substitution plus guards; it is not implemented, and three of
its decisions are worth keeping when it is:

- **Pick one attenuation convention.** `AA = (OG − FG)/(OG − 1)` in SG points
  and `AE = OE·(1 − AA)` in Plato space are the same equation *shape* but
  disagree numerically by ≈0.5–1.8 pp at 1.040–1.100, which is ≈0.03–0.25 % ABV.
  This repo uses the Plato form (`realized_fg`, the batch solver's cap).
- **Floor the ethanol end.** `FG < 0.980` is unphysical; a pair asking for it is
  rejected, not clamped.
- **Refuse the underdetermined point.** `FG = 1.000` with `AA = 1.0` admits any
  OG and must error.

It stays deferred because the three scale pins already cover what a recipe can
express: a fourth degree of freedom has no control on the screen, and the
composition model (not the arithmetic) is what constrains the rest.

### 6.2 Shape and level

Composition is intensive. It fixes the ratio of residual to original extract,
not the amount of extract, so one composition is a **locus** in the fermentation
plane and a pin selects one point on it:

```
plane of (OG, FG)     2-D    ABV is a function on it, not an axis
  + composition       1-D    fixes AE/OE: one locus remains
  + pin               0-D    selects the level
```

Two parameters are always needed: **shape** (authored) and **level** (solved).
Composition alone can never name a beer, because any ratio can be brewed at any
size. This is why cycling the pin re-solves the masses: `mass = level × shape`,
and the pin is the only thing setting the level.

The composition is many-dimensional as a recipe — grist proportions, per-malt
yield and fermentability, sugar share, yeast cap — but only one scalar of it
reaches the gravity algebra: the extract-weighted real fermentability. The rest
shows up in colour, bitterness and flavour, none of which appear in the OG/FG/ABV
relation.

Consequences:

- The three pins are three points on the **same** locus in share mode; the ratio
  `AE/OE` is constant across them (measured drift is the yeast cap being
  converted at the candidate OE).
- In dose mode the locus bends, because `share = dose / E(OE)` moves with the
  level, so the authored mass is not a fixed shape.
- A pinned ABV is an **iso-ABV contour**, not an axis. Only OG and FG can be
  read off this plane by projection.
- Absolute mass is the other way to close the model: proportions plus bill mass
  in kg also give two parameters. That is the "solve the brew length" variant,
  not implemented.

### 6.3 The style-card centroid

Merged from the retired `docs/style-card-centroid.md`. The Style card derives one
fermentation target (apparent attenuation and ABV) from a BJCP style's ranges; the
method is the centroid of the feasible region in extract space.

The Style card derives a single fermentation target — **apparent attenuation (AA)**
and **ABV** — from a BJCP style's gravity and alcohol ranges. It does so by finding
the **centroid of the feasible fermentation region** in original/apparent extract
(OE/AE) space, then converting that point back to AA and ABV. Implemented in
`frontend/src/engine/fermentation.js` (`styleCentroid`).

### 1. Inputs

Per style, the seed carries ranges (as numbers):

- `og_min`, `og_max` — original gravity (SG)
- `fg_min`, `fg_max` — final gravity (SG)
- `abv_min`, `abv_max` — alcohol by volume (%)

Styles without stats (the specialty styles) produce no centroid.

### 2. Map to extract space

`OE = P(OG)` and `AE = P(FG)` via the ASBC Table 1 cubic:

```
P(SG) = -616.868 + 1111.14·SG - 630.272·SG² + 135.997·SG³
```

Because `P` is monotonic, the SG ranges map **exactly** onto the rectangle:

```
OE ∈ [P(og_min), P(og_max)],  AE ∈ [P(fg_min), P(fg_max)]
```

### 3. The ABV function (Cutaia 2009)

`ABV(OE, AE) = (0.372 + 0.00357·OE) · (OE − AE) · (plato_to_sg(AE) / 0.7907)`

`plato_to_sg` is the ASBC 3rd-order Plato→SG polynomial (not the cubic inverse);
the ethanol density is `0.7907` (single source of truth, post-reconciliation).

The feasible region is the box intersected with `{abv_min ≤ ABV ≤ abv_max}`.

### 4. Vertices

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

### 5. Centroid (linear-sided n-gon)

The ABV level curves are treated as straight chords. Measured sag vs the chord is
≤ 0.004 °P across the BJCP spread (typically ~0.0005 °P), far below display
precision, so the linear-sided approximation is exact for practical purposes. The
centroid is the shoelace polygon centroid.

Degenerate cases: when a bound is non-binding the region collapses to the box
(or one clipped corner) and the centroid is the box center.

### 6. Convert back

```
OG* = plato_to_sg(OE*),  FG* = plato_to_sg(AE*)
AA* = (OE* − AE*) / OE*          # Plato-space (solver-native)
ABV* = ABV(OE*, AE*)
```

The centroid's `ABV*` is a reference point, not the seed: the workspace now
starts `batch.target_abv` at the ABV-band midpoint and re-centers it on the
fixed-AA ray once a yeast is selected (see §8). `AA*` is the style point's
implied attenuation; the solver's `solver.batch.apparent_attenuation` is the
value the navigator constrains to.

### 7. Conformance

`tests/frontend/fermentation.test.js` pins `styleCentroid` against the backend
`app.core.utils.calculate_abv_and_attenuation` for representative styles
(21A, 22C, 25B, 1A) and asserts the centroid's ABV always falls inside the
style's band. Any change to the Cutaia/ASBC constants must be regenerated there.

### 8. ABV target control

Many styles span a wide ABV band (e.g. Black IPA: 5.5–9.0), so a single
centroid is only a reference. The Style card owns the **scale pin** and its
active target:

- **Three pins.** ABV, OG, or FG is the active constraint; the other two are
  solved from the composition. Dose/share remains a separate axis.
- **Free target.** The active target is authored, not clamped to the fixed-AA
  ray. ABV accepts a one-decimal value; OG/FG accept a three-decimal gravity.
  Style-envelope conflicts are warnings. The solver realizes the other axes.
- **Initialization.** A new batch seeds each target from the style midpoint via
  the artifact defaults. The user's value is authoritative; a solve never
  rewrites it. “Reset to style” unsets the active target root, so the identity
  default re-evaluates.
- **Graph.** The marker is the solved batch point for every pin, and the
  composition locus is always drawn; the pinned target adds the vertical (OG),
  horizontal (FG) or iso-ABV contour. None of them is a constraint. The plotted
  plane follows the gravity unit control: the axes are linear in the display
  unit (Plato or SG), while the region, contours and locus are still sampled in
  °P and converted once for drawing — the same geometry, not a second solver.
  The window is the union of the style region and the batch point, so a batch
  outside the style still shows its dot. The iso-ABV contours are labelled, the
  style's `abvMin`/`abvMax` limits are drawn as emphasised paths, and the pin
  label takes the contour sample farthest from the marker (clamped inside the
  frame) so the dot never lands inside its text.
- **Read-only display.** The Batch step shows the active target as a readout;
  the Style step is the editor for the pin and target. The Sugars section of the
  Fermentables card previews the three pins but never edits them.

### 9. Model-free brew risk

For a picked point, the risk of brewing *out of style* is quantified
geometrically (no process assumptions):

- `d` = distance from the point to the region boundary (OE/AE °P, `edgeMargin`).
- `R` = the region's max in-region margin (`chebyshevCenter`, the pole of
  inaccessibility = the "safest" point).
- **Style safety** = `d / R ∈ [0,1]` — 1 at the safest point, 0 on the boundary.
- **Nearest limit** = the six style limits' smallest *normalized* headroom
  (`headroom / range`), reported in native units (OG/FG in SG, ABV in %).

The preview is a plain polygon (no colour heatmap: a distance fill mostly
re-encodes the marker position and misleads on elongated regions), with the
picked marker and the safest point. For elongated/convex regions the max-margin
set is a flat *ridge*, so `chebyshevCenter` returns the ridge point nearest the
area centroid — a central "safest point" rather than an arbitrary ridge end.

Scope: gravity/ABV only — IBU/SRM are not controlled by this picker. A true
out-of-style *probability* additionally needs process variance (conversion
efficiency, yeast attenuation vs the targeted AA), which is not modelled; that
is a deliberate deferral.

### 6.4 The retired `d = 1` path

Earlier versions mapped `sta1: true` to a full dextrin-consumption step
(`d = 1`), which zeroed the malt residue. That made the cap and the derate inert
and let a 9 % / 6.1 gal tripel with 1 lb candi syrup solve at 1.055 OG /
0.986 FG / 126.5 % apparent attenuation. A vendor's published range already
includes the strain's primary diastatic activity, so the step was a packaging
thought experiment, not a primary prediction.

At 6.1 gal, 9.0 % ABV, 1 lb candi extract (0.385641 kg) and a 0.72 real malt
fermentability, WLP570's 85 % cap solves near 1.075 OG / 1.008 FG / 88.7 %
apparent attenuation. The old 1.055 / 0.986 / 126.5 % figure is retained here
only as the diagnostic that motivated the change. A near-1.0 cap plus sugar can
still drive apparent extract to zero or below; that edge stays in the model.

---

## 7. Assumption register

A1–A17 are the final register for the attenuation refactor. A row is executable
where the claim is testable; `tests/guards/attenuation-register.test.js` checks
that every enforcement path exists and that the row set stays complete.

| # | Assumption | Treatment | Enforcement |
|---|---|---|---|
| A1 | basis unknown for a source | `unspecified → real` | `tests/frontend/boundaryRequest.test.js` |
| A2 | ingredient conversion at fixed 12 °P | max ΔAA 0.022 across 8–24 °P | `tests/backend/conformance/test_basis_conversion.py` |
| A3 | yeast attenuation is apparent | converted per candidate `OE` | `tests/backend/conformance/test_composition_regimes.py` |
| A4 | vendor attenuation embeds primary diastatic activity | `sta1` has no solve effect; the cap is the observation | `tests/backend/conformance/test_composition_regimes.py` |
| A5 | `sta1: null` | no solve effect + advisory | `tests/backend/conformance/test_composition_regimes.py`, `tests/frontend/attenuation-display.test.js` |
| A6 | sugar is never clamped by the malt cap | lactose keeps its own residue | `tests/backend/conformance/test_composition_regimes.py` |
| A7 | priors are converted apparent observations | values + round-trip | `tests/backend/conformance/test_basis_conversion.py` |
| A8 | bounds reported, not propagated | `min` = point in the solver | `tests/frontend/attenuation-display.test.js` |
| A9 | trace malts colour-only | no extract, no fermentability | `tests/guards/seed-rebuild.test.js` |
| A10 | post-boil cascade volume is wort-only | `V_post` excludes sugar (hop utilisation); the ledger adds `v_bar·S_late` back | `tests/backend/test_batch_solver.py`, `tests/frontend/late-addition-parts.test.js` |
| A11 | `AE_app ≤ 0` | only when a near-1.0 cap plus sugar drives it; displayed as `≤ 1.000` | `tests/backend/conformance/test_composition_regimes.py`, `tests/frontend/attenuation-display.test.js` |
| A12 | frozen bundles never re-solve | embedded artifact | `tests/backend/conformance/test_report_bundle_fixture.py` |
| A13 | derate points apply before conversion | order stated in `docs/engine.md` | `tests/frontend/selection-validation.test.js` |
| A14 | vendor ranges use the high end | low/high stored, cap = high | `tests/guards/seed-rebuild.test.js`, `tests/conformance/seed-conformance.test.js` |
| A15 | Cutaia inverse vs mass-derived RE | residual asserted | `tests/backend/conformance/test_numeric_parity.py` |
| A16 | sugar share allocates extract by Hamilton parts | 0.1 % split, masses derived | `tests/frontend/late-addition-intent.test.js` |
| A17 | mixed sugar blends use one effective RDF | `F_eff`, extract-weighted; share is total extract | `tests/guards/sugar-fermentability-contract.test.js`, `tests/backend/conformance/test_composition_regimes.py` |
| A18 | scale previews are hypothetical; style conflicts are warnings | active pin is the batch; one call, three rows | `tests/frontend/pin-matrix.test.js`, `tests/backend/conformance/test_scale_pins.py` |

## 8. References

- `docs/fermentability-and-yield.md` — the two ingredient axes and provenance.
- `docs/sugar-database.md` — the audited sugar source, tiers and `F_eff`.
- `docs/dag-artifacts/domain-equations.md` §1–§2 — the equations and the sealed
  boundary contract.
- `plans/archive/2026-10/attenuation-refactor.md` — the commit contract for passes 2–3 (landed).
- `plans/archive/2026-10/late-addition-intent.md` — the P3b commit contract (landed).
- `plans/archive/2026-10/pin-matrix.md` — the scale-pin and sugar-database contract (landed).
