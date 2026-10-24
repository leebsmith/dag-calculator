# Engine

The **reference interpreter** for `data/artifact.json`. It is a small, synchronous,
pure, DOM-free ES module — a collection of **data structures** plus an
**interpreter** — that turns the artifact's declarative DAG into live values.

This is the *realization* the artifact's semantics describe (`semantics.md`); the
artifact defines the model, and this module upholds its invariants.

## The three layers

`semantics.md` §1.2 splits the system into:

- **Logic** — `data/artifact.json` (static, authoritative, view-independent).
- **State** — the mutable **roots** (inputs).
- **Derived** — the engine's computed values (never stored).

The engine owns the **State** and **Derived** layers; the view only reads them.

## Lifecycle

1. **Load & validate** — `createCalculator(artifact, options)` calls
   `loadArtifact`, which runs `validateArtifact` (structure: node kinds, dangling
   refs, choice defaults, output shapes) and `validateDerivedDimensions`
   (dimension inference on every `derived` node). It throws on any violation.
2. **Build the graph** — `buildGraph` derives `adjacency` (node → its declared
   dependencies) and `dependents` (node → its consumers) from `inputs`/`ref`
   only, then `topologicalSort` produces `topoOrder`.
3. **Evaluate lazily** — `get(nodeId)` evaluates a node once and **memoizes** it;
   descendants are pulled on demand, not eagerly.
4. **Invalidate on change** — `setRoot`/`setCollection` drop the
   changed node and *its dependents* from the memo, so the next `get` re-derives.

There is **no read-tracking and no reactivity**: dependencies exist only where the
artifact declares them, and a value is recomputed only when a declared ancestor
changes.

## Modules

| File | Role |
|---|---|
| `index.js` | public API: `loadArtifact`, `createCalculator`; re-exports |
| `dag.js` | the runtime: graph build, evaluation dispatch, memo, invalidation |
| `ast.js` | the expression interpreter (`evaluate`) |
| `paths.js` | dotted-path resolution (`resolveReference`, `getField`) |
| `units.js` | dimension system: conversion, add/sub inference, derived-dimension checks |
| `domains.js` | unary domain-bound checks (nodes, selected-component fields, collection items) |
| `relations.js` | n-ary relation predicates |
| `boundary.js` | canonical fingerprinting + `BoundaryCache` |
| `validate.js` | structural validation of the artifact |
| `sha256.js` | hashing for canonical boundary fingerprints |

## Data structures

### The graph (`buildGraph`)

- **`adjacency`** — `nodeId → [dependencyNodeIds]`, built from each node's
  declared `inputs` (derived/boundary), `ref` (selection), and any `{ref}` in a
  root/choice `default` (a default is evaluated lazily when the node is unset,
  so its refs are real dependencies, not hidden ones). Collections have no edges
  out.
- **`dependents`** — the reverse: `nodeId → [consumerNodeIds]`.
- **`topoOrder`** — a deterministic topological sort of all nodes.

These are what make the DAG **explicit**: no edge exists unless declared.

### Mutable input state

- **`roots`** — a `Map` of `root`/`choice` values (`nodeId → value`). Includes the
  `reference` roots that name selections. `setRoot` rejects non-root/choice nodes.
- **`collections`** — `collectionNodeId → rows[]`.
- **`selections`** — `selectionNodeId → component`, the batch's copied-forward
  snapshot of each chosen component. A loaded batch reads selections from this
  map, never from the live library.
- **`references`** — the immutable seed catalogs keyed by schema then id
  (`equipment`/`yeast`/`water_report`/`water_target`), with the user's server
  library records merged over the seeds for the pickers. The engine consults it
  only for legacy drafts whose selection snapshot is missing.

Only roots/choices/collections are mutable; derived values and boundary
outputs are **never stored** (single-writer invariant, `semantics.md` §2.1).
`batch.brew_day_steps` is an authoring-only collection: it carries the printed
recipe's selected workflow steps and instruction text, and no derived math
depends on it.

### Caches

- **`memo`** — `nodeId → value` for derived/selection/boundary nodes, so a node
  evaluates at most once per root-set.
- **`BoundaryCache`** — `fingerprint → { outputs, fingerprint }`, keyed by the
  canonical fingerprint of the boundary's inputs.

## The interpreter

### `evaluateNode(nodeId)` — dispatch

```text
root/choice   → roots.get(nodeId) ?? evaluate(node.default)
collection    → collections[nodeId] ?? []
selection     → selections[nodeId] ?? reference component (empty ref → {})
derived       → evaluate(node.expr, ctx(  resolve node.inputs  ))
boundary      → request body → fingerprint → cache hit | boundaries[binding](body)
```

A boundary's **request body** is the resolved declared `inputs` by default; when
the host registers a per-binding request adapter (`options.boundaryRequests`), it
reshapes them into the backend's Pydantic contract. Either way the *same* body
feeds `boundaryRequest()` and evaluation, so their fingerprints agree.

A selection resolves the batch's copied component first
(`options.selections[nodeId]`). A non-empty `ref` with no snapshot falls back to
the library `references[node.output.schema][refValue]`; that fallback exists only for
legacy drafts, which the normal load path materialises and persists on the next
save. Library edits therefore cannot perturb a batch that already carries its
snapshot. An empty `ref` (or a `null` snapshot) resolves to `null` — absence, not
an empty component — so dotted reads yield `undefined`.

### `evaluate(expr, ctx)` — the AST

Interprets the expression tree (`expression-language.md`): literals, `ref`
(pulled from the context), `const`, `call`, operators (`+ - * / pow if …`), and
reductions (`sum weighted_avg min map filter`, with an optional `where`).

### Function calls

`callFunction(fnId, args)` binds a `functions` entry's `params` to its `args` and
evaluates its `body` — used for shared equations (e.g. the strike-water chain).

### Path resolution

`resolveValue(path)` / `resolveReference` resolve dotted paths by
longest-prefix match against node ids, then treat the suffix as a selection /
collection field or a boundary output (e.g. `solver.batch.cascade.v_strike`). If
no node matches, the longest `artifact.identity` namespace prefix is resolved
against the immutable identity snapshot (`equipment.mash_tun_mass_kg`,
`style.og_min`, `water.source.calcium_ca`). Identity refs create **no graph
edges** — nothing can invalidate them.

`createCalculator(artifact, { identity })` is required whenever the artifact
declares identity namespaces; the engine throws without it.

## Invalidation

`setRoot`/`unsetRoot`/`setCollection` call `invalidate(nodeId)`, which deletes
the node from `memo` and recurses through `dependents`. The memo is the only
place values are cached, so there is nothing else to keep consistent.

`unsetRoot(id)` drops an explicit value: the node falls back to its `default`
(or becomes valueless when the default cannot resolve). A root whose default
reads a selection field therefore *inherits* from that component until the user
sets it; once set it is an override and component changes no longer affect it.

## Public API

```js
createCalculator(artifact, { roots, collections, selections, references, … })

engine.get(id)            // node value (memoized)
engine.resolve(path)      // dotted-path value
engine.call(fnId, args)   // invoke a function
engine.relationStates()   // [{ id, holds }]
engine.domainStates()     // [{ nodeId, holds, … }]  (root/choice nodes; holds:null = unresolved)
engine.fieldDomainStates()      // [{ selectionNodeId, field, holds, … }]
engine.collectionDomainStates() // [{ nodeId, index, field, holds, … }]

engine.identity          // { equipment, "water.source", style } snapshots
engine.setRoot(id, v)  unsetRoot(id)  getRoot(id)  hasRoot(id)
engine.setCollection(id, rows)

engine.topoOrder  adjacency  dependents
```

> For a catalog of everything resolvable from a single node id (by accessor),
> see `docs/dag-artifacts/node-reference.md`.

### The boundary seam

The engine is synchronous and pure, but boundary *realizations* may be remote.
The adapter pre-resolves them: `boundaryRequest(id)` returns `{ binding, inputs,
fingerprint }`; the adapter performs the I/O and calls
`applyBoundaryResult(fingerprint, outputs)` to seed the cache. After that,
evaluation hits the cache synchronously. `hasBoundaryResult(fingerprint)` checks
whether a solve is already available.

`inputs` here is the **request body**. The artifact's declared `inputs` are
resolved into frontend shapes (flat roots, raw collection rows), but the
backend's `extra="forbid"` models use different shapes (normalized grain-bill
rows, nested `IonProfile`s). A **request adapter** bridges that gap: the host
registers pure builders per binding via `options.boundaryRequests`
(`frontend/src/adapters/boundaryRequest.js`), and the engine applies one whenever
it resolves a boundary's body. Because the *adapted* body is what gets
fingerprinted — and is what the adapter POSTs — the frontend hash matches the
backend's `canonical_fingerprint` and the cache key lines up across the seam.

### Cross-runtime contract

Three runtimes evaluate the same brewing model, so their shared numeric and wire
contracts are pinned by fixtures rather than by convention:

| Runtime | Location | Role |
|---|---|---|
| Artifact | `data/artifact.json` | canonical constants, functions, dimensions, boundary inputs |
| JS solver | `frontend/src/engine/` + `adapters/boundaryRequest.js` | live evaluation, fingerprinting, request mapping |
| Python solver | `backend/app/core/` + `schemas/boundary.py` | boundary implementations, Pydantic wire models |

Shared values and the single test surface that pins each:

| Contract | Artifact source | JS consumer | Python consumer | Pinning test |
|---|---|---|---|---|
| Sucrose gravity points, extract volume/absorption, shrinkage | `sucrose_yield_ldk`, `v_bar`, `k_abs_true`, `rho_water`, `default_shrinkage_fraction` | engine functions | `batch_solver` constants | `tests/backend/conformance/test_artifact_constants.py` |
| Water equivalents, calcium floor, mash-pH window and default | `bicarbonate_eq_weight`, `default_calcium_floor_ppm`, `mash_ph_optimal_low/high`, `default_target_mash_ph` | engine functions | `core/water.py`, `WaterSolverRequest` | `tests/backend/conformance/test_artifact_constants.py` |
| ASBC Plato↔SG, Cutaia ABV, maximum achievable ABV, Phase 1 SG-from-ABV | `plato_to_sg`, `sg_to_plato`, `realized_abv` | engine functions | `core/utils.py`, `batch_solver` | `tests/conformance/numeric-parity.test.js` + `tests/backend/conformance/test_numeric_parity.py` on `tests/conformance/fixtures/numeric-parity.json` |
| Canonical JSON + SHA-256 fingerprint | n/a | `engine/boundary.js` | `schemas/boundary.py` | `tests/frontend/boundary.test.js` + `tests/backend/test_fingerprint.py` on `tests/conformance/fixtures/canonical-json.json` |
| Boundary wire keys | node `inputs` aliases | declarative `BATCH_FIELDS` / `WATER_FIELDS` | Pydantic model fields | `tests/guards/boundary-inputs.test.js` + `tests/backend/conformance/test_boundary_wire_contract.py` on `tests/conformance/fixtures/boundary-wire-keys.json` |

The JS `realized_abv` function defines the Cutaia model in the SG domain; the
Python `cutaia_abv` defines it in the Plato domain. Parity is asserted through
the shared fixture, which stores SG inputs so both runtimes exercise the same
path. The Phase 1 inverse (`solve_sg_post_boil_from_abv`) is backend-only; the
JS side pins it by checking that `realized_abv(sg, aa)` recovers the fixture's
target ABV.

Editing a boundary input requires updating the artifact declaration and the
corresponding declarative field map; both suites then fail until the wire-keys
fixture and Pydantic model agree. Editing a shared constant or formula fails the
constant or numeric-parity test on the untouched side.

## Host-side rules

Not every rule belongs in the artifact. Hamilton normalization, Tinseth hop
back-calculation, style conformance, seed-derived copy-in, fermentation geometry,
and presentation overrides are host-side by design. `docs/adding-a-node.md`
§"Artifact-owned vs host-side rules" lists the owner and location of each;
`tests/guards/presentation-ids.test.js` keeps card modules and the producer free
of literal node ids.

## Copy-forward flows

Where a selected component's value seeds an **editable** value, the selection's
constraints apply to that value. These flows are deliberate and few; envelopes
(relations/domains) and clamps are authored per flow:

| Editable value | Source | Mechanism | Re-sync semantics |
|---|---|---|---|
| `batch.hlt_starting_volume_l` | `equipment.max_hlt_volume_l` | root `default` `{ref}` | default while unset; clamped to the equipment envelope on edit |
| `batch.apparent_attenuation` | `batch.yeast.attenuation_pct` | auto-copy on selection | overwritten on each strain pick; clamped to the strain envelope |
| `batch.house_attenuation_factor` | — | per-batch root | multiplies the planned attenuation into `batch.effective_apparent_attenuation`; starts at 1.0 |

`batch.effective_apparent_attenuation` is the product of the planned root and
the house factor. The solver and the realized FG/ABV nodes consume the effective
value; the planned value stays visible as the target. Conversion efficiency is a
separate gravity correction, not an attenuation correction.

Water source ions are **read-only selection readouts** (the boundary reads them
straight from `water.source_report`). Water target ions and the calcium floor are
**editable roots** (`water.target.*`), seeded from the
selected `water.target_profile` on copy-in, along with the template's `mode`
(`water.strategy`). The assumed dosing practice is documented in
`docs/calculator-assumed-dosing-practice.md`.

Selection-scoped invariants are expressed as `relations` referencing selection
fields, guarded with `if(ref != "", …)` (short-circuit). Per-field schema
`domain`s of a selected component are surfaced by `fieldDomainStates()`. The
adapter attributes both to the card that owns the field/selection.

## Determinism

Given the roots, every value is a pure function of its declared ancestors; the
two boundaries are idempotent (same inputs → same outputs). Because evaluation is
lazy and memoized, **arrival order never changes values** — only *freshness*
(whether a value is current). The anti-drift guards under `tests/guards/` enforce
the invariants this relies on (no reactivity, roots-only store, display-only
units, deterministic projection).
