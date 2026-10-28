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
  "bundle_format": 5,
  "artifact": { "schema_version": 9, "hash": "sha256:…", "content": { … } },
  "catalog": {
    "hash": "sha256:…",
    "dimensions": { "<dimension>": { "base_unit", "kind", "units": { … } } },
    "nodes": { "<path>": { "label", "dimension", "unit", "symbol", "decimals", "step", "options", "option_labels" } }
  },
  "formatted": {
    "<path>": { "text": "12.4 °P", "number": "12.4", "unit": "°P" }
  },
  "formatted_tables": {
    "grist.major_malts": [
      { "name": { "text": "American 2-row" },
        "amount": { "text": "4.3 kg", "number": "4.3", "unit": "kg" },
        "ppg": { "text": "36.0", "number": "36.0" },
        "color": { "text": "1.8 °L", "number": "1.8", "unit": "°L" },
        "own_pct": { "text": "85.0%", "number": "85.0", "unit": "%" },
        "grist_pct": { "text": "83.3%", "number": "83.3", "unit": "%" },
        "extract": { "text": "3.3 kg", "number": "3.3", "unit": "kg" },
        "extract_pct": { "text": "77.6%", "number": "77.6", "unit": "%" } }
    ]
  },
  "formatted_summaries": {
    "grist.major_malts": {
      "color": { "text": "7.5 °L", "number": "7.5", "unit": "°L" },
      "extract_yield": { "text": "77.4%", "number": "77.4", "unit": "%" }
    },
    "overall": {
      "color": { "text": "31.7 °L", "number": "31.7", "unit": "°L" },
      "extract_yield": { "text": "77.6%", "number": "77.6", "unit": "%" }
    }
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
| `catalog` | Structural presentation: labels, dimensions, options, and the unit/symbol/decimals metadata. The unit choice reflects the batch's display preferences at freeze. |
| `formatted` | The display strings the report prints, one per scalar path the bundle exposes: `text` (number + symbol), plus `number`/`unit` for tables that align them separately. Produced by the same formatter the UI uses; the report never converts, rounds, or chooses a symbol. |
| `formatted_tables` | Per-row display cells for collection tables (major grist, trace malts, sugars): one entry per declared collection, keyed by column. The producer computes derived amounts, PPG, and shares; the report only lays them out. Columns: `own_pct` (share within the row's own table — the authored grain bill for major malts, the mass share for trace malts) and `grist_pct` (share of grist mass, major + trace) on the grist tables; `grist_pct` only on sugars; `extract` (mass) and `extract_pct` on malt and sugar rows, the potential extract share. Percentage columns are largest-remainder normalised to sum to 100.0; a sugar's mass share sits outside the grist's 100. |
| `formatted_summaries` | Mass-weighted colour and extract yield per fermentable table, plus the `overall` aggregate. Keys name a collection node or the literal `overall`; the producer does the weighing. |
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

`bundle_format` is a literal discriminator (`7`). Unknown fields are rejected;
unknown formats are refused. A shape change bumps the format and regenerates the
fixture in the same commit; bundles written under an older format are refused
rather than read optimistically.

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
| any scalar display | `formatted[path]` |

Boundary outputs are flattened inside the boundary map: the key is everything
after the boundary node id (`cascade.v_strike`, `hlt.v_hlt_debt`,
`prescription.predicted_mash_ph`, `grist_buckets_kg.BASE`).

---

## 4. Numbers, units, precision

Every number in `state` and `batch.identity` is in the artifact's **base unit**
for its dimension — litres, kilograms, degrees Celsius, SG, fraction, ppm, IBU,
minutes. Raw values are the record; they are never display-ready.

`formatted[path]` is the display source:

```jsonc
"batch.target_og": { "text": "12.4 °P", "number": "12.4", "unit": "°P" },
"batch.target_abv": { "text": "5.5%", "number": "5.5", "unit": "%" },
"equipment.name":  { "text": "HERMS 30L" }
```

- The browser's freeze payload computes it with the **same formatter the UI
  uses**, at the unit preference in force at freeze (`unitMode`: per-field
  override → registry pin → per-dimension choice → dimension default).
- `text` is number + symbol (`%` is tight; other symbols take a space).
- `number` and `unit` split the figure for tables that align the numbers and
  units in separate columns.
- Nonlinear units (SG ↔ °P) are handled by the producer; the report never
  converts.
- Taxonomy values keep their raw string in `state`; `formatted[path].text`
  carries the option label when the catalog declares one.
- Identity dimensions (`reference`, `dimensionless`) carry no display unit:
  reference values are ids (text), dimensionless values are unitless numbers.
- Collection tables (grist, sugars) read `formatted_tables[collection]`, one
  dict per row. Derived columns (mass from the solved grist and bill share, PPG
  from yield, the within-table and grist shares) are computed by the producer.
  Grist is the malt charge, major + trace; a sugar's `grist_pct` is its mass
  against that charge, not part of the 100. The `extract` columns are the
  potential contribution (mass × yield, net of malt moisture) and its share of
  total extract; trace malts carry no extract and are absent from that view.
- Summaries read `formatted_summaries[collection]`, with `color` and
  `extract_yield` weighted by operative mass. Colour weighs all three tables;
  the overall extract yield covers only the grain bill and sugars, because trace
  malts are colour- and mash-pH-only. `overall` is absent when no fermentable
  row has mass.

Absent values (unsolved boundaries, unset selections) have no `formatted`
entry; absence is meaningful, not zero.


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
"relations":           [{ "id": "hlt_not_overfilled", "holds": true, "blocking": true }],
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
- A batch cannot be frozen while any blocking relation finding stands, so a
  frozen bundle never contains one. Frozen bundles are **not** retro-validated;
  the archive is a record of feasible batches.
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
  bundle as `path = value (label, unit)` for every resolved path, plus an
  `option labels` block for taxonomies (the one catalog field the path list
  omits: it names values, not their display text).
- The bundle is validated on every `make test` via the committed fixture
  (`tests/conformance/fixtures/report-bundle.json`). Regenerate it with
  `cd backend && PYTHONPATH=. uv run python scripts/emit_report_bundle_fixture.py`.
