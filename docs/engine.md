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
| `domains.js` | unary domain-bound checks (nodes + selected-component fields) |
| `relations.js` | n-ary relation predicates |
| `boundary.js` | canonical fingerprinting + `BoundaryCache` |
| `validate.js` | structural validation of the artifact |
| `sha256.js` | hashing for fingerprints and seed provenance |

## Data structures

### The graph (`buildGraph`)

- **`adjacency`** — `nodeId → [dependencyNodeIds]`, built from each node's
  declared `inputs` (derived/boundary) and `ref` (selection). Collections, roots,
  and choices have no edges out.
- **`dependents`** — the reverse: `nodeId → [consumerNodeIds]`.
- **`topoOrder`** — a deterministic topological sort of all nodes.

These are what make the DAG **explicit**: no edge exists unless declared.

### Mutable input state

- **`roots`** — a `Map` of `root`/`choice` values (`nodeId → value`). Includes the
  `reference` roots that name selections. `setRoot` rejects non-root/choice nodes.
- **`collections`** — `collectionNodeId → rows[]`.
- **`references`** — the immutable seed catalogs, keyed by schema then id
  (`equipment`/`yeast`/`water_report`/`water_target`).

Only roots/choices/collections are mutable; derived values and boundary
outputs are **never stored** (single-writer invariant, `semantics.md` §2.1).

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
selection     → component (read-only view; empty ref → {})
derived       → evaluate(node.expr, ctx(  resolve node.inputs  ))
boundary      → resolve inputs → fingerprint → cache hit | boundaries[binding](inputs)
```

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
collection field or a boundary output (e.g. `solver.batch.cascade.v_strike`).

## Invalidation

`setRoot`/`setCollection` call `invalidate(nodeId)`, which deletes
the node from `memo` and recurses through `dependents`. The memo is the only
place values are cached, so there is nothing else to keep consistent.

## Public API

```js
engine.get(id)            // node value (memoized)
engine.resolve(path)      // dotted-path value
engine.call(fnId, args)   // invoke a function
engine.relationStates()   // [{ id, holds }]
engine.domainStates()     // [{ nodeId, holds, … }]  (root/choice nodes)
engine.fieldDomainStates() // [{ selectionNodeId, field, holds, … }]

engine.setRoot(id, v)  getRoot(id)  hasRoot(id)
engine.setCollection(id, rows)

engine.topoOrder  adjacency  dependents
```

### The boundary seam

The engine is synchronous and pure, but boundary *realizations* may be remote.
The adapter pre-resolves them: `boundaryRequest(id)` returns `{ binding, inputs,
fingerprint }`; the adapter performs the I/O and calls
`applyBoundaryResult(fingerprint, outputs)` to seed the cache. After that,
evaluation hits the cache synchronously. `hasBoundaryResult(fingerprint)` checks
whether a solve is already available.

## Determinism

Given the roots, every value is a pure function of its declared ancestors; the
two boundaries are idempotent (same inputs → same outputs). Because evaluation is
lazy and memoized, **arrival order never changes values** — only *freshness*
(whether a value is current). The anti-drift guards under `tests/guards/` enforce
the invariants this relies on (no reactivity, roots-only store, display-only
units, deterministic projection).
