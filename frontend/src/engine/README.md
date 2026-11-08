# Engine

The reference interpreter for `data/artifact.json` — a set of **data structures**
(graph, memo, input state, boundary cache) plus a **Jexl expression runtime**.
Synchronous, pure, DOM-free.

Full description: [`docs/engine.md`](../../docs/engine.md).

## Modules

- `dag.js` — runtime: graph build, evaluation dispatch, memo, invalidation
- `expression.js` — Jexl runtime: compile cache, lazy reference context, transforms, function registry
- `paths.js` — dotted-path resolution
- `units.js` — dimension system + inference
- `domains.js` — Jexl domain strings over `$value`
- `relations.js` — relation predicates
- `boundary.js` — fingerprint + `BoundaryCache`
- `validate.js` — structural and compiled-AST validation
- `artifactFunctions.js` — host access to artifact constants and functions
- `ingredientPriors.js` — ingredient prior resolution on ingest
- `fermentation.js` — fermentation geometry
- `styleConformance.js` — style conformance judgement
- `sha256.js` — hashing

Public entry point: `createCalculator` / `loadArtifact` in `index.js`.
