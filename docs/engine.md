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
   refs, choice defaults, output shapes), `validateRootDefaults` (dimension
   inference on non-literal root defaults), and `validateDerivedDimensions`
   (dimension inference on every `derived` node). It throws on any violation.
2. **Build the graph** — `buildGraph` derives `adjacency` (node → its declared
   dependencies) and `dependents` (node → its consumers) from `inputs`/`ref`
   only, then `topologicalSort` produces `topoOrder`.
3. **Evaluate lazily** — `get(nodeId)` evaluates a node once and **memoizes** it;
   descendants are pulled on demand, not eagerly.
4. **Invalidate on change** — `setRoot`/`setCollection` drop the
   changed node and *its dependents* from the memo, so the next `get` re-derives.

Both cold-start steps are **memoized on artifact identity**: `loadArtifact`
validates a given artifact object once per process (a `WeakSet`), and `buildGraph`
returns the same graph object for it (a `WeakMap`). A clone is a different object,
so it validates and builds again. Every session reset and every sign-in therefore
reuses the validated artifact's graph instead of paying for it twice.

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
  root/choice `default` (a default is evaluated lazily when the node is unset, so
  its refs are real dependencies, not hidden ones). A collection's computed
  `fields` add **no** adjacency edges: they are read-side overlays.
- **`dependents`** — the reverse: `nodeId → [consumerNodeIds]`, including the
  collections whose computed fields read the node.
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
  only for legacy drafts whose selection snapshot is missing. A library sync
  replaces the whole map (`setReferences`) rather than editing it in place; see
  *Invalidation*.

Only roots/choices/collections are mutable; derived values and boundary
outputs are **never stored** (single-writer invariant, `semantics.md` §2.1).
`batch.brew_checklist` is an authoring-only collection: it carries the printed
recipe's checklist rows (step id, note, skip state) and no derived math depends
on it.

**Ingredient rows are resolved on ingest.** A collection whose item schema
declares `yield_fraction` or `fermentability_fraction` is passed through
`resolveIngredientRows` when it enters evaluation (`createCalculator`,
`setCollection`): a captured figure keeps its provenance, and a missing one
takes the artifact's category prior and is stamped `kind: "prior"`. The engine
mutates the caller's collection object, so the session's draft state — and
therefore autosave, freeze, and the report bundle — sees the same resolved
rows. This is an artifact rule, not a UI one: direct engine callers get it too.

### Caches

- **`memo`** — `nodeId → value` for derived/selection/boundary nodes, so a node
  evaluates at most once per root-set.
- **`BoundaryCache`** — `fingerprint → { outputs, fingerprint }`, keyed by the
  canonical fingerprint of the boundary's inputs.

## The interpreter

### `evaluateNode(nodeId)` — dispatch

```text
root/choice   → roots.get(nodeId) ?? evaluate(node.default)
collection    → collections[nodeId] ?? []   (+ computed `fields`, per row)
selection     → selections[nodeId] ?? reference component (empty ref → {})
derived       → evaluate(node.expr, ctx(  resolve node.inputs  ))
boundary      → request body → fingerprint → cache hit | boundaries[binding](body)
```

A collection's computed `fields` (grammar §2.2) are evaluated per row into a
**copy** of that row: the draft's collection state keeps only the authored
`item_schema` fields, and `row.<field>` in a field expression reads that authored
row. Like a derived node, a field resolves its declared `inputs` once per row, so
the collection is memoized under its own node id and invalidated through the same
dependency edges.

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

`setReferences(map)` is the catalogue counterpart: the caller hands over a
brand-new `references` object (the store never mutates the old one), and the
engine re-resolves the ingredient priors on every collection and clears both
valuations. Batch rows keep their captured figures; only the legacy selection
fallback reads the new map, so no selection can serve a component from the
previous catalogue.

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
engine.relationStates()   // [{ id, holds, blocking }]  (holds:null = no verdict)
engine.domainStates()     // [{ nodeId, holds, … }]  (root/choice nodes; holds:null = unresolved)
engine.fieldDomainStates()      // [{ selectionNodeId, field, holds, … }]
engine.collectionDomainStates() // [{ nodeId, index, field, holds, … }]

engine.identity          // { equipment, "water.source", style } snapshots
engine.setRoot(id, v)  unsetRoot(id)  getRoot(id)  hasRoot(id)
engine.setCollection(id, rows)  setReferences(map)

engine.topoOrder  adjacency  dependents
```

> `relationStates()` carries the artifact's `blocking` flag. The view maps it to
> its `warning` / `error` severity and composes the message in
> `views/registry/findings.js`; the engine never owns wording. A violated
> blocking relation refuses a freeze (client and server); a violated
> non-blocking relation is a quality/policy warning. `holds` is three-state:
> `null` means an operand was unrealized (a boundary that did not solve), so the
> predicate has no verdict and the finding is withheld until a solve lands. Only
> `holds === false` is a violation.

> For a catalog of everything resolvable from a single node id (by accessor),
> see "Resolving from a node id" below.

### The boundary seam

The engine is synchronous and pure, but boundary *realizations* may be remote.
A boundary has exactly one host, server-side: the frontend consumes the outputs
the artifact declares and never recomputes them. The adapter pre-resolves them:
`boundaryRequest(id)` returns `{ binding, inputs,
fingerprint }`; the adapter performs the I/O and calls
`applyBoundaryResult(fingerprint, outputs)` to seed the cache. After that,
evaluation hits the cache synchronously. `hasBoundaryResult(fingerprint)` checks
whether a solve is already available.

A solve that leaves a node unresolved is a modeled state, not a wiring error:
the adapter calls `markBoundaryUnavailable(id)` for every node the solve did not
realize (failed, blocked, or never reached), so reads — and the derived values
above them — degrade to `undefined` and the cards render placeholders underneath
the surfaced `boundaryError`/status. A boundary that is *neither* marked nor
pre-resolved still throws `No boundary binding registered…`, which is what keeps
a premature compute visible to the error observability counters.
`clearBoundaryUnavailable()` runs at the start of the next solve and restores the
strict invariant.

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
| Water equivalents, calcium floor, mash-pH window and default | `bicarbonate_eq_weight`, `default_calcium_floor_ppm`, `mash_ph_optimal_low/high`, `default_target_mash_ph` | engine functions | `core/water/constants.py`, `WaterSolverRequest` | `tests/backend/conformance/test_artifact_constants.py` |
| ASBC Plato↔SG, Cutaia ABV, maximum achievable ABV, Phase 1 SG-from-ABV | `plato_to_sg`, `sg_to_plato`, `realized_abv` | engine functions | `core/utils.py`, `batch_solver` | `tests/conformance/numeric-parity.test.js` + `tests/backend/conformance/test_numeric_parity.py` on `tests/conformance/fixtures/numeric-parity.json` |
| Canonical JSON + SHA-256 fingerprint | n/a | `engine/boundary.js` | `schemas/boundary.py` | `tests/frontend/boundary.test.js` + `tests/backend/test_fingerprint.py` on `tests/conformance/fixtures/canonical-json.json` |
| Boundary wire keys | node `inputs` aliases | declarative `BATCH_FIELDS` / `WATER_FIELDS` / `HOP_FIELDS` | Pydantic model fields | `tests/guards/boundary-inputs.test.js` + `tests/backend/conformance/test_boundary_wire_contract.py` on `tests/conformance/fixtures/boundary-wire-keys.json` |

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

Not every rule belongs in the artifact. Hamilton normalization, style
conformance, seed-derived copy-in, fermentation geometry, mash ordering and
validation, and presentation overrides are host-side
by design. The retired Belgian-knob advisory is no longer part of the card; the
scale-pin targets and previews are the replacement. Hop bitterness math is a sealed
backend boundary (`solver.hops`), including the whirlpool cooling timeline it
returns as `whirlpool_timeline`; the frontend renders the served curve and holds no
copy of the equations. `docs/adding-a-node.md` §"Artifact-owned vs host-side rules" lists the
owner and location of each; `tests/guards/presentation-ids.test.js` keeps card
modules and the producer free of literal node ids.

## Copy-forward flows

Where a selected component's value seeds an **editable** value, the selection's
constraints apply to that value. These flows are deliberate and few; envelopes
(relations/domains) and clamps are authored per flow:

| Editable value | Source | Mechanism | Re-sync semantics |
|---|---|---|---|
| `batch.target_abv` | `style.abv_min` / `style.abv_max` | Style-step number input | seeded to the band midpoint; clamped to the fixed-AA ray interval; Batch step read-only |
| `batch.hlt_starting_volume_l` | `equipment.max_hlt_volume_l` | root `default` `{ref}` | default while unset; clamped to the equipment envelope on edit |
| `batch.attenuation_derate_points` | — | per-batch root | points subtracted from the published maximum; starts at 0 |

`batch.yeast_cap = max(0, batch.yeast.attenuation_cap_pct − batch.attenuation_derate_points)`.
The batch solver treats the grain-bill fermentability values as **real** shares
of extract, converts the apparent cap to real space at each candidate `OE`,
clamps the malt (late-addition sugar keeps `F = 1.0` and is never clamped),
forms the residual extract, and inverts the Cutaia regression for apparent
extract. It returns `apparent_attenuation` (the solved **apparent**
attenuation, which a sugar addition can push past the cap) and
`real_attenuation` (the solved **real** attenuation, RDF). The batch is unresolved until a yeast is selected.
Conversion efficiency remains a separate gravity correction, not an attenuation
correction. See `docs/attenuation-model.md` and
`docs/fermentability-and-yield.md`.

The Style step owns the **scale pin** (ABV/OG/FG) and its active target. The
target is free: the solver takes it and realizes the other two gravity/strength
axes from the composition. It is not clamped to the fixed-AA ray; the ray is a
drawing of the current realization and appears only in ABV mode. A new batch
seeds the target from the style midpoint, and the user's value is never
rewritten by a solve. Style conflicts are warnings. The Batch step shows the
active target as a read-only display of the same root. The Belgian knob is
retired (see `docs/attenuation-model.md` §6.1).

Water source ions are **read-only selection readouts** (the boundary reads them
straight from `water.source`). Water target ions and the calcium floor are
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

---

## Resolving from a node id

Merged from the retired `docs/dag-artifacts/node-reference.md`. A node **id** (a
key in `artifact.nodes`) is the address of a node; this section is everything
resolvable from one id and the accessor for each. It complements
`docs/dag-artifacts/grammar.md` (node *shape*) and the runtime API above.

A node **id** (a key in `artifact.nodes`) is the address of a DAG node. This is a
tight reference of everything resolvable from one id and the accessor for each.
It complements `grammar.md` (node *shape*) and `docs/engine.md` (runtime *API*).

---

### 1. Identity

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
  - **reference roots** (`water.target_profile_id`, `batch.yeast_id`) hold a
    component id string — a foreign key resolved via `references[schema][value]`.
- Namespacing and dotted-path resolution: see `grammar.md` §1.1.

---

### 2. Static definition (`artifact.nodes[id]`)

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

### 3. Dynamic valuation (engine)

| Accessor | Returns |
|---|---|
| `engine.get(id)` | the memoized, lazy value — by kind: scalar (root/choice/derived), `rows[]` (collection), the selected component or `null` (selection), `{ outputs, fingerprint }` (boundary). A valueless node returns `undefined`. |
| `engine.resolve(path)` | a value by **dotted path** — node id, or a boundary output / selection field / collection field, **or an identity namespace field** (`equipment.mash_tun_mass_kg`, `style.og_min`, `water.source.calcium_ca`) |
| `engine.identity` | the immutable identity snapshot passed at construction: `{ equipment, "water.source", style }`; values are components, not ids |
| `engine.getRoot(id)` / `engine.hasRoot(id)` | the **explicitly-set** store value for a root/choice (distinct from the evaluated value, which folds in `default`); identity values are never roots |
| `engine.setRoot(id, v)` / `engine.unsetRoot(id)` | write / drop an explicit root or choice value; unsetting restores the `default` (or leaves the node valueless) |
| `engine.setCollection(id, rows)` | write a collection |
| `engine.setReferences(map)` | replace the whole catalogue; re-resolves ingredient priors and clears the memo |
| `engine.boundaryRequest(id)` | `{ binding, inputs, fingerprint }` — the boundary node's adapted request body |
| `engine.hasBoundaryResult(fp)` / `engine.applyBoundaryResult(fp, outputs)` | boundary-cache seam |

`get` vs `resolve`: `get` rejects dotted paths (`Unknown node`); use `resolve`
for sub-fields.

---

### 4. Validation / domain state

| Accessor | Scope |
|---|---|
| `checkDomain(artifact, id, value, resolveRef)` | one node → `{ nodeId, bounded, holds, reason?, op?, limit? }`; `holds: null` + `reason: "unresolved"` means the node has no value (not a violation) |
| `engine.domainStates()` | every bounded root/choice |
| `engine.fieldDomainStates()` | fields of selected components → `{ selectionNodeId, field, … }` |
| `engine.collectionDomainStates()` | collection item fields → `{ nodeId, index, field, … }` |

All report-only (never throw).

---

### 5. Graph topology (`buildGraph`)

| Accessor | Meaning |
|---|---|
| `engine.adjacency[id]` | upstream node ids this node depends on (from `inputs` / `ref` / `{ref}` in `default`) |
| `engine.dependents[id]` | downstream node ids that consume it |
| `engine.topoOrder` | deterministic order of all node ids |

---

### 6. Reverse references

To find what points at an id, scan the artifact for it in: `default` expressions,
`derived`/`boundary` `inputs`, and selection `ref`s. Also:

- which **dotted paths** resolve to it (`resolveReference(artifact, path)` →
  `{ nodeId, suffix }`);
- which **relations** cite it in a predicate (`engine.relationStates()` →
  `[{ id, holds }]`).

---

### 7. Provenance (freeze)

For a `selection` id, `freezePayload().provenance[id]` →
`{ source_template_id }` (which component was chosen). Provenance only — the
batch's copied selection snapshot is the frozen value, and there is no drift
detection. See `semantics.md` §3.2.

---

### 8. Presentation (view layer — not the engine)

| Concern | Where |
|---|---|
| which step/card displays it | `fieldSlice` / `selectionSlice` (`adapters/stepAdapter.js`) |
| label / unit / pin / hint / control | `registry[id]` (`views/registry/*.js`) |
| unit menu, symbol, per-unit precision | `UNIT_DIMENSIONS`, `UNIT_SYMBOLS`, `unitDecimals` (`views/registry/units.js`) |
| editable vs readout | `rendererFor` / `defaultControl` (`views/renderers.js`, `views/producer.js`) |

---

### 9. Gotchas

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
