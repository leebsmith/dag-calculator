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
| a reference + override | `selection` | `schema`, `ref` |
| a computed value | `derived` | `inputs`, `expr`, `output` |

(`boundary` is heavier — it needs a host-registered solver — and is not covered
here.)

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
  (`validateDerivedDimensions` checks this).

## 4. Validate

Building the engine runs `loadArtifact`, which throws on structural problems:
dangling `inputs`/`ref`, unknown `dimension`/`taxonomy`/`schema`/`function`/`const`
ids, a `choice` default outside its taxonomy, or a dimension-inference mismatch.

```js
import { createCalculator } from "./frontend/src/engine/index.js"; // from frontend/
createCalculator(artifact); // throws if the artifact is invalid
```

The quickest real check is `make test` — it builds the engine in many places.

## 5. Re-sync the inventory

`docs/dag-artifacts/inventory.md` is generated from the artifact and guarded. After
any artifact change:

```bash
node scripts/emit-artifact-inventory.mjs
```

`make test`'s `artifact-docs-sync` guard fails if you skip this.

## 6. Test it

Add an engine test asserting the new value (e.g. `tests/frontend/engine.test.js`,
using `makeFixtures()` from `tests/frontend/helpers.js`). For a `derived` node,
assert the numeric result; for an input, assert `get`/`setRoot` behavior and the
default. If it mirrors known-good legacy math, add a conformance case too.

## Checklist

- [ ] Node + any supporting declaration added to `data/artifact.json`
- [ ] `createCalculator`/`make test` loads without validation errors
- [ ] `node scripts/emit-artifact-inventory.mjs` regenerated `inventory.md`
- [ ] an engine test asserts the new value
- [ ] `make check` + `make test` green

## Out of scope (the view)

Surfacing the node in the UI — adding it to a step's `fields` in
`frontend/src/views/steps.js` and a label/control in
`frontend/src/views/registry/` — is a separate step; the engine neither needs nor
knows about it.
