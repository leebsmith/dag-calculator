# Adding an input or derived value

The most common change to the artifact: add a new **input** (a `root`, `choice`,
`collection`, or `selection`) or a new **derived value**. This is the artifact-side
wiring only — the *view* (step manifest, presentation registry, producer) is a
separate, later step and is deliberately out of scope here.

> Reference while you work: `grammar.md` §2 (node shapes), `expression-language.md`
> (the `expr` AST), `dimensions.md` (dimensions/units), `docs/engine.md` (how the
> value is consumed).

## 0. Decide the kind

| You want to add… | kind | key shape |
|---|---|---|
| a scalar input | `root` | `dimension`, `default` |
| a categorical input | `choice` | `taxonomy`, `default` |
| a list input | `collection` | `item_schema` |
| a reference + override | `selection` | `output.schema`, `ref` |
| a computed value | `derived` | `inputs`, `expr`, `output` |

(`boundary` is heavier — it needs a host-registered solver — and is not covered
here.)

**Identity is not a node.** Equipment, water source, and style are supplied as
immutable component snapshots (see `artifact.identity`) and addressed through their
namespaces; do not add `*_id` roots or selections for them. A new immutable context
component is a new `identity` namespace, not a node.

**Prefer a `default` over a host copy.** If a root should take its value from a
selection (a profile field, a style envelope), declare a `default` that reads
that field — the root inherits while unset and becomes an override once set. Do
not add an entry to `views/seedDerivations.js`; that table is reserved for
derivations the expression language cannot express (centroid geometry, tag
sets).

## 1. Add supporting declarations first (only if new)

If the new node needs a dimension, taxonomy, function, constant, or schema that
doesn't exist yet, add it to its section of `data/artifact.json`:

```jsonc
// constants:  { "id": { "value": …, "dimension": … } }
"default_whirlpool_time_min": { "value": 0, "dimension": "time" },

// taxonomies: { "id": [ "value", … ] }
"hop_unit": [ "oz", "g", "ml" ],

// functions:  { "id": { "params": […], "returns": …, "body": {…} } }
// dimensions: { "id": { "base_unit": …, "kind": …, "units": {…} } }
// primitive_schemas: { "id": { "field": { "dimension"|"taxonomy"|"type" … } } }
```

## 2. Add the node

Append to `nodes`.

**Scalar input (`root`)**
```jsonc
"batch.whirlpool_time_min": {
  "kind": "root",
  "dimension": "time",
  "default": { "const": "default_whirlpool_time_min" },
  "domain": { "gte": 0 }
}
```

**Categorical input (`choice`)**
```jsonc
"batch.whirlpool_added": {
  "kind": "choice",
  "taxonomy": "ph_status",          // or a new taxonomy you added above
  "default": "OPTIMAL"
}
```

**List input (`collection`)** — needs an `item_schema` in `primitive_schemas`:
```jsonc
"batch.dry_hops": { "kind": "collection", "item_schema": "dry_hop_row" }
```

**Computed row field (collection `fields`)** — a derived value scoped to one row,
declared beside `item_schema` (never inside it):
```jsonc
"grist.major_malts": {
  "kind": "collection",
  "item_schema": "grist_row",
  "fields": {
    "mass_kg": {
      "inputs": { "m_grist": "solver.batch.m_grist" },
      "expr": { "op": "*", "args": [ { "ref": "row.pct" }, { "ref": "m_grist" } ] },
      "output": { "dimension": "mass" }
    }
  }
}
```
- `inputs` — alias → dotted path; every path must resolve (same rule as a
  `derived` node). They are **read-side** edges: they invalidate the collection,
  never order it, and they resolve against authored rows.
- `row.<field>` reads an authored `item_schema` field. The alias is reserved, a
  computed field may not shadow an authored field, and one computed field may not
  read another.
- `output` — exactly one of `{ dimension }`, `{ taxonomy }`, `{ type: "boolean" }`,
  and it must match what the expression infers.
- The value is materialized when the engine reads the collection. No host code
  writes it into collection state, and no request/freeze path needs to (the row
  copy it receives already carries it).

**Derived value**
```jsonc
"batch.total_boil_time_min": {
  "kind": "derived",
  "inputs": {
    "boil":      "batch.boil_time_min",
    "whirlpool": "batch.whirlpool_time_min"
  },
  "expr": { "op": "+", "args": [ { "ref": "boil" }, { "ref": "whirlpool" } ] },
  "output": { "dimension": "time" }
}
```

## 3. Derived specifics

- **`inputs`** — `alias → dotted path`; every path must resolve to a declared node
  or a selection/boundary field.
- **`expr`** — an AST (`ref` / `const` / `call` / operators / reductions). See
  `expression-language.md`.
- **`output`** — exactly **one** of `{ dimension }`, `{ taxonomy }`, or
  `{ type: "boolean" }`, and it must match what the expression infers
  (`validateDerivedDimensions` checks this). A collection `fields` entry follows
  the same rule, with the `row` alias bound to the element
  (`validateCollectionFields` checks it).

## 4. Validate

Building the engine runs `loadArtifact`, which throws on structural problems:
dangling `inputs`/`ref`, unknown `dimension`/`taxonomy`/`schema`/`function`/`const`
ids, a `choice` default outside its taxonomy, or a dimension-inference mismatch.

```js
import { createCalculator } from "./frontend/src/engine/index.js"; // from frontend/
createCalculator(artifact); // throws if the artifact is invalid
```

The quickest real check is `make test` — it builds the engine in many places.

## 5. Re-sync the generated artifacts

`docs/dag-artifacts/inventory.md`, `docs/report-bundle-glossary.md`,
`data/sources/manifest.json`, the seed catalogs, and the report bundle fixture
are generated from the artifact and the sources, and all are guarded. After any
artifact, source, or registry change:

```bash
make generate
```

`make test`'s `artifact-docs-sync`, `glossary-sync`, `sources-manifest`, and
`seed-rebuild` guards fail if you skip this.

## 6. Test it

Add an engine test asserting the new value (e.g. `tests/frontend/engine.test.js`,
using `makeFixtures()` from `tests/frontend/helpers.js`). For a `derived` node,
assert the numeric result; for an input, assert `get`/`setRoot` behavior and the
default. If it mirrors known-good legacy math, add a conformance case too.

**Equipment fields** additionally need both profiles in `data/seeds/equipment.json`,
the metric/imperial pair in `frontend/src/store/equipmentIngest.js`
(`IMPERIAL_KEYS` / `IMPERIAL_UNIT`), and the shared
`tests/conformance/fixtures/equipment-imperial-map.json`. The equipment contract
guard fails if those diverge or a profile omits the field.

## Checklist

- [ ] Node + any supporting declaration added to `data/artifact.json`
- [ ] `createCalculator`/`make test` loads without validation errors
- [ ] `make generate` regenerated the inventory, glossary, manifest, seeds, and fixture
- [ ] an engine test asserts the new value
- [ ] `make check` + `make test` green

## Artifact-owned vs host-side rules

The artifact owns every value and domain rule the engine evaluates. A few
cross-cutting presentation/authoring rules are deliberately host-side — they
describe *how the UI authors or displays* a value, not what the value is:

| Rule | Owner | Where |
|---|---|---|
| Node ids, constants, formulas, dimensions, domains, boundary inputs | artifact | `data/artifact.json` |
| Hamilton normalization of authored `parts` into `pct`/`w_i` | host | `frontend/src/views/hamilton.js` |
| Late-addition sugar share: parts → share of the sugar budget → resolved mass | host allocation rule; the reported mass is the artifact field | `frontend/src/views/producer/sugarAllocation.js`; `batch.sugars.fields.resolved_mass_kg` in `data/artifact.json` |
| Tinseth hop mass and whirlpool cooling/IBU math | backend boundary | `backend/app/core/hop_solver.py` (`solver.hops`); JS copies in `views/hops.js` / `views/whirlpool.js` are the offline stub only |
| Style-conformance judgement and badges | host | `frontend/src/engine/styleConformance.js`, `views/producer/conformance.js` |
| Residual seed-derived copy-in (only values the AST cannot express) | host | `frontend/src/views/seedDerivations.js` |
| Fermentation geometry (styles' OE/AE feasible regions) | host geometry; ASBC/Cutaia primitives call artifact functions | `frontend/src/engine/fermentation.js`, `engine/artifactFunctions.js` |
| Mash ordering, schedule validation, and preset application | host | `frontend/src/views/mash.js`, `adapters/cards/mash.js` |
| Scale-pin targets/previews (ABV/OG/FG) | host | `frontend/src/adapters/cards/{style,late-additions}.js`, `docs/attenuation-model.md` §6.1 |
| Water readout deltas and ratio formatting | host | `frontend/src/adapters/cards/water.js`, `views/waterRatio.js` |
| Presentation overrides (polymorphic labels, hints, clamp envelopes) | host | `frontend/src/views/registry/presentation.js` |
| Card node-id references | host registry | `frontend/src/views/registry/*.js` |

Artifact-owned rules are pinned by artifact tests and the cross-runtime fixtures
(`docs/engine.md` §"Cross-runtime contract"). Host-side rules are intentionally
not expressible in the artifact; `tests/guards/presentation-ids.test.js` keeps
literal node ids out of card modules and the producer so the registry remains
the single presentation home.

## Out of scope (the view)

Surfacing the node in the UI — adding it to a step's `fields` in
`frontend/src/views/steps.js` and a label/control in
`frontend/src/views/registry/` — is a separate step; the engine neither needs nor
knows about it.
