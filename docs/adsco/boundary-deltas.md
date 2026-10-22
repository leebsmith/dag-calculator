# ADSCO Architecture: Boundary Deltas & Migration Specification

**Document Title:** Boundary Deltas: Legacy Solver vs. ADSCO Engine

**Document Identifier:** `boundary-deltas.md`

**Status:** Approved Architectural Specification

**Target Systems:** `app/core/water.py`, `app/services/water_solver_service.py`, `app/schemas/boundary.py`

## 1. Executive Summary

This document specifies the exact differences between the legacy water chemistry solver (`water.py.txt`) and the new **Adaptive Dual-Strategy Constrained Optimizer (ADSCO)** engine.

The legacy solver was developed as a metric-converted, pure-function port of Bru'n Water v1.24. While robust for linear flavor dosing with a calcium floor, it intentionally reserved Tier 3 (`OPTIMIZE`) and lacked dynamic intent classification, multi-target least-squares curve fitting, and structured forensic telemetry.

The ADSCO replacement engine preserves the pure-function, sealed boundary supernode pattern (`solve_water_chemistry(WaterChemistryInput) -> WaterChemistryOutput`) while expanding the mathematical capabilities to include non-linear profile cloning, hybrid alkalinity buffering, and an auditable telemetry event bus.

## 2. Input Boundary Deltas (`WaterChemistryInput`)

### 2.1 Comparison Table

| Field Name | Legacy Solver (`water.py`) | ADSCO Engine | Delta Type | Description / Migration Rule | 
| ----- | ----- | ----- | ----- | ----- | 
| `strategy` | `str = "CALCIUM_FLOOR"` | `str = "AUTO"` | **Backward-Compatible Extension** | Supports legacy strings (`"CALCIUM_FLOOR"`, `"FLAVOR"`). Replaces `"OPTIMIZE_NOT_IMPLEMENTED"` with full SLSQP least-squares solver. Adds `"AUTO"`, `"HYBRID"`, `"BASELINE"`, and `"CUSTOM"`. | 
| `target` | `dict` (requires keys `so4`, `cl`) | `dict` (sparse or dense) | **Backward-Compatible Extension** | Can now accept sparse dictionaries (e.g. `{so4: 250, cl: 50}`), partial dictionaries (e.g. `{so4: 50, cl: 100, alk: 150}`), dense 6-ion vectors, or an empty dict `{}`. | 
| `custom_pinned_ions` | *Not Present* | `Sequence[str] = ()` | **New Optional Field** | Used exclusively when `strategy="CUSTOM"` (Mode 5) to explicitly specify which ions the dynamic sparse linear engine must pin as equality constraints. | 
| `source` | `dict` (Ca, Mg, Na, SO4, Cl, Alk) | `dict` (Extended) | **Backward-Compatible Extension** | Ingests optional secondary contaminants (`k`, `fe`, `mn`, `no3`). Emits guardrail warnings if limits are breached. | 
| `calcium_floor_ppm` | `float = 50.0` | `float = 50.0` | **Unchanged Signature, New Logic** | Overriding below 30.0 ppm triggers an explicit biological guardrail telemetry warning rather than silently accepting it. | 
| All other fields (`grist`, `v_*`, etc.) | Identical | Identical | **No Change** | Grist entries, volumetric scalars, acid medium, salt hydrate forms, and alkaline agents remain identical. | 

### 2.2 Ingestion & Routing Matrix

In the legacy solver, passing `strategy="OPTIMIZE"` raised an unhandled `SolverValidationError("OPTIMIZE_NOT_IMPLEMENTED")`. In ADSCO, the input is routed deterministically:

```
                          [ Incoming Request ]
                                   │
                     Strategy == "AUTO" ?
                        /              \
                     YES                NO
                      │                  │
        Inspect Target Vector            Use Explicit Strategy:
        ├── Empty / Null ──────────────> Mode 4 (BASELINE)
        ├── Only SO4 / Cl / Na ────────> Mode 1 (CALCIUM_FLOOR)
        ├── SO4 / Cl + Alkalinity ─────> Mode 2 (HYBRID)
        ├── Complete 6 Ions ───────────> Mode 3 (OPTIMIZE / CLONE)
        └── Custom Selection ──────────> Mode 5 (CUSTOM)

```

## 3. Output Boundary Deltas (`WaterChemistryOutput`)

### 3.1 Comparison Table

| Field Name | Legacy Type | ADSCO Type | Status | Description | 
| ----- | ----- | ----- | ----- | ----- | 
| `predicted_mash_ph` | `float` | `float` | **Unchanged** | Estimated room-temperature mash pH. | 
| `mash_ph_status` | `str` | `str` | **Unchanged** | `"OPTIMAL"`, `"LOW"`, or `"HIGH"`. | 
| `strategy` | `str` | `str` | **Modified Value** | Returns canonical executed strategy code (`"CALCIUM_FLOOR"`, `"FLAVOR"`, `"OPTIMIZE"`, `"HYBRID"`, `"BASELINE"`, `"CUSTOM"`). | 
| `mash_dose_g` | `dict` | `dict` | **Unchanged** | Grams of Gypsum, CaCl2, Epsom, NaCl for mash. | 
| `sparge_dose_g` | `dict` | `dict` | **Unchanged** | Grams of Gypsum, CaCl2, Epsom, NaCl for sparge. | 
| `mash_acid_ml` | `float` | `float` | **Unchanged** | mL of acid solution for mash pH correction. | 
| `sparge_acid_ml` | `float` | `float` | **Unchanged** | mL of acid solution for sparge neutralization. | 
| `alkaline_agent_g` | `float` | `float` | **Unchanged** | Grams of alkaline agent for mash buffering. | 
| `post_salt_mash_ions` | `dict` | `dict` | **Unchanged** | Complete 6-ion resulting profile in mash. | 
| `residual_hlt_water_l` | `float` | `float` | **Unchanged** | Volume of treated liquor remaining in HLT. | 
| `sparge_tannin_warning` | `bool` | `bool` | **Unchanged** | Flagged when sparge liquor requires acid. | 
| `grist_buckets_kg` | `dict` | `dict` | **Unchanged** | Grist mass breakdown by grain category. | 
| `warnings` | `list[str]` | `list[str]` | **Backward-Compatible** | Retains all legacy warning strings, supplemented by formatted guardrail events. | 
| `notes` | `list[str]` | `list[str]` | **Backward-Compatible** | Retains legacy LP compromise notes, supplemented by optimization telemetry. | 
| `telemetry` | *Not Present* | `list[dict]` | **New Field** | Serialized list of `TelemetryEvent` dicts containing structured codes, severities, categories, and context. | 
| `total_added_salt_mass_g` | *Not Present* | `float` | **New Field** | Total mass of all mineral salts dosed across mash and sparge liquor. | 
| `added_mineral_tds_ppm` | *Not Present* | `float` | **New Field** | Total Dissolved Solids (TDS) contribution added by mineral salts. | 

## 4. Algorithmic and Mathematical Engine Deltas

### 4.1 Resolution Mode Expansion

| Strategy / Mode | Legacy Mechanism | ADSCO Replacement Engine | Mathematical Objective | 
| ----- | ----- | ----- | ----- | 
| **Mode 1: Flavor Balance** | Linear Programming (`scipy.optimize.linprog`) | Highs LP Engine with Lexicographic Tie-Breaking | $\min \sum (\text{Salt Mass})$, subject to $SO_4 = \text{target}, Cl = \text{target}, Ca \ge \text{floor}$. | 
| **Mode 2: Hybrid Buffer** | *Not Supported* (Treated as Mode 1, Alk ignored) | Sequential LP Flavor + Alkaline Mass Allocation | Minimizes flavor salts via LP, allocates carbonate deficit via chosen alkaline agent, counter-balances with mash acid. | 
| **Mode 3: Profile Clone** | **Raises Error** (`OPTIMIZE_NOT_IMPLEMENTED`) | Non-Linear SLSQP (`scipy.optimize.minimize`) | $\min \sum w_i (\text{Actual}_i - \text{Target}_i)^2 + 0.05 \sum \text{Mass}$, with $Ca \ge \text{floor}, Mg \le 50$. | 
| **Mode 4: Baseline** | *Not Supported* (Required mock targets) | Direct Analytic Pass-Through | $0.0\text{ g}$ salts added. Solves grist acidity and sparge alkalinity analytically. | 
| **Mode 5: Custom Sparse** | *Not Supported* | Dynamic Sparse LP Matrix Construction | Solves arbitrary equality subsets while leaving unselected ions unconstrained. | 

### 4.2 Universal Guardrail Enforcement

The legacy solver checked magnesium and calcium floor thresholds only *after* the solve was completed, emitting a simple string warning in `warnings`.

ADSCO embeds guardrails directly into the mathematical boundary conditions:

1. **Active Calcium Floor:** Mode 1 and Mode 3 inject $Ca \ge \text{floor}$ directly into the inequality constraint matrices (`A_ub` / `b_ub` or SLSQP constraint dictionaries).

2. **Hard Toxicity Limits:** Mode 3 actively bounds Magnesium ($Mg \le 50\text{ ppm}$) during curve fitting so an overzealous least-squares calculation never prescribes dangerous Epsom salt levels.

3. **Contaminant Gatekeeping:** Secondary ions ($K > 10$, $Fe > 0.1$, $Mn > 0.05$, $NO_3 > 44$) are audited before optimization begins.

## 5. Service Adapter (`water_solver_service.py`) Impact & Parity

The existing service adapter relies on `assert_field_parity(WaterSolverRequest, WaterChemistryInput)`.

To adopt ADSCO without breaking existing API routes:

1. **Schema Extension (`app/schemas/boundary.py`):**

   ```
   class WaterStrategy(str, Enum):
       CALCIUM_FLOOR = "CALCIUM_FLOOR"
       FLAVOR = "FLAVOR"
       OPTIMIZE = "OPTIMIZE"
       AUTO = "AUTO"
       HYBRID = "HYBRID"
       BASELINE = "BASELINE"
       CUSTOM = "CUSTOM"
   
   class WaterSolverRequest(BaseModel):
       # ... all existing fields retained ...
       strategy: WaterStrategy = WaterStrategy.AUTO
       custom_pinned_ions: list[str] = Field(default_factory=list)
   
   ```

2. **Response Mapping (`WaterSolverResponse`):**
   The service adapter's `_to_response` function can map `result.warnings` and `result.notes` exactly as it does today. If the API schema is updated to include telemetry, it can optionally map `result.telemetry`, `result.total_added_salt_mass_g`, and `result.added_mineral_tds_ppm`.

3. **Field Parity:**
   Because all new fields on `WaterChemistryInput` (`custom_pinned_ions`) and `WaterChemistryOutput` (`telemetry`, `total_added_salt_mass_g`, `added_mineral_tds_ppm`) provide safe default values, field parity is maintained with zero breaking changes to existing test suites.