# Grammar — The Artifact Language

This document is the formal grammar of `artifact.json`: its sections, node
kinds, edge kinds, and a JSON-Schema summary. Read it before the artifact.

---

## 1. Top-level sections

```
artifact.json
├─ schema_version      int — the grammar revision this file was written under
├─ meta                { name, description, status }
├─ dimensions          { id → dimension }
├─ constants           { id → { value, dimension } }
├─ taxonomies          { id → [value, ...] }
├─ functions           { id → { params, returns, body } }
├─ primitive_schemas   { id → schema }
├─ nodes               { id → node }
└─ relations           [ relation, ... ]
```

Only `schema_version`, `meta`, and `nodes` are required at a minimum; the other
sections may be empty. `relations` is an array; the rest are maps keyed by
string id.

### 1.1 Identifier conventions

Node ids are **dot-namespaced slugs** by slice: `equipment.*`, `mash.*`,
`water.*`, `grist.*`, `batch.*`, `solver.*`. Constant, function, taxonomy,
dimension, and schema ids are flat kebab/snake slugs.

A dotted path resolves by **longest-prefix match**: first try the whole path as a
node id; if that fails, resolve the longest prefix that *is* a node and treat the
remainder as (a) a field of a selection/collection, or (b) an output of a
boundary. For example, `solver.batch.mash_thickness_l_per_kg` is the
`mash_thickness_l_per_kg` output of the `solver.batch` boundary;
`equipment.mash_tun_specific_heat` is the `mash_tun_specific_heat` field of the
`equipment.profile` selection's schema.

---

## 2. Node kinds (five)

Every node has a `kind`. The legal set, and the shape each requires:

| Kind | Purpose | Required fields |
|---|---|---|
| `root` | user-set scalar input | `dimension`, `default` |
| `collection` | user-set list | `item_schema` |
| `selection` | reference to a component + overlay | `schema`, `ref` |
| `derived` | pure computed value | `inputs`, `expr`, `output` |
| `boundary` | sealed host-defined black box | `binding`, `resolution`, `inputs`, `outputs` |

### 2.1 `root`

```jsonc
"mash.grain_temp_c": {
  "kind": "root",
  "dimension": "temperature",
  "default": { "const": "default_grain_temp_c" },
  "domain": { "gte": 0 }
}
```

- `default` — an expression (see `expression-language.md`): `{const}` / `{ref}` /
  `{call}` / `{lit}`. Evaluated when the root is unset.
- `domain` — **unary bounds** on this node (see §4.1).

### 2.2 `collection`

```jsonc
"grist.major_malts": {
  "kind": "collection",
  "item_schema": "grist_row",
  "default": { "call": "default_major_malts", "args": [] }
}
```

- `item_schema` — a primitive-schema id defining each element's fields.
- Addressed via dotted sub-refs; reduced over by `map`/`filter`/`sum`/`weighted_avg`.

### 2.3 `selection`

```jsonc
"equipment.profile": {
  "kind": "selection",
  "schema": "equipment",
  "ref": "batch.equipment_profile_id",
  "overlay": { "mash_tun_mass_kg": 7.5 }
}
```

- `schema` — the component type this selection resolves to.
- `ref` — a root holding the component id (usually a dotted path to a `batch.*` root).
- `overlay` — a **sparse absolute-value delta**: only *overridden* fields appear;
  absent = inherit from the referenced component. Legal keys are those fields
  marked `overridable` in the schema; values inherit the field's `dimension`/`domain`.
- The effective value of a dotted sub-ref is `overlay[field] ?? component[field]`.

### 2.4 `derived`

```jsonc
"mash.strike_water_temp_base_c": {
  "kind": "derived",
  "inputs": {
    "t_target":  "mash.dough_in_target_temp_c",
    "t_grain":   "mash.grain_temp_c",
    "thickness": "solver.batch.mash_thickness_l_per_kg"
  },
  "expr": { "call": "calculate_strike_water_base_temp",
            "args": [ { "ref": "t_target" }, { "ref": "t_grain" }, { "ref": "thickness" } ] },
  "output": { "dimension": "temperature" }
}
```

- `inputs` — alias → node path (the **explicit edges**; aliases are the names the
  expression references).
- `expr` — an AST expression (see `expression-language.md`).
- `output` — one of `{ "dimension": id }`, `{ "taxonomy": id }`, or
  `{ "type": "boolean" }`. A taxonomy/boolean output is an **interpretation**
  (a categorical derived value), not a quantity.

### 2.5 `boundary`

```jsonc
"solver.batch": {
  "kind": "boundary",
  "binding": "batch_sparge_solver",
  "resolution": "iterative",
  "inputs":  { "target_abv": "batch.target_abv", "grain_bill": "grist.major_malts" },
  "outputs": { "mash_thickness_l_per_kg": { "dimension": "mash_thickness" },
               "v_strike":                { "dimension": "volume" } },
  "domain": { "codes": ["INVALID_TARGET_ABV", "HLT_TOO_SMALL", "…"] }
}
```

- `binding` — a **dedicated slug** naming the host-registered implementation
  (distinct from the node id). The engine maps this to native code.
- `resolution` — `iterative` (root-finding / linear program). The artifact
  declares *that* it iterates, never *how*.
- `inputs`/`outputs` — the declared contract (outputs are dimensioned).
- `domain` — the **feasibility/error surface**: the set of `code` values the
  boundary can raise (mirrors the implementation's `SolverValidationError` codes).
- A boundary is **opaque**: no `expr`, no body. Its interior is host code.

---

## 3. Edge kinds (three)

Edges are **not** a top-level section; they are declared *by* node definitions.
But they fall into three semantic kinds:

| Kind | Where declared | Meaning |
|---|---|---|
| **data** | a `derived`/`boundary` node's `inputs` | value → value dependency |
| **reference** | a `selection` node's `ref` | id → resolved component value |
| **relation** | the `relations` array | an n-ary domain invariant (edge carrying a predicate) |

The explicit adjacency graph is derived mechanically from `inputs`, `ref`, and
`relations` — never from read-tracking.

---

## 4. Domains and relations

### 4.1 Unary domain (per-node)

A node (usually `root`) may carry `domain` bounds. The bound references
constants where the bound is a known parameter (e.g. a yeast envelope):

```jsonc
"domain": { "gte": 0, "lte": { "const": "max_boil_off_rate" } }
```

Supported operators: `gt`, `gte`, `lt`, `lte`, `eq`, `ne`. Bounds may be
literals, `{const}`, or `{ref}`. These are *annotations* — they restrict the
valid inputs, they are not separate nodes.

### 4.2 Relation (n-ary invariant)

```jsonc
{ "id": "hlt_not_overfilled",
  "predicate": { "op": "le",
                 "lhs": { "ref": "batch.hlt_starting_volume_l" },
                 "rhs": { "ref": "equipment.max_hlt_volume_l" } } }
```

A relation is a predicate over two or more nodes that no single node owns. It is
a first-class invariant, evaluated by the engine and surfaced to the view.

---

## 5. JSON-Schema summary

The artifact is a JSON document. Its machine schema (used by the *validator*
tooling, not shipped as a deliverable) is, in essence:

- Top level: object with `schema_version` (integer), `meta` (object),
  `dimensions`, `constants`, `taxonomies`, `functions`, `primitive_schemas`,
  `nodes` (all objects), and `relations` (array).
- `nodes.*` must be one of the five kinds; each kind's required fields are in
  §2; unknown `kind` values are rejected.
- `derived.expr` and `functions.*.body` must be valid AST (see
  `expression-language.md`).
- `output` must be exactly one of `dimension`/`taxonomy`/`type:boolean`.
- Every `inputs`/`ref`/`{ref}` path must resolve to a declared node or a
  declared schema field; dangling references are a validation error.
- Every `dimension`/`taxonomy`/`schema`/`function`/`constant` id referenced
  anywhere must be declared in its section.

The validator enforces "extra fields forbidden" (`extra: forbid`) so unknown or
renamed fields fail loudly rather than being silently dropped.
