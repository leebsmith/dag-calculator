# The attenuation model

**Status:** D1 and D2 landed. This document is the canonical statement of the
model; the code implements it. Pass 1 made the ingredient data honest (`F` is
now a real mass fraction) and D1 makes the solver consume it: extract composition
is the primitive, and both real and apparent attenuation are derived from it.

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
UE         = E_malt·(1 − F_malt_eff)·(1 − d) + E_sugar·(1 − F_eff)
RE         = OE · UE / E
AE         = inverse_cutaia(RE)               # may be ≤ 0
ABW        = Cutaia(OE, AE)
ABV        = ABW · plato_to_sg(AE) / 0.7907
AA_app     = (OE − AE) / OE                   # may exceed 1
RDF        = (OE − RE) / OE
```

`F_eff` is the extract-weighted **real** fermentability of the late-addition
blend (see `docs/sugar-database.md`); it is `1.0` only when every sugar in the
blend is fully fermentable. `d = 1` only for a confirmed STA1 strain. The
inversion solves the Cutaia real-extract regression for `AE`; when the residue
is small enough (a diastaticus fermentation) `AE < 0` is the only solution, so
`plato_to_sg` evaluates the ASBC polynomial on a small negative domain.

The ABV-first inversion is the default pin. The same composition block also
supports an OG pin (the target fixes `OE`; the grist absorbs the remainder) and
an FG pin (root-find `OE` so the composition's apparent extract matches the
target). In every case the active target is the only scale constraint, and the
other two gravity/strength values are solved.

## 2. The four regimes

| Regime | What must hold | Test |
|---|---|---|
| pure grist | real-basis rows round-trip: `F = 0.643` displays `AA_app = 0.810` at 12 °P | `test_basis_conversion.py` |
| + sugar (`F = 1`) | `UE` (mass) flat, `OE` up, `AA_app` up, `ABV` up; the yeast cap cannot suppress sugar | `test_composition_regimes.py` |
| + STA1 (`d = 1`) | `UE → 0`; `AE_app` may be negative; `AA_app` may exceed 1 | `test_composition_regimes.py` |
| + both | sugar adds fermentable extract only; `d` touches the malt residue only | `test_composition_regimes.py` |

The first regime is *why* the priors do not move the default recipe: the old
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

- The cap is the yeast's **apparent** attenuation (strain × batch derate). It
  converts to real space at the candidate `OE` and clamps **malt** fermentability
  only: `F_malt_eff = min(F_malt, cap_real)`.
- Sugar extract keeps its own `F_eff` and is never clamped by the yeast cap, so
  a sugar addition can push apparent attenuation past the malt cap (regime 2).
  A non-fermentable blend (`F_eff < 1`) leaves its own residue; the sugar share
  is total extract, not fermentable extract.
- `d` (D5) applies to the malt residue only: `(1 − F_malt_eff)(1 − d)`. A
  non-fermentable late addition (lactose) keeps its own residue regardless of
  `d` (A6).
- `bound: "min"` is reported, not propagated: the solver uses the printed value
  as a point and the UI labels it a floor (A8, D3).

### 5.1 Diastaticus

`sta1` is a tri-state vendor field (D4b). `true` sets `d = 1`: the malt's dextrin
residue is consumed, apparent extract may go negative, and apparent attenuation
may exceed 1. `false` is an ordinary strain. `null` (not published) is modelled
as `d = 0` **and** surfaced as the host advisory `sta1_unknown` — the model never
treats a missing QC result as a confirmed negative. Sugar is never touched by
`d`; a non-fermentable sugar keeps its own residue.

The wire carries `sta1` as a boolean. The request builder sends `false` when the
selection has no QC result (the boundary input guard treats null as "not ready"),
while the advisory reads the selection directly; the solver also accepts
`sta1: null` from a direct caller and models it as `false`.

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

The Belgian knob is retired; the general ABV+FG composition-solving mode is
deferred.

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

## 7. Assumption register

A1–A17 are the final register for the attenuation refactor. A row is executable
where the claim is testable; `tests/guards/attenuation-register.test.js` checks
that every enforcement path exists and that the row set stays complete.

| # | Assumption | Treatment | Enforcement |
|---|---|---|---|
| A1 | basis unknown for a source | `unspecified → real` | `tests/frontend/boundaryRequest.test.js` |
| A2 | ingredient conversion at fixed 12 °P | max ΔAA 0.022 across 8–24 °P | `tests/backend/conformance/test_basis_conversion.py` |
| A3 | yeast attenuation is apparent | converted per candidate `OE` | `tests/backend/conformance/test_composition_regimes.py` |
| A4 | STA1 = full dextrin consumption | `d = 1`, malt residue only, time ignored | `tests/backend/conformance/test_composition_regimes.py` |
| A5 | `sta1: null` | `d = 0` + advisory | `tests/backend/conformance/test_composition_regimes.py`, `tests/frontend/attenuation-display.test.js` |
| A6 | sugar immune to `d` | lactose stays unfermented | `tests/backend/conformance/test_composition_regimes.py` |
| A7 | priors are converted apparent observations | values + round-trip | `tests/backend/conformance/test_basis_conversion.py` |
| A8 | bounds reported, not propagated | `min` = point in the solver | `tests/frontend/attenuation-display.test.js` |
| A9 | trace malts colour-only | no extract, no fermentability | `tests/guards/seed-rebuild.test.js` |
| A10 | hot-side sugar displacement unmodelled | bounded by `v_bar·s_late_add` | doc only |
| A11 | `AE_app ≤ 0` | computed and displayed (`≤ 1.000` FG policy) | `tests/backend/conformance/test_composition_regimes.py`, `tests/frontend/attenuation-display.test.js` |
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
- `plans/attenuation-refactor.md` — the commit contract for passes 2–3 (landed).
- `plans/late-addition-intent.md` — the P3b commit contract (landed).
- `plans/pin-matrix.md` — the scale-pin and sugar-database contract (landed).
