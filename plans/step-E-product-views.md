---
title: Step E — Product / Views
step: E
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [Step A, Step D]
blocks: [Step F]
gate: legacy 7-step workflow reproducible; make local-dev runs; make check/test green
status: done
---

# Step E — Product / Views

**Goal:** deliver the 7-step brewing workflow on top of the engine + adapters. The
view is **thin** (`00-ingestion.md`): it reads `engine.get(id)` / `engine.resolve(path)`
and writes roots. All presentation the artifact excludes (labels, units, rounding,
control kinds, layout, taxonomy classes) is reconstructed **outside** the artifact.

## Architecture (view layer)
```
artifact ─┐
manifest ─┼─▶ field-model producer ─▶ renderer registry ─▶ partials (Alpine)
registry ─┤        (projection)              (control kind)
stores ───┘
```
- **Field-model producer** — two halves:
  - *static projection* (once): `{ id, slice, role, control, dimension, label, group, editable, target }`;
  - *dynamic valuation* (on change): `{ value, display, unit, status }`.
  The producer **is** the recompute seam (driven by `engine.dependents`, never read-tracking).
- **Write targets** unify edits under single-writer:
  `{root|choice, nodeId}` · `{collection, nodeId, row, field}`.
- **Renderer registry** — control kind → partial: `number`, `choice-select`,
  `selection-picker`, `collection-table`, `readout`, `interpretation-badge`,
  `invariant-badge`, `boundary-status`.

## Recommended choices (call out if you disagree)
- **Composition:** build-time HTML includes via `<load>` (`vite-plugin-html-inject`,
  as the legacy app used). No runtime `x-html`.
- **Rendering:** **hybrid** — generic `x-for` over scalar field models; bespoke
  partials for selections / collections / tables.
- **Presentation registry:** **per-slice co-located** modules (`src/views/<slice>.js`)
  composed by a small index; labels/units/rounding/taxonomy-classes live here.
- **Step model:** a **manifest** (`src/views/steps.js`) declaring order, partial,
  reveal condition, and the nodes/selections each step binds.
- **Master store:** modularized by slice (`equipment/mash/water/grist/batch`), roots
  only; separate `uiStore` (unit mode, active step, modals, search).

## Steps

### E.1 — Tooling
- Add `vite-plugin-html-inject`; wire `<load src>` includes in `index.html`.

### E.2 — State (`src/store/`)
- Split `masterStore` into per-slice modules composed by an index (roots only).
- `uiStore`: `activeStep`, `unitMode` (per dimension), modal open/close, search.

### E.3 — Presentation registry (`src/views/<slice>.js` + index)
- Labels, help, `group`, control-kind overrides, unit symbols/preferred units,
  rounding, taxonomy→label/class maps, slice titles/order.

### E.4 — Field-model producer (`src/views/producer.js`)
- Static projection from artifact + manifest + registry; dynamic valuation from
  engine + uiStore; `display` via `units.fromBase` + rounding; boundary `status`
  from the adapter; relation/domain badges from `engine.relationStates()/domainStates()`.

### E.5 — Renderer registry + macros (`src/views/partials/`)
- One partial per control kind; dispatch via a `<template x-if="f.control === …">`
  chain (or a small `x-field` directive). Writes route to store via target scope.

### E.6 — Step partials (`src/partials/step-*.html`)
- `step-equipment-profile` (selection picker + read-only component fields)
- `step-yeast-selection` (component picker; attenuation → `batch.apparent_attenuation`)
- `step-fermentables` (`grist.major_malts` table; Hamilton allocator is host-side)
- `step-late-additions` (`batch.sugars` table → `batch.s_late_add`)
- `step-batch-solver` (inputs + `solver.batch` outputs + boundary status)
- `step-mash` (`mash.rests` + strike chain)
- `step-water-chemistry` (source/target selectors + `solver.water` outputs)
- `mash-rests-modal` (ephemeral `uiStore`)

### E.7 — Boundary status & invariants (view)
- Surface `boundaryStatuses` (pending/ok/error) from Step D; render `SolverError`
  codes; render relation/domain badges from Step B.

### E.8 — Units (view)
- Per-dimension unit mode → `units.fromBase(...)` for display; base-unit compute.

### E.9 — Tests
- `producer.test.js`: static projection shape; valuation updates on `setRoot`;
  write-target routing. `uiStore`/`masterStore` unit tests. Renderer dispatch
  (jsdom-free: test the model, not the DOM).

### E.10 — Docs
- `tech-stack.md`/README: view layer map; `<load>` include convention.

## Sub-milestone split (recommended execution order)
- **E-a** *(tightly scoped, reviewable in one pass)* — prove the pattern on **one
  vertical slice (Mash)** with **scalar roots + readouts only**:
  1. tooling: `<load>` include wiring + `index.html` shell hosting one step;
  2. `uiStore` (`activeStep`, `unitMode` — minimal);
  3. one master-store slice module (mash) + index;
  4. one presentation-registry module (mash) + index;
  5. the **field-model producer** (static projection + dynamic valuation + write targets);
  6. renderer registry with **`number` + `readout`** only;
  7. partial `step-mash.html` (grain-temp input → root write; strike readouts), all from field models;
  8. anti-drift guards **A1, A2, A3, A5, A6, A7, A9**.
  **Deferred to E-b..E-d:** `choice-select`, `selection-picker`, `collection-table`,
  the other 6 steps, units *display*, boundary-status/invariant badges, modals.
  **E-a acceptance:** producer emits mash field models; dispatch renders
  `number`+`readout`; edits write the root (store+engine) and update readouts via the
  producer re-pull; guards green; mash strike goldens hold (73.4233 / 3.0214 / 76.4447).
- **E-b** step partials (1,5,6 wired to real engine data).
- **E-c** selections + collection tables (steps 1,3,4,7).
- **E-d** units, boundary status, invariants, polish, modals.

## Acceptance Criteria — anti-drift guards
All Node `node --test` files under `tests/guards/`, wired into the gate via the
frontend test script (`... ../tests/guards/*.test.js`). Shared helper
`tests/guards/util.js` (`walk(dir, exts)`, `read`, `artifact()`, `rel`, `ROOT`).

| # | File | Rule (exact) | Phase |
|---|---|---|---|
| A1 | `no-reactivity.test.js` | `frontend/src/engine/**`, `frontend/src/store/**`, `frontend/src/views/producer.js` must not match `/\bnew\s+Proxy\b|\bdefineProperty\b|\bcomputed\s*\(|\breactive\s*\(|\bwatch\s*\(|\beffect\s*\(/` | E-a |
| A2 | `engine-access.test.js` | `engine.` may appear only under `frontend/src/engine/`, `frontend/src/adapters/`, `frontend/src/views/producer.js`; forbidden in `views/**` (excl. producer), `store/**`, `partials/**`, `components/**`, `main.js` | E-a |
| A3 | `artifact-purity.test.js` | no `data/artifact.json` key matches `/^(label\|title\|control\|controlKind\|css\|class\|className\|rounding\|decimals\|sentinel\|layout\|order\|help\|display\|displayName\|format\|render\|colSpan)$/i` | E-a |
| A4 | `roots-only.test.js` | every `store.allRoots()` key is a `root`/`choice` node | E-c |
| A5 | `write-targets.test.js` | editable ⇒ exactly one target scope `root\|choice\|collection`; readout ⇒ no target | E-a |
| A6 | `manifest-integrity.test.js` | every manifest/registry reference path resolves via `resolveReference` | E-a |
| A7 | `include-integrity.test.js` | every `<load src>` exists and ↔ manifest steps (bidirectional) | E-a |
| A8 | `display-only-units.test.js` | `units.fromBase` referenced only by the producer/registry; writing a display value stores the base value | E-d |
| A9 | `determinism.test.js` | identical roots ⇒ deep-equal field models | E-a |

Each guard fails with a `file:line`/`json.path` message (see the guard spec).

## Out of scope
Persistence/freeze/auth (Step F) · seed/schema conformance (Step G) · map/dict type ·
boolean input · list literals · `max`.

## Gate (definition of done)
- The 7 legacy steps are reproducible from the artifact (no bespoke domain logic in
  the view).
- `make local-dev` boots Vite + emulators + uvicorn; the stepper runs against the
  real seam (or stubs offline).
- `make check` and `make test` green; producer/store/renderer tests pass.

## Risks
- **Scope:** the largest step; execute in E-a…E-d.
- **Alpine dispatch:** no dynamic components — one disciplined `<template x-if>` chain.
- **Compound inputs** (selection/collection) strain a flat field model → hybrid partials.
- **Presentation leakage:** the registry must not feed back into the artifact.

## Program context
A → B → C ‖ D → **E**; Steps F/G parallel.

## E-e1 addendum (delivered)

Completes the view: the remaining three steps, a horizontal progress stepper,
and a global unit switcher.

- **Layout:** horizontal `flex-flow: row wrap` step row (no horizontal scroll);
  a menu bar (title + global unit switcher) and a sticky footer (Back/Next +
  violation summary). Progressive reveal gated by `uiStore.highwater` (furthest
  reached), separate from the cursor (`activeIndex`); completed cards stay fully
  active, future cards hidden. One generic `step-card.html` partial replaces the
  four per-step partials.
- **Steps wired:** yeast-selection, late-additions, water-chemistry (manifest
  order equipment → yeast → fermentables → late-additions → batch → mash →
  water).
- **Yeast ↔ AA (decision):** picking a yeast does **not** auto-write AA; an
  explicit "Use this attenuation" action copies `batch.yeast.attenuation_pct`
  into `batch.apparent_attenuation`, which renders as a readout in the batch
  card. No envelope range-guard yet.
- **References:** the engine now resolves selections schema-aware
  (`references[node.schema][refValue]`); `referenceCache` normalizes seeds
  (flat water-target `ions.*`, water reports indexed by `report_id`).
- **Empty-selection guard:** selection-derived fields are deferred while their
  reference root is `""` (so `batch.yeast.*` readouts don't throw before a
  yeast is chosen).
- **Units:** dimension-level `unitMode` surfaced via a menu-bar switcher;
  `UNIT_DIMENSIONS`/`UNIT_SYMBOLS` in `registry/units.js`; gravity SG↔Plato wired
  through `engine.call`. Per-node unit preferences delivered later: per-field
  `unit-badge` (cycle toggle), resolved as `unitMode[field.id] ??
  unitMode[field.dimension]` in the producer.
- **Deferred (tracked):** live-HTTP boundary debounce/in-flight coalescing;
  `solver.water` salt-addition readouts (unblocked by Step G's C14 fix);
  unit-preference persistence.

