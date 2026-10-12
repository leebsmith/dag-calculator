# Validation Report — Discovery Sweep

Self-check results for the completed `data/artifact.json`. All checks were run against the
written artifact in place.

## 1. Load / grammar validator

A hand-rolled validator (mirroring `grammar.md` §5) checks:

- top-level sections exactly `{schema_version, meta, dimensions, constants, taxonomies,
  functions, primitive_schemas, nodes, relations}` (`extra: forbid`);
- node kinds ∈ `{root, collection, selection, derived, boundary}`;
- every referenced `dimension`/`taxonomy`/`schema`/`function`/`constant` is declared;
- every `inputs`/`ref`/`{ref}` path resolves (node, schema field, boundary output, or the
  slice-level `equipment.<field>` convention);
- `derived`/`boundary` output spec ∈ `{dimension}` | `{taxonomy}` | `{type:"boolean"}`;
- schema fields carry only `{dimension,taxonomy,domain,default,overridable}`;
- reductions and calls reference declared functions.

**Result: PASS** — 0 errors. 60 nodes, 39 constants, 11 taxonomies, 12 functions,
11 schemas, 4 relations.

## 2. Boundary parity (field-for-field vs `boundary.py`)

A parity checker diffed the artifact's `solver.batch` / `solver.water` input+output keys and
error-code sets against the Pydantic models.

**Result: PASS.**

- `solver.batch` inputs = 17 fields — exact match to `BatchSolverRequest`.
- `solver.batch` outputs = 19 keys (nested `cascade`/`hlt` flattened to dotted keys) — exact
  match to `BatchSolverResponse`.
- `solver.batch.domain.codes` = 13 — exact match to `BatchSolverErrorCode`.
- `solver.water` inputs = 26 keys (nested `source`/`target` `IonProfile` flattened) — exact
  match to `WaterSolverRequest`.
- `solver.water` outputs = 31 keys (nested `prescription`/`mash_additions`/`sparge_additions`/
  `post_salt_mash_ions` flattened; `grist_buckets_kg` flattened to 4 grain types) — exact match
  to `WaterSolverResponse` (excluding `warnings`/`notes`, advisory text — gap C6).
- `solver.water.domain.codes` = 10 — exact match to `WaterSolverErrorCode`.
- Taxonomies `topology`/`strategy`/`salt_distribution`/`acid_medium`/`alkaline_agent`/
  `ph_status` match their enums.

## 3. Dimension checks

- `mash.strike_water_temp_c` adds `temperature` + `temperature_delta` — legal (the two are
  distinct dimensions; `temperature_delta` is linear with no affine offset).
- `batch.delta_v_evap` = `volume × (time/time)` → `volume`; `batch.s_late_add` = `mass`;
  `grist.mcu` = `mass × color / volume × dimensionless` → `dimensionless`.
- `grist.weighted_lovibond`/`weighted_yield_fraction` are `weighted_avg` reductions preserving
  `color`/`percentage` respectively.
- `water.mash_ph_status` is a taxonomy interpretation (`ph_status`), not a dimensioned quantity.
- `sg_to_plato`/`plato_to_sg`/`morey_*` functions carry consistent `gravity`/`color` returns.

**Result: PASS** — no dimension violations introduced.

## 4. Golden-vector reproductions

| Check | Expected | Got |
|---|---|---|
| `sg_to_plato(1.050)` (ASBC cubic) | ≈ 12.388 | 12.3876 |
| `plato_to_sg(sg_to_plato(1.050))` round-trip | 1.050 | 1.050002 |
| `morey_lovibond_to_srm(1.5)` = 1.3546·1.5 − 0.76 | 1.2719 | 1.2719 |
| `morey_mcu_to_srm(8.0)` = 1.4922·8^0.6859 | 6.2124 | 6.2124 |
| `extract_yield_ldk(0.80)` = 0.80 × 385.641 | 308.513 | 308.513 |
| `bicarbonate_from_alkalinity(78)` = 78 × 61/50 | 95.16 | 95.16 |
| strike base temp @ T=67°C, grain=20°C, R=2.6079: 67 + (0.41/2.6079)(67−20) | ≈ 74.39 | 74.389 |

**Result: PASS** — all golden values from `worked-example.md`, `domain-equations.md`, and the
known-good code reproduce.

## 5. Graph invariants

- **No cycles:** Kahn topological sort over the explicit edge graph (inputs + `ref` +
  relation refs) resolves all 60 nodes.
- **Single writer:** each node id appears once; derived values are never roots.
- **Explicit edges only:** all dependencies declared via `inputs`/`ref`/`relations`; no
  read-tracking.
- **Sealed boundaries:** `solver.batch`/`solver.water` carry `resolution:"iterative"` and the
  binding slugs `batch_sparge_solver`/`water_chemistry_solver`; no interiors re-implemented.
- **No presentation leakage:** labels, rounding, control kinds, CSS, sentinels, unit-mode
  state absent from the artifact (see coverage matrix).
- **No duplicated equations:** shared equations live once in `functions` and are invoked via
  `call` (e.g. `mash_ph_status`, `extract_yield_ldk`, strike/tun functions).

## 6. Known deviations (documented, non-blocking)

- `warnings`/`notes` boundary outputs omitted (advisory text) — gap C6.
- Boundary `taxonomy`/`boolean` outputs and the `min` reduction are additive language
  clarifications — gaps C7/C8 — with no `schema_version` bump (grammar shape unchanged).
- `meta.status` = `"complete"`; `schema_version` = `1`.
