# UI readiness

How far the model is from supporting an arbitrary UI, measured rather than
asserted. This is the answer to "could a different client be written against
this?" — what it would get for free, what it must still supply, and which
guarantees stop the answer from drifting.

Living document. The numbers below are produced by the guards listed at the end;
update them when the surface declarations change.

## Verdict

- **Design: ready.** The only open questions are the design's own — grouping,
  copy, layout, and how deltas are shown. Nothing is left to discover about the
  model, the state, the solve or the failures. The brief is
  `docs/ui-contract.md`.
- **Build: still work.** A read-only client is nearly done; a live one must
  implement the boundary wire (now specified); an authoring one must also own the
  pre-engine transforms.

## The measures

| Measure | Value |
|---|---|
| Artifact nodes | 133 (36 root, 12 choice, 70 derived, 10 collection, 2 selection, 3 boundary) |
| Boundary outputs | 91 across 3 solvers |
| Valid scalar paths (nodes + outputs) | 224 |
| Manifest descriptors | 335 — every node, boundary output, identity field and selection field |
| Roots/choices declared | 48 of 48 (17 inherited, 31 authored) |
| Authoring actions declared | 60 (16 set, 17 override, 12 choose, 5 pick, 10 edit-table) |
| Pre-engine transforms | 5 (Hamilton, sugar share, prior resolution, mash preset, scale pin) |
| Families declared | 13 (4 identity, 2 selection, 7 constructed) |
| Internal declarations | 24 (12 boundary diagnostics, 12 node internals) |
| Labels | 226 entries; 79 of 133 nodes labelled; 22 card-labelled; every node has a home |
| Printed values covered | every value in the three committed states (149 normal, 47 draft, 127 water-unavailable) |
| Accepted gaps | 1 (`batch.late_addition_volume_l`, report-only) |
| Relations dispositioned | 9 of 9 |
| Boundary wire mappings | 73 implemented (30 batch, 13 hops, 30 water); specified, not generated |
| Reference renderer | reproduces every printed value from a bundle through the manifest |
| Step order | checked against the solve spine; 4 accepted previews |

## What a new client gets for free

| Capability | Source | Shape |
|---|---|---|
| The contract | `docs/ui-contract.md` | state, authoring, solve, failure, identity, wire |
| Values and dependencies | `frontend/src/engine/` | `get`, `setRoot`, `adjacency`, `dependents`, `topoOrder` |
| Cause and effect | `frontend/src/engine/impact.js` | closure, boundary fan-out, identity attribution, valuation diff |
| Field descriptors | `surface.generated.js` | kind, control, dimension, taxonomy, owner per path |
| Presentation copy | `data/labels.json`, `registry/units.js` | labels, hints, display units, precision |
| Failure wording | `registry/findings.js` | relation label, message, severity |
| Solve order | `topoOrder` filtered to boundaries | batch, then hops and water in parallel |
| State shape | `store/snapshot.js` | roots, collections, selections, identity; draft schema v4 |
| Proof of sufficiency | `scripts/render-bundle.mjs` | prints every value using only the manifest and the label file |
| Completeness oracle | `tests/conformance/fixtures/report-bundle.json` and `report-states/` | every printed value in three states, with display strings |

## What it must still supply

1. **Boundary wire construction.** Specified in the contract appendix; the 73
  mappings, the three host transforms and the response flattening are still
  host-side code. A client reimplements them, or someone emits them later
  (roughly a week, deliberately unscheduled until a client exists).
2. **Pre-engine authoring transforms.** Hamilton normalization, sugar
  allocation, mash presets, scale pins, ingredient priors, plus the post-engine
  rules (conformance, fermentation geometry, water readouts, presentation
  overrides). Inventory in `data/authoring.json` and `docs/adding-a-node.md`. A
  read-only client needs none of them; an authoring client needs the five
  pre-engine ones and inherits the rest as behaviour.
3. **Grouping, copy and layout.** Editorial by decision. The derived spine is a
  guard, not a generator; the design owns the rest.
4. **Impact presentation.** The primitive is validated and unused. Delta
  visibility is parked in `TODO.md` with the new UI as its trigger.

## Scorecard

| Client | Design readiness | Build readiness | What blocks the build |
|---|---|---|---|
| Read-only viewer over a bundle | ready | high, ~90% | layout and grouping only |
| Read-only viewer, live | ready | ~80% | the wire implementation |
| Authoring client | ready | ~65% | the wire plus the pre-engine transforms |
| Full replacement app | ready | ~55% | those two plus grouping, copy and interaction |

"Design readiness" is a yes/no, and it is yes: every question a wireframe would
ask has an answer in the contract or the declarations. The percentages measure
only how much of a build the model supplies.

## What enforces these numbers

| Guard | Prevents |
|---|---|
| `tests/guards/surface-coverage.test.js` | an undeclared root; family drift; a path both internal and card-labelled |
| `tests/guards/surface-manifest.test.js` | a stale manifest; descriptor drift from the artifact; an unlabelled node |
| `tests/guards/authoring-contract.test.js` | an authorable node with no action; a wrong action or constraint; an unlisted transform |
| `tests/guards/report-parity.test.js` | a printed value with no surface in any state; an undispositioned relation or domain; a stale allowlist |
| `tests/guards/render-coverage.test.js` | a renderer that drifts from the oracle or invents copy |
| `tests/guards/stage-order.test.js` | a readout before its prerequisites; a changed boundary spine |
| `tests/frontend/impact.test.js` | a closure that misses a value a changed root moves; missing fan-out or identity attribution |
| `tests/guards/findings-registry.test.js` | a relation without wording |
| `tests/guards/engine-access.test.js`, `roots-only.test.js` | the UI reaching the model directly, or storing derived state |
| `tests/guards/docs-claims.test.js` | a document citing a path the artifact does not have |

## Remaining gaps and their triggers

- **Wire implementation** — trigger: a client starts. The shape is specified and
  parity-tested; only the code is missing.
- **Authoring transforms** — trigger: a client authors ratios rather than
  accepting resolved absolutes.
- **Grouping and copy** — the design's work, starting now.
- **Delta visibility** — parked with the new UI, not with this document.

## Re-measuring

    make test-guards
    node scripts/run-tests.mjs --files tests/frontend/impact.test.js
    node scripts/emit-surface.mjs
    node scripts/derive-report-states.mjs
    node scripts/render-bundle.mjs

A change to any count above is either a surface change (update this document in
the same commit) or a bug the guards already caught.
