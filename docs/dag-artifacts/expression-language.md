# Expression Language — The Formula AST

Every `derived` node's `expr` and every `function`'s `body` is an **AST** — a
tree of JSON objects, language-neutral and machine-evaluable. It contains **no
host-language code**.

---

## 1. Leaves

| Leaf | Shape | Meaning |
|---|---|---|
| node ref | `{ "ref": "alias" }` or `{ "ref": "dotted.path" }` | the value of an input (by alias) or a node/field (by dotted path) |
| constant | `{ "const": "id" }` | a `constants` entry |
| literal | `42`, `"HIGH"` (a **bare JSON number/string**) | a literal value (numbers, or strings for enum comparisons) |

`{ "ref": "alias" }` is used *inside* a node's `expr` to reference its `inputs`
aliases. `{ "ref": "dotted.path" }` is used in top-level expressions (defaults,
relations) to reference any node by id.

---

## 2. Operators

### 2.1 Arithmetic

`+ - * / neg pow` — each as `{ "op": "+", "args": [a, b] }` (unary `neg` takes
one arg).

```jsonc
{ "op": "-", "args": [ { "ref": "t_target" }, { "ref": "t_grain" } ] }
```

### 2.2 Comparison

`gt ge lt le eq ne` — `{ "op": "gt", "args": [a, b] }` → boolean.

### 2.3 Logic

`and or not` — `{ "op": "and", "args": [a, b] }`, `{ "op": "not", "args": [a] }`.

### 2.4 Conditional

`if` — `{ "op": "if", "args": [cond, then, else] }` (used for classifications).

```jsonc
{ "op": "if", "args": [
  { "op": "ge", "args": [ { "ref": "ph" }, 5.6 ] },
  "HIGH",
  { "op": "if", "args": [ { "op": "le", "args": [ { "ref": "ph" }, 5.2 ] }, "LOW", "OPTIMAL" ] }
] }
```

`and`, `or`, and `if` **short-circuit**: only the taken branch is evaluated. This
lets a predicate guard access to a value that may be unresolvable, e.g. a field of
an unset optional selection: `if(ref != "", <predicate>, true)`.

---

## 3. Reductions (higher-order)

Reductions operate over a collection and carry a **lambda binding**: `coll` (a
reference to a collection node), `as` (the element alias), and `body` (an
expression over the alias). The alias is available inside `body` as `{ "ref": "alias.field" }`.

A value-reduction (`sum` / `weighted_avg` / `min` / `max`) MAY carry an optional
**`where`** predicate — a boolean expression over the alias. When present, only
items whose `where` is truthy are reduced (**filter-then-reduce**). Truthiness is
plain falsiness: `undefined`, `null`, `false`, `0`, and `""` are excluded.

| Op | Shape | Returns |
|---|---|---|
| `map` | `{ "op":"map", "coll":..., "as":"row", "body":... }` | list of `body` per element |
| `filter` | `{ "op":"filter", "coll":..., "as":"row", "body":<predicate> }` | sublist where predicate holds |
| `sum` | `{ "op":"sum", "coll":..., "as":"row", "body":..., "where"?:<predicate> }` | Σ `body` |
| `weighted_avg` | `{ "op":"weighted_avg", "coll":..., "as":"row", "value":..., "weight":..., "where"?:<predicate> }` | Σ(value·weight) / Σ(weight) |
| `min` | `{ "op":"min", "coll":..., "as":"row", "value":..., "where"?:<predicate> }` | smallest finite `value` |
| `max` | `{ "op":"max", "coll":..., "as":"row", "value":..., "where"?:<predicate> }` | largest finite `value` |

```jsonc
{ "op": "sum", "coll": { "ref": "grist.major_malts" }, "as": "row",
  "body": { "op": "*", "args": [ { "ref": "row.pct" }, { "ref": "row.yield_fraction" } ] } }

// first enabled rest's temperature: filter by `enabled`, then take the minimum
{ "op": "min", "coll": { "ref": "mash.rests" }, "as": "rest",
  "value": { "ref": "rest.use_temp_c" }, "where": { "ref": "rest.enabled" } }
```

`min`/`max` require a **numeric** `value` (an ordered quantity); they skip
non-finite/`null` values and return `undefined` when no finite value remains
(e.g. an empty schedule). `count` is **not** in the set; add it only if a derived
node requires it.

### 3.1 Row-scoped computed fields

A `collection`'s `fields` entries (grammar §2.2) use the same binding idea
without the reduction wrapper: the alias is fixed to `row` and bound to the
element, so `{ "ref": "row.pct" }` reads an authored `item_schema` field. Every
value from outside the row comes through the field's declared `inputs` aliases:

```jsonc
"mass_kg": {
  "inputs": { "m_grist": "solver.batch.m_grist" },
  "expr": { "op": "*", "args": [ { "ref": "row.pct" }, { "ref": "m_grist" } ] },
  "output": { "dimension": "mass" }
}
```

---

## 4. Function calls

`{ "call": "<function-id>", "args": [ ... ] }` invokes a `functions` entry.

```jsonc
{ "call": "morey_mcu_to_srm", "args": [ { "ref": "mcu" } ] }
```

A `function` is declared as:

```jsonc
"morey_mcu_to_srm": {
  "params": ["mcu"],
  "returns": "beer_color",
  "body": { "op": "*", "args": [ 1.4922, { "op": "pow", "args": [ { "ref": "mcu" }, 0.6859 ] } ] }
}
```

Note: inside a function `body`, `{ "ref": "x" }` refers to the function's
**parameter** `x`, not a node.

---

## 5. Nonlinear transforms (numeric inversion)

Some transforms are **not closed-form** (e.g. Plato → SG requires numeric
inversion of the ASBC cubic). These are declared at the **dimension** level as a
`nonlinear` transform pair with `fwd`/`inv` function ids:

Convention: `fwd` = **base → unit**, `inv` = **unit → base**. For `Plato`
(base `SG`), `fwd` is `sg_to_plato` (SG→Plato, the ASBC cubic) and `inv` is
`plato_to_sg` (Plato→SG, the numeric inverse):

```jsonc
"gravity": { "base_unit": "SG", "kind": "nonlinear",
             "units": { "Plato": { "fwd": "sg_to_plato", "inv": "plato_to_sg" } } }
```

Where `inv` is not closed-form (Newton–Raphson), the engine provides a
**numeric-inversion primitive**. The function `sg_to_plato` may be a polynomial
(AST); its inverse `plato_to_sg` is realized by the engine's primitive rather
than a hand-written AST.

---

## 6. Determinism and type rules

- Every expression is **pure**: no I/O, no time, no randomness. Same inputs →
  same output.
- The engine **dimension-checks** expressions: adding a `temperature` and a
  `temperature_delta` is legal; adding a `temperature` and a `volume` is a
  validation error.
- A `derived` node with `output.type == "boolean"` or `output.taxonomy` produces
  a boolean/enum, never a dimensioned quantity; the expression must match the
  declared output.
