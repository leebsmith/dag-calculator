---
title: Step B — Engine Enforcement (Relations & Domain Bounds)
step: B
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: Step A
blocks: [Step E]
gate: relations + domain states evaluate; tests green; make check/test green; no artifact change
status: ready
---

# Step B — Engine Enforcement (Relations & Domain Bounds)

**Goal:** make the artifact's declared invariants **live** — the engine evaluates
the four n-ary `relations` and each node's unary `domain` bounds, and exposes them
for the view to surface. Today they are **declared but inert** (R1 deferred this
from Step A).

## Context (from `data/artifact.json`)
- **4 relations**, each `{ id, predicate }`; predicates are AST with `lhs`/`rhs`
  operands and ops `le`/`ge`; operands are `{ref}` (dotted, including boundary
  outputs like `solver.batch.v_pre_boil`) or `{const}`:
  `hlt_not_overfilled`, `kettle_not_overfilled`,
  `mash_thickness_above_husk_floor`, `target_abv_reachable`.
- **23 root/choice nodes** carry `domain` bounds (`gt`/`gte`/`lt`/`lte`, values as
  literals / `{const}` / `{ref}`). Categories have no `domain` (membership is the
  taxonomy).

## Steps

### B.1 — Relation evaluation (`frontend/src/engine/relations.js`)
- `evaluatePredicate(artifact, predicate, resolveValue) -> boolean`: resolves
  `lhs`/`rhs` (or `args`) and applies the comparison op; supports
  `gt/ge/lt/le/eq/ne` (+ reuse existing logical/arithmetic ops).
- `relationStates(artifact, resolveValue) -> [{ id, holds }]`.

### B.2 — Domain evaluation (`frontend/src/engine/domains.js`)
- `checkDomain(artifact, nodeId, value) -> { nodeId, holds, field?, limit? }`.
- `domainStates(artifact, get) -> [{ nodeId, holds, ... }]` over every root/choice
  node with a `domain` (skip nodes with no bounds or non-finite values).
- Bounds may be literals or `{const}`/`{ref}` (resolve against constants/nodes).

### B.3 — Engine API (`frontend/src/engine/dag.js` + `index.js`)
- Expose `engine.relationStates()` and `engine.domainStates()` (report-only;
  non-throwing — invariants are surfaced, not enforced at set time).
- Export the helpers from `index.js`.

### B.4 — Tests (`tests/frontend/relations.test.js`, `domains.test.js`)
- Relations: with fixtures, `hlt_not_overfilled` and `mash_thickness_above_husk_floor`
  hold; craft a violating fixture (e.g. `hlt_starting_volume_l > max_hlt_volume_l`)
  and assert `holds:false`. Include a relation referencing a boundary output.
- Domains: in-range vs out-of-range for `batch.target_abv` (`gt 0`),
  `batch.apparent_attenuation` (`gt 0, lte 1`), `water.target_mash_ph` (`gte 4, lte 7`).

### B.5 — Docs
- `semantics.md` §4 already defines constraints/interpretations; add a one-line
  note that the engine evaluates `relations` and `domain` and surfaces them
  (report-only). `grammar.md` §4.2 predicate shape unchanged.

## Out of scope (recorded)
map/dict value type · boolean **input** kind · list literals · `max` ·
semantic conformance (Step C) · async boundary status (Step D) · view surfacing
(Step E).

## Gate (definition of done)
- `engine.relationStates()` returns all 4 relations with boolean `holds`;
  `engine.domainStates()` covers all 23 bounded nodes.
- New tests pass; `make check` and `make test` green; **no artifact change**.

## Program context
A → **B** → C ‖ D → E; Steps F/G parallel.
