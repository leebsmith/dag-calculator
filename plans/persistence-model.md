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

### On-blur batching (§2.1) — DEFERRED

The existing 300ms recalc / 400ms autosave debounce already coalesces keystrokes,
so recalc and push do not thrash and match the "continuous save" Google model
more closely than a strict blur gate. Moving `notify()` off the shared `edit()`
path is a cross-partial refactor (number/text inputs vs. select `@change` vs.
range sliders all route through it) that risks regressions without visual
verification. Deferred to a follow-up; the write path is already debounced and
correct.

### Optimistic-concurrency write guard (LWW prevention)

- `DraftPayload` gains `base_updated_at: float | None = None`.
- Backend `upsert_draft` compares stored `updated_at` to `base_updated_at`;
  mismatch → `BatchConflictError` → HTTP 409 `{code: "CONFLICT"}`. First write
  (null baseline) creates.
- Frontend `saveNow` sends last-observed `updated_at`; on 409 refetches and
  re-hydrates from the latest remote state (full merge UX lands in M3).

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
- **P.4** M2: optimistic-concurrency guard (backend compare + frontend 409 refetch).
  *commit: guard draft writes with an optimistic-concurrency check*
- **P.5** M2: on-blur batching (deferred — see §2.1).

## Out of scope (this pass)

- M3 realtime subscription (Firestore onSnapshot).
- M4 offline overlay + IndexedDB write-ahead.
- Renaming the concept from "batch" to "recipe" in backend code/API (UI says
  "recipe", code/API keeps "batch").
