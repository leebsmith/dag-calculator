---
title: UI gate closure — finish everything that is not design
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [surface-audit]
status: active (Stages A–C shipped; the ledger remains)
---

# UI gate closure

> **See also:** [`docs/ui-readiness.md`](../../docs/ui-readiness.md) — the measured
> state this plan closes, and [`surface-audit.md`](../surface-audit.md) — the
> original evidence.

## Goal

Reach the point where a UI can be designed without discovering, mid-design, that
the model or the state contract is missing something. After this plan, the only
open work is the design itself.

## What "gate closed" means

A designer can start when all ten are true:

1. Every value a screen can show is declared, described and reachable — shipped
   with the surface layer.
2. Every state a screen must render is representable and covered by the oracle:
   a normal batch, an empty batch, a failed boundary, a legacy draft.
3. Solve timing is specified: when boundaries run, what `pending` means, what
   supersedes what, and what a frozen batch does instead.
4. Every authoring action a person can take is inventoried with its constraints,
   and the inventory is complete by guard.
5. Persistence and lifecycle are specified: the canonical state, its versions,
   and the migration rule.
6. The boundary wire is specified (request, response, host transforms). Its
   *implementation* remains build work, but it is no longer a design unknown.
7. Causality semantics are specified: what impact answers, what it does not, and
   why identity is a terminal source.
8. No known model inconsistency can surprise a design. The identity/graph split
   is either fixed or stated as a rule the client must follow.
9. The contract is proven sufficient: one reference renderer reproduces every
   printed value from a frozen bundle using only the declared surface.
10. `docs/ui-readiness.md` says the only remaining gaps are grouping, copy and
    layout — the design's own work.

## Non-goals

- No UI, no wireframe, no interaction decisions.
- No new model values or artifact changes.
- No authoring-transform relocation; the contract names them, it does not move
  them.
- No wire code generation; the existing parity guards remain the enforcement.

## Stage A — The UI contract (one document, three sections)

**Scope.** `docs/ui-contract.md`:

- **State** — the canonical payload (roots, collections, selections, identity),
  the draft schema version, freeze, and the migration rule. This is the missing
  state contract, written once.
- **Authoring** — every action a person can take on the free variables: set a
  root, choose a taxonomy, edit a collection row, pick a component, apply a
  preset. For each, its constraint (domain, envelope, relation) and which host
  transform runs before the engine sees the value. Declared in
  `data/authoring.json` and rendered into the document.
- **Solve and failure** — boundary timing (debounce, supersede, fingerprint
  cache, pending/unavailable), the error-code vocabulary, relations, domains,
  absence-is-not-zero, and what a frozen batch guarantees instead of solving.

**Exit criteria**

- `node scripts/run-tests.mjs --files tests/guards/authoring-contract.test.js`
  passes: every `authored` root, every `table` family and every selection has an
  action entry; every entry resolves; a stale entry fails.
- Every section of the document names only paths and ids the artifact has
  (`docs-claims` green).
- The document answers, by section, the ten gate items it covers.

## Stage B — Broaden the oracle

**Scope.** The report oracle currently reads one frozen bundle. Add fixtures for
the states a UI must render, and run the same reachability check over each:

- a normal batch (exists),
- an empty batch (no selections, defaults only),
- a failed or unavailable boundary,
- a legacy draft that migrated.

**Exit criteria**

- Each fixture is a committed bundle under `tests/conformance/fixtures/`.
- `tests/guards/report-parity.test.js` iterates every fixture, and the allowlist
  is per-path, not per-bundle.
- No new unallowlisted gap appears; every accepted gap carries a reason.
- `make test` green.

## Stage C — The reference renderer

**Scope.** `scripts/render-bundle.mjs`: read a frozen bundle, walk the manifest,
and print every `formatted` path with its label, unit and value, using nothing but
the manifest, `data/labels.json` and the bundle. No layout, no grouping, no copy
invented.

**Exit criteria**

- The renderer reproduces every path in the normal-batch bundle — the same 148 of
  149, with the allowlisted path named.
- Running it against each Stage B fixture succeeds or names the unavailable
  value; it never throws.
- A guard asserts the renderer's coverage equals the oracle's coverage, so the two
  cannot diverge.
- `make check` and `make test` green.

## Stage D — Close the ledger

**Scope.** Update `docs/ui-readiness.md`: the scorecard's remaining gaps become
grouping, copy and layout only; the wire is marked *specified, unbuilt*; the last
section states that design is the only gate. Add the reference renderer to the
re-measure block.

**Exit criteria**

- Every count in the readiness document matches the guards and the renderer.
- `TODO.md` carries one line: UI design is the only open work.
- `make verify` green.

## Sequencing

| Stage | Depends on | Size | Product risk |
|---|---|---|---|
| A | — | 2–3 days | none — documentation and one data file |
| B | — | 1–2 days | low — fixtures only |
| C | A, B | 2–3 days | none — a proof artefact |
| D | A–C | hours | none |

A and B can run in parallel; C needs both.

## Risks

- **Documentation drift.** Mitigation: the authoring inventory is data with a
  completeness guard, and every cited path is claims-checked.
- **A fixture that cannot be built without a live backend.** Mitigation: a
  boundary-failed state is representable in a bundle (missing outputs), and the
  fixture can be shaped by hand and validated by the bundle schema.
- **The contract documents taste by accident.** Mitigation: the document records
  actions, constraints and timing; it never records grouping, copy or layout.
- **Scope creep into wire generation.** Mitigation: Stage A specifies the wire;
  the trigger for building it remains a client.

## Definition of done for the plan

`make verify` green, all ten gate items checked in `docs/ui-contract.md`, and
`docs/ui-readiness.md` naming design as the only open gate.

## Amendments

**A.1 — Stage A carries the wire appendix (2026-11-25).** Gate item 6 requires the
boundary wire to be specified. The contract document therefore closes with a wire
appendix (URLs, request keys, host transforms, response flattening) marked
*specified, not generated*; no code generation is in scope.

**A.2 — Stage B fixtures are oracle states, not bundles (2026-11-26).** Fabricating
a full bundle would carry a fake content hash, so the two new states are committed
as partial fixtures under `tests/conformance/fixtures/report-states/` with only the
blocks the oracle reads plus the derivation note. They are re-derived from the
normal bundle by `scripts/derive-report-states.mjs` and byte-guarded. The
legacy-draft state is not a bundle state; it stays covered by the draft-migration
guards (`tests/frontend/batch-migrations.test.js` and the roots-only A4b case).

## Stage log

- **2026-11-25 — Stage A shipped.** `docs/ui-contract.md` covers state, authoring,
  solve and failure, identity and causality, and the wire appendix.
  `data/authoring.json` records 60 actions (16 set, 17 override, 12 choose, 5
  pick, 10 edit-table) and 5 pre-engine transforms.
  `tests/guards/authoring-contract.test.js` (4 tests) enforces coverage,
  action/constraint consistency, transform ownership, and mutation failure.
  `make check` and `make test` green.
- **2026-11-26 — Stage B shipped.** Two derived state fixtures
  (`draft-before-solve` with 47 printed paths, `water-unavailable` with 127) are
  byte-guarded against `scripts/derive-report-states.mjs`. The report oracle now
  iterates normal, draft and water-unavailable, with a per-path allowlist and a
  liveness check. Legacy draft stays with the migration guards (A.2).
  `make check` and `make test` green.
- **2026-11-26 — Stage C shipped.** `scripts/render-bundle.mjs` renders every
  printed value from a bundle through the manifest and `data/labels.json`, with no
  layout or invented copy; the accepted gap is rendered and named. Five guard
  tests assert its coverage equals the oracle's input on all three states, that
  every value is labelled, and that the CLI runs on each fixture.
  `make check` and `make test` green.
