# Whirlpool Hopping Model

Canonical theory and equations for whirlpool bitterness. The production
implementation is the sealed backend boundary `solver.hops`
(`backend/app/core/hop_solver.py`), like the batch and water solvers. The
artifact owns the hop charges, targets, and the rest/cooling inputs; the same
boundary returns the cooling curve (`whirlpool_timeline`) and its forced chills
(`whirlpool_chills`), so the client renders solved state and holds no copy of
these equations.

Status: implemented model for the four hop leaves — whole cone, pellets,
lupulin concentrate and extract — with target-driven IBU, per-charge rest
duration and initial temperature, and batch-level ambient temperature and
cooling time constant. The leaf never restricts the stage: the same four forms
are offered in the boil and the whirlpool, because form is a yield property and
placement is a row property (`docs/hops/hop-products.md`). Authored cooling-curve
records calibrate the time constant; oil retention, humulinone bitterness,
active chilling and equipment-level thermal simulation are deferred.

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

### Measured curves

The hops card offers `Default cooling`, the built-in `108.7 min` constant, and
any authored curves in the cooling-curve library. A curve record carries its
measured date, vessel reference, start and ambient temperatures, and time /
temperature points. Selecting one fits the log-linear model:

```
y_i = ln((T_i - T_amb) / (T_start - T_amb))
k = -slope(t_i, y_i)
```

The fit ignores points at or below ambient and requires at least two usable
points with strictly increasing, unique times. It writes `1/k` into
`batch.whirlpool_cooling_time_constant_min` and records the curve id in
`batch.cooling_curve_id`.

The curve's ambient is **not** copied into `batch.whirlpool_ambient_temp_c`.
Ambient is a brew-day condition; the picker shows the measured ambient beside
the batch value and warns when they differ by 5 °C or more. A fit with
`R² < 0.98` warns as well, but it never blocks the selection.

`Default cooling` restores `108.7 min` and clears the id. Editing the time
constant by hand clears the id and reads as `Custom`. Deleting the selected
record leaves the copied roots in place and reads as `Missing curve`; a
corrected measurement is a new record.

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

| Form | `C_trub` | Basis |
|---|---|---|
| Whole cone | supplied per charge | none published; the charge will not solve until it is set |
| Pellets (T-90, T-45/55) | 1.00 | Tinseth's own pellet fit — the baseline |
| Lupulin concentrate (Cryo, Lupomax) | 1.10 | gland versus bract |
| Extract (CO₂, Flex, DynaBoost, Incognito) | 1.15 | the hot-side reference above 90 °C |

A boil has no cooling curve, so a scalar is applied isothermally; heat and shear
are at their maximum there, which is the end of the range the `1.15` was measured
at. It is an assumption borrowed from that measurement, not a measured boil
figure.

Whole cone has no source at all, so the boundary refuses rather than guessing:
a cone charge without its factor raises `CONE_UTILIZATION_REQUIRED`, and the
mass stays unsolved. The factor lives on the charge, bounded to `0 < c ≤ 1`,
because a cone beating a pellet is the thing the scalar exists to deny.

Forward IBU from a hop charge:

```
IBU = (m_g · A · 1000 / V_L) · U
```

Inverse mass for IBU-share authoring:

```
m_g = IBU · V_L / (A · 1000 · U)
```

Inverse mass for a mass-share pool (`mass_pool`), where the shares are
`mass_pct` and one scale factor sets the grams:

```
IBU_i  = m_i · k_i                     k_i = IBU per kg of charge i
m_i    = mass_pct_i · M
M      = target_ibu / Σ (mass_pct_i · k_i)
```

`k_i` is the forward model's IBU per kilogram, so `k_i = A_i · U_i · 1000 / V_L`
and the same utilisation and form rules apply. The solve is one division because
IBU is linear in mass and utilisation depends on time, gravity, temperature and
form but never on mass. Shares are invariant under `M`: the same percentages
land on a different mass for a different volume, gravity or target.

Two modes exist, chosen by `batch.hop_allocation_mode`:

- `ibu_split` (default) — the style card splits the total IBU target into boil
  and whirlpool pools; each hop table normalizes its `parts` into shares of its
  own pool and back-calculates mass with the inverse model above.
- `mass_pool` — the kettle and both whirlpool stands are one pool. Each charge
  authors `mass_parts` (normalized to `mass_pct` across both tables), the whole
  target is spent across it, and the stage IBU split is a result. The splits in
  §"IBU splits" are then derived from the masses rather than authored.

The mode is a root, not a compile-time choice: `parts` keeps its IBU meaning in
both modes, and the mass shares live in their own column, so no stored batch is
reinterpreted and switching modes is lossless.

### Extract practice

An extract charge is a late addition — the picker seeds 15 minutes rather than
the full boil — because a rolling boil steam-distils the extract. The leaf does
not forbid a whirlpool charge: a maker's placement is guidance, the row is the
truth, and a cool stand simply yields less.

- Dose gravimetrically; the card derives grams and prints hop masses in grams.
  No density or volumetric conversion is used.
- Enter the lot certificate-of-analysis alpha. The catalog preset is a
  placeholder; `docs/hops/hop-products.md` carries the published ranges and the
  supplier guidance.
- At equal alpha and time, extract mass is `1 / 1.15` of T-90 mass.
- A zero-minute boil charge is not modelled: Tinseth's time factor is zero at
  zero minutes, so a flameout charge belongs to the whirlpool table.
- `R_absorption = 0` for extract. The model already uses the post-boil hot
  kettle volume and does not subtract hop vegetative absorption.

### Boil timeline

A boil charge authors its **share of the boil**, not a minute count:

```
t_exposure_i = boil_time_fraction_i × batch.boil_time_min
```

The share is deliberate, and it is the one place the two hot-side coordinates
differ. A whirlpool charge authors a *position* (minutes after flameout) because
position decides the temperature the charge meets; a boil charge authors a
*share* because there is no temperature history to meet, only duration. The
consequence is intended and must not be "fixed": changing
`batch.boil_time_min` re-solves every boil charge, so a longer boil needs less
hops for the same IBU. The boil length is a recipe input, not just a process
setting.

A share of 100 % is a full-boil charge and 0 % is flameout; the card prints both
the share and the solved minutes, and the editor names the field "Portion of
boil" so a percentage is never mistaken for a position.

### Whirlpool timeline

Charges cannot be removed without emptying the kettle, so every charge rests to
knockout. The window is a batch input, not a property of the longest charge:

```
t_0     = 0        at t_start_c
t_end   = knockout_min
t_add_i = addition_at_min_i          exposure_i = t_end - t_add_i
```

The curve starts at flameout, so a flameout charge is one at position zero and a
charge added at knockout has no exposure and no mass. The solver builds one
batch curve from `(0, start_temp_c)` to `knockout_min`. Between additions the wort cools passively at
the batch cooling constant; at each addition it compares the posted start
temperature with the latent value there:

| Posted vs latent (tolerance 0.5 °C) | Meaning | Model |
|---|---|---|
| within tolerance | passive | no event |
| below | forced chill | instantaneous drop, then passive from the posted value |
| above | heating | rejected with `WHIRLPOOL_HEATING` |

Two charges within 0.05 min of the same addition time are one addition; if they
post temperatures more than 0.5 °C apart the request fails with
`WHIRLPOOL_ADDITION_CONFLICT`, and a charge beyond the knockout fails with
`INVALID_HOP_INPUT`. A charge below the ambient temperature fails with
`WHIRLPOOL_BELOW_AMBIENT`, because the kettle would have to warm. Each charge's
`t_eff` integrates its own window over that one curve; its mass then follows its
own IBU share, alpha and form multiplier.

Example: a knockout at 30 min, charges at positions 0 and 10 from 99 °C, the
second posted at 76.7 °C, infer a chill at 10 minutes (`99 °C → 92.1 °C`
passively, then 76.7 °C) and give the first charge 9.81 effective minutes; the
second gets 2.43.

The boundary returns the curve it solved over, so no client recomputes the
integral: `solver.hops.whirlpool_timeline` is the segment list
(`start_min`, `end_min`, `temp_c` — the temperature at the segment's start) and
`solver.hops.whirlpool_chills` is the forced-chill list (`at_min`,
`from_temp_c`, `to_temp_c`). Chills are declared separately rather than inferred
from a segment boundary because `from_temp_c` is a value on the cooling curve,
which only the host can evaluate; a client deriving it would be doing the
integral's arithmetic again. Both are boundary outputs, so they travel in the
frozen report bundle and are covered by the stub-completeness guard.

The card samples that returned curve at one-minute steps for its cooling-ceiling
table, using the same Newton decay between each segment's start and the next
chill or knockout. The table is a display aid from the last solve: it names the
maximum posted temperature at each minute, and the boundary still enforces the
0.5 °C tolerance. The draft editor previews the same ceiling per row from its
unsaved rows, so an edited time or temperature is marked above the curve before
the charge is saved; the boundary remains the authority.

### IBU splits

The report prints a stage table — boil, hot whirlpool, cool whirlpool, and the
hot-side total — with each stage's mass share, mass, IBU and IBU share, plus the
boil/whirlpool and hot/cool pairs below it.

The boil/whirlpool split is reported from what the charges carry:
`batch.boil_ibu_share` and `batch.whirlpool_ibu_share` divide
`solver.hops.boil_ibu` and the two whirlpool sums over
`batch.hop_realized_ibu`. In `ibu_split` this equals the authored pool division
`batch.boil_target_ibu` / `batch.whirlpool_target_ibu` over `batch.target_ibu`,
because the shares are assigned; in `mass_pool` it is the split the masses
produced. The stage mass shares are `batch.hop_boil_mass_share`,
`batch.hop_hot_mass_share` and `batch.hop_cool_mass_share`, over
`solver.hops.total_mass_kg`.

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
- The model supports the four leaves: pellets (`C_trub = 1.0`), lupulin
  concentrate (`1.10`), extract (`1.15`) and whole cone, whose scalar the charge
  supplies because no source publishes one. The hot-side reference's `1.15`
  above 90 °C is the number the extract uses; its separate "10–15 % penalty" for
  a 75–85 °C whirlpool is what the cooling curve already prices, so the scalar is
  not varied by stage.
- Oil retention, humulinone bitterness, and perceived-bitterness offsets are
  deferred.
- Ambient temperature and cooling decay are inputs, not constants in the model
  code. Authored curves calibrate the decay; no equipment-level thermal
  simulation is attempted.

## 8. Hop oil charge

The bitterness model ends at IBU; oil is priced separately, and deliberately
narrowly.

```
oil_mg_per_L = mass_kg × 1000 × oil_ml_per_100g × form_multiplier / 100
               × density_g_per_ml × 1000 / volume_L
```

Two constants, both in the artifact: `oil_form_multiplier_lupulin` = 2.7
(measured, YCH 2022, 26 varieties) and `oil_density_g_per_ml` = 0.85 (a unit
conversion, not a fact about a hop). T-90 is the reference at 1; whole cone is
assumed 1, since no source publishes a ratio; extract is unpriced, since no
per-variety oil figure exists for it.

**Kettle only.** The charge covers the boil and the whirlpool. **Dry hops are not
priced**, and that is the larger gap in an aromatic beer: a 70 IBU hazy prices at
about 121 mg/L in the kettle, and 10–20 g/L of dry hops would add roughly
210–430 mg/L more. A beer that never dry hops — most lagers, and plenty of ales —
is unaffected by the omission.

**The bract floor.** Lupulin concentration carries oil and alpha but strips the
vegetative matter, so a bill built entirely from it loses the polyphenol and
tannin structure. YCH's benchmark for adapting a T-90 recipe keeps 25 g of T-90
per 40 g of Cryo — a floor of 0.625 g of bract-carrying hop per gram of lupulin,
held in `batch.bract_floor_ratio` and overridable.

The check is hot-side: bract mass is every T-90 and whole-cone charge there,
lupulin mass every lupulin charge, and the bill passes when
`bract ≥ ratio × lupulin`. The boundary exports the two masses as
`solver.hops.bract_mass_kg` and `solver.hops.lupulin_mass_kg`; the artifact
derives `batch.bract_floor_kg` and `batch.bract_shortfall_kg` from them. The
floor is a policy benchmark, so it warns and never blocks or rewrites. The hops
card shows the composition whenever lupulin is present and turns the line into a
shortfall warning when the floor is missed; the report prints the same figures
in its overall-hops block. A bill with no lupulin shows nothing.

**Added, never retained.** Oils volatilise in the boil and adsorb to trub, yeast
and filter media; nothing in the source set measures the transfer, so the model
stops at what the charge puts in and says "added". A kettle figure is not a proxy
for aroma: two beers with the same kettle oil and different dry hops are not
comparable.

**Dry hop, when it lands.** The mechanics are known and the row already carries
the inputs: contact time saturates within 24–72 h, the application stage decides
how much is lost to CO2 stripping and yeast adsorption, and the form changes how
readily oil is exposed. A first version would be a stage factor over the existing
application-event taxonomy times `(1 − e^(−t/τ))`, declared as a prior and
reported as *extracted*. Total oil remains a mass budget; the quantities that are
actually measured are compounds — linalool, geraniol, myrcene — at µg/L.

## 9. Limitations

- Single lumped wort temperature; no stratification or active chilling.
- Product forms are the four leaves of `docs/hops/hop-products.md`; the yield
  scalar is one number per leaf and does not vary by stage. Pellet vegetative
  absorption, pH/fermentation losses, and dry-hop contribution are not modelled,
  and every charge shares one knockout end, set by the batch rather than inferred
  from the longest charge.
- Chills are instantaneous: the transient through the dropped range is skipped.
  After a chill the curve keeps decaying with the batch constant, so a held
  temperature is under-modelled. Charges are assumed to share one knockout end,
  which is why durations encode addition order.
- The boil carries a product form: every boil row is T-90 unless it names an
  extract, which is solved with the `1.15` scalar at boiling temperature. The
  reference's standardized bittering products (Flex and similar) are not
  modelled; their supplier formulas are in the appendix.
- No sensory prediction. Oil is priced as a kettle charge (§8), separately from
  IBU, and dry hops are outside it.
- The cooling constant must be calibrated for a vessel and fill volume.

## 10. Provenance

- Provided whirlpool modeling note (`modeling-whirlpool-hops.md`, 2026-10-23):
  Arrhenius rate, Newton cooling, numerical effective time, Tinseth extension,
  and the reference vectors.
- `docs/hops/reference/hot-side-hopping-agent-dosing.md`: the background
  hot-side dosing conversation (retrieved 2026-10-29), which supplies the
  product-form bands and the oil-retention context; its appendix carries the
  Yakima Chief Hops early-kettle dosing formula.
- `backend/app/core/hop_solver.py`: the implementation, and the only one — the
  browser renders the segments and chills the boundary returns.
- `tests/backend/test_hop_solver.py` and
  `tests/conformance/fixtures/hop-parity.json`: executable reference vectors.
