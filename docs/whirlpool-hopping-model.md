# Whirlpool Hopping Model

Canonical theory and equations for whirlpool bitterness. The production
implementation is the sealed backend boundary `solver.hops`
(`backend/app/core/hop_solver.py`), like the batch and water solvers. The
artifact owns the hop charges, targets, and the rest/cooling inputs. The
JavaScript `views/whirlpool.js` / `views/hops.js` copies are retained only as
the offline boundary stub.

Status: implemented model for T-90 pellets, flowable CO₂ extracts and lupulin
pellets, target-driven IBU, per-charge rest duration and initial temperature, and
batch-level ambient temperature and cooling time constant. The flowable
multiplier is temperature-dependent; oil retention, humulinone bitterness, active
chilling, equipment cooling curves and the boil product forms are deferred.

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

Product-form scalar. T-90 and lupulin are constant across the whirlpool window;
flowable extract is a smooth ramp between the two measured bounds, because a
cooling, un-agitated whirlpool no longer emulsifies the resin:

| Form | `C_trub` | Notes |
|---|---|---|
| T-90 pellets | 1.00 | Baseline, including the empirical trub loss built into Tinseth |
| Lupulin pellets | 1.10 | Concentrated lupulin; static across the window |
| Flowable CO₂ extract, `T0 ≥ 90 °C` | 1.15 | Low viscosity, pre-ruptured resin; no vegetative adsorption |
| Flowable CO₂ extract, `T0 ≤ 75 °C` | 0.80 | Lipid viscosity dominates; utilization falls below T-90 |
| Flowable CO₂ extract, 75–90 °C | smoothstep between 0.80 and 1.15 | Evaluated at the row's start temperature |

The multiplier is evaluated at the charge's `initial_temp_c`, not integrated
through the cooling curve; see §8.

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

### Flowable extract practice

- Dose gravimetrically; the card derives grams and defaults whirlpool mass to
  grams. No density or volumetric conversion is used.
- Enter the lot certificate-of-analysis alpha. Published product ranges are
  DynaBoost `0.35–0.50` and Incognito `0.20–0.55`; the seeded catalog stores the
  range midpoint (`0.425`, `0.375`) as an editable preset.
- At equal alpha and IBU target, extract mass is `1 / 1.15` of pellet mass above
  90 °C, rising to `1 / 0.80` of pellet mass at 75 °C and below.
- Product guidance: DynaBoost `0.15–0.5 g/L`; Incognito `0.5–2.0 g/L`, maximum
  `2 g/L`. The card keeps a generic `4 g/gal` ceiling warning; the product limits
  are informational until dose is modeled.
- T-90 replacement is `1:10` for DynaBoost, `1:6` for Incognito, and `1:8` for the
  generic preset. These are supplier substitution heuristics, not bitterness
  equations. The inspector can show a T-90 equivalent (`extract mass × ratio`)
  when the row carries a ratio; IBU back-solving always uses alpha and utilization.
- `R_absorption = 0` for extract. The model already uses the post-boil hot
  kettle volume and does not subtract hop vegetative absorption.

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

`docs/hot-side-hopping-agent-dosing.md` is the broader hot-side product and
dosing reference. It discusses product-form multipliers, oil retention,
humulinones, and perceived bitterness. This document is the implementation
contract.

- The implementation uses `9773 K` and `2.39e11` from the provided whirlpool
  model. The `Ea/R ≈ 9500 K` figure in the hot-side reference is a rounded
  alternate fit and is not used.
- V1 supports T-90 pellets (`C_trub = 1.0`), lupulin pellets (`C_trub = 1.10`)
  and flowable CO₂ extracts (`C_trub = 1.15` above 90 °C, `0.80` at 75 °C and
  below). The hot-side reference's "10–15 % penalty" and its `0.75–0.85`
  multiplier are not the same number; the implementation takes the `0.75–0.85`
  endpoints and uses the band midpoint `0.80`.
- Oil retention, humulinone bitterness, and perceived-bitterness offsets are
  deferred.
- Ambient temperature and cooling decay are inputs, not constants in the model
  code. Equipment-specific cooling curves are a later feature.

## 8. Limitations

- Single lumped wort temperature; no stratification or active chilling.
- Product forms are limited to T-90 pellets, lupulin pellets and flowable CO₂
  extract. Pellet vegetative absorption, pH/fermentation losses, and dry-hop
  contribution are not modelled.
- The product-form multiplier is a point estimate at the charge's start
  temperature; it is not integrated through the cooling curve, and the model has
  no shear or agitation input, so the cool-whirlpool branch assumes either good
  agitation or the low end of the band.
- The boil path has no product-form field: every boil row is modelled as T-90,
  including the standardized bittering products whose supplier formula is in the
  reference's appendix.
- No oil or sensory prediction; the output is IBU only.
- The cooling constant must be calibrated for a vessel and fill volume.

## 9. Provenance

- Provided whirlpool modeling note (`modeling-whirlpool-hops.md`, 2026-10-23):
  Arrhenius rate, Newton cooling, numerical effective time, Tinseth extension,
  and the reference vectors.
- `docs/hot-side-hopping-agent-dosing.md`: the vendored hot-side dosing
  conversation (retrieved 2026-10-29), which supplies the product-form bands and
  the oil-retention context; its appendix carries the Yakima Chief Hops
  early-kettle dosing formula.
- `frontend/src/views/whirlpool.js`: reference implementation.
- `tests/frontend/whirlpool.test.js`: executable reference vectors.
