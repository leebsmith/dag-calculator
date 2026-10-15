---
title: Recipe YAML — Vocabulary & Grammar (draft)
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: [recipe-pipeline]
gate: a worked recipe parses against the generic document model and its bindings resolve
status: proposed
---

# Recipe YAML — Vocabulary & Grammar

Ancillary spec for `plans/recipe-pipeline.md`. Defines the declarative language
that shapes a **rendered recipe document** and **binds each leaf to an artifact
node id**. The projector parses this at runtime (no codegen); values render as
strings. This is the "shape" doc; projection semantics live in the parent plan.

> First draft for review — expect churn. The worked example (§8) is the contract.

---

## 1. Top level — the document tree

A recipe is a **tree**: a **Rollup** (the document) containing ordered
**Sections**, each of which may contain **Subsections** and **fields**. Every
level may carry its own title/subtitle/prose (decision #8).

```yaml
recipe:            # the Rollup
  title: "House Pale"
  subtitle: "…"
  meta: { author: "…", date: "…" }
  prose: [ "…" ]           # optional document-level text
  sections: [ … ]          # ordered

sections:          # named, reusable section definitions (referenced above)
  <section-id>:
    title: "…"
    prose: [ "…" ]
    subsections: [ … ]
    fields: [ … ]
```

- `sections` holds **definitions**; `recipe.sections` holds **instances**
  (ordered), each a bare id or a `{ ref, args }` (decision #7 — reuse).
- A section need not mirror an app step-card; it may draw from nodes across cards.

---

## 2. Document elements (unbound)

Available on the Rollup and every Section/Subsection/Group:

| Key | Meaning |
|---|---|
| `title` / `subtitle` | headings |
| `prose` | ordered text blocks (paragraphs) |
| `meta` | free key/values (document metadata; Rollup only) |

These carry no node binding; they render as headings/paragraphs so the document
reads like a recipe.

---

## 3. Field kinds

Entries of `fields:` (or a group's `blocks:`) are one of four kinds, discriminated
by key:

| Kind | Discriminator | Renders as |
|---|---|---|
| **value** | `node:` | a key-value line (`"Target ABV  5.5"`) |
| **table** | `collection:` | a table (repeatable rows) |
| **group** | `group:` | a nested block (same shape as a section body) |
| **prose** | `prose:` | a paragraph (inline document text) |

### 3.1 `value`

```yaml
- label: "Target ABV"
  node: batch.target_abv
  unit: inherit             # inherit | <unit-id> | as-authored
  when: { ref: batch.topology, eq: runoff_ratio }   # optional
  optional: true            # missing path → null instead of error
```

- `node` — a node id or **dotted path** (`solver.batch.cascade.v_sparge`,
  `equipment.max_hlt_volume_l`); resolved against the valuation (§5).
- **No `type:`** — the rendered value is always a string; the node's *dimension*
  is used only to convert + format ("12.2 g"), not to type the field.
- `unit` — `inherit` (follow the profile; default), a fixed unit id, or
  `as-authored` (base unit).
- `when` / `optional` — conditional inclusion / tolerance for unset selections.

### 3.2 `table`

```yaml
- label: "Mash Steps"
  collection: mash.rests
  columns:
    - { label: "Step",  field: rest_id }
    - { label: "Temp",  field: use_temp_c }
    - { label: "Time",  field: duration_min }
```

- `collection` — a collection node id; `columns[].field` — an `item_schema` key.
- Rows render as formatted strings per the field's dimension.

### 3.3 `group`

```yaml
- group: strike-water
  label: "Strike Water"
  fields: [ … ]
```

Same body as a section (`fields`/`subsections`/`prose`); a nested block without a
separate entry in `sections`.

### 3.4 `prose`

```yaml
- prose: ["Strike at 152 °F for a medium body."]
```

Inline text within a section's field list (for interleaving without a subsection).

---

## 4. Bindings

- A binding string is a node id or a dotted path into a boundary output /
  selection field / collection field.
- Resolution is **longest-prefix** over `artifact.nodes` (identical to
  `resolveReference`), then a valuation lookup (parent plan §5.1).
- Bindings are **validated** (parent plan §7): the node/path must resolve in the
  artifact; referenced units must exist.

---

## 5. Units

A value's display unit is resolved by the profile ladder
(`overrides[node] → master[dimension] → default → base`) and formatted as
`value + " " + symbol` using `data/units.json` (symbols + per-unit precision) and
artifact factors. A per-field `unit:` overrides the profile for that node.

---

## 6. Conditions

`when:` is a minimal predicate over the valuation (decision #7):

```yaml
when: { ref: batch.topology, eq: runoff_ratio }   # eq | ne | truthy
```

False → the field is omitted (or `null`). Keeps one section reusable across
topologies. (Widen to the artifact expression language only if a real need appears.)

---

## 7. Composition & reuse

```yaml
recipe:
  title: "Belgian Strong — 90 min boil"
  sections:
    - equipment
    - mash
    - water-chemistry
    - { ref: batch-sparge, args: { show_hlt: false } }   # reuse + per-instance args
```

`args` are substituted into the referenced definition (e.g. toggling optional
fields) at parse time.

---

## 8. Worked example (acceptance artifact)

A section drawing from two different step-cards, with a table, a nested group,
prose, and a conditional field.

```yaml
recipe:
  title: "House Pale"
  meta: { author: "lbs" }
  sections: [ mash ]

sections:
  mash:
    title: "Mash"
    prose:
      - "Single-infusion mash. Strike temperature is solved from the tun model."
    fields:
      - { label: "Grain temperature", node: mash.grain_temp_c }
      - { label: "Dough-in target",   node: mash.dough_in_target_temp_c }
      - { label: "Mash pH",           node: solver.water.prescription.predicted_mash_ph }
      - label: "Mash Steps"
        collection: mash.rests
        columns:
          - { label: "Step", field: rest_id }
          - { label: "Temp", field: use_temp_c }
          - { label: "Time", field: duration_min }
      - group: strike-water
        label: "Strike Water"
        fields:
          - { label: "Thickness", node: solver.batch.mash_thickness_l_per_kg }
          - { label: "Volume",    node: solver.batch.cascade.v_strike }
          - { label: "Temperature", node: mash.strike_water_temp_c }
          - label: "Runoff ratio r"
            node: batch.runnings_ratio
            when: { ref: batch.topology, eq: runoff_ratio }
            optional: true
```

Projected (illustrative — all leaves are strings):

```text
Section "Mash"
  prose: "Single-infusion mash. …"
  value "Grain temperature"  → "20.0 °C"
  value "Dough-in target"    → "67.0 °C"
  value "Mash pH"            → "5.4"
  table "Mash Steps"         → rows of ("Dough-in", "67.0 °C", "0 min"), …
  group "Strike Water"
    value "Thickness"        → "2.6 L/kg"
    value "Volume"           → "12.7 L"
    value "Temperature"      → "68.3 °C"
    value "Runoff ratio r"   → (omitted — topology is r_l_to_g)
```

---

## 9. Mapping to the generic document model

| YAML | Model (`backend/app/schemas/recipe_document.py`) |
|---|---|
| `recipe` | `RecipeDocument { title, subtitle, meta, prose, sections, identity }` |
| `sections.<id>` | `Section { id, title, subtitle, prose, blocks, subsections }` |
| `value` | `Value { label, node, value: str?, unit_label: str? }` |
| `table` | `Table { label, collection, columns, rows: [[str, …]] }` |
| `group` | `Group { label, blocks: [...] }` |
| `prose` (field) | `Prose { text }` |

No codegen: the projector parses YAML into these fixed models directly.

---

## 10. Open questions

1. **`unit:` spelling** — `inherit`/`as-authored` sentinels, or a nullable value
   with the profile as default? (Leaning: sentinels.)
2. **Group vs subsection** — is an inline `group` a distinct concept from an
   `subsections` entry, or should they unify? (Leaning: keep both — `group` is
   anonymous, `subsection` is a named/reusable section.)
3. **`when` operators** — start with `eq`/`ne`/`truthy`; confirm that's enough for
   the first recipe.
4. **Prose representation** — a `prose` list vs a `prose` field kind (both are
   specced here); pick one before R.1 or support both.
