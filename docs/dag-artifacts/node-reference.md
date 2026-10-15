# Node Reference — Identity and Discovery

A node **id** (a key in `artifact.nodes`) is the address of a DAG node. This is a
tight reference of everything resolvable from one id and the accessor for each.
It complements `grammar.md` (node *shape*) and `docs/engine.md` (runtime *API*).

---

## 1. Identity

- An id is the **key** in `artifact.nodes`; the node record itself carries no
  `id`. Identity lives in the container, not on the value — given the node value
  alone you cannot recover its id.
- It is **intrinsic** (authored in the artifact, stable across sessions and
  serialization), not ephemeral.
- Contrast the other id concepts:
  - **seed components** (`equipment`, `malts`, …) embed an identity field (`id`,
    or `report_id`) *and* live under the same key; the seed-conformance test
    asserts `component[idField] === key`.
  - **collection rows** have no id — identity is **positional** (array index).
    Their `catalog_id`/`sugar_id`/`rest_id` are foreign keys, not row identity.
  - **reference roots** (`batch.equipment_profile_id`, `batch.yeast_id`) hold a
    component id string — a foreign key resolved via `references[schema][value]`.
- Namespacing and dotted-path resolution: see `grammar.md` §1.1.

---

## 2. Static definition (`artifact.nodes[id]`)

| Facet | Field | Notes |
|---|---|---|
| kind | `kind` | `root` · `choice` · `collection` · `selection` · `derived` · `boundary` |
| value type | `dimension` / `taxonomy` / `output.{dimension|taxonomy|boolean}` | normalized by `nodeDimension(artifact, id)` |
| bounds | `domain` | unary ops (`gte/lte/gt/lt/eq/ne`), values may be `{ref}`/`{const}` |
| default | `default` | root/choice only; evaluated when unset |
| collection | `item_schema` | ⇒ `primitive_schemas[item_schema]` (per-field spec) |
| selection | `schema`, `ref` | component schema + the root holding the chosen id |
| derived | `inputs`, `expr`, `output` | alias→path edges, AST, output type |
| boundary | `binding`, `resolution`, `inputs`, `outputs`, `domain.codes` | contract only (§2.5, `grammar.md`) |
| namespace | `id.split(".")[0]` | `equipment` · `mash` · `water` · `grist` · `batch` · `solver` |

Referenced sections (look up by the ids found above): `dimensions`, `constants`,
`taxonomies`, `functions`, `primitive_schemas`.

Accessor: none — read `artifact.nodes[id]` directly.

---

## 3. Dynamic valuation (engine)

| Accessor | Returns |
|---|---|
| `engine.get(id)` | the memoized, lazy value — by kind: scalar (root/choice/derived), `rows[]` (collection), component or `{}`/`null` (selection), `{ outputs, fingerprint }` (boundary) |
| `engine.resolve(path)` | a value by **dotted path** — node id, or a boundary output / selection field / collection field (longest-prefix via `resolveReference`) |
| `engine.getRoot(id)` / `engine.hasRoot(id)` | the **explicitly-set** store value for a root/choice (distinct from the evaluated value, which folds in `default`) |
| `engine.setRoot(id, v)` / `engine.setCollection(id, rows)` | writes (roots/choices/collections only) |
| `engine.boundaryRequest(id)` | `{ binding, inputs, fingerprint }` — the boundary node's adapted request body |
| `engine.hasBoundaryResult(fp)` / `engine.applyBoundaryResult(fp, outputs)` | boundary-cache seam |

`get` vs `resolve`: `get` rejects dotted paths (`Unknown node`); use `resolve`
for sub-fields.

---

## 4. Validation / domain state

| Accessor | Scope |
|---|---|
| `checkDomain(artifact, id, value, resolveRef)` | one node → `{ nodeId, bounded, holds, reason?, op?, limit? }` |
| `engine.domainStates()` | every bounded root/choice |
| `engine.fieldDomainStates()` | fields of selected components → `{ selectionNodeId, field, … }` |
| `engine.collectionDomainStates()` | collection item fields → `{ nodeId, index, field, … }` |

All report-only (never throw).

---

## 5. Graph topology (`buildGraph`)

| Accessor | Meaning |
|---|---|
| `engine.adjacency[id]` | upstream node ids this node depends on (from `inputs` / `ref` / `{ref}` in `default`) |
| `engine.dependents[id]` | downstream node ids that consume it |
| `engine.topoOrder` | deterministic order of all node ids |

---

## 6. Reverse references

To find what points at an id, scan the artifact for it in: `default` expressions,
`derived`/`boundary` `inputs`, and selection `ref`s. Also:

- which **dotted paths** resolve to it (`resolveReference(artifact, path)` →
  `{ nodeId, suffix }`);
- which **relations** cite it in a predicate (`engine.relationStates()` →
  `[{ id, holds }]`).

---

## 7. Provenance (freeze)

For a `selection` id, `freezePayload().provenance[id]` →
`{ source_template_id, source_revision }` (a content hash of the referenced seed
component). Used by `detectDrift`. See `semantics.md` §3.2.

---

## 8. Presentation (view layer — not the engine)

| Concern | Where |
|---|---|
| which step/card displays it | `fieldSlice` / `selectionSlice` (`adapters/stepAdapter.js`) |
| label / unit / pin / hint / control | `registry[id]` (`views/registry/*.js`) |
| unit menu, symbol, per-unit precision | `UNIT_DIMENSIONS`, `UNIT_SYMBOLS`, `unitDecimals` (`views/registry/units.js`) |
| editable vs readout | `rendererFor` / `defaultControl` (`views/renderers.js`, `views/producer.js`) |

---

## 9. Gotchas

- A **boundary** id yields `{ outputs, fingerprint }`, not a scalar — use the
  dotted output path (`engine.resolve`) for one output.
- Reads can **throw**: an unresolved boundary (HTTP mode) or an unknown/unset
  reference. The step adapter guards with a `safe(fn)` try/catch in `compute()`.
- **Evaluated vs stored**: `engine.get(id)` folds in `default`; `getRoot(id)` is
  only what the user explicitly set (roots/choices).
