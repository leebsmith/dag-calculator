---
title: Report Bundle — frozen, self-sufficient render input
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [off-graph-identity]
blocks: []
gate: a frozen batch emits one `report_bundle` document that validates against the guarded schema; it is self-sufficient for rendering with no joins and no re-resolution
status: active (R1–R4 landed; renderer pending)
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
| 2 | **Raw + catalog + formatted strings.** Values stay base-unit numbers, with presentation metadata beside them (label, unit, decimals, step, options) **and** a per-path `formatted` block (`text`, `number`, `unit`) produced by the browser at the unit preference in force at freeze. Report generators print the strings and never convert, round, or choose a symbol. |
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
  "bundle_format": 4,
  "artifact": { "schema_version": 8, "hash": "sha256:…", "content": { … } },
  "catalog": {
    "hash": "sha256:…",
    "dimensions": { "<dim>": { "base_unit", "kind", "units": { "<unit>": { "factor", "offset", "fwd", "inv" } } } },
    "nodes": { "<path>": { "label", "unit", "decimals", "step", "options", "option_labels" } }
  },
  "formatted": { "<path>": { "text": "12.4 °P", "number": "12.4", "unit": "°P" } },
  "formatted_tables": { "<collection>": [ { "<column>": { "text", "number", "unit" } } ] },
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
| `catalog.nodes` | per-path presentation: `label`, `dimension`, `unit`, `decimals`, `step`, `options`, `option_labels` | keys resolve by the engine's dotted-path rule; **every** resolvable path is emitted |
| `formatted` | per-path display strings, unit-aware at freeze | the only display source a generator reads |
| `formatted_tables` | per-row display cells for collection tables (grist) | derived amounts, PPG, and shares are producer-side |
| `batch.identity` | the three component snapshots | the document header |
| `state.valuation` | all 86 node ids → values | authoritative; boundaries are plain output maps |
| `state.roots` | explicitly-set roots only | authored-vs-inherited (`hasRoot`); **never** used to recompute |
| `state.collections` | raw rows | same data as valuation's collection entries |
| `state.selections` | remaining component snapshots | target profile, yeast |
| `state.provenance` | per selection `source_template_id` | |
| `conformance` | style adherence as assessed at freeze | |
| `validation` | relations + four domain states | captured, not recomputed |
| `telemetry` | per boundary: binding, fingerprint, messages | fingerprint is otherwise stripped from the freeze payload |
| `content_hash` | canonical hash of everything above | |

### The embed decision, quantified

Measured on a real boot: artifact 68.5 KB, valuation 6.7 KB (86 nodes, empty
collections), `freezePayload()` 8.1 KB, `draftState()` 6.8 KB, `conformance`
1.3 KB. Embedding the artifact + catalog costs ≈ 75 KB fixed; the variable part is
collection rows.

---

## 3. Guards

The schema is deliberately **small**: it does not duplicate the artifact schema.
`artifact.content` is typed as free-form JSON and trusted by hash (the frontend
engine has already validated it); the bundle schema enforces *bundle* structure and
cross-references.

1. `bundle_format` is a literal discriminator (currently `4`); unknown ⇒ refuse.
2. Pydantic with `extra="forbid"` on every model; the emitter runs the same check
   before writing, so a malformed bundle never reaches storage.
3. Cross-reference validators, against the embedded artifact:
   - every `state.valuation` key names a declared node;
   - every `telemetry` key names a boundary node and its `binding` matches, and
     names a node that is present in `state.valuation`;
   - every `catalog.dimensions` key is a declared dimension;
   - every `batch.identity` namespace is declared in `artifact.identity`;
   - every `catalog.nodes` key resolves to a node, selection field, boundary
     output, or identity field;
   - **coverage**: every node id, boundary-output key, selection field, and
     collection row field exposed in `state.valuation` has a `catalog.nodes`
     entry. A required-but-empty catalog cannot pass;
   - every `formatted` key names a catalog path, and a path whose catalog entry
     has a unit carries the `number`/`unit` split;
   - every `formatted_tables` key names a collection node, with non-empty cell
     text.
4. `content_hash` recomputes from the canonicalized content (`ReportBundle.seal`;
   the validator rejects a mismatch).
5. A committed fixture bundle is validated in CI, so the shape cannot drift
   silently. Any shape change bumps `bundle_format` and regenerates the fixture in
   the same commit.

---

## 4. Consequences

- **Formatting is the producer's job.** The browser freezes `formatted` strings
  at the unit preference in force, using the same formatter as the UI. A report
  generator needs no conversion code; identical output requires the same
  `content_hash` (which covers `formatted`). Changing the display-unit switcher
  later does not rewrite a frozen fact.
- **No re-render from source.** A bundle cannot be recomputed under a newer
  artifact; that is a new batch (fork + re-solve) by design.
- **Bundle size grows with rows**, not with the catalog (fixed ≈ 75 KB).
- **Telemetry is empty offline.** Stub solves produce no messages; the advisory
  part of a document will be blank for those batches.
- **`validation` is captured**, so no Python reimplementation of the domain/relation
  evaluators is required.

---

## 5. Implementation choices (settled)

1. **Emitter seam** — separate `reportInputs()` / `reportCatalog()` producers; the
   server assembles the bundle inside the existing freeze transaction. Two
   documents, one transaction: the freeze fails if the bundle cannot be sealed.
   Both producer blocks are **required** on `FreezePayload`, and the repository's
   `freeze` requires a bundle factory — there is no freeze path without a bundle.
2. **Document path** — sibling collection `users/{uid}/report_bundles/{frozen_id}`,
   keyed by the *new* frozen id. `BatchRecord` stays lean.
   **Download/preview:** `GET /batches/{id}/report-bundle` serves the stored fact;
   `POST` assembles a draft preview (`batch.status: "draft"`,
   `frozen_at: null`) and persists nothing. The renderer refuses non-frozen
   bundles.
3. **`catalog.nodes` scope** — every resolvable path (nodes, selection fields,
   collection fields, boundary outputs, identity fields), with a humanized label
   fallback. 315 entries for the current artifact.

---

## 6. Staging

| Stage | Work | Gate |
|---|---|---|
| R1 ✅ | `backend/app/schemas/report_bundle.py` — guarded models + cross-reference validators; fixture test | pytest green |
| R2 ✅ | Freeze-time capture: `reportInputs()` (four validation states + per-boundary binding/fingerprint/messages) | frontend tests |
| R3 ✅ | `reportCatalog()` — dimensions from the artifact, presentation from the registries + step labels | unit tests |
| R4 ✅ | Server-side emitter + `content_hash` enforcement + catalog-coverage guard; atomic sibling write; required request blocks | end-to-end freeze test |
| R5 ✅ | Committed fixture (`tests/conformance/fixtures/report-bundle.json`) + freshness test | `make verify` |
| R6 ✅ | `docs/report-bundle.md` + generated `docs/report-bundle-glossary.md` + `scripts/describe-report-bundle.mjs` | `make verify` |

---

## 7. Non-goals

- A document grammar/template language (separate decision).
- Rendering (markdown/PDF) and the projector.
- Drift detection, ancestry graphs, re-resolution.
- Any change to the artifact's domain content.
