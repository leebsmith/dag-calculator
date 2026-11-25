# UI readiness

How far the model is from supporting an arbitrary UI, measured rather than
asserted. This is the answer to "could a different client be written against
this?" — what it would get for free, what it must still supply, and which
guarantees stop the answer from drifting.

Living document. The numbers below are produced by the guards listed at the end;
update them when the surface declarations change.

## Verdict

- **A read-only client** (render values, labels, units, readouts, findings):
  ready. Nothing essential is missing.
- **An authoring client** (let a person move the free variables): blocked on two
  contracts — the boundary wire shape and the pre-engine authoring transforms.
- **A full second app** (authoring plus its own workflow, grouping and copy):
  needs those two, plus the taste layer that is host-side on purpose.

## The measures

| Measure | Value |
|---|---|
| Artifact nodes | 133 (36 root, 12 choice, 70 derived, 10 collection, 2 selection, 3 boundary) |
| Boundary outputs | 91 across 3 solvers |
| Valid scalar paths (nodes + outputs) | 224 |
| Manifest descriptors | 335 — every node, boundary output, identity field and selection field |
| Roots/choices declared | 48 of 48 (17 inherited, 31 authored) |
| Families declared | 13 (4 identity, 2 selection, 7 constructed) |
| Internal declarations | 24 (12 boundary diagnostics, 12 node internals) |
| Labels | 226 entries; 79 of 133 nodes labelled; 22 card-labelled; every node has a home |
| Printed values reachable | 148 of 149 (1 allowlisted with a reason) |
| Relations dispositioned | 9 of 9 |
| Boundary wire mappings | 73 implemented (30 batch, 13 hops, 30 water); 0 emitted from the artifact |
| Host-side authoring rules | 11 (10 browser, 1 backend boundary) |
| Step order | checked against the solve spine; 4 accepted previews |

## What a new client gets for free

| Capability | Source | Shape |
|---|---|---|
| Values and dependencies | `frontend/src/engine/` | `get`, `setRoot`, `adjacency`, `dependents`, `topoOrder` |
| Cause and effect | `frontend/src/engine/impact.js` | closure, boundary fan-out, identity attribution, valuation diff |
| Field descriptors | `surface.generated.js` | kind, control, dimension, taxonomy, owner per path |
| Presentation copy | `data/labels.json`, `registry/units.js` | labels, hints, display units, precision |
| Failure wording | `registry/findings.js` | relation label, message, severity |
| Solve order | `topoOrder` filtered to boundaries | batch, then hops and water in parallel |
| State shape | `store/snapshot.js` | roots, collections, selections, identity; draft schema v4 |
| Completeness oracle | `tests/conformance/fixtures/report-bundle.json` | every printed value, with display strings |

## What it must still supply

1. **Boundary wire construction.** The artifact declares each solver's inputs,
  outputs, resolution and error codes, but the request body and response nesting
  are host-side (`adapters/boundaryRequest.js` plus the Pydantic models). A new
  client copies 73 mappings — or someone emits them from the declarations, which
  is roughly a week and is deliberately unscheduled until a client exists.
2. **Pre-engine authoring transforms.** Hamilton normalization of authored parts,
  late-addition sugar allocation, mash ordering and presets, scale-pin previews,
  ingredient priors, style conformance, fermentation geometry, presentation
  overrides. These are the twelve-row table in `docs/adding-a-node.md`. A
  read-only client needs none of them; an authoring client needs all of them,
  either reimplemented or moved into the artifact/backend.
3. **Grouping, copy and taste.** The step order is editorial by decision; the
  derived spine is a guard, not a generator. A new client must author its own
  grouping and its own prose. `data/surface.json` declares what exists, not how
  it should feel.
4. **Impact presentation.** The primitive is validated and unused. The design for
  showing deltas is parked (see `TODO.md`); nothing in the current app consumes
  it.

## Readiness scorecard

Judgements, not measurements — the table above is the evidence.

| Client | Readiness | What blocks it |
|---|---|---|
| Read-only viewer (bundle or live) | high, ~90% | grouping and visual design only |
| Authoring client using the declared model | medium, ~65% | wire construction, authoring transforms |
| Full replacement app | medium-low, ~55% | those two plus grouping, copy and interaction design |

The gap between the first two rows is the honest measure of the inversion: the
model is complete, the editor is described only by its declaration surface.

## What enforces these numbers

| Guard | Prevents |
|---|---|
| `tests/guards/surface-coverage.test.js` | an undeclared root; family drift; a path both internal and card-labelled |
| `tests/guards/surface-manifest.test.js` | a stale manifest; descriptor drift from the artifact; an unlabelled node |
| `tests/guards/report-parity.test.js` | a printed value with no surface; an undispositioned relation or domain; a stale allowlist |
| `tests/guards/stage-order.test.js` | a readout before its prerequisites; a changed boundary spine |
| `tests/frontend/impact.test.js` | a closure that misses a value a changed root moves; missing fan-out or identity attribution |
| `tests/guards/findings-registry.test.js` | a relation without wording |
| `tests/guards/engine-access.test.js`, `roots-only.test.js` | the UI reaching the model directly, or storing derived state |
| `tests/guards/docs-claims.test.js` | a document citing a path the artifact does not have |

## Remaining gaps and their triggers

- **Wire shape** — trigger: a second client starts. Until then the mapping stays
  hand-written and parity-tested.
- **Authoring transforms** — trigger: a client authors ratios rather than
  accepting resolved absolutes.
- **Grouping** — never derivable. Keep it editorial and keep the stage guard.
- **Delta visibility** — parked with the new UI, not with this document.

## Re-measuring

The counts are the guards' own inputs, so they cannot drift silently:

    make test-guards
    node scripts/run-tests.mjs --files tests/frontend/impact.test.js
    node scripts/emit-surface.mjs

A change to any count above is either a surface change (update this document in
the same commit) or a bug the guards already caught.
