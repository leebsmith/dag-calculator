---
title: Recipe Landing Page
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
status: active
---

# Recipe Landing Page

## Goal

Replace the single flat recipe list with a landing page that separates **start
something** from **find something**, and gives every row a stable action menu.

```
hero        [New recipe]   [recent frozen batches → fork cards] [View all]
library     Your recipes                       [sort: modified | title]
            Last 30 days   title · modified · ⋮
            Older          title · modified · ⋮
freezes     frozen index   title · frozen · ⋮       (third view)
trash       unchanged soft-delete list              (existing view)
```

## Locked decisions

1. **Drafts and freezes are separate surfaces.** The landing hero and library
   list drafts only. A "View all" link opens a dedicated freezes view. Frozen
   rows do not appear in the draft tables.
2. **Freeze rail.** The hero shows up to 6 frozen batches, newest `frozen_at`
   first. Clicking a card forks it (same drift confirmation as today).
3. **Rename is allowed for drafts and frozen batches.** Rename changes only the
   `name` metadata; a frozen valuation remains immutable.
4. **Row menu is non-destructive.** Draft rows offer `Rename` and `Move to
   trash`; frozen rows offer `Fork a copy`, `Rename`, and `Move to trash`.
   Permanent deletion stays exclusive to the Trash view.
5. **Sorting.** Two orders: last modified (newest first) and title (A–Z). The
   30-day partition always applies; the chosen order sorts *within* each group.
6. **No lazy loading.** The expected ceiling is a few hundred batches; render
   all rows. The list endpoint keeps returning full records for now.
7. **Dates.** Draft rows show `updated_at` as "Modified". Frozen rows and
   freeze cards show `frozen_at` as "Frozen". `null` renders as "—".
8. **Trash stays in the top menu bar**, exactly as today.

## Context (what already exists)

- Chooser markup: `frontend/index.html:33-105`; store: `frontend/src/main.js:17-121`.
- Persistence seam: `frontend/src/store/persistence.js`; client:
  `frontend/src/adapters/batchClient.js`.
- `GET /batches` returns every batch with full state, sorted `updated_at` desc
  (`backend/app/repositories/batch_repo.py:22-25`).
- `PATCH /batches/{id}` accepts only `{trashed}` (`backend/app/main.py:83-91`).
- Rename exists only for the active draft
  (`frontend/src/store/persistence.js:70-74`).
- Frozen semantics: immutable payload, forked copy preserves lineage
  (`docs/dag-artifacts/semantics.md` §3.3).

## Architecture

### Pure list helpers — `frontend/src/store/recipeList.js`

- `draftSections(batches, { now, sort })` → `[{ key, label, batches }]`,
  omitting empty groups. Filters out frozen and trashed batches; partitions at
  30 days on `updated_at`; sorts within each group.
- `frozenBatches(batches)` → non-trashed frozen batches, `frozen_at` desc.
- `recentFreezes(batches, limit)` → first N of `frozenBatches`.
- `trashedBatches(batches)` → trashed batches, `updated_at` desc.
- `formatDate(seconds, { locale, timeZone })` → short date or "—".
- Title sort uses `localeCompare(..., { sensitivity: "base", numeric: true })`.

### Backend rename

- Extend the PATCH body from `TrashPayload` to `BatchPatch` with optional
  `name` (trimmed, 1–200 chars) and optional `trashed`; at least one required.
- `BatchRepository.rename(uid, id, name)` advances `updated_at` and returns the
  record; `BatchService.rename_batch` maps a missing/foreign record to 404.
- `PATCH` applies whichever fields are present and returns the final record.
  Existing trash calls remain valid.

### Frontend seam

- `batchClient.renameBatch(id, name)` → `PATCH {name}`.
- `persistence.renameBatch(id, name)` → forwards; refreshes the active name if
  the active batch is the renamed one.
- `persistence.trashBatch(id)` → soft-delete a non-active row.

### Store (`frontend/src/main.js`)

- `view: "chooser" | "freezes" | "editor"`; `trashView` unchanged.
- Getters: `drafts`, `freezes`, `recentFreezeRail`, `sections`, `trash`,
  `sortLabel`.
- Popovers are single shared floating elements, positioned from the trigger's
  bounding rect (`position: fixed`), so they never clip inside the scrolling
  chooser body. State: `rowMenu`/`rowMenuStyle`, `sortOpen`/`sortMenuStyle`.
- Inline rename: `renamingId` + `renameValue`; Enter and blur commit, Escape
  cancels; empty or unchanged names are a no-op.
- Actions: `openRowMenu`, `closeRowMenu`, `toggleSort`, `closeSort`, `setSort`,
  `beginRename`, `startRename`, `cancelRename`, `commitRename`, `trashBatch`,
  `forkMenu`, `trashMenu`, `showFreezes`.

### Markup and styles

- Hero: new-recipe card + freeze rail (horizontal, overflow-x).
- Library header with sort trigger; one table per non-empty group.
- Freezes view: back link + frozen table.
- Trash view: unchanged list.
- Table title cell is a button; the rename state swaps it for an input. No
  interactive nesting inside rows.
- Kebab menu: single fixed popover with role menu items.
- Tokens only; add `--container-content-wide: 56rem` and widen the chooser body.
- `[x-cloak] { display: none; }` so the fixed menus do not flash.

## Staging (one commit each)

1. **`Add the landing-page list helpers`** — `recipeList.js`,
   `tests/frontend/recipeList.test.js`.
2. **`Let the batch seam rename any owned batch`** — backend schema/repo/service/
   route + pytest coverage; `batchClient.renameBatch`, `persistence.renameBatch`,
   `persistence.trashBatch` + frontend tests.
3. **`Model the landing page in the recipe store`** — main.js state, getters,
   actions. No visual change yet.
4. **`Build the recipe landing page`** — index.html hero/library/freezes/menus,
   style.css, tokens. Verify `make check`, `make test`, `make build`.

## Tests

- Helper tests: partition boundary (exactly 30 days), title vs modified order,
  frozen/trashed filtering, freeze rail limit, date formatting/null.
- Backend: rename draft, rename frozen (metadata only; valuation unchanged),
  rename missing/foreign → 404, PATCH still trashes, PATCH rejects empty body.
- Frontend seam: rename request shape; persistence updates the active name.
- Guards: Alpine handlers stay dotted (`$store.recipes.*`); no unbound methods.

## Out of scope

- Server-side pagination / summary projection for `GET /batches` (revisit if the
  payload grows).
- Frozen-card stat chips (OG/ABV/style).
- Template gallery (freezes are not templates).
- Firestore realtime updates.
