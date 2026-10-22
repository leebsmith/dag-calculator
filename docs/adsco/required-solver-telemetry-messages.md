# ADSCO System Specification: Required Solver Telemetry & Decision Messages

**Document Status:** Approved Architecture  
**Target System:** Adaptive Dual-Strategy Constrained Optimizer (ADSCO)  
**Companion Documents:** `style-selection-and-ion-entry.md`, `ion-limits-for-brewing.md`  
**Reference Document:** `required-solver-telemetry-messages.md`

---

## 1. Executive Summary & Telemetry Philosophy

The Adaptive Dual-Strategy Constrained Optimizer (ADSCO) adheres to a strict **"Zero Hidden Decisions"** doctrine. In traditional brewing software, solvers frequently act as opaque "black boxes," silently shifting targets, rounding off impossible salt fractions, or forcing unwanted additions without explanation. 

ADSCO treats solver output not as a simple numerical receipt, but as an **auditable decision log**. Every time the engine infers intent, routes to an algorithm, hits an inequality boundary, makes a chemical substitution, or encounters biological limits, it emits structured telemetry.

This document provides the exhaustive specification for all log messages, telemetry events, warnings, notes, and validation errors emitted by ADSCO.

---

## 2. Telemetry Architecture & Event Structure

All telemetry messages emitted by ADSCO are serialized within the final execution payload as structured objects conforming to the following model:

```json
{
  "code": "GUARDRAIL_CALCIUM_FLOOR_RAISED",
  "category": "GUARDRAIL",
  "severity": "WARNING",
  "message": "User target Calcium (15.0 ppm) breached biological floor. Overridden by Universal Guardrail to 50.0 ppm.",
  "context": {
    "ion": "ca",
    "requested_val": 15.0,
    "enforced_val": 50.0,
    "threshold_rule": "DEFAULT_CALCIUM_FLOOR_PPM"
  }
}
```

### Telemetry Categories

| Category | Description | Primary Severity |
| :--- | :--- | :--- |
| `ROUTER` | Discloses the routing path, inferred intent, and active mathematical engine. | `INFO` |
| `GUARDRAIL` | Emitted when universal biological, toxicological, or astringency boundaries intervene. | `WARNING` |
| `OPTIMIZATION` | Mathematical notes detailing LP tie-breaking, relaxed bounds, and goal compromises. | `NOTE` / `INFO` |
| `ENZYMATIC` | Telemetry covering grist acidity balancing, mash pH status, and acid/base neutralization. | `INFO` / `WARNING` |
| `OPERATIONAL` | Brew-day liquor balance, salt dissolution limits, and HLT volume surplus/deficits. | `NOTE` / `WARNING` |
| `VALIDATION` | Gatekeeping errors that reject physically or numerically impossible inputs prior to solve. | `ERROR` |

---

## 3. Exhaustive Telemetry Catalog

### 3.1 Routing & Intent Classification (`ROUTER`)

These messages disclose which mathematical engine was spun up, confirming how the user's input vector was categorized.

#### `ROUTER_MODE_1_LINEAR_FLAVOR`
* **Trigger:** Input vector contains stylistic targets ($SO_4^{2-}$, $Cl^-$, and/or $Na^+$) with biological/structural ions omitted.
* **Severity:** `INFO`
* **Message Template:** `"Routed to Linear Minimalist Engine (Mode 1: Flavor Balance). Objective: Minimizing total added salt mass to satisfy flavor equalities while enforcing background biological guardrails."`
* **Representative Example:**  
  `"Routed to Linear Minimalist Engine (Mode 1: Flavor Balance). Objective: Minimizing total added salt mass to satisfy flavor equalities while enforcing background biological guardrails."`

#### `ROUTER_MODE_2_HYBRID_BUFFER`
* **Trigger:** Input vector contains flavor targets ($SO_4^{2-}$, $Cl^-$) alongside a structural Alkalinity ($CaCO_3$) target.
* **Severity:** `INFO`
* **Message Template:** `"Routed to Hybrid Optimization Engine (Mode 2: Ratio + Buffer). Objective: Minimizing flavor salts via Linear Programming while allocating structural alkalinity via {agent} and secondary acid neutralization."`
* **Representative Example:**  
  `"Routed to Hybrid Optimization Engine (Mode 2: Ratio + Buffer). Objective: Minimizing flavor salts via Linear Programming while allocating structural alkalinity via BAKING_SODA and secondary acid neutralization."`

#### `ROUTER_MODE_3_NONLINEAR_CLONE`
* **Trigger:** Input vector contains a complete 6-ion profile ($Ca^{2+}$, $Mg^{2+}$, $Na^+$, $SO_4^{2-}$, $Cl^-$, $\text{Alk}$).
* **Severity:** `INFO`
* **Message Template:** `"Routed to Non-Linear Cloner Engine (Mode 3: Profile Clone). Objective: Minimizing weighted sum of squared errors (SSE) across all 6 ions simultaneously."`
* **Representative Example:**  
  `"Routed to Non-Linear Cloner Engine (Mode 3: Profile Clone). Objective: Minimizing weighted sum of squared errors (SSE) across all 6 ions simultaneously."`

#### `ROUTER_MODE_4_BASELINE_ONLY`
* **Trigger:** All ion targets are unassigned/null.
* **Severity:** `INFO`
* **Message Template:** `"Routed to Baseline Water Correction Engine (Mode 4: Null Targets). Mineral salt dosing bypassed (0.0 g). Solving strictly for grist residual alkalinity, mash pH, and sparge acidification."`
* **Representative Example:**  
  `"Routed to Baseline Water Correction Engine (Mode 4: Null Targets). Mineral salt dosing bypassed (0.0 g). Solving strictly for grist residual alkalinity, mash pH, and sparge acidification."`

#### `ROUTER_MODE_5_CUSTOM_SPARSE`
* **Trigger:** Arbitrary subset of ions enabled via custom modal configuration.
* **Severity:** `INFO`
* **Message Template:** `"Routed to Dynamic Sparse Linear Engine (Mode 5: Custom Permutation). Pinned targets: {pinned_ions}; floating unconstrained: {floating_ions}."`
* **Representative Example:**  
  `"Routed to Dynamic Sparse Linear Engine (Mode 5: Custom Permutation). Pinned targets: [ca, alk]; floating unconstrained: [mg, na, so4, cl]."`

---

### 3.2 Biological & Toxicological Guardrails (`GUARDRAIL`)

Guardrail messages surface non-negotiable boundaries enforced by brewing physics and biology.

#### `GUARDRAIL_CALCIUM_FLOOR_ENFORCED`
* **Trigger:** Post-addition mash calcium would fall below the flocculation floor ($50.0\text{ ppm}$ default), requiring artificial salt injection.
* **Severity:** `INFO`
* **Message Template:** `"Calcium floor enforced: Added Gypsum / CaCl2 adjusted upward to satisfy the minimum flocculation threshold ({floor} ppm Ca2+)."`
* **Representative Example:**  
  `"Calcium floor enforced: Added Gypsum / CaCl2 adjusted upward to satisfy the minimum flocculation threshold (50.0 ppm Ca2+)."`

#### `GUARDRAIL_CALCIUM_FLOOR_OVERRIDDEN`
* **Trigger:** User manually overrides the calcium floor setting below the recommended brewing baseline ($30.0\text{ ppm}$), e.g., for a Bohemian Pilsner.
* **Severity:** `WARNING`
* **Message Template:** `"User overrode Minimum Calcium Floor to {floor} ppm (below recommended 30.0 ppm baseline). Verify adequate yeast nutrients (zinc/amino acids) are added in the fermenter."`
* **Representative Example:**  
  `"User overrode Minimum Calcium Floor to 15.0 ppm (below recommended 30.0 ppm baseline). Verify adequate yeast nutrients (zinc/amino acids) are added in the fermenter."`

#### `GUARDRAIL_CALCIUM_FLOOR_UNREACHABLE`
* **Trigger:** Source water is very soft, and the requested flavor targets are too low to allow enough $CaSO_4$ or $CaCl_2$ without overshooting $SO_4^{2-}$ or $Cl^-$.
* **Severity:** `WARNING`
* **Message Template:** `"Calcium floor unreachable with pinned flavor targets: Resulting Ca2+ ({actual} ppm) is below the {floor} ppm floor. Flavor equalities took precedence."`
* **Representative Example:**  
  `"Calcium floor unreachable with pinned flavor targets: Resulting Ca2+ (28.4 ppm) is below the 50.0 ppm floor. Flavor equalities took precedence."`

#### `GUARDRAIL_MAGNESIUM_TOXICITY_CEILING`
* **Trigger:** Added or total magnesium exceeds the sensory bitterness/laxative threshold ($40.0 - 50.0\text{ ppm}$).
* **Severity:** `WARNING`
* **Message Template:** `"Magnesium ceiling breached: Total Mg2+ reached {actual} ppm (caution threshold: 40.0 ppm, hard max: 50.0 ppm). Risk of astringent bitterness or laxative defect."`
* **Representative Example:**  
  `"Magnesium ceiling breached: Total Mg2+ reached 46.2 ppm (caution threshold: 40.0 ppm, hard max: 50.0 ppm). Risk of astringent bitterness or laxative defect."`

#### `GUARDRAIL_SULFATE_HARSHNESS_CEILING`
* **Trigger:** Sulfate target or post-salt result exceeds $400.0\text{ ppm}$.
* **Severity:** `WARNING`
* **Message Template:** `"Sulfate harshness limit exceeded: Total SO4(2-) reached {actual} ppm. Bitterness perception will likely turn dry, metallic, and astringent above 400 ppm."`
* **Representative Example:**  
  `"Sulfate harshness limit exceeded: Total SO4(2-) reached 425.0 ppm. Bitterness perception will likely turn dry, metallic, and astringent above 400 ppm."`

#### `GUARDRAIL_SPARGE_TANNIN_RISK`
* **Trigger:** Sparge liquor residual alkalinity ($\text{RA}_{\text{HLT}} > 0$) causes rinse water pH to exceed $5.80$.
* **Severity:** `WARNING`
* **Message Template:** `"Sparge tannin extraction risk: Untreated sparge water pH ({ph_predicted}) exceeds 5.80. Acidification required to prevent polyphenol leaching."`
* **Representative Example:**  
  `"Sparge tannin extraction risk: Untreated sparge water pH (6.24) exceeds 5.80. Acidification required to prevent polyphenol leaching."`

#### `GUARDRAIL_SOURCE_CONTAMINANT_DETECTED`
* **Trigger:** Source water report exceeds safe brewing limits for secondary ions: $K^+ > 10\text{ ppm}$, $Fe > 0.1\text{ ppm}$, $Mn > 0.05\text{ ppm}$, or $NO_3^- > 44\text{ ppm}$.
* **Severity:** `WARNING`
* **Message Template:** `"Source water contaminant threshold exceeded: {ion} is {actual} ppm (recommended max: {limit} ppm). Dilution with Reverse Osmosis (RO) water is strongly advised."`
* **Representative Example:**  
  `"Source water contaminant threshold exceeded: Iron (Fe) is 0.35 ppm (recommended max: 0.10 ppm). Dilution with Reverse Osmosis (RO) water is strongly advised."`

---

### 3.3 Mathematical Optimization & Compromises (`OPTIMIZATION`)

These messages document the internal operations of the linear and non-linear engines, including tie-breaking, bound relaxation, and curve-fitting trade-offs.

#### `OPT_LP_RELAXATION_APPLIED`
* **Trigger:** Hard source water prevented simultaneous satisfaction of $SO_4^{2-}/Cl^-$ targets and the upper bound on added calcium.
* **Severity:** `NOTE`
* **Message Template:** `"Calcium upper boundary relaxed: Primary solver could not satisfy flavor equalities without exceeding the calcium ceiling. Pinned SO4/Cl preserved."`
* **Representative Example:**  
  `"Calcium upper boundary relaxed: Primary solver could not satisfy flavor equalities without exceeding the calcium ceiling. Pinned SO4/Cl preserved."`

#### `OPT_LP_LEXICOGRAPHIC_TIE_BREAK`
* **Trigger:** Degenerate LP solution space has multiple combinations yielding identical minimal mass.
* **Severity:** `INFO`
* **Message Template:** `"Lexicographic tie-break executed: Multi-pass LP resolved degenerate vertex by penalizing secondary counter-ions (preferring Gypsum/CaCl2 over Epsom/NaCl)."`
* **Representative Example:**  
  `"Lexicographic tie-break executed: Multi-pass LP resolved degenerate vertex by penalizing secondary counter-ions (preferring Gypsum/CaCl2 over Epsom/NaCl)."`

#### `OPT_CLONE_WEIGHTED_COMPROMISE`
* **Trigger:** Non-linear engine (Mode 3) cannot hit all 6 ions due to fixed salt stoichiometry.
* **Severity:** `NOTE`
* **Message Template:** `"Profile compromise accepted: Prioritized enzymatic ions (Ca2+ error: {ca_err} ppm, Alk error: {alk_err} ppm); accepted larger variance on sensory counter-ions (Na+ error: {na_err} ppm)."`
* **Representative Example:**  
  `"Profile compromise accepted: Prioritized enzymatic ions (Ca2+ error: +1.2 ppm, Alk error: -3.5 ppm); accepted larger variance on sensory counter-ions (Na+ error: +18.4 ppm)."`

#### `OPT_MINIMAL_MASS_ACHIEVED`
* **Trigger:** Optimization completed successfully with minimal addition footprint.
* **Severity:** `INFO`
* **Message Template:** `"Optimal mineral dose identified: Total added salt mass is {total_mass_g} g ({dose_rate} g/L). Added mineral contribution to TDS: {added_tds} ppm."`
* **Representative Example:**  
  `"Optimal mineral dose identified: Total added salt mass is 8.30 g (0.45 g/L). Added mineral contribution to TDS: 312.0 ppm."`

---

### 3.4 Enzymatic & Mash pH Assessment (`ENZYMATIC`)

These messages surface the biological extraction state, grist acidity balance, and required pH adjustments.

#### `ENZYMATIC_MASH_PH_OPTIMAL`
* **Trigger:** Predicted room-temperature mash pH lands within $5.20 \le \text{pH} \le 5.60$.
* **Severity:** `INFO`
* **Message Template:** `"Predicted mash pH ({predicted_ph}) is within the optimal enzymatic window (5.20 - 5.60). Optimal alpha/beta-amylase activity projected."`
* **Representative Example:**  
  `"Predicted mash pH (5.38) is within the optimal enzymatic window (5.20 - 5.60). Optimal alpha/beta-amylase activity projected."`

#### `ENZYMATIC_MASH_PH_OUT_OF_BOUNDS`
* **Trigger:** Predicted mash pH falls outside $5.20 - 5.60$.
* **Severity:** `WARNING`
* **Message Template:** `"Predicted mash pH ({predicted_ph}) is {status_flag} (optimal: 5.20 - 5.60). {corrective_action}."`
* **Representative Example:**  
  `"Predicted mash pH (5.82) is HIGH (optimal: 5.20 - 5.60). Mash acid dosage prescribed to recover enzymatic conversion."`

#### `ENZYMATIC_ACID_DOSE_PRESCRIBED`
* **Trigger:** Grist acidity and water residual alkalinity require liquid acid addition to hit `target_mash_ph`.
* **Severity:** `INFO`
* **Message Template:** `"Mash acidification prescribed: {volume_ml} mL of {acid_medium} ({meq_total} mEq) required to shift mash from pH {ph_start} to target pH {ph_target}."`
* **Representative Example:**  
  `"Mash acidification prescribed: 4.80 mL of LACTIC_88 (52.3 mEq) required to shift mash from pH 5.72 to target pH 5.40."`

#### `ENZYMATIC_ALKALINE_DOSE_PRESCRIBED`
* **Trigger:** Highly acidic grist (dark roasted malts) pulls mash pH below target, requiring an alkaline buffer.
* **Severity:** `INFO`
* **Message Template:** `"Mash buffering prescribed: {mass_g} g of {agent} ({meq_total} mEq) required to raise mash pH from {ph_start} to target pH {ph_target}."`
* **Representative Example:**  
  `"Mash buffering prescribed: 3.60 g of BAKING_SODA (42.8 mEq) required to raise mash pH from 5.12 to target pH 5.40."`

#### `ENZYMATIC_SPARGE_ACID_PRESCRIBED`
* **Trigger:** Sparge liquor alkalinity neutralized with acid to cap pH below $5.80$.
* **Severity:** `INFO`
* **Message Template:** `"Sparge acidification prescribed: {volume_ml} mL of {acid_medium} ({meq_total} mEq) required to neutralize sparge alkalinity and cap pH at 5.80."`
* **Representative Example:**  
  `"Sparge acidification prescribed: 2.30 mL of LACTIC_88 (25.1 mEq) required to neutralize sparge alkalinity and cap pH at 5.80."`

---

### 3.5 Operational & Brewhouse Diagnostics (`OPERATIONAL`)

These messages alert the brewer to practical cellar, kettle, and hot liquor tank issues.

#### `OPERATIONAL_HLT_SURPLUS`
* **Trigger:** Treated HLT volume exceeds the volume required to fulfill sparge demand and vessel debt ($V_{\text{HLT, treat}} - V_{\text{debt}} - V_{\text{sparge}} > 0$).
* **Severity:** `WARNING`
* **Message Template:** `"HLT surplus detected: Treated liquor exceeds sparge demand by {surplus_l} L. Surplus minerals will be left behind in the HLT."`
* **Representative Example:**  
  `"HLT surplus detected: Treated liquor exceeds sparge demand by 4.50 L. Surplus minerals will be left behind in the HLT."`

#### `OPERATIONAL_SALT_DISSOLUTION_LIMIT`
* **Trigger:** Prescribed Chalk ($CaCO_3$) addition cannot fully dissolve without pressurized $CO_2$ dissolution.
* **Severity:** `WARNING`
* **Message Template:** `"Low salt solubility: Chalk (CaCO3) has extremely low solubility at room temperature. Ensure chalk is added directly to the mash tun with grains, or substitute Baking Soda/Pickling Lime."`
* **Representative Example:**  
  `"Low salt solubility: Chalk (CaCO3) has extremely low solubility at room temperature. Ensure chalk is added directly to the mash tun with grains, or substitute Baking Soda/Pickling Lime."`

#### `OPERATIONAL_SPARGE_SALT_DISTRIBUTION`
* **Trigger:** Informs the user how salts were allocated across brewing liquor vessels.
* **Severity:** `INFO`
* **Message Template:** `"Salt distribution strategy '{distribution}': Sparge liquor received {sparge_salt_pct}% of total salt mass."`
* **Representative Example:**  
  `"Salt distribution strategy 'PROPORTIONAL': Sparge liquor received 43.1% of total salt mass."`

---

### 3.6 Validation & Gatekeeper Rejections (`VALIDATION`)

These exceptions halt execution before the optimization matrix is built, throwing a `SolverValidationError` with a stable error code.

| Error Code | Trigger Condition | Emitted Message String |
| :--- | :--- | :--- |
| `INVALID_MASH_VOLUME` | $V_{\text{mash}} \le 0.0$ | `"Mash volume must be positive."` |
| `INVALID_SPARGE_VOLUME`| $V_{\text{sparge}} < 0.0$ | `"Sparge volume cannot be negative."` |
| `UNKNOWN_GRAIN_TYPE` | Grist entry contains an unmapped type | `"Unknown grain type '{grain_type}'. Expected: BASE, CRYSTAL, ROASTED, ACID."` |
| `UNKNOWN_ACID_MEDIUM` | Acid medium is not mapped in density tables | `"Unknown acid medium '{acid_medium}'. Expected: LACTIC_88, PHOSPHORIC_10, PHOSPHORIC_85."` |
| `UNKNOWN_ALKALINE_AGENT`| Alkaline agent not mapped in equivalent tables | `"Unknown alkaline agent '{agent}'. Expected: BAKING_SODA, CHALK, PICKLING_LIME."` |
| `UNKNOWN_SALT_FORM` | Hydration state not recognized | `"Unknown salt hydrate form for {salt}. Expected dihydrate or anhydrous."` |
| `SALT_SOLVE_FAILED` | Infeasible LP boundary state | `"Salt optimization failed to find a feasible dose for the provided constraints."` |
| `ION_TARGET_OUT_OF_RANGE`| Target ion entry $< 0.0$ or $> 2000.0\text{ ppm}$ | `"Target concentration for {ion} ({val} ppm) is outside physically feasible bounds."` |

---

## 4. UI Telemetry Presentation Matrix

To maintain high readability on the client, the UI splits the telemetry stream into two visual surfaces: the **Telemetry Banner** (top-level operational overview) and the **Resolution Audit Log** (collapsible forensic drawer).

```
+-----------------------------------------------------------------------------------------+
| TELEMETRY AUDIT LOG                                                       [Status: OK]  |
+-----------------------------------------------------------------------------------------+
| [i] ROUTER: Routed to Linear Minimalist Engine (Mode 1: Flavor Balance).                |
| [!] GUARDRAIL: Calcium floor enforced (Gypsum/CaCl2 bumped to reach 50.0 ppm Ca2+).     |
| [i] ENZYMATIC: Predicted mash pH (5.38) is OPTIMAL. 4.8 mL Lactic Acid (88%) added.     |
| [!] GUARDRAIL: Sparge liquor acidified with 2.3 mL Lactic Acid to cap pH at 5.80.       |
| [i] SUMMARY: Total added minerals: 8.30 g (0.45 g/L). Mineral TDS: +312 ppm.            |
+-----------------------------------------------------------------------------------------+
```

### Visual Styling Rules

* **`INFO` (Blue Accent):** Standard routing choices, optimal enzymatic confirmations, and dosage summaries.
* **`NOTE` (Gray/Neutral Accent):** Internal mathematical trade-offs, tie-breaking notes, and LP relaxations.
* **`WARNING` (Amber/Orange Accent):** Biological guardrail overrides, toxicity limit proximities ($Mg > 40\text{ ppm}$, $SO_4 > 400\text{ ppm}$), sparge tannin extraction risks, and HLT volume surpluses.
* **`ERROR` (Red Accent):** Gatekeeper validation halts, division-by-zero blocks, or mathematically infeasible constraint states.