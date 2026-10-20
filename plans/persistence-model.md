---
title: Continuous-Sync Persistence Model (Google-Docs style)
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: chooser landing + client-UUID draft + inline title + trash/restore/permanent-delete (M1), on-blur recalc + debounced push + optimistic-concurrency guard (M2); lint + tests green
status: in-progress
---

# Continuous-Sync Persistence Model

Adopt the Google-Docs document model for recipe (batch) persistence, wholesale
and cleanly: always-in-a-document, continuous autosave, inline title rename,
Move-to-Trash. Reject the MS-Office metaphor (no Save/Save As, no scratch, no
dirty flag, no discard dialogs). The one domain-only exception is **Freeze** —
an immutable snapshot with fork-to-edit and drift detection — which has no
Google analog and is already implemented (spec §4, unchanged).

## Milestones

- **M1 — Identity & lifecycle (spec §1)** — implement now.
- **M2 — Sync correctness (spec §2.1 + write-side LWW guard)** — implement now.
- **M3 — Realtime cross-tab/multi-device (spec §2.2)** — deferred.
- **M4 — Offline resilience (spec §3)** — deferred.

## M1 — Identity & lifecycle

### Landing "New / Choose" + ephemeral identity (§1.1)

- Sign-in lands on a **chooser** (recipe list + New), not the editor.
- "New" generates a client-side UUID (`crypto.randomUUID()`) and enters the
  editor **without writing a blank record**. The first write happens on the
  first actual edit (upsert-on-first-change).
- Navigating back before any edit abandons the UUID (no zero-byte row).

### In-place rename (§1.2)

- Borderless title input in the editor header, placeholder "Untitled recipe".
- Title is ordinary mutable data, decoupled from the UUID (duplicate titles
  allowed — Firestore has no name constraint).

### Move to Trash (§1.3)

- "Move to Trash" in the editor: set `trashed: true`, flush immediately
  (bypass debounce), route back to the chooser. If the doc was never persisted,
  just abandon the UUID.

### Trash recovery & permanent delete (§1.4)

- Chooser Trash view lists `trashed == true`; each row offers Restore
  (`trashed: false`) and Delete Permanently (hard `DELETE`).

### Backend

- `PUT /batches/{batch_id}` — idempotent upsert (client-owned id). Frozen docs
  reject upsert (409).
- `PATCH /batches/{batch_id}` — `{trashed: bool}` trash/restore.
- `DELETE /batches/{batch_id}` — permanent delete.
- `POST /batches` removed; fork also uses the upsert route with a client UUID.
- `BatchRecord` gains `trashed: bool = False`; `batch_repo` `upsert`,
  `set_trashed`, `delete`; `create` switches from `.add()` (auto-id) to
  `.document(id).set()`.

### Frontend

- `store/persistence.js`: `active` gains `persisted` + `trashed`;
  `createUntitled()` (no network); `queueSave` upserts on first write then
  updates; `renameActive(name)` (no prompt); `trashActive`/`restore`/
  `deletePermanent`.
- `adapters/batchClient.js`: `upsertBatch`/`setTrashed`/`deleteBatch`.
- `main.js`: `recipes.view` (`chooser` | `editor`); remove auto-open-most-recent
  and prompt-based Rename; wire trash/restore/delete/back.
- `index.html`: chooser view (New, active list, Trash view) + editor view with
  inline title and Move-to-Trash; remove the Recipes popover.

## M2 — Sync correctness

### On-blur batching (§2.1)

- `edit()` (`@input`) mutates the raw root + reactive display only — **drop
  `notify()`** (stepAdapter.js:554).
- `commitField()` (`@change`/blur, stepAdapter.js:576) clamps the envelope,
  `scheduleSolve()` + `notify()` → debounced push.
- Normalize every editable partial so all fields carry `@input` (live) **and**
  `@change` (commit). `@input`-only fields get a commit handler.
- `queueSave`'s 400ms debounce is the push debounce. Draft payload is inputs
  only (final at blur); the "fully resolved payload" clause applies to freeze
  (already synchronous in `freezePayload()`).

### Optimistic-concurrency write guard (LWW prevention)

- `DraftPayload` gains `base_updated_at: float | None = None`.
- Backend `upsert`/`update` run in a **Firestore transaction**: compare stored
  `updated_at` to `base_updated_at`; mismatch → 409 with the current record.
  First write (null baseline) creates.
- Frontend `queueSave` sends last-observed `updated_at`; on 409 refetches and
  re-hydrates/merges (full merge UX lands in M3).

### UX tradeoff

Recalc moves to blur, so readouts (SRM/ABV/strike temp…) update on blur, not
live mid-keystroke — exactly §2.1. Implemented as specified.

## M3 — Realtime cross-tab/multi-device (deferred)

Browser Firestore `onSnapshot` subscription (decision: browser-direct). Adds the
Firestore SDK to the browser bundle + security rules. Re-hydrate on newer
`updated_at`; reconciles with the M2 write guard. Doc shape stays additive.

## M4 — Offline resilience (deferred)

`navigator.onLine` "Reconnecting…" blocking overlay; IndexedDB write-ahead
before debounce; flush-conflict via `updated_at` baseline comparison (§3.3).

## Cross-milestone constraint

Firestore doc shape stays additive and stable so M3 can consume it:
`id`, `uid`, `name`, `status`, `trashed`, `roots`, `collections`,
`schema_version`, `parent_batch_id`, `valuation`, `provenance`, `created_at`,
`updated_at`. M1 introduces only `trashed`; no field renames.

## Files

- **Backend**: `app/schemas/batch.py`, `app/repositories/batch_repo.py`,
  `app/services/batch_service.py`, `app/main.py`.
- **Frontend**: `store/persistence.js`, `adapters/batchClient.js`, `main.js`,
  `index.html`, step/editor partials.
- **Tests**: `tests/backend/test_batches.py`, `tests/frontend/persistence.test.js`.

## Verification

- M1: chooser landing; New → UUID (no blank row); abandon-before-edit; inline
  rename; Move-to-Trash → `trashed:true` + route back; restore/permanent-delete.
- M2: blur-gated recalc + push; stale `base_updated_at` → 409 + current record;
  matching baseline → success; frontend 409 handler refetches.
- `make test` + `make check` green.

## Staging (one commit per step)

- **P.1** Plan (this file). *commit: record the persistence-model plan*
- **P.2** M1 backend: schema + repo + service + routes.
  *commit: add batch upsert, trash, and permanent-delete routes*
- **P.3** M1 frontend: persistence + client + chooser/editor UI.
  *commit: add chooser landing, inline title, and trash to the client*
- **P.4** M2 backend: optimistic-concurrency guard.
  *commit: guard draft writes with an optimistic-concurrency check*
- **P.5** M2 frontend: on-blur batching.
  *commit: gate recalc and autosave on blur*

## Out of scope (this pass)

- M3 realtime subscription (Firestore onSnapshot).
- M4 offline overlay + IndexedDB write-ahead.
- Renaming the concept from "batch" to "recipe" in backend code/API (UI says
  "recipe", code/API keeps "batch").
