# Semantics — Model, Invariants, Authoring

This document defines *what the concepts mean* and *the invariants the
realization must uphold*. It is the "why" behind the grammar.

---

## 1. The mental model

The app's business logic is a **deterministic DAG**. Data flows:

```
seed ──▶ select(reference) ──▶ input ──▶ compute ──▶ output
```

- **Seeds** are immutable facts (catalogs, lab reports) — read, never edited.
- **Selections** reference a component by id (plus an optional batch-scoped
  override).
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

The dependency graph comes **only** from declared `inputs`, `ref`, and
`relations`. There is **no read-tracking / auto-inference**. A dependency that is
not declared does not exist.

### 2.3 Domain-core-only

The artifact holds **domain quantities and rules only**. It excludes: labels,
unit selection, rounding-for-display, sentinels (`"—"`, `"∞"`), CSS classes,
control kinds, and layout. Presentation is reconstructed outside, from
dimensions + taxonomies.

### 2.4 No denormalized cache

Derived values are computed by the engine and **memoized by the engine**, never
materialized into the store. A live draft holds roots only. A *saved batch* is a
separate, immutable **frozen valuation** (see §3), which is a fact, not a cache.

### 2.5 Realization-agnostic boundaries

`boundary` nodes declare a **contract** (inputs, outputs, resolution, domain) but
not a body. Their realization (remote HTTP, native code, in-process) is a
host concern. Currency/staleness and the fingerprint are **derived** from the
declared edges — never authored.

---

## 3. Selection, overlay, and freeze

### 3.1 Selection = reference + overlay

A `selection` holds a `ref` (component id) and a sparse `overlay`. The effective
value of a field is `overlay[field] ?? component[field]`. Overrides are
**absolute** values (not deltas), constrained to fields marked `overridable` on
the schema.

### 3.2 Freeze = full valuation

A saved batch is a **node-id → value** map over the whole graph, immutable,
carrying provenance:

- `source_template_id` / `source_revision` — which component (by content hash)
  was copied in, for drift detection.
- `schema_version` — the artifact revision the node set came from.
- `parent_batch_id` — lineage (a batch is a recipe *variation*).

**Provenance ≠ versioning.** There is no append-only component-version chain and
no `(component_id, version)` reference. Reuse means *copy-into-batch* at
selection time; drift is reconciled explicitly (reset-to-seed / keep-custom), not
silently propagated.

### 3.3 Draft vs. frozen

- **Draft** — roots only; derived values computed live by the engine.
- **Frozen** — full valuation, immutable, provenance-tagged.

---

## 4. Constraints, interpretations, defaults

- **Domain (constraints)** — unary bounds on a node (`domain`), n-ary invariants
  in `relations`. They restrict *what is valid*, and are annotations, not nodes.
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
