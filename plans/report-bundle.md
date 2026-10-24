---
title: Report Bundle — frozen, self-sufficient render input
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [off-graph-identity]
blocks: []
gate: a frozen batch emits one `report_bundle` document that validates against the guarded schema; it is self-sufficient for rendering with no joins and no re-resolution
status: proposed
---

# Report Bundle

A **frozen batch** emits one self-sufficient JSON document — the `report_bundle` —
that a downstream report generator consumes with **no joins, no upstream
consolidation, and no re-resolution**. The bundle is a *fact*: artifact and catalog
as of freeze, the whole solved state, the validation outcome, and the solver
telemetry.

This supersedes the earlier template/projector plan for the data contract. The
document *grammar* is a separate, still-unsettled question; this plan is only about
what the generator is handed.

---

## 1. Decisions (settled)

| # | Decision |
|---|---|
| 1 | **Embedded.** The bundle carries `artifact` and `catalog` content inline, plus their hashes. Measured ≈ 80–100 KB/batch — inside Firestore's 1 MiB limit. |
| 2 | **Raw + catalog.** Values stay base-unit numbers. Formatting metadata ships beside them: dimension units **and** per-path presentation (label, unit, decimals, step, options). **No pre-formatted strings.** |
| 3 | **No ancestry.** `parent_batch_id` is carried because the record has it; no chain, no stamps, no drift tracking. |
| 4 | **Sibling document** keyed by the batch id, written once at freeze, immutable. `BatchRecord` stays lean. |
| 5 | **Frozen only.** Live drafts have no bundle; identity remains mutable until freeze. |
| 6 | **Not a second artifact.** Only referenced components are included (identity snapshots, selection snapshots, collection rows) — never the seed catalogs. |

### Why labels are in the catalog

The artifact is domain-core-only: it carries no labels. Without a per-path
presentation block a generator can format `68.3` but cannot say *"Strike water
temperature"*. `catalog.nodes` closes that gap without promoting labels into the
artifact or the payload.

---

## 2. Shape

```jsonc
{
  "bundle_format": 1,
  "artifact": { "schema_version": 6, "hash": "sha256:…", "content": { … } },
  "catalog": {
    "hash": "sha256:…",
    "dimensions": { "<dim>": { "base_unit", "kind", "units": { "<unit>": { "factor", "offset", "fwd", "inv" } } } },
    "nodes": { "<path>": { "label", "unit", "decimals", "step", "options", "option_labels" } }
  },
  "batch": { "id", "name", "status", "frozen_at", "parent_batch_id", "identity": { equipment, water_source, style } },
  "state": { "valuation", "roots", "collections", "selections", "provenance" },
  "conformance": { … },
  "validation": { "relations", "domains", "field_domains", "collection_domains" },
  "telemetry": { "<boundary id>": { "binding", "fingerprint", "telemetry", "warnings", "notes" } },
  "content_hash": "sha256:…"
}
```

| Block | Contents | Notes |
|---|---|---|
| `artifact` | the whole artifact document | validated by the engine's own validator; pinned by `hash` |
| `catalog.dimensions` | base unit, kind, per-unit factor/offset or fwd/inv | mirrors the artifact's dimension shape |
| `catalog.nodes` | per-path presentation | keys resolve by the engine's dotted-path rule |
| `batch.identity` | the three component snapshots | the document header |
| `state.valuation` | all 77 node ids → values | authoritative; boundaries are plain output maps |
| `state.roots` | explicitly-set roots only | authored-vs-inherited (`hasRoot`); **never** used to recompute |
| `state.collections` | raw rows | same data as valuation's collection entries |
| `state.selections` | remaining component snapshots | target profile, yeast |
| `state.provenance` | per selection `source_template_id` | |
| `conformance` | style adherence as assessed at freeze | |
| `validation` | relations + four domain states | captured, not recomputed |
| `telemetry` | per boundary: binding, fingerprint, messages | fingerprint is otherwise stripped from the freeze payload |
| `content_hash` | canonical hash of everything above | |

### The embed decision, quantified

Measured on a real boot: artifact 68.5 KB, valuation 6.7 KB (77 nodes, empty
collections), `freezePayload()` 8.1 KB, `draftState()` 6.8 KB, `conformance`
1.3 KB. Embedding the artifact + catalog costs ≈ 75 KB fixed; the variable part is
collection rows.

---

## 3. Guards

The schema is deliberately **small**: it does not duplicate the artifact schema.
`artifact.content` is typed as free-form JSON and trusted by hash (the frontend
engine has already validated it); the bundle schema enforces *bundle* structure and
cross-references.

1. `bundle_format` is a literal discriminator (currently `1`); unknown ⇒ refuse.
2. Pydantic with `extra="forbid"` on every model; the emitter runs the same check
   before writing, so a malformed bundle never reaches storage.
3. Cross-reference validators, against the embedded artifact:
   - every `state.valuation` key names a declared node;
   - every `telemetry` key names a boundary node and its `binding` matches;
   - every `catalog.dimensions` key is a declared dimension;
   - every `batch.identity` namespace is declared in `artifact.identity`;
   - every `catalog.nodes` key resolves to a node, selection field, boundary
     output, or identity field.
4. `content_hash` recomputes from the canonicalized content.
5. A committed fixture bundle is validated in CI, so the shape cannot drift
   silently. Any shape change bumps `bundle_format` and regenerates the fixture in
   the same commit.

---

## 4. Consequences

- **Formatting is the generator's job.** Identical output requires the same
  `catalog.hash`. A different unit profile can be applied later without the app.
- **No re-render from source.** A bundle cannot be recomputed under a newer
  artifact; that is a new batch (fork + re-solve) by design.
- **Bundle size grows with rows**, not with the catalog (fixed ≈ 75 KB).
- **Telemetry is empty offline.** Stub solves produce no messages; the advisory
  part of a document will be blank for those batches.
- **`validation` is captured**, so no Python reimplementation of the domain/relation
  evaluators is required.

---

## 5. Open questions (implementation choices)

1. **Emitter seam** — extend `freezePayload()` or add a separate `reportBundle()`.
   Does freeze become a two-document write (batch + bundle) that must be atomic?
2. **Document path** — top-level collection keyed by batch id, or a subcollection
   under the batch.
3. **`catalog.nodes` scope** — every artifact node (simple, larger) or only paths a
   template may reference (needs the template at freeze).

---

## 6. Staging

| Stage | Work | Gate |
|---|---|---|
| R1 | `backend/app/schemas/report_bundle.py` — guarded models + cross-reference validators; minimal fixture test | pytest green |
| R2 | Freeze-time capture: persist `boundaryExtras` (binding, fingerprint, messages) and the four validation states | frontend tests |
| R3 | Catalog resolution in the browser (dimensions from the artifact, presentation from the registries) | unit tests |
| R4 | `reportBundle()` emitter + JS shape check; atomic write path | end-to-end freeze test |
| R5 | Fixture committed + CI validation; docs (`engine.md`, `node-reference.md`, `semantics.md` §3.2) | `make verify` |

---

## 7. Non-goals

- A document grammar/template language (separate decision).
- Rendering (markdown/PDF) and the projector.
- Drift detection, ancestry graphs, re-resolution.
- Any change to the artifact's domain content.
