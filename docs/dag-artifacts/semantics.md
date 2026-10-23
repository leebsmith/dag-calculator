# Semantics — Model, Invariants, Authoring

This document defines *what the concepts mean* and *the invariants the
realization must uphold*. It is the "why" behind the grammar.

---

## 1. The mental model

The app's business logic is a **deterministic DAG**. Data flows:

```
seed ──▶ select(reference) ──▶ input ──▶ compute ──▶ output
```

- **Seeds** are immutable bundled facts (catalogs, lab reports) — read, never
  edited. **Library records** are immutable, per-user components authored outside
  a batch; they merge with seeds for selection but are copied into a batch when
  chosen.
- **Selections** reference a component by id and hold the batch's own read-only
  copy of that component.
- **Inputs** are user-set values.
- **Compute** transforms them.
- **Outputs** are the results.

In the artifact this becomes a graph of **six node kinds** (`root`, `choice`,
`collection`, `selection`, `derived`, `boundary`) and **three edge kinds**
(data, reference, relation) — see `grammar.md`.

### 1.1 What "deterministic" means here

Given the roots, every derived value is a **pure function of its ancestors**. The
two `boundary` nodes are idempotent: same inputs → same outputs (their interiors
iterate, but converge deterministically). Therefore **arrival order never changes
values** — only *freshness* (whether a result is current), which is a runtime
concern, not a value concern.

### 1.2 Three layers

- **Logic** — the artifact. Static, authoritative, view-independent.
- **State** — the master store of **roots** (mutable).
- **Derived** — the engine's computed values (never stored).

---

## 2. Invariants (must hold)

### 2.1 Single writer

Every node has exactly **one definition**. Roots are the only mutable state;
derived values and boundary outputs are **never stored**. If a value can be
computed, it is *not* a root.

### 2.2 Explicit edges

The dependency graph comes **only** from declared `inputs`, `ref`, `relations`,
and `{ref}`s inside a node `default` (a default is a lazy expression, so its refs
are dependencies). There is **no read-tracking / auto-inference**. A dependency
that is not declared does not exist.

### 2.3 Domain-core-only

The artifact holds **domain quantities and rules only**. It excludes: labels,
unit selection, rounding-for-display, sentinels (`"—"`, `"∞"`), CSS classes,
control kinds, and layout. Presentation is reconstructed outside, from
dimensions + taxonomies.

### 2.4 No denormalized cache

Derived values are computed by the engine and **memoized by the engine**, never
materialized into the store. A live draft holds roots only. A *saved batch* is a
separate, immutable **frozen valuation** (see §3), which is a fact, not a cache.

This extends to component values: a root that inherits from a selection declares
a `default` over that selection's field and stays **unset**. Host code must not
copy component values into roots (push) when the artifact can express the
inheritance as a default (pull) — the copy needs a synchroniser that remembers to
re-copy on every component change and to clear on every detach. A set root is an
**override** and survives later component changes.

### 2.5 Identity is memory, not state

A batch carries an immutable **identity**: the equipment, water source, and style
components it was designed with, as `{ id, label, …values }` snapshots supplied by
the host at engine construction. Identity is memory — it survives independently of
the library that produced it — and not linkage: editing or deleting a library
record never changes a batch, and no live dereference exists.

Consequences:

- Identity values are **not nodes**: no edges, no invalidation, no root, no
  `valuation` entry. A dotted path like `equipment.mash_tun_mass_kg` or
  `style.og_min` resolves through `artifact.identity`, not through the graph.
- Identity is **required**: an artifact that declares identity namespaces cannot be
  interpreted without them.
- **No container entity exists.** Batches with equal identity are "the same beer";
  grouping is a query, and `parent_batch_id` records explicit lineage only.
- Styles are catalogue data or an inline *experimental* declaration, so they have
  no CRUD lifecycle; equipment and water sources are user-owned assets that do.

### 2.6 Absence is not a value

A node may have **no value**: an unset root whose default cannot resolve (e.g. a
field the selected component does not declare, or no component at all), or a
`selection` whose `ref` is empty. Absence is spelled `undefined` in the engine
and `null` in payloads — never `0`, `""`, `{}`, or a dropped key.

- Bounds on a valueless node are **unresolved**, not violated (§4.1).
- An empty `ref` selection resolves to `null`; dotted reads into it yield
  `undefined` (safe behind a short-circuiting `if`).
- Presentation renders absence as blank, never as a zero.

### 2.7 Realization-agnostic boundaries

`boundary` nodes declare a **contract** (inputs, outputs, resolution, domain) but
not a body. Their realization (remote HTTP, native code, in-process) is a
host concern. Currency/staleness and the fingerprint are **derived** from the
declared edges — never authored.

---

## 3. Selection and freeze

### 3.1 Selection = reference + batch copy

A `selection` holds a `ref` (component id). Choosing a component **copies it
forward** into the batch's `selections` snapshot, and the selection resolves to a
**read-only view** of that snapshot — selections are never mutated. Only the two
switchable references (water target profile, yeast) remain selections; equipment,
water source, and style are identity (see §2.5). The library
(seeds + the user's records) is consulted only when a legacy draft has a
non-empty ref and no snapshot; the normal load path materialises the snapshot and
persists it on the next save. Library edits therefore cannot perturb a loaded
batch. An empty `ref` means "no component chosen": the selection resolves to
`null` (dotted reads yield `undefined`), so optional selections are safe to
reference behind a short-circuit guard. Identity namespaces carry no `ref`: the
component is the value. A batch that needs a value different from
the selected component models it as a `root` defaulting to the selected field;
setting that root overrides the inheritance, keeping batch state in one place:
the roots.

### 3.2 Freeze = full valuation

A saved batch is a **node-id → value** map over the whole graph, immutable,
carrying provenance:

- `source_template_id` — which component was selected (provenance only; there is
  no content hash and no drift detection, because the batch already owns its
  copy).
- `schema_version` — the batch payload revision.
- `parent_batch_id` — lineage (a batch is a recipe *variation*).
- `valuation_format` — `"outputs"` marks the current shape: a boundary node maps
  to its plain output map (`sg_post_boil`, `cascade.v_strike`, …). A missing
  marker is the legacy shape, where the entry was the engine's internal
  `{ outputs, fingerprint }` cache wrapper; read paths must keep accepting it.

**Provenance ≠ versioning.** There is no append-only component-version chain and
no `(component_id, version)` reference. Reuse means *copy-into-batch* at
selection time; correcting a library record means creating a new immutable record
and deleting the old one. Existing batches are unaffected.

### 3.3 Draft vs. frozen

- **Draft** — roots, collections, and copied selection snapshots; derived values
  computed live by the engine.
- **Frozen** — full valuation, immutable, provenance-tagged, keeping the draft's
  roots/collections/selections for lossless forking.

---

## 4. Constraints, interpretations, defaults

- **Domain (constraints)** — unary bounds on a node (`domain`), n-ary invariants
  in `relations`. They restrict *what is valid*, and are annotations, not nodes.
  The engine **evaluates** both and surfaces the result to the view
  (report-only: `relationStates()` / `domainStates()`); a violated invariant is a
  presentation concern, not a computation failure. Bounds may reference a
  selected component's fields; a bound that cannot be resolved (e.g. an unset
  optional selection) is **not applicable** and skipped. Primitive-schema fields
  may also declare `domain`s, evaluated for the fields of a selected component
  (`fieldDomainStates()`).
- **Interpretation** — a `derived` node whose output is a `taxonomy` (or boolean):
  a categorical judgment over a computed value (e.g. mash-pH status). Its
  presentation label/class is stripped.
- **Default** — an expression evaluated when a root is unset. Structured
  "factory" defaults are decomposed into per-node defaults.

---

## 5. Authoring conventions

When adding to the artifact, obey:

1. **Classify by output nature, not complexity.** A calculation is *domain* iff
   it produces a meaningful, dimensioned (or enum) quantity independent of
   presentation. "Total water used" is domain; "EBC label for display" is not.
2. **Split domain core from view adapter.** A getter that computes *and* formats
   is two things; keep only the compute in the artifact.
3. **Compute in base units.** Unit conversion is derived from dimensions, pushed
   to the display boundary.
4. **One definition per equation.** Shared equations go in `functions`; do not
   duplicate them inline.
5. **Prefer a node over a magic value.** Defaults and bounds reference
   `constants`/`taxonomies`, not inline literals.
6. **Cycles go in boundaries.** Any fixed-point (root-finding, linear program)
   is a `boundary`, never a cycle in the acyclic graph.

---

## 6. Versioning

- `schema_version` — the grammar revision. Bumping it signals a breaking change
  to the artifact's shape.
- The validator enforces `extra: forbid` so renamed/removed fields fail loudly.
- Migration on load (fill defaults, rename, or flag for review) precedes
  validation — see the anti-drift strategy in the data-model plan.
- Boundary `interface_version` is **deferred** (add when a host implementation
  must be matched to a declared contract).
