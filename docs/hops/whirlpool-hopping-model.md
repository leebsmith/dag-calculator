# Whirlpool Hopping Model

Canonical theory and equations for whirlpool bitterness. The production
implementation is the sealed backend boundary `solver.hops`
(`backend/app/core/hop_solver.py`), like the batch and water solvers. The
artifact owns the hop charges, targets, and the rest/cooling inputs. The
JavaScript `views/whirlpool.js` / `views/hops.js` copies are retained only as
the offline boundary stub.

Status: implemented model for T-90 pellets, flowable CO₂ extracts and lupulin
pellets, target-driven IBU, per-charge rest duration and initial temperature, and
batch-level ambient temperature and cooling time constant. Product forms are
placed by process — T-90 or extract in the boil, T-90 or lupulin in the
whirlpool. Oil retention, humulinone bitterness, active chilling and
equipment-specific cooling curves are deferred.

## 1. Notation

| Symbol | Meaning | Unit |
|---|---|---|
| `T` | Absolute wort temperature | K |
| `T(t)` | Wort temperature during the rest | °C |
| `T0` | Initial (flameout) temperature | °C |
| `T_amb` | Ambient temperature | °C |
| `k` | Lumped cooling decay constant | min⁻¹ |
| `t` | Rest duration | min |
| `t_eff` | Boiling-equivalent contact time | min |
| `G` | Post-boil specific gravity | SG |
| `V` | Post-boil wort volume | L |
| `m` | Hop charge mass | kg |
| `A` | Alpha-acid fraction | decimal |
| `U` | Fractional isomerization utilization | — |
| `C_trub` | Product-form utilization scalar | — |

`k` and the ambient temperature are batch-level model inputs. Duration and
initial temperature are per hop charge.

## 2. Temperature-dependent isomerization

Relative to boiling, alpha-acid isomerization follows an Arrhenius rate:

```
U_rel(T) = 2.39e11 · exp(-9773 / T)
```

`T` is in kelvin. The implementation constants are `2.39e11` and `9773 K`
(`Ea ≈ 81.3 kJ/mol`).

| Temperature | `U_rel` |
|---|---|
| 100 °C | 1.009 |
| 90 °C | 0.491 |
| 80 °C | 0.229 |
| 70 °C | 0.102 |
| 60 °C | 0.0435 |
| 50 °C | 0.0175 |

The 100 °C value is slightly above 1.0 because the empirical fit is not
normalized to exactly one at the boiling point. That is why an isothermal
100 °C rest evaluates to `t_eff ≈ 30.27 min` for a 30-minute duration.

## 3. Cooling curve

Passive cooling follows Newton's law:

```
T(t) = T_amb + (T0 - T_amb) · exp(-k · t)
```

The default `k = 0.0092 min⁻¹` is the reference value for an uninsulated
stainless kettle in ambient air. It is a lumped constant: real vessels vary with
geometry, fill volume, insulation, evaporation, and drafts. Use the measured
endpoint to calibrate it:

```
k = -ln((T_end - T_amb) / (T0 - T_amb)) / t
```

### Default calibration

The default decays 99 °C wort to about 80.0 °C after 30 minutes:

| `k` (min⁻¹) | Time constant `1/k` (min) | 30-min endpoint from 99 °C | `t_eff` | IBU for the reference charge |
|---|---|---|---|---|
| 0.0092 | 108.7 | 80.0 °C | 14.795 | 28.33 |
| 0.012 | 83.3 | 75.1 °C | 12.666 | 25.21 |
| 0.015 | 66.7 | 70.4 °C | 10.904 | 22.42 |
| 0.018 | 55.6 | 66.0 °C | 9.528 | 20.10 |

A partially filled 15-gallon kettle with about 6.5 gallons of wort in a drafty
room loses heat faster than the reference full-kettle case: the wetted area is
smaller, but the exposed headspace and surface-to-volume ratio are larger. A
value around `0.012–0.015 min⁻¹` is a reasonable starting point unless the
measured endpoint says otherwise. Slower cooling (smaller `k`) predicts more
bitterness; faster cooling predicts less.

## 4. Effective boiling-equivalent time

Integrate the relative rate over the cooling curve:

```
t_eff = ∫₀^t U_rel(T(τ)) dτ
```

The implementation uses deterministic adaptive Simpson quadrature with an
absolute tolerance of `1e-10 min`. No external numerical library is required.

## 5. Tinseth utilization and IBU

Gravity factor and time factor:

```
f_gravity(G) = 1.65 · 0.000125^(G - 1)
f_time(t_eff) = (1 - exp(-0.04 · t_eff)) / 4.15
U = f_gravity(G) · f_time(t_eff) · C_trub
```

Product-form scalar. It is a **lumped mechanical efficiency**, not a different
kinetics: the temperature dependence stays in the Arrhenius integral, and the
scalar carries only what the form changes about *how much of the alpha reaches
the wort*. T-90 is the baseline (Tinseth already embeds the pellet's empirical
trub loss); an extract leaves no vegetative matter behind and its resin is
already ruptured, so less alpha is lost and it disperses more readily.

| Form | `C_trub` | Where it is used |
|---|---|---|
| T-90 pellets | 1.00 | Boil and whirlpool — the default |
| Lupulin pellets | 1.10 | Whirlpool |
| Flowable CO₂ extract | 1.15 | Boil, applied isothermally |

A boil has no cooling curve, so the extract's scalar is taken at its base value;
heat and shear are at their maximum there, which is the end of the range the
`1.15` was measured at. It is an assumption borrowed from that measurement, not a
measured boil figure.

Forward IBU from a hop charge:

```
IBU = (m_g · A · 1000 / V_L) · U
```

Inverse mass for IBU-share authoring:

```
m_g = IBU · V_L / (A · 1000 · U)
```

The hops card authors whirlpool additions by IBU share. The style card splits
the total IBU target into boil and whirlpool pools; each hop table normalizes
its `parts` into shares of its own pool and back-calculates mass with the
inverse model.

### Boil extract practice

The boil sells T-90 pellets or a flowable CO₂ extract; lupulin powder is a
whirlpool product. An extract charge is a late addition — the picker seeds 15
minutes rather than the full boil — because a rolling boil steam-distils the
extract.

- Dose gravimetrically; the card derives grams and prints hop masses in grams.
  No density or volumetric conversion is used.
- Enter the lot certificate-of-analysis alpha. Published product ranges are
  DynaBoost `0.35–0.50` and Incognito `0.20–0.55`; the seeded catalog stores the
  range midpoint (`0.425`, `0.375`) as an editable preset.
- At equal alpha and time, extract mass is `1 / 1.15` of T-90 mass.
- A flameout charge is not represented: Tinseth's time factor is zero at zero
  minutes, and a flameout stand is a whirlpool calculation the product does not
  offer for extracts.
- Product guidance: DynaBoost `0.15–0.5 g/L`; Incognito `0.5–2.0 g/L`, maximum
  `2 g/L`. The card keeps a generic `4 g/gal` ceiling warning; the product limits
  are informational until dose is modeled.
- T-90 replacement is `1:10` for DynaBoost, `1:6` for Incognito, and `1:8` for the
  generic preset. These are supplier substitution heuristics, not bitterness
  equations. The inspector can show a T-90 equivalent (`extract mass × ratio`)
  when the row carries a ratio; IBU back-solving always uses alpha and utilization.
- `R_absorption = 0` for extract. The model already uses the post-boil hot
  kettle volume and does not subtract hop vegetative absorption.

### Whirlpool timeline

Charges cannot be removed without emptying the kettle, so every charge rests to
knockout. That makes a charge's duration its **time to knockout**, and all
charges share the same end:

```
t_end   = max(duration_i)
t_add_i = t_end - duration_i
```

The solver builds one batch curve. Between additions the wort cools passively at
the batch cooling constant; at each addition it compares the posted start
temperature with the latent value there:

| Posted vs latent (tolerance 0.5 °C) | Meaning | Model |
|---|---|---|
| within tolerance | passive | no event |
| below | forced chill | instantaneous drop, then passive from the posted value |
| above | heating | rejected with `WHIRLPOOL_HEATING` |

Two charges within 0.05 min of the same duration are one addition; if they post
temperatures more than 0.5 °C apart the request fails with
`WHIRLPOOL_ADDITION_CONFLICT`. A charge below the ambient temperature fails with
`WHIRLPOOL_BELOW_AMBIENT`, because the kettle would have to warm. Each charge's
`t_eff` integrates its own window over that one curve; its mass then follows its
own IBU share, alpha and form multiplier.

Example: charges at 30 and 20 minutes from 99 °C, the second posted at 76.7 °C,
infer a chill at 10 minutes (`99 °C → 92.1 °C` passively, then 76.7 °C) and give
the first charge 9.81 effective minutes; the second gets 2.43.

### IBU splits

The report prints two splits. The boil/whirlpool split is the authored pool
division: `batch.boil_target_ibu` and `batch.whirlpool_target_ibu` over
`batch.target_ibu`, declared as the shares `batch.boil_ibu_share` and
`batch.whirlpool_ibu_share`.

The hot/cool split cuts the whirlpool pool at the **top of the isomerization
floor band** (`79 °C`, `isomerization_floor` in the whirlpool notes): above it a
charge still isomerises freely, at or below it the stand mostly extracts flavour
and aroma. Cutting at the band's *top* is what makes the band's own midpoint
(`77.5 °C`) classify as cool — the card applies the midpoint when a brewer picks
that band. The boundary returns the two sums as
`solver.hops.whirlpool_hot_ibu` and `solver.hops.whirlpool_cool_ibu`; the shares
are `batch.whirlpool_hot_ibu_share` and
`batch.whirlpool_cool_ibu_share`. The threshold is `ISOMERIZATION_FLOOR_C` in
`backend/app/core/hop_solver.py`, and a coupling test holds it equal to the
band's top; a charge exactly at the threshold counts as cool, and the two sums
always add up to the whirlpool pool.

## 6. Reference vectors

Implemented test vectors:

| Case | Expected |
|---|---|
| 99 °C → 20 °C, `k = 0.0092`, 30 min | `t_eff = 14.795001104` min |
| 50 g at 10% AA, 20 L, 1.050, above case | `28.327469657` IBU |
| Isothermal 100 °C, 30 min | `t_eff = 30.276952309` min |
| Isothermal 60 °C, 20 min | `t_eff = 0.869642856` min |
| 30 IBU, 20 L, 1.050, 30 min, 45% AA extract | `≈ 9.81 g` extract |

## 7. Reconciliation with the hot-side reference

`docs/hops/reference/hot-side-hopping-agent-dosing.md` is the broader hot-side product and
dosing reference. It discusses product-form multipliers, oil retention,
humulinones, and perceived bitterness. This document is the implementation
contract.

- The implementation uses `9773 K` and `2.39e11` from the provided whirlpool
  model. The `Ea/R ≈ 9500 K` figure in the hot-side reference is a rounded
  alternate fit and is not used.
- V1 supports T-90 pellets (`C_trub = 1.0`), lupulin pellets (`C_trub = 1.10`)
  and flowable CO₂ extracts (`C_trub = 1.15`, in the boil). The hot-side
  reference's `1.15` above 90 °C is the number the extract uses; its separate
  "10–15 % penalty" for a 75–85 °C whirlpool describes a product placement the
  calculator does not offer.
- Oil retention, humulinone bitterness, and perceived-bitterness offsets are
  deferred.
- Ambient temperature and cooling decay are inputs, not constants in the model
  code. Equipment-specific cooling curves are a later feature.

## 8. Limitations

- Single lumped wort temperature; no stratification or active chilling.
- Product forms are limited to T-90 pellets, lupulin pellets and flowable CO₂
  extract. Pellet vegetative absorption, pH/fermentation losses, and dry-hop
  contribution are not modelled.
- Chills are instantaneous: the transient through the dropped range is skipped.
  After a chill the curve keeps decaying with the batch constant, so a held
  temperature is under-modelled. Charges are assumed to share one knockout end,
  which is why durations encode addition order.
- The boil carries a product form: every boil row is T-90 unless it names an
  extract, which is solved with the `1.15` scalar at boiling temperature. The
  reference's standardized bittering products (Flex and similar) are not
  modelled; their supplier formulas are in the appendix.
- No oil or sensory prediction; the output is IBU only.
- The cooling constant must be calibrated for a vessel and fill volume.

## 9. Provenance

- Provided whirlpool modeling note (`modeling-whirlpool-hops.md`, 2026-10-23):
  Arrhenius rate, Newton cooling, numerical effective time, Tinseth extension,
  and the reference vectors.
- `docs/hops/reference/hot-side-hopping-agent-dosing.md`: the background
  hot-side dosing conversation (retrieved 2026-10-29), which supplies the
  product-form bands and the oil-retention context; its appendix carries the
  Yakima Chief Hops early-kettle dosing formula.
- `frontend/src/views/whirlpool.js`: reference implementation.
- `tests/frontend/whirlpool.test.js`: executable reference vectors.
