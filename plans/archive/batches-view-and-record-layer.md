---
title: Batches View, Library Split & Style Record Layer
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [landing-and-batch-setup, off-graph-identity]
blocks: []
gate: New batch opens a selection-only dialog; one Batches view with scope filters; Library split into Sources/Ingredients; style is a catalog kind; make verify green
status: done
---

# Batches View, Library Split & Style Record Layer

Replaces the shipped chooser/landing surface. The model below was settled in
conversation; this file is the execution record.

## Model

**Reference data has two classes, and one storage mechanism.**

| Class | Kinds | Role | Authoring |
|---|---|---|---|
| Identity source | style, rig (`equipment`), water source (`water_report`) | one of each is snapshotted into the batch's identity at creation; equal co-requisites | style: fork → edit → seal; rig/water: create + replace |
| Formulation record | malt, hop, hop product, sugar, yeast, water target | step-local; snapshotted into the batch's selections when picked | create + delete |

- A **record** is the storage unit: `{kind, component, created_at, schema_version}`
  in `users/{uid}/catalog_items`. Created, read, deleted — never updated.
- **Sealed** = a record's state (immutable on save). **Frozen** = a batch's state
  (valuation snapshot). The words are not interchangeable.
- **Seeds** are shipped JSON: read-only, not records.
- **Snapshot** = the copy a batch takes (identity at creation, selection when
  picked). Records never reference batches; batches never resolve their records.
- **Selection** (composing a batch) and **administration** (CRUD of records) are
  different functions and never share a surface.
- **Records supply defaults; the batch owns the values.** A measured deviation is
  a batch-scoped edit of the copied row, never a record edit.

**Surfaces**

- **Batches** (default view): one list, scope filter All / Drafts / Frozen / Trash,
  sort modified/name. Rows show the snapshotted style, rig and water labels, status,
  updated. Draft/frozen actions are contextual; trash rows restore or delete permanently.
- **Batch workspace**: identity is read-only; only targets inside the frozen ranges
  are writable. No record selection, no Library link.
- **Library** (admin, reached from the masthead control and the prerequisite notice):
  **Sources** (Styles / Rigs / Water, three peers) and **Ingredients** (the other kinds).
- **New batch**: name + three identical selectors (style, rig, water). Selection only.

## Phase 0 — Unblock New batch

The setup store captured `state` in a closure and mutated the raw object; Alpine
templates observe the store through a proxy, so those writes never triggered a
re-render (`x-show` on the dialog never flipped). All mutations now go through
`this.state`, and asset option getters read a `revision` counter bumped on mutation.

- `frontend/src/store/setup.js`
- `tests/frontend/setup.test.js` — proxy-spy regression test

## Phase 1 — Style catalog kind

- `data/catalogs.json`: register `style` (schema `style`, `id_field: id`,
  `title_field: name`, `references_key: style`, `seed_key: styles`).
- `data/artifact.json`: `primitive_schemas.style` gains `forked_from_id`,
  `forked_from_name` (display lineage, not an edge).
- `node scripts/emit-artifact-inventory.mjs` (required by repo rule).
- `tests/backend/test_artifact.py`: `SEED_FILES["style"] = ["styles.json"]`.
- `docs/dag-artifacts/seed-substrate.md`: kind registry list.

No backend code change: `CatalogService` is registry-driven and there is no update
route, so sealed-on-save already holds. All 122 committed styles already validate
against `primitive_schemas.style`.

## Phase 2 — Library: Sources / Ingredients

- `frontend/src/store/userCatalog.js`: `IDENTITY_KINDS`, `INGREDIENT_KINDS`,
  `catalogClass`.
- `frontend/src/adapters/libraryUi.js`: section state, `activeKind`, ingredient
  tabs only, Sources kind peers (style/equipment/water), style fork, seed rows
  read-only (no delete), records hard-delete only.
- `frontend/src/partials/library.html`: two sections; Sources first.
- `frontend/src/partials/step-{card,water,yeast}.html`: remove the three
  "Manage library" links (CRUD inside a picker).

## Phase 3 — Batches view

- `frontend/src/store/recipeList.js`: scopes replace recency buckets.
- `frontend/src/main.js`: scope state, prerequisite status, contextual row actions,
  `forkFrozen` stores the parent's name.
- `frontend/src/partials/chooser.html`: one Batches view; frozen rail, freezes view,
  trash list and "Your setup" block removed.
- `frontend/src/partials/editor.html`: back to Batches, batch verbs only; no
  Library/Trash in the workspace.
- `frontend/src/store/persistence.js` + `backend/app/schemas/batch.py`:
  `parent_name` so lineage survives deleting the parent.

## Phase 4 — New batch dialog

- `frontend/src/partials/batch-setup.html`: workspace-dialog structure
  (`modal-dialog-workspace` → `modal-workspace-main`), name + three selectors,
  fixed-for-batch notice, disabled reason.
- `frontend/src/store/setup.js`: drop `styleMode` / `customStyle`; identity comes
  from the selected style record.

## Phase 5 — Workspace: identity frozen, targets only

- `frontend/src/adapters/cards/style.js` + `partials/step-style.html`: remove the
  catalogue picker and the identity writes (`selectStyle`, `clearStyleSelection`);
  the frozen declaration is a readout; targets remain writable.
- `batch.fermentation`: read-only (derived from the style's tags).
- `frontend/src/partials/step-hops.html` + `adapters/cards/hops.js`: Alpha becomes a
  per-row input (batch data), defaulted from the variety; the catalogue range is
  context and deviation is flagged, not blocked.

## Verification

`make check`, `make test`, `make verify`. The artifact change requires the emitted
inventory; `make test` guards it.

## Outcome (as shipped)

- **Setup store**: every mutation writes `this.state`; asset option getters read a
  `revision` counter. A proxy-spy regression test fails on the old closure-write
  path. `New batch` now opens.
- **Style record layer**: `style` is a catalog kind; `primitive_schemas.style`
  carries `forked_from_id` / `forked_from_name`; all 122 seeds validate; inventory
  re-emitted; `SEED_FILES` covers `styles.json`.
- **Library**: Sources (styles / rigs / water) and Ingredients sections, reached
  from the masthead only. Styles are forked and sealed on save; seeds are
  read-only; record deletes are permanent. The three picker-level "Manage
  library" links are gone.
- **Batches view**: one list with All / Drafts / Frozen / Trash, sort by modified
  or name, identity snapshot columns, lineage label, contextual row actions, a
  prerequisite notice, and a selection-only new-batch dialog.
- **Workspace**: identity is read-only. The style picker and its two identity
  writes are gone; `batch.fermentation` renders read-only; the style step keeps
  only target parameterisation. Creation-time residuals are seeded from the
  identity snapshot in `loadState`.
- **Hop alpha**: the batch row's alpha is an input (percent), defaulted from the
  variety, with the catalogue band shown and deviation highlighted rather than
  blocked.
- Not done: row-level `Freeze` on the Batches list (freezing stays in the
  workspace, where the batch is open), the optional inverse-CSS guard, and moving
  Units into the account menu (it stays in the editor control group).

