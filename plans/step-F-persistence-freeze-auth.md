---
title: Step F — Persistence / Freeze / Auth
step: F
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [Step D, Step E]
blocks: []
gate: multi-draft autosave + freeze reproducible; make local-dev boots emulators + uvicorn; make check/test green
status: ready
---

# Step F — Persistence / Freeze / Auth

**Goal:** a multi-draft recipe library (each autosaved — roots + collections +
overlays) plus an immutable **freeze** (full valuation + provenance), scoped
per-user via real Firebase auth. The engine stays pure; the backend is a dumb
JSON store for the browser-computed freeze.

## Locked decisions

1. **Multi-draft** — N recipes in progress; each is a batch doc with a name + `batch_id`.
2. **Autosave** — draft edits debounced (~300–500 ms) → PUT draft (roots/collections/overlays). No explicit "Save".
3. **Freeze = "save version"** — snapshots the full valuation; immutable; keeps the draft live with `parent_batch_id` lineage.
4. **Valuation is browser-computed** — the engine is JS-only, so the frontend walks `engine.topoOrder` and snapshots `get(id)` for every node; the backend only stores + enforces immutability (no Python engine).
5. **Provenance hashes reuse `canonicalize` + `sha256Hex`** (already in `engine/boundary.js`): per selection, `source_template_id` = ref value, `source_revision` = hash of the referenced seed component.

## Data model (Firestore, `batches/{id}`, uid-scoped)

- **Draft doc:** `{ id, uid, name, status:"draft", schema_version, roots:{nodeId→value}, collections:{nodeId→rows}, overlays:{selectionNodeId→{field:value}}, updated_at }`
- **Frozen doc:** `{ id, uid, name, status:"frozen", parent_batch_id, schema_version, valuation:{nodeId→value}, provenance:{selectionNodeId→{source_template_id, source_revision}}, frozen_at }`

> Draft "roots" is loose: the editable state is **roots + collections + overlays**
> (collections/overlays live outside `masterStore` today — the adapter's
> `collections`/`overlays` closures are exactly what to serialize).

## Backend (tach: `main → auth → service → repositories → schemas/database`)

- `database/firestore.py` — Admin SDK client + `get_db()` (emulator via `FIRESTORE_EMULATOR_HOST`, already in Makefile).
- `schemas/batch.py` — Pydantic: `DraftPayload`, `FreezePayload`, `BatchRecord`.
- `repositories/batch_repo.py` — Firestore CRUD (list/create/update/freeze/load).
- `services/batch_service.py` — create/rename/update-draft/freeze/load; **reject mutation of `status:"frozen"` docs**.
- `main.py` routes — `GET /batches`, `POST /batches`, `PUT /batches/{id}/draft`, `POST /batches/{id}/freeze`, `GET /batches/{id}`.
- `auth/deps.py` — real `verify_id_token` (replaces the `local-user` stub).

## Frontend

- **Auth** — Firebase Web SDK (compat/CDN, per tech-stack §2), ID token → bearer on `fetch`; sign-in gate.
- **Persistence client** — extend `adapters/apiClient.js` with batch routes.
- **Recipe panel** — menu-bar "Recipes" dropdown: list drafts + frozen, New / Rename / Open / Freeze.
- **Autosave** — debounced serialize `{roots, collections, overlays}` → PUT draft (reuses the deferred debounce).
- **Freeze** — walk `topoOrder` → valuation + provenance hashes → POST; keep draft live.
- **Restore** — draft: load roots/collections/overlays → store + recompute. Frozen: read-only view; "Edit" forks into a new draft (`parent_batch_id`).

## Sub-milestones (auth first)

- **F-a — Auth** (first): Firebase Web SDK sign-in + backend `verify_id_token`; enforce bearer on `/solve/*` too.
- **F-b — Persistence seam**: draft CRUD + debounced autosave (roots+collections+overlays) against the real `uid`.
- **F-c — Freeze**: valuation + provenance + immutability + lineage.
- **F-d — Frontend UX**: recipe list + New/Rename/Open/Freeze + restore flows.
- **F-e — Drift reconcile** (deferred/optional): on open, compare `source_revision` vs current seed hash → reset-to-seed / keep-custom.

## Completion

- [x] F-a Auth — sign-in + `verify_id_token`; `/solve/*` bearer enforced
- [x] F-b Persistence — draft CRUD + debounced autosave (roots+collections+overlays)
- [x] F-c Freeze — valuation + provenance + immutability + lineage
- [ ] F-d UX — recipe list + New/Rename/Open/Freeze + restore
- [ ] F-e Drift reconcile — reset-to-seed / keep-custom (optional)

## Acceptance / gate

- `make local-dev` (emulators + uvicorn + Vite): sign in, create two drafts, edit both, reload, both restore exactly.
- Freeze a draft → frozen doc immutable (backend rejects PUT); edit draft afterward → new lineage.
- `make check` (ruff + tach) and `make test` green (pytest offline via `dependency_overrides` mocking `get_db`/`get_current_user`; frontend store tests for debounce + freeze payload).

## Risks

- **Draft-state completeness** — forgetting collections/overlays in the draft would silently drop user edits (explicit `serializeDraft` test).
- **Immutability** — a single "reject frozen writes" guard must be centralized in the service, not per-route.
- **Valuation drift** — freeze must snapshot against the *current* `schema_version`; loading an old frozen batch against a newer artifact needs the drift path (F-e).

## Program context

A → B → C ‖ D → E → **F**; Step G parallel (seed/schema conformance).
