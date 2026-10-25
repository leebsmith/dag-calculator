# Domain Equations & Black-Box Contracts

This document states the brewing math the acyclic graph computes, and the
**contracts** of the two sealed black boxes. It is the reference the discovery
sweep verifies against the known-good code.

> **Provenance.** The batch math derives from `docs/batch-math/unified-treatment.md`
> and `docs/batch-math/batch-sparge-non-linear-root-finding-v2.md`. The water
> math derives from `docs/good-enough-water-chemistry-calculator.md` and
> `scripts/water-chemistry-module.py` (Bru'n Water port). The color math derives
> from `docs/srm-ebc-and-lovibond-reference.md`.
>
> **Provenance (batch).** The batch math was originally specified in the legacy
> `docs/batch-math/` treatment (`unified-treatment.md`,
> `batch-sparge-non-linear-root-finding-v2.md`) and `plans/vessel-loss-model.md`
> in the predecessor repository. Those files are **not** vendored here; §2.4–2.7
> below consolidates the parts that remain authoritative, and the solver's
> docstrings point here rather than at them. Two of their statements are
> **superseded** — the absorption coefficient (D15) and the transfer-loss
> accounting (D12) in [`plans/batch-solver-correctness.md`](../../plans/batch-solver-correctness.md).

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

- **Weighted grist Lovibond** (`grain_color`) — the `pct`-weighted average of the
  malts' `color_lovibond` (a summary of *grain* color, not finished-beer SRM).
  Display `EBC = 1.97 × °L`.
- **Finished-beer SRM** (`beer_color`) — via the MCU path (Morey):

  ```
  MCU = Σ (weight_lb · color_lovibond) / volume_gal
  SRM = 1.4922 · MCU^0.6859
  EBC = 1.97 · SRM
  ```

> Grain color and beer color are distinct `dimension`s (`grain_color` /
> `beer_color`, each linear ×1.97 to EBC). The finished-beer `SRM` is produced by
> the `morey_mcu_to_srm` *function*; the single-malt `morey_lovibond_to_srm`
> bridge was removed in schema v3.

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
| `apparent_attenuation` | percentage (fraction) | yeast attenuation cap (strain × batch derate), (0, 1] |
| `v_ferm` | volume | target cold fermenter volume (L) |
| `topology` | taxonomy | `r_l_to_g` \| `runoff_ratio` |
| `intensive_value` | mash_thickness / dimensionless | `R_L:G` (L/kg) or `r` |
| `grain_bill` | collection | rows `{ w_i, yield_i, mc_i, fermentability_i }` (Σw=1) |
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
| `aa_wort` | percentage |
| `aa_batch` | percentage |
| `hlt` `{ v_hlt_debt, v_hlt_after_strike, v_hlt_top_up, v_sparge_deliverable }` | volume |
| `mash_thickness_l_per_kg` | mash_thickness |

### 2.3 Domain / error surface

`INVALID_TARGET_ABV` · `INVALID_ATTENUATION` · `ABV_UNREACHABLE` ·
`INVALID_FERM_VOLUME` · `INVALID_SHRINKAGE` · `EXTRACT_TARGET_NON_POSITIVE` ·
`INVALID_YIELD` · `DEGENERATE_BRACKET` · `BRACKET_NO_SIGN_CHANGE` ·
`UNKNOWN_TOPOLOGY` · `INVALID_INTENSIVE_VALUE` · `MASH_TOO_THIN` · `HLT_TOO_SMALL`.

### 2.4 Derivation — two-stage batch lauter

Single-strike, single-sparge extraction is modelled as two equilibrium stages. All
symbols are declared as artifact constants; none are restated numerically here.

Mash generation (`E` is the dry-basis composite yield, already net of grain moisture):

    S_conv = eta_conv · E · M
    V_mc   = M · MC_bar / rho_water
    V_sol  = v_bar · S_conv
    V_ret  = k_abs_true · M + V_dead

Retention and lauter efficiency:

    R_f1     = V_ret / (V_strike + V_mc + V_sol)
    R_f2     = V_ret / (V_sparge + V_ret)
    eta_lauter = 1 - R_f1 · R_f2

so the kettle receives

    S_post = S_conv · (1 - R_f1 · R_f2) + S_late

Runnings, volumes, and gravities:

    V_run1 = V_strike + V_mc + V_sol - V_ret
    V_run2 = V_sparge
    V_pre  = V_run1 + V_run2
    S_run1 = S_conv · (1 - R_f1)
    S_run2 = S_conv · R_f1 · (1 - R_f2)
    SG_pre = 1 + (S_run1 + S_run2) · gamma / (1000 · V_pre)

Cold-side reversal (Phases 1–2). `SG_post` is the Cutaia inversion of the target ABV at
the batch attenuation, computed through the artifact functions `cutaia_abv_plato`,
`sg_to_plato` and `plato_to_sg`:

    V_kettle_cold  = V_ferm + V_kettle_dead · (1 - f_shrink)
    S_post_target  = 1000 · (SG_post - 1) · V_kettle_cold / gamma
    V_pre          = (V_ferm + V_kettle_dead + V_kettle_transfer + V_trub) / (1 - f_shrink)
                     + delta_v_evap - v_bar · S_late

| Symbol | Constant |
|---|---|
| `k_abs_true` | `k_abs_true` (absorption; value pending D15) |
| `v_bar` | `v_bar` |
| `gamma` | `sucrose_yield_ldk` |
| `rho_water` | `rho_water` |
| `f_shrink` | `default_shrinkage_fraction` |

### 2.5 Constraint topologies and the residual

The liquid subsystem has two degrees of freedom, so it needs two constraints, at least one
of them extensive. The solver consumes `{V_pre, intensive}`; `V_ferm` is the user input and
is reversed into `V_pre` first. `r = V_run1 / V_sparge`, so equal runnings is `r = 1` —
where lauter efficiency (`eta_lauter` above) is at its maximum, because both retention
fractions are minimised there.

    {V_pre, R_L:G}  V_strike = L:G · M;  V_run1 from the tun balance;
                    V_sparge = V_drain - V_run1
    {V_pre, r}      V_sparge = V_drain / (r + 1)          (static)
                    V_run1   = V_drain - V_sparge         (static)
                    V_strike = V_run1 + V_ret - V_mc - V_sol   (reversed post-solve)

`V_drain = V_pre + mash_transfer_loss` — the tun must yield the kettle target plus the
volume held in its transfer plumbing (§2.6).

The residual Brent's method solves, in cleared-denominator form:

    c_vol = MC_bar / rho_water + v_bar · eta_conv · E
    D1    = V_strike + c_vol · M
    D2    = V_sparge + V_dead + k_abs_true · M
    P(M)  = (eta_conv · E · M) · (D1 · D2 - V_ret²)
            - (S_post_target - S_late) · D1 · D2

Bracket:

    a = max(0, (S_post_target - S_late) / E)
    b = (S_post_target - S_late) / (0.5 · E)

**Identity — do not "simplify" it away.** Under `{V_pre, r}`, `V_run1` and `V_sparge` are
static, so

    D1 = V_strike + c_vol · M = (V_run1 + V_ret - V_mc - V_sol) + (V_mc + V_sol)
       = V_run1 + V_ret

exactly. Moisture and displaced extract therefore **cancel in the residual** — the runoff
solve is insensitive to them, unlike `{V_pre, R_L:G}` where `D1 = M · (L:G + c_vol)`. They
must nonetheless stay in the strike reversal, because the reported thickness is
`V_strike / M` and *is* sensitive to them. Dropping them shifts thickness by `c_vol`
(≈ 0.39 L/kg for the reference grist), which at small `r` crosses the absorption floor:
at `r = 0.001`, 5% ABV, 20 L the coded thickness is 1.348 L/kg and the "simplified" one is
1.741 L/kg, against a floor of 1.67. Two guards pin this: `D1` explicit equals `D1`
simplified, and `thickness` equals `(V_run1 + V_ret - V_mc - V_sol) / M`.

### 2.6 Loss taxonomy and volume accounting

| Class | Example | Property | Enters |
|---|---|---|---|
| Dead space | mash tun below the false bottom; kettle below the drain | vessel geometry | extract and water |
| Transfer loss | hose and pump after a vessel | plumbing | extract and water |
| Trub | kettle, post-boil | process / recipe | extract |
| Thermal shrinkage | kettle to pitching temperature | multiplicative | volume only |

HLT dead space and HLT transfer loss are **water debt, not extract loss**: they never enter
the wort mass balance, only the deliverable sparge volume and salt-dosing volume.

Mash tun to kettle: the kettle receives the mash liquid minus absorption, dead space and
transfer loss. Transfer loss therefore carries **wort, not water** — it removes extract as
well as volume. The solver writes this as `V_drain = V_pre + mash_transfer_loss`, and the
concentration denominator must be the drain volume. Phase 3 and Phase 4 must use the same
drain volume (see §2.7).

Kettle to fermenter: shrink the entire hot volume first, then subtract the additives.

    V_packaged = V_post · (1 - f_shrink) - V_trub - V_kettle_dead - V_kettle_transfer

Applying shrinkage to the net volume instead would incorrectly shrink the losses themselves.

### 2.7 Pending corrections

This derivation is the intended model. The implementation currently deviates in four ways,
each decided in [`plans/batch-solver-correctness.md`](../../plans/batch-solver-correctness.md):

| Deviation | Decision |
|---|---|
| Absorption constant is 0.200 gal/lb; the per-rig field is declared but unused | D15 |
| Phase 3 solves against `V_pre`; Phase 4 builds the cascade against `V_drain` — the mass is not compensated for the extract carried out by the loss | D12 |
| No physical floor on the *derived* thickness in `{V_pre, r}` | D21 |
| Tun capacity declared but unchecked; no upper thickness ceiling | D14, D3/D4 |

Each correction lands here in the same commit as its code, per the atomic-docs rule in
`AGENTS.md`.

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
| `target` | ions | the six working ions (checked targets constrain; unchecked ions float to source) |
| `custom_pinned_ions` | list[str] | the checked ion subset (short keys), filtered to checked ions with a positive target |
| `v_mash_treat_l` | volume | mash treatment volume (L), equal to `v_strike` |
| `v_hlt_treat_l` | volume | **sparge salt dosing volume** — the HLT content after the strike is drawn and any top-up added, derived from `batch.sparge_salted_volume` (`v_hlt_after_strike + v_hlt_top_up`), *not* the delivered sparge volume |
| `v_hlt_debt_l` | volume | undeliverable HLT debt (L) |
| `v_sparge_demand_l` | volume | sparge demand (L) |
| `mash_thickness_l_per_kg` | mash_thickness | resolved L/kg |
| `target_mash_ph` | ph | desired mash pH |
| `strategy` | taxonomy | `AUTO` \| `FLAVOR` \| `CALCIUM_FLOOR` \| `OPTIMIZE` \| `HYBRID` \| `BASELINE` \| `CUSTOM` (the UI derives it and never sends `AUTO`) |
| `salt_distribution` | taxonomy | `MASH_ONLY` \| `PROPORTIONAL` |
| `acid_medium` | taxonomy | `LACTIC_88` \| `PHOSPHORIC_10` \| `PHOSPHORIC_85` |
| `gypsum_form` / `cacl2_form` | taxonomy | hydrate forms |
| `preferred_alkaline_agent` | taxonomy | `BAKING_SODA` \| `CHALK` \| `PICKLING_LIME` |
| `calcium_floor_ppm` | concentration | Ca floor (ppm) |

The six working ions: `calcium_ca`, `magnesium_mg`, `sodium_na`, `sulfate_so4`,
`chloride_cl`, `alkalinity_as_caco3` (ppm, except alkalinity as CaCO₃). `source`
is read from the `water.source_report` selection (copied forward from records,
read-only in the batch); `target` is read from the editable `water.target.*`
roots, seeded from the selected preset's declared ions. The routed `strategy` is
derived from the checked set (`checked ∩ positive target`): `{}` → `BASELINE`,
`{SO₄,Cl}` → `CALCIUM_FLOOR`, `{SO₄,Cl,alk}` → `HYBRID`, all six → `OPTIMIZE`,
anything else → `CUSTOM` with those ions as pins. The UI never writes `AUTO`,
though the solver still accepts it for API clients. `target` alkalinity is the
root's `alkalinity_as_caco3` while `source` alkalinity is the report's
`total_alkalinity_caco3`. `calcium_floor_ppm` is the editable
`water.calcium_floor_ppm` root (seeded from the profile); `custom_pinned_ions`
is the checked subset in the `water.pinned_ions` collection — ignored by the
named strategies, and the equality set for `CUSTOM`. A checked ion with no
positive target is dropped by the request builder rather than sent as a zero
target. The assumed dosing practice —
dry-grist dosing, HLT dosing after top-up, the two distribution modes, and the
unmodelled grist/SMB contributions — lives in
`docs/calculator-assumed-dosing-practice.md`.

### 3.2 Outputs

| Field | Dimension |
|---|---|
| `strategy` | taxonomy |
| `prescription` `{ predicted_mash_ph, mash_ph_status, residual_hlt_water_l }` | ph / taxonomy / volume |
| `mash_additions` `{ gypsum_kg, cacl2_kg, epsom_kg, nacl_kg, acid_l, (baking_soda_kg \| chalk_kg \| pickling_lime_kg) }` | mass / volume |
| `sparge_additions` `{ … }` | mass / volume |
| `post_salt_mash_ions` | ions |
| `post_salt_hlt_ions` | ions — the treated HLT vector: `post_salt_mash_ions` under `PROPORTIONAL`, the source ions under `MASH_ONLY` |
| `post_dose_mash_ions` | ions — the full post-addition mash vector (flavor salts + alkaline agent + acid-neutralized alkalinity) |
| `total_added_salt_mass_g` | mass — total dosed salt mass (flavor salts + agent) |
| `added_mineral_tds_ppm` | concentration — added mineral mass normalized to the mash volume |
| `grist_buckets_kg` | mass (per grain type) |
| `warnings` / `notes` | text |
| `telemetry` | host-side only (not a DAG output) |

Derived water readouts: `water.kettle_blend.<ion>` volume-weights the treated
mash and HLT vectors by `v_run1 + v_run2` and `v_sparge`;
`water.kettle_blend.sulfate_chloride_ratio` and
`water.target.sulfate_chloride_ratio` guard `chloride > 0`. The grid shows
post-addition, kettle, and Δ columns; Δ formatting remains host-side.

### 3.3 Domain / error surface

`INVALID_MASH_VOLUME` · `INVALID_SPARGE_VOLUME` · `UNKNOWN_GRAIN_TYPE` ·
`UNKNOWN_ACID_MEDIUM` · `UNKNOWN_ALKALINE_AGENT` · `UNKNOWN_SALT_FORM` ·
`SALT_SOLVE_FAILED` · `ION_TARGET_OUT_OF_RANGE` · `UNKNOWN_STRATEGY`.
