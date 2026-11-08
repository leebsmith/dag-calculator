# Expression Language — Jexl Strings

Every authored expression is a **Jexl string** (schema revision 11). The
artifact remains the source of truth; Jexl is only the syntax that carries it.

The surfaces are:

| Surface | Meaning |
|---|---|
| `derived.expr` | the node's value |
| `root` / `choice` / `collection` `default` | the value used when unset |
| `collection.fields.*.expr` | a row-scoped computed value |
| `functions.*.body` | a shared equation |
| node / schema-field `domain` | a boolean over `$value` |
| `relations[].predicate` | a boolean invariant |

`boundary.domain.codes` is an error-code list, not an expression.

---

## 1. Literals and identifiers

| Form | Meaning |
|---|---|
| `42`, `-7.2`, `"HIGH"`, `true`, `false` | literal value |
| `intent`, `rows`, `t_target` | an input alias or function parameter |
| `batch.target_abv`, `solver.batch.m_grist` | a dotted node or boundary-output path |
| `constants.sucrose_yield_ldk` | a `constants` entry |
| `functions.extract_yield_ldk(0.8)` | a declared function |
| `row.pct` | an authored row field in a reduction or collection field |

The engine resolves identifiers lazily: a dotted path is read only when Jexl
evaluates the branch that contains it. `&&`, `||`, and the ternary therefore
preserve the old short-circuit behavior, including guarded optional selections.

A missing identifier resolves to `undefined`, not an exception. Absence is never
coerced to `0`, `""`, `{}`, or a dropped key; arithmetic through it naturally
yields `NaN`, which domain and relation reporting treat as unresolved.

---

## 2. Operators

Jexl supplies the operators:

- Arithmetic: `+ - * / // % ^`
- Comparison: `== != > >= < <= in`
- Logic: `&& || !`
- Conditional: `condition ? consequent : alternate`

`functions.<id>(...)` is namespaced in the artifact. Jexl 2.x drops the
qualifier on a call, so the runtime rewrites it to the flat registered function
name before compilation.

---

## 3. Reductions are transforms

A reduction is a transform on a collection. The field forms take row-field names
and an optional row-scoped predicate:

```text
rows | weighted_avg('color_lovibond', 'pct')
rests | sum('duration_min', 'row.enabled && row.duration_min != null', $context)
```

The `_expr` forms take a row-scoped Jexl string, an optional predicate (`null`
when absent), and `$context`:

```text
sugars | sum_expr('(row.mass_kg * row.yield_fraction)', null, $context)
rows | weighted_avg_expr('row.color_lovibond', 'row.pct', null, $context)
```

`min_expr`, `max_expr`, `map_expr`, and `filter_expr` follow the same shape.
`map_expr` and `filter_expr` take no `where` predicate: their third argument
must be `null`, and the validator rejects a non-null value. `$context` carries
the surrounding aliases and `row` binds the current item.

The transforms preserve the old semantics exactly:

- `sum` adds the selected values.
- `weighted_avg` returns `0` when the total weight is zero.
- `min` and `max` skip non-finite values and return `undefined` when none remain.
- An absent or null `where` selects every row; otherwise plain truthiness filters
  before the reduction.

---

## 4. Function calls

A function body uses its parameter names as bare identifiers and calls other
functions through the namespace:

```text
realized_fg = functions.plato_to_sg(functions.sg_to_plato(og_sg) * (1 - aa))
```

Function bodies are pure and deterministic. They receive only their parameters
and the immutable constants.

---

## 5. Domains

A node or schema-field `domain` is one boolean string over the reserved subject
`$value`:

```text
$value >= 0
$value > 0 && $value <= 1
$value <= constants.max_boil_off_rate
```

Record-catalog schemas (`data/record_schemas.json`) use the same Jexl domain
strings, so there is one domain syntax across the artifact and the record
catalogs.

An unresolved value is reported as `holds: null`, not a violation. A non-finite
value is a violation (`reason: "non-finite"`). A bound whose referenced limit is
absent is not applicable and is skipped.

---

## 6. Compilation and validation

The runtime compiles each expression once and caches the AST. A pre-build pass
must compile every `expr`, `default`, `domain`, `predicate`, `functions.*.body`,
`collection.fields.*.expr`, and expression-carrying transform argument with
`jexl.compile(...)`. Compilation proves syntax only; the loader also walks the
compiled AST to collect identifiers and verify every path against the declared
inputs, constants, functions, row schema, node, boundary output, selection
field, or identity namespace.

Dimension inference walks the same AST: arithmetic follows the declared
dimensions, comparisons and logic produce `boolean`, a ternary's branches must
agree, and a transform's dimension comes from its collection's item schema.

---

## 7. Determinism

Every expression is pure: no I/O, no time, no randomness. Same inputs → same
output. Evaluation order never changes a value; it only changes freshness.
