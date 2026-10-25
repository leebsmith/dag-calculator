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
├─ identity            { namespace → schema id }   (optional)
├─ nodes               { id → node }
└─ relations           [ relation, ... ]
```

Only `schema_version`, `meta`, and `nodes` are required at a minimum; the other
sections may be empty. `relations` is an array; the rest are maps keyed by
string id.

`identity` declares the **immutable context** the host must supply: each key is a
dotted namespace (`equipment`, `water.source`, `style`) and each value is a
primitive-schema id describing its shape. Identity values are not nodes — they have
no edges, are never invalidated, and are not stored in the batch's `roots`. Every
identity namespace must be disjoint from the node ids (a node id may not equal or
extend a namespace).

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

> For everything resolvable from a node id at runtime (valuation, domain state,
> topology, provenance, view metadata), see `node-reference.md`.

---

## 2. Node kinds (six)

Every node has a `kind`. The legal set, and the shape each requires:

| Kind | Purpose | Required fields |
|---|---|---|
| `root` | user-set scalar (numeric) input | `dimension`, `default` |
| `choice` | user-set categorical input | `taxonomy`, `default` |
| `collection` | user-set list | `item_schema` |
| `selection` | read-only reference to a component | `output.schema`, `ref` |
| `derived` | pure computed value | `inputs`, `expr`, `output` |
| `boundary` | sealed host-defined black box | `binding`, `resolution`, `inputs`, `outputs` |

A node's **value type** is one of `{dimension}` (numeric quantity), `{taxonomy}`
(N-valued categorical), or `{type:"boolean"}` — the same vocabulary used by
`derived.output` and by each `boundary.outputs` entry. Inputs use it via the node
kind (`root` → dimension; `choice` → taxonomy). A `selection` declares
`output: {schema}`; identity namespaces declare their shape in the `identity`
section.

### 1.2 Dotted paths

A dotted path resolves to a node (plus a selection/collection field or boundary
output suffix) **or** to an identity namespace (plus a component-field suffix).
Nodes win; identity namespaces are matched by longest prefix after node resolution
fails. Dispatch order is: exact node id → longest node prefix → longest identity
namespace → error.

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
  `{call}` / a bare literal. Evaluated when the root is unset; a default that
  reads a selection field is the sanctioned way to inherit a component value
  (e.g. `batch.boil_off_rate_l_per_hr` → `equipment.nominal_boil_off_rate_l_per_hr`).
  A non-literal default must infer the root's declared dimension; bare numbers
  are read in that dimension and bare strings are only valid for `reference`
  roots.
  A set root overrides its default and is never overwritten by later component
  changes.
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
  "output": { "schema": "equipment" },
  "ref": "batch.equipment_profile_id"
}
```

- `output.schema` — the component type this selection resolves to. `output` is the
  selection's value spec, parallel to `derived.output`; it names a declaration in
  `primitive_schemas` (it is a type key, not a graph edge).
- `ref` — a root holding the component id (usually a dotted path to a `batch.*` root).
- A selection is a **read-only view** of the referenced component: its value is the
  component, unchanged. Batch-specific variation is modeled with `root` nodes
  (optionally `default`-ing to a selected field), never by mutating the component.
- A selection resolves in order: the batch's copied component snapshot, then the
  reference catalogue (`references[schema][id]`). An **empty `ref` value** means
  "no component chosen": the selection resolves to `null` (dotted field reads
  yield `undefined`) rather than erroring. A non-empty id that names no component
  is a validation error.

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
- `resolution` — `iterative` (root-finding / linear program) or `direct` (a
  closed-form solver). The artifact declares *that* it iterates, never *how*.
- `inputs`/`outputs` — the declared contract. Each output is a **value spec**:
  `{dimension}` | `{taxonomy}` | `{type:"boolean"}` | `{type:"collection",
  item_schema}`. Nested host responses are **flattened to dotted output keys**
  (e.g. `cascade.v_strike`, `hlt.v_hlt_debt`), reusing the dotted-path resolution
  of §1.1. A collection output is an opaque list of schema-conforming rows (the
  hop solver's per-addition results); it is presentation-read, not an
  expression input.
- `domain` — the **feasibility/error surface**: the set of `code` values the
  boundary can raise (mirrors the implementation's `SolverValidationError` codes).
- A boundary is **opaque**: no `expr`, no body. Its interior is host code.

### 2.6 `choice`

```jsonc
"batch.topology": {
  "kind": "choice",
  "taxonomy": "topology",
  "default": "r_l_to_g"
}
```

- `taxonomy` — the enumerated domain the value is drawn from (see `taxonomies`).
- `default` — the selected member (a bare string) or an expression evaluating to one.
  If a literal, it must be a member of the named `taxonomy`.
- Binary inputs (e.g. `r_l_to_g` | `runoff_ratio`) are `choice` over a 2-member
  taxonomy; a dedicated boolean *input* kind does not exist (booleans are a
  computed/interpretation value type only).

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

A bound that cannot be resolved (e.g. a `{ref}` to a field of an unset optional
selection) is treated as **not applicable** and skipped. Primitive-schema fields
may also carry `domain`s; those are evaluated for the fields of a *selected*
component and for the items of a *collection* (surfaced separately from node
domains).

A node with **no value** (`undefined` / `null` — e.g. a root whose default reads
a field of an unset selection) is reported as **unresolved**:
`{ bounded: true, holds: null, reason: "unresolved" }`. Absence is not a
violation. Only a value that exists and fails a bound is `holds: false`; a
non-finite computed number (e.g. `NaN`) is still a violation.

### 4.2 Relation (n-ary invariant)

```jsonc
{ "id": "hlt_not_overfilled",
  "blocking": true,
  "predicate": { "op": "le",
                 "lhs": { "ref": "batch.hlt_starting_volume_l" },
                 "rhs": { "ref": "equipment.max_hlt_volume_l" } } }
```

A relation is a predicate over two or more nodes that no single node owns. It is
a first-class invariant, evaluated by the engine and surfaced to the view.

`blocking` is a required boolean domain fact, not presentation vocabulary.
`true` marks a capability limit: a batch that fails it cannot exist (an
overfilled tun, a kettle that cannot hold the pre-boil volume). `false` marks a
quality/policy finding (a thin mash, a rig preference). The view maps `blocking`
to its `error`/`warning` severity; the artifact never names those words.

The AST has no scalar `min`/`max`. Use `if(a >= b, a, b)` for the larger of two
values — `mash_tun_not_overfilled` compares the peak phase volume this way.

Predicate referents may include selection fields. Because `and`/`or`/`if`
**short-circuit**, an optional selection is guarded with a conditional, e.g.
`if(ref != "", <predicate over the selected component>, true)`. An *unguarded*
ref to an unset optional selection resolves to `undefined` and the comparison
yields a spurious `holds:false` — it is not a load error (validate only checks
that refs resolve).

---

## 5. JSON-Schema summary

The artifact is a JSON document. Its machine schema (used by the *validator*
tooling, not shipped as a deliverable) is, in essence:

- Top level: object with `schema_version` (integer; current grammar revision is
  **9**), `meta` (object), `dimensions`, `constants`, `taxonomies`, `functions`,
  `primitive_schemas`, `identity` (all objects), `nodes` (all objects), and
  `relations` (array).
- `nodes.*` must be one of the **six** kinds; each kind's required fields are in
  §2; unknown `kind` values are rejected.
- `derived.expr` and `functions.*.body` must be valid AST (see
  `expression-language.md`).
- `output` must be exactly one of `dimension`/`taxonomy`/`type:boolean`/`schema`;
  a boundary output may also be a collection (`type:collection` + `item_schema`).
  A selection's `output` is `{schema: <id>}`. A schema field may also carry
  `{type:"boolean"}` for a flag (e.g. `enabled`).
- Every `inputs`/`ref`/`{ref}` path must resolve to a declared node, a declared
  schema field, or a declared identity namespace + schema field; dangling
  references are a validation error.
- Every `dimension`/`taxonomy`/`schema`/`function`/`constant` id referenced
  anywhere must be declared in its section.

The validator enforces "extra fields forbidden" (`extra: forbid`) so unknown or
renamed fields fail loudly rather than being silently dropped.
