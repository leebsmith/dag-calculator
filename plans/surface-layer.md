---
title: Surface layer — impact, coverage, manifest, oracle
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [surface-audit]
status: active (Stages 0–4 shipped; stage guard remains)
---

# Surface layer

> **See also:** [`surface-audit.md`](surface-audit.md) — the evidence this plan
> acts on. The audit's numbering (F1–F12) is referenced below.

## Goal

One declared surface for the artifact, one impact primitive, and one completeness
oracle — so a future UI can be built against a contract instead of an
accumulation. **No user-visible change is required by any stage.**

## Non-goals

- No new UI, no card regroup, no orphaned visual redesign.
- No consumption of the impact query by the current UI.
- No generated step order. Step order stays editorial (locked).
- No relocation of host-side authoring transforms in this plan.
- No draft/batch schema migration; persisted payloads are untouched.

## Determinism rules (execution)

1. **Stage 0 closes before any code.** No stage starts with an open decision.
2. **One stage per merge.** A stage begins only after the previous stage's exit
   criteria pass on the branch.
3. **Exits are commands.** Every criterion names a command that returns 0; no
   criterion is "looks right".
4. **Additive only.** A stage that changes values or payloads is out of scope and
   needs a new plan revision.
5. **Scope is closed.** Widening a stage requires a dated amendment at the bottom
   of this file; amendments are reviewed like code.

## Locked decisions

1. **Step order is editorial.** Derived stages are a warning guard, never a
   generator (`surface-audit.md` F5).
2. **Impact is an over-approximation.** It reports declared dependency, not a
   promise that a value changes. Downstream equality is allowed.
3. **Identity is outside the runtime graph.** `buildGraph` creates no identity
   edges (F4); impact and stage derivation treat identity as terminal sources
   over the DOT graph's edge set.
4. **Families are declared.** Never inferred by prefix for boundary nodes (F7).
5. **The report is the oracle.** If a printed value exists, the UI must be able to
   recreate it; `formatted` paths are the check.
6. **No consumer pressure, no section.** A manifest section that replaces no
   existing projection (audit §6) does not enter the manifest.
7. **Step 1 is the impact query.** It is independent of the manifest and resolves
   the identity question the manifest would otherwise guess.

## Stage 0 — Decisions (no code)

Record, in this file, before Stage 1:

- **D1 Identity attribution.** Identity namespaces are terminal sources in the
  impact walk only; the engine's `adjacency`/`dependents` stay untouched. A
  selection swap is attributed to every identity field the artifact reads.
- **D2 Authoring class vocabulary.** Exactly four: `authored` (a root/choice the
  user sets), `inherited` (a default read from identity/selection, overridable),
  `table` (a collection), `internal` (a node no UI must surface). Readouts are
  derived from node kind, not declared.
- **D3 Family declaration shape.** Explicit records —
  `{ base, members: "schema" | [names], reason }` — no bare prefixes.
- **D4 Manifest output form.** A generated module beside the registry
  (`scripts/emit-surface.mjs` → a generated file), byte-guarded like
  `generated.js`; `describeField` reads it instead of re-deriving.

**Status:** D1–D4 accepted 2026-11-25.

**Exit criteria**

- D1–D4 present in this file with `status: accepted`.
- The four classes cover every one of the 48 roots/choices without a fifth class;
  the assignments themselves land in Stage 2.
- `plans/surface-audit.md` §6 table agreed without additions.

## Stage 1 — Impact query (engine only)

**Scope.** A pure graph walk over the existing `adjacency`/`dependents`:
`ancestors`, `dependents`, `boundaryFanOut`, `byDepth`; boundary fan-out (reaching
a boundary marks all its outputs changed and continues); identity attribution per
D1; `diff(stateA, stateB)` formatted through the producer.

**Deliverables.** One engine module; one frontend suite; no call-site changes.

**Exit criteria**

- `node scripts/run-tests.mjs --files tests/frontend/impact.test.js` passes with:
  inverse symmetry (`x ∈ dependents(y) ⇔ y ∈ adjacency(x)`), boundary fan-out,
  identity attribution, determinism (same input → same output, memo untouched),
  and the subset invariant against two frozen bundles.
- `make check` green.
- `make test` green.
- No file under `frontend/src/views` imports the module (A2 guard unchanged).

**Rollback.** Revert the commit; nothing consumes it.

## Stage 2 — Surface declarations and root coverage

**Scope.** `data/surface.json`: the four authoring classes for all 48
roots/choices and the D3 family records (identity namespaces, selection schemas,
constructed id families). A guard that fails when a root has no declaration or a
family member is undeclared.

**Deliverables.** The data file, the guard suite, and the 11 dispositions from
audit §A.

**Exit criteria**

- `node scripts/run-tests.mjs --files tests/guards/surface-coverage.test.js`
  passes.
- Mutation proof: a temporary artifact with an added root fails the guard (the
  test injects it; no fixture is committed).
- Every path in audit §C resolves to a declared family; the 12 boundary outputs
  in audit §4 are declared `internal` with a reason.
- `make test` green.

**Rollback.** Revert the commit; `surface.json` has no consumer yet.

## Stage 3 — Manifest emitter

**Scope.** `scripts/emit-surface.mjs` joins artifact + `data/labels.json` +
`data/surface.json` into one generated descriptor; `describeField` reads it.
No new metadata: every section replaces an existing projection (audit §6).

**Deliverables.** The emitter, the generated module, a byte guard, and the parity
suite.

**Exit criteria**

- Byte guard: regenerating changes nothing (`make generate` is quiet for this
  output).
- Parity: for all 224 valid paths, the descriptor's kind/control/dimension/unit
  matches today's `describeField` output (golden comparison).
- Label coverage is reported and enforced: every node is labelled or explicitly
  card-labelled in `surface.json`.
- `make check` green; `make test` green.

**Rollback.** Revert the commit; the generated file goes with it.

## Stage 4 — Oracle harness

**Scope.** A bundle-driven guard: every path in a frozen bundle's `formatted` must
be reachable from the declared surface; every relation/domain violation must have
a disposition (extending the existing `findings.js` completeness rule).

**Deliverables.** One guard suite; a triaged gap list (fixes are separate commits,
not this stage).

**Exit criteria**

- `node scripts/run-tests.mjs --files tests/guards/report-parity.test.js` passes.
- Every unreachable path is either fixed or allowlisted with a reason; the
  allowlist is data, not a growing `if`.
- The suite runs on the committed fixture with no browser.
- `make test` green.

**Rollback.** Revert the commit; no runtime consumer.

## Stage 5 — Stage guard (warning only)

**Scope.** Derive stages from the DOT graph (identity included) and compare them
to the editorial step order. Report drift; never reorder.

**Deliverables.** One guard suite and an accepted-drift allowlist.

**Exit criteria**

- `node scripts/run-tests.mjs --files tests/guards/stage-order.test.js` passes.
- Current drift is enumerated and either fixed or accepted with a reason
  (expected: `hops` before `water` is accepted, because they are siblings).
- `make test` green.

**Rollback.** Revert the commit.

## Whole-plan exit

- One guarded surface source; all roots dispositioned; oracle green; stage drift
  visible; impact validated.
- `make verify` green.
- No user-visible change required or made.

## Sequencing and size

| Stage | Depends on | Size | Visible change |
|---|---|---|---|
| 0 | — | hours | none |
| 1 | 0 | 1–2 days | none |
| 2 | 0,1 (identity rule) | 1–2 days | none |
| 3 | 2 | 2–3 days | none |
| 4 | 3 | 1–2 weeks | none |
| 5 | 1,2 | 1 day | none |

## Risks

- **Speculation.** A manifest section with no consumer. Mitigation: locked
  decision 6.
- **Fixture churn.** Labels and catalog are shared with `docs-claims`,
  `ui-vocabulary`, and the bundle fixture; expect parity updates, not behaviour
  changes.
- **Identity leakage.** If identity edges are added to `buildGraph`, A9 and the
  cold-start memo change semantics. Mitigation: D1 confines it to the impact walk.
- **Backlog shock.** Stage 4 will list real gaps. They are triaged, not fixed in
  the same stage.
- **Guard tax.** Stage 2 adds a disposition per new root. Accepted deliberately;
  it is the same contract as `artifact-consumers`.

## Amendments

**A.1 — Stage 1 ships the raw diff (2026-11-25).** `diffValuations` returns
`{ path, before, after }`; display formatting stays in the producer until a
consumer exists, per locked decision 6. The subset invariant does not need it.

**A.2 — Impact is a module, not a calculator method (2026-11-25).** `dag.js` is at
its `max-lines` ratchet, so the API is `createImpact(artifact, { adjacency,
dependents })`, exported from the engine's index. A consumer reads the graph off
the calculator and passes it.

**A.3 — `dependents` is not the inverse of `adjacency` (2026-11-25).** Collection
computed fields add read-side dependent edges with no matching adjacency edge
(`batch.grain_moisture_fraction → grist.major_malts`). Impact relies on this; the
stage guard (Stage 5) must derive from adjacency plus collection field inputs,
not from `dependents`.

**A.4 — A family is a namespace snapshot, drift-checked (2026-11-25).** Explicit
family members are the artifact's members under that base at declaration time;
the guard fails when the artifact gains or loses one. The water target namespace
therefore includes its derived ratio sibling, not only the six ion roots.

**A.5 — The manifest covers 335 paths, not 224 (2026-11-25).** Beyond the 133
nodes and 91 boundary outputs, it carries every identity and selection schema
field, because `describeField` already accepted those. `describeField` now reads
the manifest and attaches the artifact node by `owner`, so callers are unchanged.

**A.6 — The consumer guard skips the manifest (2026-11-25).** The generated
manifest names every path by construction, so counting its strings as
consumption made the twelve internal-boundary allowlist entries look stale. The
guard reads every other registry file as before.

**A.7 — Reachability is declared surface, not manifest membership (2026-11-25).**
Because the manifest lists all 335 paths, using it as the oracle's reachable set
would make the check vacuous. The oracle's reachable set is steps + registry
strings (excluding the generated manifest) + family members, minus the paths
declared `internal`.

**A.8 — Printed tables are checked by identity, not by column (2026-11-25).**
`formatted_tables` carries the producer's display columns (`amount`, `ppg`,
`color`, …), not schema fields. The oracle asserts each key is a collection or a
declared named report table; the five named tables live in `data/report-parity.json`
with a reason, and a stale entry fails.

## Stage log

- **2026-11-25 — Stage 0 closed.** D1–D4 accepted.
- **2026-11-25 — Stage 1 shipped.** `frontend/src/engine/impact.js` and
  `tests/frontend/impact.test.js` (10 tests: edges, fan-out, isolation, identity
  attribution, identity inputs, purity, unknown source, subset invariant, diff).
  `make check` and `make test` green. Diff formatting deferred by A.1.
- **2026-11-25 — Stage 2 shipped.** `data/surface.json` declares 17 inherited and
  31 authored roots/choices, 13 families, and 12 internal boundary outputs.
  `tests/guards/surface-coverage.test.js` (4 tests: coverage, new-root mutation,
  family-drift mutation, resolution). `make check` and `make test` green.
- **2026-11-25 — Stage 3 shipped.** `scripts/emit-surface.mjs` writes
  `frontend/src/views/registry/surface.generated.js` (335 paths, 13 families) and
  `describeField` reads it; the artifact node is attached by `owner`, so callers
  are unchanged. `tests/guards/surface-manifest.test.js` (5 tests: emitter sync,
  rule parity, node attachment, determinism, label coverage). Wired into
  `make generate` and the pre-commit generators; the `projection.js` complexity
  pin dropped 34 → 29. `make check` and `make test` green.
- **2026-11-25 — Stage 4 shipped.** `tests/guards/report-parity.test.js` (7 tests)
  checks the committed bundle: every printed value is reachable or allowlisted,
  the allowlist has no stale entry, printed tables name a collection or a declared
  report table, summaries name a collection or `overall`, and every relation and
  domain violation has a disposition. `data/report-parity.json` holds the one
  accepted gap and the five named-report-table reasons. `make check` and
  `make test` green.
