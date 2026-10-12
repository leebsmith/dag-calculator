---
title: Step A — Grammar v2 & Loadable Artifact
step: A
program: deterministic-dag-calculator
seed_doc: prompts/discovery-sweep.md
target_repo: ~/Development/dag-calculator
depends_on: none
blocks: [Step B, Step C, Step D, Step E, Step F, Step G]
gate: loadArtifact + validateDerivedDimensions pass; npm test / make check / make test green; boundary parity; worked-example goldens
status: ready
---

# Step A — Grammar v2 & Loadable Artifact

**Goal:** make `data/artifact.json` a *legal, versioned* graph under grammar v2 that the
engine **loads, validates, and dimension-checks** — and ratify the language the domain
needs. No correctness/completeness claims (those are later steps).

---

## Locked decisions (recap)

| # | Decision |
|---|---|
| #1 | **A2** — new `choice` node kind; boolean **input** kind deferred (binary choices are `choice` over a 2-member taxonomy) |
| #2 | Boundary outputs — **FLAT + dotted** keys, with a documented flattening convention |
| #3 | Reductions — optional **`where`** predicate (filter-then-reduce); add `min`; empty ⇒ `undefined`; `max` deferred; key `value`; numeric-only |
| #4 | `mash.rests` default via **reference-cache seed** |
| #5 | Boundary warts — **C3 + C5 only** + explicit default tests |
| #6 | `schema_version` → **2** |

## Four agreed additions (folded in)

- **R1 — Relation/`domain` scope.** For Step A, invariants remain **inert**; engine
  evaluation is deferred to **Step B (engine completeness)**. The empty-`min` "guard" is
  **not** added; instead the seed guarantees ≥1 enabled rest and the precondition is
  **documented**.
- **R2 — `where` truthiness + boolean schema-field convention.** Define `where` as truthy
  (`undefined` / `null` / `false` / `0` / `""` ⇒ false). Document a boolean-flag
  schema-field form so `mash_rest.enabled` stops being an empty spec `{}`.
- **R3 — `min` non-finite behavior.** `min` skips non-finite/`null` `value`s **after**
  filtering; if none remain ⇒ `undefined`.
- **R4 — Correct/retire the sweep reports** in this pass (the false PASS must go).

---

## Steps

### A.1 — Language spec (`docs/dag-artifacts/`)
- `grammar.md`: node kinds five→**six**; add `choice`; document **FLAT + dotted** boundary
  outputs; value-type vocabulary; boolean-flag schema field; §6 `schema_version 2`.
- `expression-language.md`: add **`min`** + optional **`where`** (filter-then-reduce,
  applies to `sum` / `weighted_avg` / `min`); truthiness rule (**R2**); numeric-only;
  empty ⇒ `undefined`; non-finite rule (**R3**).
- `semantics.md`, `00-ingestion.md`: update kind count + value-type vocabulary.
- `worked-example.md`: note `dough_in_target` is derived (`min` over enabled rests).

### A.2 — Validator (`frontend/src/engine/validate.js`)
- `NODE_KINDS` += `"choice"`; validate `{taxonomy declared, default ∈ members}`.
- `root` stays `dimension`-only.
- Boundary outputs accept `{dimension | taxonomy | boolean}`; validate ids.
- Schema-field vocabulary: accept the boolean-flag form (**R2**).
- Accept `schema_version: 2`.

### A.3 — AST (`frontend/src/engine/ast.js`)
- Add `min`.
- Add `where` to `sum` / `weighted_avg` / `min` (filter-then-reduce).
- Empty-`min` ⇒ `undefined`; non-finite skip (**R3**).

### A.4 — Units (`frontend/src/engine/units.js`)
- `inferExprDimension`: `min` → dim(`value`); `where` no-op; boolean.
- `nodeDimension`: `choice` → taxonomy; boundary taxonomy/boolean.

### A.5 — DAG (`frontend/src/engine/dag.js`)
- Add `case "choice"` (evaluate `default`).

### A.6 — Artifact (`data/artifact.json`)
- The 7 enum roots `kind:"root", taxonomy` → **`kind:"choice", taxonomy`**.
- `mash.dough_in_target_temp_c.expr.min` += `where: {ref: "rest.enabled"}`.
- Type `mash_rest.enabled` per **R2**; `schema_version` → 2; refresh `meta.description`.
- Re-validate with the engine validator.

### A.7 — Seed / reference cache
- New `data/seeds/mash-schedules.json` (≥1 enabled rest).
- `frontend/src/store/referenceCache.js`: import + supply `collections["mash.rests"]`.

### A.8 — Consumers
- `frontend/src/adapters/engineAdapter.js`: stop `setRoot`-ing `dough_in_target`.
- `tests/frontend/`: fixtures get `mash.rests`; recompute goldens; add tests for `choice`,
  `min` + `where`, empty-`min` ⇒ `undefined`, boundary taxonomy/boolean output,
  `schema_version: 2`.

### A.9 — Backend (`backend/`)
- `app/schemas/boundary.py`: **C3** `strategy` `FLAVOR` → `CALCIUM_FLOOR`; **C5**
  `target_mash_ph` `5.35` → `5.4`.
- `tests/backend/`: add `test_water_defaults` (assert the two defaults); stop re-pinning
  them in `conftest.py` for that path.

### A.10 — Correct the sweep reports (**R4**)
- `validation-report.md`: replace the false PASS with real gate output (or delete).
- `gap-register.md`: record the `root` → `choice` change; note C3/C5 resolved in-code;
  list deferred items.
- `provenance.md` / `coverage-matrix.md`: update for `choice` / `min` / `where`.

### A.11 — Gate
- Run the full gate below.

---

## Gate (definition of done)
- `loadArtifact()` + `validateDerivedDimensions()` pass.
- `npm test`, `make check`, `make test` green.
- Boundary parity (batch/water) still matches `boundary.py`.
- `worked-example` / `domain-equations` goldens reproduce.

## Deferred (recorded, not in Step A)
Relations / `domain` evaluation · map/dict value type · boolean **input** kind · list
literals · `max` · semantic conformance (Step C) · JSON seam (Step D) · product/views
(Step E) · persistence (Step F) · seed/schema conformance (Step G).

## Program context
**Step A** (this) → Step B (engine completeness) → Step C (conformance) ‖ Step D (seam) →
Step E (product); Steps F/G parallel.
