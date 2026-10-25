# Report Bundle

A frozen batch emits one self-sufficient JSON document — the **report bundle** —
that a report generator consumes with no joins, no catalogue lookups, and no
re-solving. The contract is owned by
`backend/app/schemas/report_bundle.py`; the producer is
`backend/app/services/report_bundle_service.py`; the design record is
[`plans/report-bundle.md`](../plans/report-bundle.md).

A companion path index lives in
[`report-bundle-glossary.md`](report-bundle-glossary.md) (generated from the
artifact + presentation registries).

---

## 1. Getting one

| Where | Route | What you get |
|---|---|---|
| Editor toolbar → **Download bundle** | `POST /batches/{id}/report-bundle` for a draft | A **preview**: current solve, nothing persisted |
| Editor toolbar → **Download bundle** | `GET /batches/{id}/report-bundle` for a frozen batch | The **stored** bundle, byte-for-byte the freeze-time fact |
| Batches list → row menu → **Download bundle** | `GET` | The stored bundle (frozen rows only) |

- `GET` returns `409` for a draft and `409` for a frozen batch whose bundle
  predates this feature (fork and re-freeze; there is no backfill).
- `POST` returns `409` for a frozen batch.
- Both are validated with `ReportBundle` on read. A stored document that no
  longer satisfies the schema fails loudly (`500`) rather than rendering blanks.
- The POST body is the freeze payload (`valuation`, `provenance`,
  `conformance`, `report_inputs`, `catalog`) — exactly what freezing sends.

### Preview vs. fact

A preview is **not** an immutable record. It is marked by:

```jsonc
"batch": { "status": "draft", "frozen_at": null, "parent_batch_id": null }
```

The renderer refuses any bundle whose `batch.status` is not `frozen`. Freezing is
the only way to produce a fact, and the frozen record + bundle are written in one
Firestore transaction.

---

## 2. Blocks

```jsonc
{
  "bundle_format": 1,
  "artifact": { "schema_version": 7, "hash": "sha256:…", "content": { … } },
  "catalog": {
    "hash": "sha256:…",
    "dimensions": { "<dimension>": { "base_unit", "kind", "units": { … } } },
    "nodes": { "<path>": { "label", "dimension", "unit", "decimals", "step", "options", "option_labels" } }
  },
  "batch": { "id", "name", "status", "frozen_at", "parent_batch_id", "identity" },
  "state": { "valuation", "roots", "collections", "selections", "provenance" },
  "conformance": { … } | null,
  "validation": { "relations", "domains", "field_domains", "collection_domains" },
  "telemetry": { "<boundary id>": { "binding", "fingerprint", "telemetry", "warnings", "notes" } },
  "content_hash": "sha256:…"
}
```

| Block | Notes |
|---|---|
| `artifact` | The whole artifact as of freeze. Free-form to the bundle schema — validated by the engine before freeze and pinned by `hash`. |
| `catalog` | Presentation metadata for **every** path the state exposes. `hash` covers `dimensions + nodes`. `unit` is a **unit id**, not a symbol. |
| `batch.identity` | The three component snapshots: `equipment`, `water.source`, `style`. |
| `state.valuation` | `node id → value` for every node. Boundary nodes map to their plain output map. |
| `state.roots` | Explicitly authored roots only. Never used to recompute anything. |
| `state.collections` | The raw rows; the same data as the collection entries in `valuation`. |
| `state.selections` | Remaining component snapshots (e.g. `batch.yeast`, `water.target_profile`), or `null`. |
| `state.provenance` | Per selection: `{ "source_template_id": … }`. |
| `conformance` | Style adherence assessed at freeze (`hasBaseline`, `sai`, `dimensions`, `pillars`), or `null`. |
| `validation` | Relation + domain states captured at freeze, not recomputed. |
| `telemetry` | Per solved boundary: binding, applied fingerprint, structured events, warnings, notes. |
| `content_hash` | Canonical hash of everything except itself. |

`bundle_format` is a literal discriminator (`1`). Unknown fields are rejected;
unknown formats are refused.

---

## 3. Resolving a path

The bundle has no flattened path index. A dotted path resolves by longest node
prefix, exactly like the engine:

| Path | Where the value lives |
|---|---|
| `batch.target_abv` | `state.valuation["batch.target_abv"]` |
| `solver.batch.cascade.v_strike` | `state.valuation["solver.batch"]["cascade.v_strike"]` |
| `solver.water.grist_buckets_kg.BASE` | `state.valuation["solver.water"]["grist_buckets_kg.BASE"]` |
| `mash.rests` | `state.valuation["mash.rests"]` (array of rows) |
| `mash.rests.0.use_temp_c` | `state.valuation["mash.rests"][0].use_temp_c` |
| `batch.yeast.attenuation_pct` | `state.valuation["batch.yeast"].attenuation_pct` (or `state.selections`) |
| `equipment.max_hlt_volume_l` | `batch.identity.equipment.max_hlt_volume_l` |
| `style.og_min` | `batch.identity.style.og_min` |
| `water.source.calcium_ca` | `batch.identity["water.source"].calcium_ca` |

Boundary outputs are flattened inside the boundary map: the key is everything
after the boundary node id (`cascade.v_strike`, `hlt.v_hlt_debt`,
`prescription.predicted_mash_ph`, `grist_buckets_kg.BASE`).

---

## 4. Numbers, units, precision

Every number in `state` and `batch.identity` is in the artifact's **base unit**
for its dimension — litres, kilograms, degrees Celsius, SG, fraction, ppm, IBU,
minutes. There are no pre-formatted strings.

To display one:

1. Read `catalog.nodes[path]` → `dimension`, `unit` (unit id), `decimals`.
2. Convert from base to that unit using `catalog.dimensions[dimension]`:
   - `linear`: `display = base / unit.factor`
   - `affine`: `display = base * unit.factor + unit.offset`
   - `nonlinear`: apply the unit's `fwd` function (the function ids are in the
     catalog; the formulas are in `artifact.content.functions`). Gravity is the
     only nonlinear dimension today (`sg_to_plato` / `plato_to_sg`).
   - `identity`: unchanged.
3. Round to `decimals` (null means "no fixed precision").
4. Append the unit **symbol**. The bundle carries ids, not symbols; the
   [glossary](report-bundle-glossary.md) lists both, and the frontend keeps the
   symbol map in `views/registry/units.js`.

Worked examples: `28.0 L`, `1.056 SG`, `13.6 °P`, `12.2 g`, `5.5 %`, `0.714`
(dimensionless, no symbol).

Taxonomy values are bare artifact strings (e.g. `"runoff_ratio"`).
`catalog.nodes[path].option_labels` maps them to display text when a label
exists.

---

## 5. Nullability

- A node the engine cannot resolve is `null` in `state.valuation` (for example
  an unsolved boundary or an unset optional selection). It is never `0`.
- `state.selections[node]` is `null` when nothing is selected.
- Collection rows may omit optional fields; absence is meaningful, not zero.
- Validation states distinguish "no bound" from "bound not evaluable":
  `{ "bounded": false, "holds": true }` vs
  `{ "bounded": true, "holds": null, "reason": "unresolved" }`.
- Telemetry is empty for offline (stub) freezes; the fingerprint is still
  captured.

---

## 6. Validation and telemetry shapes

```jsonc
"relations":           [{ "id": "hlt_not_overfilled", "holds": true }],
"domains":             [{ "nodeId": "batch.target_abv", "bounded": true, "holds": true }],
"field_domains":       [{ "selectionNodeId": "batch.yeast", "field": "attenuation_pct", "bounded": true, "holds": true }],
"collection_domains":  [{ "nodeId": "mash.rests", "index": 0, "field": "use_temp_c", "bounded": true, "holds": true }]
```

A bound failure adds `op` and `limit`; a non-finite value adds
`reason: "non-finite"`.

Telemetry events (`telemetry.<boundary>.telemetry[]`) carry
`{ code, category, severity, message, context }`, where `category` is one of
`ROUTER | GUARDRAIL | OPTIMIZATION | ENZYMATIC | OPERATIONAL | VALIDATION` and
`severity` is one of `INFO | NOTE | WARNING | ERROR`.

---

## 7. Immutability

- `artifact.hash`, `catalog.hash`, and `content_hash` are `sha256:` prefixed
  canonical hashes (JS-compatible float formatting, sorted keys).
- The bundle schema recomputes `content_hash` and rejects a mismatch.
- A bundle cannot be recomputed under a newer artifact. That is a new batch
  (fork + re-freeze) by design.
- Preview bundles carry the same hashes but are not stored and not renderable as
  a fact.

---

## 8. Worked excerpt

From `tests/conformance/fixtures/report-bundle.json`:

```jsonc
"batch": { "id": "frozen-1", "name": "House Pale", "status": "frozen", "frozen_at": 1700000000.0 },
"state": {
  "valuation": {
    "mash.grain_temp_c": 20.0,
    "solver.batch": { "sg_post_boil": 1.055, "v_pre_boil": 24.0 },
    "mash.rests": [{ "rest_id": "beta", "use_temp_c": 67.0, "duration_min": 60.0, "enabled": true }]
  }
},
"catalog": {
  "nodes": {
    "mash.grain_temp_c": { "label": "Grain temperature", "dimension": "temperature", "unit": "degC", "decimals": 1 },
    "mash.rests.use_temp_c": { "label": "Temp", "dimension": "temperature", "unit": "degC", "decimals": 1 }
  }
}
```

Rendered: `Grain temperature 20.0 °C`; the rest row's temp `67.0 °C`.

---

## 9. Tooling

- [`report-bundle-glossary.md`](report-bundle-glossary.md) — generated list of
  every path with label, dimension, unit, and precision.
- `node scripts/describe-report-bundle.mjs <bundle.json>` — print a downloaded
  bundle as `path = value (label, unit)` for every resolved path.
- The bundle is validated on every `make test` via the committed fixture
  (`tests/conformance/fixtures/report-bundle.json`). Regenerate it with
  `cd backend && PYTHONPATH=. uv run python scripts/emit_report_bundle_fixture.py`.
