# ADSCO Contract — reconciled design

Status: draft for review. Supersedes the legacy water model; input is the vendored
`docs/adsco/*` specs (locked for the first pass). Where those specs are ambiguous
or over-reach the implementation, this document records the **reconciled
decision** that the code will follow.

## Locked decisions

1. **Spec-first.** The vendored docs are authoritative for behavior; this file
   only reconciles gaps, it does not re-litigate.
2. **Telemetry is host-side, not a DAG output.** The artifact output grammar
   (dimension/taxonomy/boolean) cannot carry `list[dict]`. `telemetry`,
   `warnings`, and `notes` stay on the boundary response, are retained by
   `boundaryRunner`, and reach the card through a view model. Parity `ALLOW`
   gains `telemetry`.
3. **`predicted_mash_ph` means the corrected outcome** (post acid/alkaline
   correction). `mash_ph_status` is computed from it. The pre-correction model
   pH is carried in telemetry only.
4. **Mode 2 alkalinity is a minimum buffer at mash-in (pre-acid),** not an exact
   post-acid equality. The agent supplies the buffer; acid then balances to
   `target_mash_ph`; final alkalinity is reported separately.
5. **Target ions are editable again** (reversing `12c315d`'s read-only
   copy-forward). Pin/floating is decided by the **mode**, not by value presence.
6. **`custom_pinned_ions` is a wire list** but is populated by the service from a
   Mode-5 pin collection, never inferred from `0`-vs-`None` in the target vector.

## Boundary contract

### Inputs (`WaterSolverRequest` / `WaterChemistryInput`)

| Field | v1 | v2 | Notes |
| --- | --- | --- | --- |
| `grist` | list | unchanged | |
| `source` | `IonProfile` (6 required) | `SourceProfile` (6 ions + optional `k, fe, mn, no3`) | contaminants audited, not solved |
| `target` | `IonProfile` (6 required) | `IonProfile` (6 floats, all default `0`) | unpinned ions float to source |
| `custom_pinned_ions` | — | `list[str]` (short keys), default `[]` | Mode 5 only |
| `strategy` | `CALCIUM_FLOOR` | `AUTO` default; + `HYBRID`, `BASELINE`, `CUSTOM` | `FLAVOR` retained |
| `target_mash_ph` | 5.4 | unchanged | domain 5.0–5.8 |
| `calcium_floor_ppm` | 50.0 | unchanged | warn < 30 |
| all `v_*`, forms, agents, `salt_distribution` | — | unchanged | |

`WaterStrategy` = `FLAVOR | CALCIUM_FLOOR | OPTIMIZE | HYBRID | BASELINE | CUSTOM | AUTO`.

### Outputs (`WaterSolverResponse`)

| Field | v1 | v2 |
| --- | --- | --- |
| `strategy` | code | resolved code (never `AUTO`) |
| `prescription.predicted_mash_ph` | pre-correction | **corrected** |
| `prescription.mash_ph_status` | pre-correction | from corrected pH |
| `prescription.residual_hlt_water_l`, `sparge_tannin_warning` | — | unchanged |
| `mash_additions`, `sparge_additions` | — | unchanged shape |
| `post_salt_mash_ions`, `post_salt_hlt_ions` | — | unchanged (salts only) |
| `post_dose_mash_ions` | — | **new**: salts + agent + acid-neutralized alkalinity (the "post-addition" vector) |
| `grist_buckets_kg` | — | unchanged |
| `total_added_salt_mass_g` | — | **new** (mass) |
| `added_mineral_tds_ppm` | — | **new** (concentration) |
| `warnings`, `notes` | — | unchanged (host) |
| `telemetry` | — | **new** (host-only, not a DAG output) |

### Error taxonomy

`INVALID_MASH_VOLUME` · `INVALID_SPARGE_VOLUME` · `UNKNOWN_GRAIN_TYPE` ·
`UNKNOWN_ACID_MEDIUM` · `UNKNOWN_ALKALINE_AGENT` · `UNKNOWN_SALT_FORM` ·
`SALT_SOLVE_FAILED` · `ION_TARGET_OUT_OF_RANGE` · `UNKNOWN_STRATEGY`.

Removed: `OPTIMIZE_NOT_IMPLEMENTED` (now implemented), `SOURCE_NOT_FOUND`,
`MISSING_SOURCE`. Renamed: `UNKNOWN_ACID` → `UNKNOWN_ACID_MEDIUM`.

## Mode semantics (unified decision vector)

Decision vector (per litre of mash liquor):
`x = [g_gypsum, g_cacl2, g_epsom, g_nacl, g_agent, ml_acid]`.

| Mode | code | pinned equalities | objective | pH | agent/acid |
| --- | --- | --- | --- | --- | --- |
| 1 Flavor | `CALCIUM_FLOOR` (`FLAVOR` = unbounded Ca) | so4, cl | min salt mass | correct to target | post-step |
| 2 Buffer | `HYBRID` | so4, cl; alk ≥ target (buffer) | min salt+agent mass | balance to target | agent supplies buffer; acid balances |
| 3 Clone | `OPTIMIZE` | none (soft all 6) | min Σ w_i(actual−target)² + λ·mass | soft toward target | agent+acid active (alk reachable) |
| 4 Baseline | `BASELINE` | none; salts+agent = 0 | — | acid/base only | acid/base only |
| 5 Custom | `CUSTOM` | `custom_pinned_ions` | min mass | correct to target | post-step |

Guardrails (constraints where mode-specific, warnings otherwise): Ca ≥ floor,
Mg ≤ 50, SO₄ ≤ 400, sparge pH ≤ 5.80, contaminant gates.

## Target, pinning, and routing

- Six editable target roots `water.target.<ion>` (dimension `concentration`,
  default `0`).
- `water.strategy` (mode) taxonomy: `AUTO | FLAVOR | CALCIUM_FLOOR | OPTIMIZE |
  HYBRID | BASELINE | CUSTOM`.
- `water.pinned_ions` collection (`[{ ion }]`) — Mode 5 only.
- Service derives `custom_pinned_ions` from `water.pinned_ions`; the core floats
  unpinned ions to `source`.
- `AUTO` (wire default): empty/all-zero target → `BASELINE`; else infer from the
  target shape per `boundary-deltas.md` §2.2. The UI always sends an explicit mode.

## pH and ion coupling

- Compute `post_dose_mash_ions` = source + flavor salts + agent ions − acid
  alkalinity-neutralization (meq × 50).
- Predict pH from that vector's residual alkalinity + grist acidity.
- Prescribe acid/alkaline to reach `target_mash_ph`; recompute `predicted_mash_ph`
  from the corrected vector (the reported, corrected outcome).
- `mash_ph_status` derives from the corrected pH.

## Telemetry (host-side)

- `WaterSolverResponse.telemetry: list[TelemetryEvent]` (code, category, severity,
  message, context).
- `boundaryRunner` retains `telemetry`/`warnings`/`notes` per boundary from the
  winning solve token only; cleared on `reset`/supersede/error.
- Exposed to the water card as a view model (`waterTelemetry`); no engine/artifact
  change. Parity `ALLOW` for `solver.water` becomes `{warnings, notes, telemetry}`.

## Metrics

- `total_added_salt_mass_g` = flavor salt mass + alkaline-agent mass, mash + HLT
  (proportional only for HLT). Acid (liquid) excluded.
- `added_mineral_tds_ppm` = that mass (g) ÷ `v_mash_treat_l` × 1000 — an
  added-mineral concentration (mg/L), labelled "added minerals", not a full TDS.

## Migration

- Reintroduce editable `water.target.*` roots (removed in `12c315d`).
- Add `water.pinned_ions` collection; `strategy` taxonomy; new outputs.
- `water_target` schema gains `mode` (the template's pre-selected mode) and new
  template values; `soft-pilsner` floor → 15.
- `strategy` root default → `AUTO`; schema/core default → `AUTO`.
