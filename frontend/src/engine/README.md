# Engine

The reference interpreter for `data/artifact.json` — a set of **data structures**
(graph, memo, input state, boundary cache) plus an **interpreter** (AST +
per-kind dispatch). Synchronous, pure, DOM-free.

Full description: [`docs/engine.md`](../../docs/engine.md).

## Modules

- `dag.js` — runtime: graph build, evaluation dispatch, memo, invalidation
- `ast.js` — expression interpreter
- `paths.js` — dotted-path resolution
- `units.js` — dimension system + inference
- `domains.js` — domain bounds
- `relations.js` — relation predicates
- `boundary.js` — fingerprint + `BoundaryCache`
- `validate.js` — artifact validation
- `sha256.js` — hashing

Public entry point: `createCalculator` / `loadArtifact` in `index.js`.
