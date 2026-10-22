# Software Design Requirements: Style Selection and Ion Entry

**Document Status:** Approved Architecture  
**Target Component:** Adaptive Dual-Strategy Constrained Optimizer (ADSCO) — Interface & Ingestion Subsystem  
**Reference Document:** `style-selection-and-ion-entry.md`  

---

## 1. Executive Summary & Purpose

In brewing water chemistry, formulation software historically presents users with one of two extremes: an unconstrained 6-ion manual trial-and-error grid (e.g., legacy spreadsheets) or a rigid "black box" solver that hides its mathematical trade-offs and forces unnatural additions.

The **Adaptive Dual-Strategy Constrained Optimizer (ADSCO)** bridges this divide. Under the hood, ADSCO employs two mathematically distinct optimization cores:
1. **The Linear Minimalist Engine:** A linear programming model ($\min \sum \text{salt mass}$) that pins stylistic flavor targets ($SO_4^{2-}$ and $Cl^-$) as strict equalities while enforcing biological floors ($Ca^{2+} \ge 50\text{ ppm}$) and toxicity ceilings ($Mg^{2+} \le 50\text{ ppm}$, $SO_4^{2-} \le 400\text{ ppm}$) as boundary inequalities.
2. **The Non-Linear Cloner Engine:** A goal-programming / least-squares curve-fitting model ($\min \sum (\text{Actual}_i - \text{Target}_i)^2$) that globally minimizes variance across a dense 6-ion vector, reconciling impossible salt linkages against the physical brewing environment.

This document establishes the official design requirements for the **Target Entry and Style Selection Interface**. It defines how the brewer's mental model and stylistic intent are translated deterministically into ADSCO’s optimization matrices without exposing complex linear algebra or sparse matrix rules, while preventing user confusion and invalid data states.

---

## 2. Core Metaphor: The 5-Mode Deterministic Radio Selector

To eliminate the cognitive friction of manual algorithm toggles or ambiguous sparse form fields, the Target Profile interface shall be governed by **five mutually exclusive radio buttons**. Each button explicitly reflects a practical brewing objective, enables *only* the relevant input fields, and clears/locks irrelevant fields to prevent latent ("zombie") data from corrupting the optimizer.

```
+-----------------------------------------------------------------------------------+
| TARGET PROFILE SELECTION                                                          |
| Template Preset: [ Hoppy / IPA               v ]                                 |
+-----------------------------------------------------------------------------------+
|  (o) 1. Flavor Balance Only (SO4 / Cl)                                           |
|  ( ) 2. Modern Ratio + Dark Beer Buffer (SO4 / Cl + Alkalinity)                   |
|  ( ) 3. Classic Spreadsheet Clone (All 6 Ions)                                   |
|  ( ) 4. Baseline Water Correction (No Ion Targets)                                |
|  ( ) 5. Custom Permutation (Advanced Edge Cases)... [Configure]                   |
+-----------------------------------------------------------------------------------+
| Target Ion Grid (ppm)                                                             |
|   Calcium (Ca2+):      [  --  ] (Locked)     Sulfate (SO4 2-):  [ 250  ]          |
|   Magnesium (Mg2+):    [  --  ] (Locked)     Chloride (Cl-):    [  50  ]          |
|   Sodium (Na+):        [  --  ] (Locked)     Alkalinity:        [  --  ] (Locked) |
+-----------------------------------------------------------------------------------+
```

### Mode 1: "Flavor Balance Only (Sulfate & Chloride)"
*   **Brewing Intent:** Modern flavor structuring. The brewer seeks to manipulate the sulfate-to-chloride ratio to sharpen hop bitterness or enhance malt roundness, leaving background biological nutrients to the solver.
*   **Active UI Fields:** Sulfate ($SO_4^{2-}$), Chloride ($Cl^-$).
*   **Locked & Cleared Fields:** Calcium ($Ca^{2+}$), Magnesium ($Mg^{2+}$), Sodium ($Na^+$), Alkalinity ($CaCO_3$).
*   **Backend ADSCO Routing:** **Linear Minimalist Engine**. Sulfate and chloride are treated as equality constraints. Total salt mass is minimized. The biological calcium flocculation floor ($Ca^{2+} \ge 50\text{ ppm}$) is enforced silently as an inequality constraint.

### Mode 2: "Modern Ratio + Dark Beer Buffer (SO4, Cl, & Alkalinity)"
*   **Brewing Intent:** Flavor structuring for roasted, acidic grists (e.g., Porters, Stouts, Munich Dunkels). The brewer tunes the flavor ratio while establishing a structural carbonate buffer to prevent mash pH collapse.
*   **Active UI Fields:** Sulfate ($SO_4^{2-}$), Chloride ($Cl^-$), Alkalinity (ppm as $CaCO_3$).
*   **Locked & Cleared Fields:** Calcium ($Ca^{2+}$), Magnesium ($Mg^{2+}$), Sodium ($Na^+$).
*   **Backend ADSCO Routing:** **Hybrid Engine**. Linear programming minimizes flavor salts ($CaSO_4$, $CaCl_2$, $MgSO_4$, $NaCl$). The resulting ionic state is handed off to the alkaline dosing phase, which prescribes the selected alkaline agent (Baking Soda, Chalk, or Pickling Lime) to supply carbonate, followed by subsequent acid balancing against the target mash pH.

### Mode 3: "Classic Spreadsheet Clone (All 6 Ions)"
*   **Brewing Intent:** Traditional holistic profile matching. The brewer enters a complete 6-ion profile (e.g., historical city reports or regional water analyses).
*   **Active UI Fields:** All six fields are enabled: $Ca^{2+}$, $Mg^{2+}$, $Na^+$, $SO_4^{2-}$, $Cl^-$, Alkalinity ($CaCO_3$).
*   **Locked & Cleared Fields:** None.
*   **Backend ADSCO Routing:** **Non-Linear Cloner Engine**. Executes least-squares optimization across all six targets. If a user target violates a physical or biological boundary (e.g., target $Ca^{2+} = 10\text{ ppm}$ against a default $50\text{ ppm}$ floor), ADSCO enforces the guardrail, flags the compromise, and curve-fits the remaining parameters.

### Mode 4: "Baseline Water Correction (No Ion Targets)"
*   **Brewing Intent:** Pure enzymatic and sparge correction without adding mineral salts. Ideal for brewers using balanced municipal water or brewing delicate styles where added salt mass is undesirable.
*   **Active UI Fields:** None.
*   **Locked & Cleared Fields:** All six ion inputs are locked and set to null/empty.
*   **Backend ADSCO Routing:** **Null / Baseline Engine**. Salt dosing is bypassed ($0.0\text{ g}$). The solver evaluates raw source water residual alkalinity against grist acidity, predicting mash pH and calculating only the liquid acid or base required to achieve the enzymatic target, plus sparge acidification.

### Mode 5: "Custom Permutation (Advanced Edge Cases)..."
*   **Brewing Intent:** Specialized targeting where standard groupings fail (e.g., targeting only Calcium and Alkalinity for a malt-forward historical ale, or adjusting only Sodium for a Gose).
*   **Active UI Fields:** Controlled dynamically via an interactive modal dialog.
*   **Modal Interaction:**
    *   Clicking Mode 5 (or an adjacent "Configure" link) opens a modal window containing six explicit checkboxes:
        *   `[ ] Calcium (Ca2+)`
        *   `[ ] Magnesium (Mg2+)`
        *   `[ ] Sodium (Na+)`
        *   `[ ] Sulfate (SO4 2-)`
        *   `[ ] Chloride (Cl-)`
        *   `[ ] Alkalinity (as CaCO3)`
    *   Upon confirmation, only the checked ions become editable in the primary UI grid; unchecked ions are disabled and cleared.
*   **Backend ADSCO Routing:** **Dynamic Sparse Linear Engine**. ADSCO treats checked inputs as equality constraints, leaves unchecked fields unconstrained (floating), and enforces biological guardrails.

---

## 3. Predefined Style Macro Integration

Rather than storing exhaustive databases of unboiled, historical municipal water reports, the system surfaces a curated library of **seven post-treatment style templates**. These templates represent functional, proven water chemistry targets for specific brewing styles.

### 3.1 Template Definitions

| Template ID | Display Name | Target Configuration | Pre-selected Radio Mode |
| :--- | :--- | :--- | :--- |
| `hoppy-ipa` | Hoppy / IPA | $SO_4^{2-}: 250\text{ ppm}$, $Cl^-: 50\text{ ppm}$ | Mode 1 (Flavor Only) |
| `balanced-pale` | Balanced Pale | $SO_4^{2-}: 100\text{ ppm}$, $Cl^-: 100\text{ ppm}$ | Mode 1 (Flavor Only) |
| `malty-amber` | Malty / Amber | $SO_4^{2-}: 50\text{ ppm}$, $Cl^-: 120\text{ ppm}$, $\text{Alk}: 60\text{ ppm}$ | Mode 2 (Ratio + Buffer) |
| `dark-stout` | Dark / Stout | $SO_4^{2-}: 50\text{ ppm}$, $Cl^-: 100\text{ ppm}$, $\text{Alk}: 150\text{ ppm}$ | Mode 2 (Ratio + Buffer) |
| `belgian-golden-tripel` | Belgian Golden / Tripel | $SO_4^{2-}: 80\text{ ppm}$, $Cl^-: 60\text{ ppm}$ | Mode 1 (Flavor Only) |
| `belgian-saison` | Belgian Saison | $SO_4^{2-}: 180\text{ ppm}$, $Cl^-: 60\text{ ppm}$ | Mode 1 (Flavor Only) |
| `soft-pilsner` | Soft Pilsner | $Ca^{2+}: 15$, $Mg^{2+}: 3$, $Na^+: 4$, $SO_4^{2-}: 10$, $Cl^-: 10$, $\text{Alk}: 15$ | Mode 3 (All 6 Ions) + Guardrail Override |

### 3.2 Macro Behavior & State Mutation Rules
1. **Macro as a UI Dispatcher:** Selecting an option from the "Target Style Template" dropdown acts as an automated UI state machine. It programmatically selects the designated radio button, updates field lock/unlock states, and populates the numeric values.
2. **The "Soft Pilsner" Guardrail Exception:** Selecting `soft-pilsner` not only activates Mode 3 with dense low-mineral targets, but it also automatically shifts the visible **Minimum Calcium Floor** setting from its default of $50\text{ ppm}$ down to $15\text{ ppm}$. This prevents the Universal Guardrail from rejecting the target or artificially injecting calcium salts into an ultra-soft profile.
3. **Non-Destructive Overrides:** A macro is strictly an initial state generator. Once applied:
    *   The user can freely edit any unlocked numeric field.
    *   If the user alters a value, the dropdown label appends an indicator: `Hoppy / IPA (Modified)`.
    *   If the user switches the radio button manually, the template dropdown resets to `Custom / None`.

---

## 4. Universal Guardrails & Supporting Input Parameters

The UI must segregate stylistic targets from physical and enzymatic constants. The following supporting parameters must be surfaced to ensure proper solver execution:

### 4.1 Enzymatic & Extraction Controls
*   **Target Mash pH (Scalar):** Number input with strict validation ($5.00$ to $5.80$, default: $5.40$). An adjacent visual indicator validates whether the entry lands within the optimal enzymatic window ($5.20 - 5.60$).
*   **Acid Medium Selector (Dropdown):** Mandatory selector for pH adjustment acid. Options:
    *   `Lactic Acid (88%)`
    *   `Phosphoric Acid (10%)`
    *   `Phosphoric Acid (85%)`

### 4.2 Biological Guardrails (Advanced Panel)
*   **Minimum Calcium Flocculation Floor (Scalar):** Editable numeric input pre-populated with $50.0\text{ ppm}$ (recommended brewing range: $30 - 150\text{ ppm}$). This parameter dictates the lower-bound inequality constraint enforced by ADSCO's Universal Guardrail layer. Overriding this value below $30\text{ ppm}$ flags a prominent biological warning.
*   **Sparge pH Ceiling (Scalar):** Read-only or advanced editable field fixed at $5.80\text{ pH}$. Sparge liquor alkalinity must be neutralized to prevent extraction of harsh polyphenols (tannins).

### 4.3 Chemical Agents & Hydration State
*   **Alkaline Agent Preference (Dropdown):** Options: `Baking Soda (NaHCO3)`, `Chalk (CaCO3)`, `Pickling Lime (Ca(OH)2)`. Determines equivalent weight and counter-ion attribution during mash pH buffering.
*   **Salt Hydration States:**
    *   Gypsum: `Dihydrate (CaSO4·2H2O)` vs. `Anhydrous (CaSO4)`
    *   Calcium Chloride: `Dihydrate (CaCl2·2H2O)` vs. `Anhydrous (CaCl2)`
*   **Salt Distribution Mode:** Toggle between `Proportional` (dosing mash and sparge liquor uniformly) and `Mash Only` (salts restricted to mash, sparge liquor receives acid only).

---

## 5. System Output & Telemetry Requirements

ADSCO operates under a strict **Zero Hidden Decisions** transparency doctrine. The output payload returned to the UI must deliver two distinct structures: an **Objective Performance Assessment** and an **Actionable Brew-Day Prescription**.

### 5.1 Objective Assessment & Audit Log

#### 1. Routing & Strategy Telemetry
The UI must prominently display the active solver strategy resolved by the Smart Router:
*   *Mode 1 Example:* `"Routed to Linear Optimizer (Flavor Mode). Objective: Minimizing total salt additions to hit SO4/Cl targets while enforcing 50 ppm Ca floor."`
*   *Mode 3 Example:* `"Routed to Non-Linear Optimizer (Profile Cloner). Objective: Minimizing statistical variance across 6 target ions."`

#### 2. Target vs. Actual Comparison Grid
Regardless of the active mode, the UI shall render the final post-salt ion concentrations for **all six ions**. Unconstrained ions shall display an explicit status indicating how their value was derived:

| Ion | Source (ppm) | Target (ppm) | Post-Addition Mash (ppm) | Status / Constraint |
| :--- | :--- | :--- | :--- | :--- |
| Calcium ($Ca^{2+}$) | 12.0 | *[Auto]* | 52.4 | Satisfied (Floor $\ge 50$) |
| Magnesium ($Mg^{2+}$) | 4.0 | *[Auto]* | 4.0 | Floating (Below 50 ppm ceiling) |
| Sodium ($Na^+$) | 8.0 | *[Auto]* | 8.0 | Floating |
| Sulfate ($SO_4^{2-}$) | 15.0 | 250.0 | 250.0 | Exact Match (Target Equality) |
| Chloride ($Cl^-$) | 6.0 | 50.0 | 50.0 | Exact Match (Target Equality) |
| Alkalinity ($CaCO_3$) | 35.0 | *[Auto]* | 35.0 | Enzymatic Baseline |

#### 3. Total Mineralization Metric
To prove that ADSCO is minimizing salt additions and to prevent overmineralization, the UI shall display:
*   **Total Added Salt Mass:** Measured in grams and grams per liter ($g/L$).
*   **Estimated Total Dissolved Solids (TDS):** Derived from the baseline plus added minerals.

#### 4. Guardrail & Compromise Event Log
The UI must render an audit list containing all system notes and warnings:
*   **Guardrail Overrides:** `"Target Calcium (15 ppm) breached biological floor. Overridden by Universal Guardrail to 50 ppm."`
*   **Toxicity Alerts:** `"Added Magnesium (42.5 ppm) exceeds 40 ppm caution threshold."`
*   **Solubility Notices:** `"Chalk addition bypassed due to poor solubility; substituted Baking Soda."`
*   **Sparge Protection:** `"Sparge water alkalinity neutralized with 3.2 mL Lactic Acid to protect against tannin extraction (pH < 5.8)."`

### 5.2 Actionable Brew-Day Prescription
The UI must deliver a segregated, step-by-step checklist matching the physical phases of brew day:

```
+-----------------------------------------------------------------------------------+
| BREW-DAY WATER PRESCRIPTION                                                       |
+-----------------------------------------------------------------------------------+
| MASH ADDITIONS (Treating 18.5 L Mash Water)                                       |
|   [ ] Gypsum (CaSO4·2H2O):           6.2 g                                        |
|   [ ] Calcium Chloride (CaCl2·2H2O):  2.1 g                                        |
|   [ ] Lactic Acid (88%):             4.8 mL (Target Mash pH: 5.40 -> Optimal)     |
+-----------------------------------------------------------------------------------+
| SPARGE ADDITIONS (Treating 14.0 L Sparge Water)                                   |
|   [ ] Gypsum (CaSO4·2H2O):           4.7 g                                        |
|   [ ] Calcium Chloride (CaCl2·2H2O):  1.6 g                                        |
|   [ ] Lactic Acid (88%):             2.3 mL (Sparge Tannin Guard: pH < 5.80)      |
+-----------------------------------------------------------------------------------+
```

---

## 6. Frontend Validation & State Management Rules

1. **State Persistence on Mode Switching:**
   * Switching between Radio Modes 1, 2, 3, and 4 shall retain entered values in memory for currently active fields, but set locked fields to `null` in the payload sent to the backend.
   * If a user switches from Mode 1 to Mode 3, previously entered $SO_4^{2-}$ and $Cl^-$ values remain intact while the four newly unlocked fields default to the current source water baseline or blank.
2. **Numeric Validation Constraints:**
   * All ion inputs must be non-negative floating-point values ($0.0$ to $1000.0\text{ ppm}$).
   * Values exceeding recommended thresholds ($SO_4^{2-} > 400\text{ ppm}$, $Mg^{2+} > 50\text{ ppm}$, $Na^+ > 100\text{ ppm}$) must display real-time inline warnings (orange accent) without blocking submission.
3. **Atomic Execution:**
   * The "Solve" execution button must be disabled if any active field contains non-numeric text, negative values, or if the source water profile is incomplete.