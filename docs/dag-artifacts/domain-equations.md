# Domain Equations & Black-Box Contracts

This document states the brewing math the acyclic graph computes, and the
**contracts** of the two sealed black boxes. It is the reference the discovery
sweep verifies against the known-good code.

> **Provenance.** The batch math derives from `docs/batch-math/unified-treatment.md`
> and `docs/batch-math/batch-sparge-non-linear-root-finding-v2.md`. The water
> math derives from `docs/good-enough-water-chemistry-calculator.md` and
> `scripts/water-chemistry-module.py` (Bru'n Water port). The color math derives
> from `docs/srm-ebc-and-lovibond-reference.md`.

---

## 1. Shared equations (the acyclic graph)

These are `derived` nodes / `functions` — pure, closed-form, and owned by the
artifact.

### 1.1 Strike-water temperature

The base strike temperature (excluding the mash-tun thermal-mass correction):

```
T_strike = T_target + (0.41 / mash_thickness) · (T_target − T_grain)
```

where `mash_thickness` is the **solver-resolved** L/kg ratio (a boundary output),
`T_target` is the dough-in target, `T_grain` is the grain temperature. The `0.41`
factor is the `mash_thermal_factor` constant.

The tun thermal-mass correction (a **temperature delta**, not an absolute temp):

```
ΔT_tun = (C_tun / water_mass) · (T_target − T_tun_initial)
C_tun  = mash_tun_specific_heat · mash_tun_mass_kg
```

`water_mass` is the solver-resolved strike volume (`v_strike`, L ≈ kg).
`mash_tun_specific_heat` is ~0.12 kcal/(kg·°C) (stainless steel). The final
strike temperature is `T_strike + ΔT_tun`.

### 1.2 Extract yield

Sucrose reference yields:

- Imperial: `46.21` points·gal/lb (`sucrose_yield_ppg`).
- Metric: `385.641` L·°/kg (`sucrose_yield_ldk`) = `46.21 × 3.785411784 / 0.45359237`.

A malt's yield in gravity points: `yield × sucrose_yield`; the weighted grist
extract yield is the `pct`-weighted average of the malts' yields.

### 1.3 Color

- **Weighted grist Lovibond** — the `pct`-weighted average of the malts'
  `color_lovibond` (a summary of *grain* color, not finished-beer SRM).
- **Finished-beer SRM** — via the MCU path (Morey):

  ```
  MCU = Σ (weight_lb · color_lovibond) / volume_gal
  SRM = 1.4922 · MCU^0.6859
  EBC = 1.97 · SRM
  ```

- Lovibond↔SRM (single-value): `SRM = 1.3546·L − 0.76` (see `dimensions.md`).

> The current code's "weighted SRM" is a **weighted Lovibond average**, not a
> true SRM; the MCU→Morey step is the *correct* finished-beer color and is a
> `derived` node in the artifact.

### 1.4 Late additions (kettle sugars)

```
s_late_add = Σ (mass_kg · yield_fraction)
```

The sugar's extract contribution in gravity points is
`(mass_kg · yield_fraction · sucrose_yield_ldk) / v_ferm`.

### 1.5 Gravity conversions

ASBC Plato↔SG (see `dimensions.md` §3.1). `SG → Plato` is a cubic; `Plato → SG`
is its numeric inverse.

### 1.6 Grist allocation

Hamilton largest-remainder: given proportional `parts`, distribute percentages
summing to exactly 100.0% (at 0.1% resolution), breaking ties by larger `parts`
then original index. Purely deterministic. (This is a formulation rule; the
solver consumes the resulting `w_i` fractions.)

---

## 2. Black-box contract: batch-sparge solver

**Binding:** `batch_sparge_solver` · **Resolution:** `iterative` (bracketed
root-finding via `scipy.optimize.brentq`). **Realization:** the module
`backend/app/core/batch_solver.py`, sealed and opaque.

### 2.1 Inputs

| Field | Dimension | Meaning |
|---|---|---|
| `target_abv` | percentage | desired ABV (%) |
| `apparent_attenuation` | percentage (fraction) | expected attenuation, (0, 1] |
| `v_ferm` | volume | target cold fermenter volume (L) |
| `topology` | taxonomy | `r_l_to_g` \| `runoff_ratio` |
| `intensive_value` | mash_thickness / dimensionless | `R_L:G` (L/kg) or `r` |
| `grain_bill` | collection | rows `{ w_i, yield_i, mc_i }` (Σw=1) |
| `s_late_add` | mass | late-addition extract (kg) |
| `v_kettle_dead`, `delta_v_evap`, `v_dead` | volume | kettle/chiller dead space, boil-off, mash-tun dead space (L) |
| `eta_conv` | percentage (fraction) | mash conversion efficiency |
| `f_shrink` | percentage (fraction) | thermal contraction (~4%) |
| `hlt_starting_volume_l` | volume | HLT fill at brew-day start (L) |
| `hlt_dead_space_l`, `hlt_transfer_loss_l`, `hlt_coil_floor_l` | volume | HLT debts + coil floor (L) |
| `max_hlt_volume_l` | volume | HLT capacity (L) |

### 2.2 Outputs

| Field | Dimension |
|---|---|
| `sg_post_boil` | gravity |
| `v_pre_boil` | volume |
| `s_post_boil_target` | mass |
| `m_grist` | mass |
| `cascade` `{ v_strike, v_run1, v_run2, v_sparge, s_run1, s_run2, sg_pre_boil, v_post_boil, mash_thickness_l_per_kg }` | volumes / masses / gravity |
| `max_achievable_abv` | percentage |
| `hlt` `{ v_hlt_debt, v_hlt_after_strike, v_hlt_top_up, v_sparge_deliverable }` | volume |
| `mash_thickness_l_per_kg` | mash_thickness |

### 2.3 Domain / error surface

`INVALID_TARGET_ABV` · `INVALID_ATTENUATION` · `ABV_UNREACHABLE` ·
`INVALID_FERM_VOLUME` · `INVALID_SHRINKAGE` · `EXTRACT_TARGET_NON_POSITIVE` ·
`INVALID_YIELD` · `DEGENERATE_BRACKET` · `BRACKET_NO_SIGN_CHANGE` ·
`UNKNOWN_TOPOLOGY` · `INVALID_INTENSIVE_VALUE` · `MASH_TOO_THIN` · `HLT_TOO_SMALL`.

---

## 3. Black-box contract: water-chemistry solver

**Binding:** `water_chemistry_solver` · **Resolution:** `iterative` (linear
program via `scipy.optimize.linprog`). **Realization:** the module
`backend/app/core/water.py`, sealed and opaque.

### 3.1 Inputs

| Field | Dimension | Meaning |
|---|---|---|
| `grist` | collection | rows `{ mass_kg, color_lovibond, grain_type }` |
| `source` | ions | the six working ions (source water) |
| `target` | ions | the six working ions (target profile) |
| `v_mash_treat_l` | volume | mash treatment volume (L) |
| `v_hlt_treat_l` | volume | HLT treatment volume (L) |
| `v_hlt_debt_l` | volume | undeliverable HLT debt (L) |
| `v_sparge_demand_l` | volume | sparge demand (L) |
| `mash_thickness_l_per_kg` | mash_thickness | resolved L/kg |
| `target_mash_ph` | ph | desired mash pH |
| `strategy` | taxonomy | `FLAVOR` \| `CALCIUM_FLOOR` \| `OPTIMIZE` |
| `salt_distribution` | taxonomy | `MASH_ONLY` \| `PROPORTIONAL` |
| `acid_medium` | taxonomy | `LACTIC_88` \| `PHOSPHORIC_10` \| `PHOSPHORIC_85` |
| `gypsum_form` / `cacl2_form` | taxonomy | hydrate forms |
| `preferred_alkaline_agent` | taxonomy | `BAKING_SODA` \| `CHALK` \| `PICKLING_LIME` |
| `calcium_floor_ppm` | concentration | Ca floor (ppm) |

The six working ions: `calcium_ca`, `magnesium_mg`, `sodium_na`, `sulfate_so4`,
`chloride_cl`, `alkalinity_as_caco3` (ppm, except alkalinity as CaCO₃).

### 3.2 Outputs

| Field | Dimension |
|---|---|
| `strategy` | taxonomy |
| `prescription` `{ predicted_mash_ph, mash_ph_status, residual_hlt_water_l, sparge_tannin_warning }` | ph / taxonomy / volume / boolean |
| `mash_additions` `{ gypsum_g, cacl2_g, epsom_g, nacl_g, acid_ml, (baking_soda_g \| chalk_g \| pickling_lime_g) }` | mass / volume |
| `sparge_additions` `{ … }` | mass / volume |
| `post_salt_mash_ions` | ions |
| `grist_buckets_kg` | mass (per grain type) |
| `warnings` / `notes` | text |

### 3.3 Domain / error surface

`OPTIMIZE_NOT_IMPLEMENTED` · `SOURCE_NOT_FOUND` · `MISSING_SOURCE` ·
`SALT_SOLVE_FAILED` · `INVALID_MASH_VOLUME` · `UNKNOWN_STRATEGY` ·
`UNKNOWN_ACID` · `UNKNOWN_ALKALINE_AGENT` · `UNKNOWN_SALT_FORM` ·
`UNKNOWN_GRAIN_TYPE`.
