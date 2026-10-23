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
| value type | `dimension` / `taxonomy` / `output.{dimension|taxonomy|boolean|schema}` / `item_schema` | normalized by `valueSpecOf(artifact, id)`; `nodeDimension` returns the scalar dimension/taxonomy only. Identity fields take their type from `artifact.identity[namespace]` → schema |
| bounds | `domain` | unary ops (`gte/lte/gt/lt/eq/ne`), values may be `{ref}`/`{const}` |
| default | `default` | root/choice only; evaluated when unset |
| collection | `item_schema` | ⇒ `primitive_schemas[item_schema]` (per-field spec) |
| selection | `output.schema`, `ref` | component type + the root holding the chosen id |
| derived | `inputs`, `expr`, `output` | alias→path edges, AST, output type |
| boundary | `binding`, `resolution`, `inputs`, `outputs`, `domain.codes` | contract only (§2.5, `grammar.md`) |
| namespace | `id.split(".")[0]` | graph slices: `mash` · `water` · `grist` · `batch` · `solver`; identity namespaces: `equipment`, `style`, `water.source` |

Referenced sections (look up by the ids found above): `dimensions`, `constants`,
`taxonomies`, `functions`, `primitive_schemas`.

Accessor: none — read `artifact.nodes[id]` directly.

---

## 3. Dynamic valuation (engine)

| Accessor | Returns |
|---|---|
| `engine.get(id)` | the memoized, lazy value — by kind: scalar (root/choice/derived), `rows[]` (collection), the selected component or `null` (selection), `{ outputs, fingerprint }` (boundary). A valueless node returns `undefined`. |
| `engine.resolve(path)` | a value by **dotted path** — node id, or a boundary output / selection field / collection field, **or an identity namespace field** (`equipment.mash_tun_mass_kg`, `style.og_min`, `water.source.calcium_ca`) |
| `engine.identity` | the immutable identity snapshot passed at construction: `{ equipment, "water.source", style }`; values are components, not ids |
| `engine.getRoot(id)` / `engine.hasRoot(id)` | the **explicitly-set** store value for a root/choice (distinct from the evaluated value, which folds in `default`); identity values are never roots |
| `engine.setRoot(id, v)` / `engine.unsetRoot(id)` | write / drop an explicit root or choice value; unsetting restores the `default` (or leaves the node valueless) |
| `engine.setCollection(id, rows)` | write a collection |
| `engine.boundaryRequest(id)` | `{ binding, inputs, fingerprint }` — the boundary node's adapted request body |
| `engine.hasBoundaryResult(fp)` / `engine.applyBoundaryResult(fp, outputs)` | boundary-cache seam |

`get` vs `resolve`: `get` rejects dotted paths (`Unknown node`); use `resolve`
for sub-fields.

---

## 4. Validation / domain state

| Accessor | Scope |
|---|---|
| `checkDomain(artifact, id, value, resolveRef)` | one node → `{ nodeId, bounded, holds, reason?, op?, limit? }`; `holds: null` + `reason: "unresolved"` means the node has no value (not a violation) |
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
`{ source_template_id }` (which component was chosen). Provenance only — the
batch's copied selection snapshot is the frozen value, and there is no drift
detection. See `semantics.md` §3.2.

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
- **Evaluated vs stored**: `engine.get(id)` folds in `default`; `hasRoot(id)` is
  the provenance signal — `false` means the value is inherited, `true` means the
  user (or host) set it and it will not follow later component changes.
- **Absence**: `undefined` in the engine, `null` in payloads. An unset selection
  is `null`; a dotted read into it is `undefined`. Never treat `0` or `{}` as
  "not set".
- **Identity is not a node**: `engine.get("style")` throws; use `resolve` for
  identity fields, and read the component itself from `engine.identity`.
- **Water targets are gated, not clamped**: a pinned target below its source is
  sent nowhere — `adapters/waterGate.js` blocks the request (salts only add). The
  rule is deliberately at the seam, not a domain bound, because unpinned ions may
  legitimately sit below source.
