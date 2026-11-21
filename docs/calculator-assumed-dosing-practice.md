---
title: Calculator-assumed dosing practice
status: living
---

# Calculator-assumed dosing practice

What the calculator assumes you do with water-treatment additions, so a mismatch
between the model and your brew day is visible instead of silent.

This doc describes **assumed practice only**. The chemistry lives in
`data/artifact.json` and `backend/app/core/water/`; the numbers live in
`docs/dag-artifacts/domain-equations.md` and `docs/dag-artifacts/inventory.md`.

## 1. The two destinations

The calculator assumes exactly two places receive additions:

| Destination | When | What |
|---|---|---|
| **Dry grist**, in the tun, before the first underlet | Before strike water touches the grain | Mash salts, mash acid, any alkaline agent |
| **HLT**, after the strike is drawn and the HLT is topped up | Once the HLT holds its final volume for the second underlet | Sparge salts and sparge acid |

Nothing else is assumed: the HLT holds water (plus metabisulfite) until the sparge
dose is added, and the strike water enters the tun unmodified.

## 2. Distribution mode

`water.salt_distribution` is a batch input. It governs **salts only** — never acid.

| | Grist, before underlet | HLT, after top-up |
|---|---|---|
| `PROPORTIONAL` ("Split — grist and HLT") — salts | `dose_per_L × v_strike` | `dose_per_L × salted_volume` |
| `PROPORTIONAL` — acid | `mash_acid_ml` | `sparge_acid_ml` |
| `MASH_ONLY` ("Mash only salts") — salts | `dose_per_L × v_strike` | **zero** |
| `MASH_ONLY` — acid | `mash_acid_ml` | `sparge_acid_ml` — unchanged |
| Alkaline agent | on the grist | always zero, by construction |

Consequences worth stating plainly:

- The mash dose is **identical in both modes**. Changing the mode never changes what
  goes on the grist.
- `MASH_ONLY` is a *salts* adjective. The HLT still receives its acid dose, because
  sparge acid is computed from the HLT's residual alkalinity regardless of mode. If
  you read "mash only" as "leave the HLT alone" you will sparge with alkaline,
  unprotected liquor.
- `PROPORTIONAL` means one per-litre concentration applied to both vessels. The grams
  differ only because the volumes differ.

### The calcium band

Calcium is a **band**: a minimum (default 50 ppm) and a maximum (default 150 ppm),
both from the ion-limits source. A dosing route adds calcium until the finished
mash reaches the minimum, whenever the pinned equalities leave room; a source
already above the minimum needs no extra calcium. The maximum is what orders the
dose: the solver prefers gypsum, and reaches for Epsom salt only when the ceiling
would otherwise be breached, so magnesium rises above the source only when the
sulfate target has no other route.

The band is soft in the same way as the old floor. When the equalities cannot
hold it, the solver keeps the equalities, drops the band, and reports one
relaxation note; the minimum's shortfall is then graded by
`GUARDRAIL_CALCIUM_FLOOR_UNREACHABLE`, and a finished concentration above the
maximum by `GUARDRAIL_CALCIUM_ABOVE_CEILING`. A maximum below the minimum
collapses to the minimum and reports
`GUARDRAIL_CALCIUM_BAND_OVERRIDDEN`. `BASELINE` and `FLAVOR` never apply the
band, so they carry no band finding.

### Ion ceilings

Magnesium warns above the recommended 30 ppm and names the 50 ppm hard maximum,
sulfate above 400, sodium above the
recommended 50 (`GUARDRAIL_SODIUM_ABOVE_RECOMMENDED`) and chloride above 300
(`GUARDRAIL_CHLORIDE_ABOVE_RECOMMENDED`). All of these are taste conventions:
they warn on the finished water and never clamp the dose, because a Gose, a stout
or a hazy IPA may deliberately exceed them. Table salt and baking soda are the
usual sodium sources, so a sodium warning on a dark grist usually comes from the
alkaline agent rather than a mineral target.

### Acid load

Lactic acid is dosed as a volume but tasted as a concentration. The calculator
reports the added lactate in the knockout volume, counting both the mash and the
sparge dose because neither boils off: the published sensory threshold is
400 ppm, and sensitive tasters detect a lactic tang from 250–300 ppm in delicate
styles. The guardrail warns at 400 and leaves the style judgement to you. Native
fermentation lactate (20–60 ppm) is not modelled, so the figure is **added**
lactate and the guardrail is therefore slightly stricter than the finished
concentration. Phosphoric acid carries no taste guardrail: its practical limit is
calcium phosphate precipitation, which the model does not compute.

Threshold provenance: Dysvik et al. (2020), Thompson Witrick et al. (2017) and
Carriglio et al. (2022) for the 400 ppm figure; Li et al. (2015) for the
buffering and phosphate behaviour that makes phosphoric acid taste-neutral.

## 3. Volume basis

| Quantity | Node | Definition |
|---|---|---|
| Mash treatment volume | `solver.batch.cascade.v_strike` | Strike water |
| HLT at brew-day start | `batch.hlt_starting_volume_l` | Root; defaults to `equipment.max_hlt_volume_l` |
| HLT after strike | `solver.batch.hlt.v_hlt_after_strike` | `hlt_starting_volume_l − v_strike` |
| HLT top-up target | `solver.batch.hlt.v_hlt_target` | `max(hlt_coil_floor_l, v_sparge_demand + v_hlt_debt)` |
| HLT required volume | `solver.batch.hlt.v_hlt_required` | `v_sparge_demand + v_hlt_debt` |
| HLT top-up | `solver.batch.hlt.v_hlt_top_up` | `max(0, target − after_strike)` |
| **Dose volume** | `batch.sparge_salted_volume` | `after_strike + top_up` |
| Delivered sparge | `solver.batch.hlt.v_sparge_deliverable` | `salted_volume − v_hlt_debt` |
| HLT debt | `solver.batch.hlt.v_hlt_debt` | `hlt_dead_space_l + hlt_transfer_loss_l` |

The water boundary reads `batch.sparge_salted_volume` — the liquor actually in
the HLT when you dose. It is **not** the delivered sparge volume: dosing by
concentration means liquor left behind (dead space, transfer loss, surplus) stays
correctly salted, while the delivered sparge carries the right concentration.

Two readouts describe what stays behind, on different bases.
**Treated liquor remaining** (`residual_hlt_water_l`) is the treated volume minus
the sparge demand, so it includes the undeliverable debt. **Deliverable surplus**
(`surplus_sparge_capacity`) is the deliverable volume minus the demand, so it
excludes the debt. They differ by `v_hlt_debt`; the surplus is the number you can
still run through the bed.

The fill rule is the batch solver's, not a calculator invention
(`backend/app/core/batch/hlt.py`, `resolve_hlt_water_budget`): top up to
whichever is greater, the volume needed to cover the HERMS coil or the volume needed
to deliver the sparge plus the HLT debt.

## 4. Not modelled

| Omitted | Why | Magnitude |
|---|---|---|
| Grist ion contributions | Small, no seed data, no tolerance for the comparison | Unknown; typically single-digit ppm |
| Sodium metabisulfite | Added to remove chlorine/chloramine, not for ions; concentration depends on HLT volume and is diluted by untreated top-up water | One 0.44 g tablet: ≤ ~7.8 mg/L SO₄, ~1.9 mg/L Na at 56.8 L (15 US gal); ≤ ~14.8 mg/L SO₄, ~3.6 mg/L Na in a 30 L HLT |
| Chlorine / chloramine removal | Treatment effect, not an ion balance | — |
| Secondary-ion contaminants (K, Fe, Mn, NO₃) | The core audits `k`/`fe`/`mn`/`no3` against `CONTAMINANT_LIMITS` and emits `GUARDRAIL_SOURCE_CONTAMINANT_DETECTED`, but the `water_report` schema and seeds do not yet carry those ions to the solver (no `mn`, nitrate is `nitrate_no3_n` "as-N"), so the guardrail is not exercised through the seam today | — |

Both omissions push the same way: with metabisulfite in the HLT, the realized sulfate
(and therefore the kettle SO4:Cl) is **higher** than the calculator reports. The
water card states this; it is not a defect to be rediscovered later. If
metabisulfite is ever modelled, it is an addition to the source vector plus a
displacement fraction for top-up — not a solver change.

## 5. What the calculator shows, and what it still cannot verify

The card shows the corrected vectors, each with a signed delta against the target
profile:

| Block | Source | Meaning |
|---|---|---|
| **Treated mash** | `post_dose_mash_ions` (solver) | What the grist receives, in solution: flavour salts, any alkaline agent, and the acid/alkali correction to `water.target_mash_ph` |
| **Treated HLT** | `post_dose_hlt_ions` (solver) | What the sparge liquor receives: flavour salts under `PROPORTIONAL` (the grist-only agent is excluded), then its own acid correction. Under `MASH_ONLY` it starts from the source report |
| **Kettle (blended)** | Host mass balance over delivered runnings and sparge | The two corrected vectors carried into the boil, weighted by volume |

The HLT acid dose is modelled as neutralising the HLT's residual alkalinity (the
proxy for a 5.80 sparge pH), so the treated HLT's alkalinity is the calcium and
magnesium residual-alkalinity term rather than zero. That assumption is why the
kettle alkalinity is below the mash's whenever a sparge acid is prescribed.

The kettle block is an **estimate**: it assumes uniform concentration per vessel and
full mixing. It is not a measurement, and the SO4:Cl readout is derived from it.

The report's water-chemistry section prints the treated mash as Final Water and
the net source-to-final change (`water.mash_adjustment.calcium_ca` and the other
working ions) as its Adjustment column. Its Treatment Dosage subsection prints
the nonzero mash and sparge additions with the selected hydrate forms, acid
medium, and distribution mode, so the printed masses match the declared
practice above.

The distribution mode is still a **declaration**, not an observation. The calculator
cannot tell whether the grist was dosed, whether the HLT was dosed, or whether the
volumes matched the plan. Two known failure paths therefore remain *visible but
undetected*:

1. Declaring `PROPORTIONAL` and dosing only the grist. The model overstates sparge
   salts and computes sparge acid against an HLT residual alkalinity that does not
   exist.
2. Declaring `MASH_ONLY` and dosing the HLT salts anyway. The treated-HLT block reads
   at source concentration — if you salted the HLT, that block contradicts what you
   did. Automatic detection is not possible from any output; visibility is the
   mitigation.

Treat the as-solved SO4:Cl as "what the declared practice produces", not as a
measurement.

## 6. Deviating safely

- **Treat differently than declared** → change `water.salt_distribution`. The
  readout follows the declaration.
- **Underlet only part of the strike, or add water later** → the mash chemistry still
  assumes the whole `v_strike` is treated. Adjust the strike volume or accept the
  dilution.
- **Overfill the HLT past the top-up target** → `sparge_salted_volume` grows and the
  dose with it, but only if `batch.hlt_starting_volume_l` reflects the fill. If it
  does not, the grams are short.
- **Use a different salt hydrate or acid strength** → change `water.gypsum_form`,
  `water.cacl2_form`, or `water.acid_medium`. The mass and volume are computed for
  the selected form; the readout names it.

## 7. Brew-day instruction strings

The brew-day payload carries these, derived from the same numbers as the water card.
User-entered `instructions` override them. Example values: 14.0 L strike, 16.0 L
salted HLT, 15.0 L delivered.

`brew-day-setup` (both modes):

> Fill the HLT to 20.0 L. Add 1 crushed metabisulfite tablet per 15 US gal. Water and
> metabisulfite only — no salts or acid yet. Masses assume Dihydrate (CaSO₄·2H₂O) ·
> Dihydrate (CaCl₂·2H₂O) · 88% lactic acid. (SMB is not modelled: ≤ ~8 mg/L SO₄ at
> one tablet per 15 US gal, ~15 mg/L in a 30 L HLT.)

`dough-in` (both modes):

> Dose the dry grist before underletting: Mash gypsum (dihydrate) 4.2 g, Mash calcium
> chloride (dihydrate) 2.1 g, Mash 88% lactic acid 1.4 ml. Sized for the 14.0 L strike.

`batch-sparge`, `PROPORTIONAL`:

> After the strike is drawn and the HLT is topped up to 16.0 L: add Sparge gypsum
> (dihydrate) 4.8 g, Sparge calcium chloride (dihydrate) 2.4 g, Sparge 88% lactic
> acid 1.0 ml to the HLT. Stir to dissolve, then underlet. 15.0 L ships; the remainder
> is dead space and transfer loss.

`batch-sparge`, `MASH_ONLY`:

> After the strike is drawn and the HLT is topped up to 16.0 L: no salts in the HLT.
> Add Sparge 88% lactic acid 1.0 ml only. 15.0 L ships.

When every HLT addition is zero, the instruction reads "No additions to the HLT —
underlet with untreated water" rather than going blank.
