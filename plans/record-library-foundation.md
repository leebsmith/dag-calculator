---
title: Record Library Foundation (immutable records + copy-forward)
step: next
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: [water-chemistry-cleanup]
gate: —
status: accepted
---

# Plan 1 — Record library foundation (immutable records, copy-forward, auth, storage)

## Goal

Give record collections (equipment profiles, water reports, water targets, and future
catalogs such as cooling curves) a first-class existence: server-persisted, immutable,
per-user, authored outside the batch, and copied into a batch on selection. Then the batch
holds its own values and the library is off its read path.

## Non-goals

- Water-chemistry semantics cleanup (ion roots, calcium floor, RO seeds, SO4:Cl readout) —
  Plan 2.
- Cooling curves themselves — they land after Plan 2 as the first catalog born onto this
  substrate.
- Style-conformance water axis — deferred (`style-water-axis-todo.md`).
- App-shell navigation — deferred (`app-shell-navigation.md`).

## Decisions already made (do not re-litigate)

- Records are immutable: create, read, delete. No update route, no optimistic concurrency,
  no conflict envelope for the library. Corrections are new records.
- Delete is hard. Batches keep their own copies, so deletion cannot damage one.
- Ownership is structural: `users/{uid}/…`. The uid comes from the verified token.
- One generic `catalog_items` collection with a `kind` discriminator.
- Server assigns ids. Server validates every component against the artifact at create.
- Seeds stay read-only bundled pseudo-records; the picker merges them with remote records.
- Batch selection copies the component forward into a `selections` snapshot; the copy is
  read-only. No override layer, no per-field revert.
- Backfill is not migration code: the normal load path materialises any selected id that
  lacks a snapshot, then persists on the next save.
- Auth: Google sign-in, build-time email allowlist, fail closed, `check_revoked=True`,
  blocked screen via `GET /session`, anonymous deleted.
- Batches move to `users/{uid}/batches/{id}`. Routes and the frontend client are unchanged.
- The library view is a sibling of the chooser inside the same shell, outside the wizard
  progress gates; the trigger lives at app level.
- No router.

## Phase 0 — commit the plans

In build mode, before any code: place these two documents in `plans/` and commit.

    Commit: "Plan the record library foundation and water cleanup"

## Phase 1 — artifact + catalog registry available to the backend

The backend has never read `data/artifact.json`, and `deploy-backend` ships only
`backend/` (`--source backend/`), so `data/` is absent in the deployed image.

- Add `data/catalogs.json`: `kind → { schema, id_field, title_field }`. This is the single
  registry shared by `frontend/src/store/userCatalog.js` (replacing `CATALOGS`) and the
  backend. No artifact grammar change, no `schema_version` bump.
- Add `backend/app/artifact.py` (new tach module, no deps): resolve the data directory from
  `ARTIFACT_PATH` → `app/_vendor/` → repo `data/`; load and cache `artifact.json` and
  `catalogs.json`; expose `validate_component(kind, component) -> list[str]` mirroring the
  JS `validateComponent` rules (declared fields only, identity field, title required,
  dimensions finite, domains, taxonomies, booleans).
- Add `app.artifact` to `backend/tach.toml` and to `app.services` `depends_on`.
- `deploy-backend`: copy `data/artifact.json` and `data/catalogs.json` into
  `backend/app/_vendor/` before `gcloud run deploy`; gitignore that directory.
- Tests: validator accepts every seed component for its kind; rejects undeclared fields,
  domain violations, taxonomy misses, missing title, wrong identity field; validates the
  committed seeds for all kinds (a Python mirror of the conformance test's purpose).

## Phase 2 — authenticated identity and allowlist

- `app/auth/deps.py`: keep `get_current_user`; return `{uid, email, email_verified, token}`;
  pass `check_revoked=True`. Add `require_allowed_user` — verified email present in
  `ALLOWED_EMAILS` (case-insensitive, read once at startup), fail closed when unset/empty.
  Every existing route switches to it.
- New `GET /session` (auth only, **not** allowlist-gated) returning
  `{uid, email, allowed}` so a blocked user can be told why.
- `tests/backend/test_auth.py`: email present/absent/unverified/not-allowlisted cases;
  `/session` reachable for a blocked user, everything else 403. `test_routes.py` gains the
  new route in its enumeration.
- Frontend: replace anonymous with Google (`signInWithPopup`, `prompt=select_account`,
  redirect fallback + `getRedirectResult`). Delete `signInAnonymously` and the auth-mode
  switch. On auth-state change call `/session`; `allowed: false` → sign out and render the
  blocked screen.
- `local-dev`: pass a dev `ALLOWED_EMAILS`; the Auth emulator's fake Google account supplies
  the email.

## Phase 3 — record store (repo, service, routes)

- `app/schemas/catalog.py`: `CatalogItemCreate { component: dict }`, `CatalogItem` record.
- `app/repositories/catalog_repo.py`: `users/{uid}/catalog_items`; list by `kind` (filter in
  memory after a `kind ==` query), get, create (`uuid4` id, `created_at`, `schema_version`),
  delete. No update.
- `app/services/catalog_service.py`: validate via `app.artifact`; 422 with structured
  details on invalid components; 404 on missing/foreign ids.
- Routes: `GET /catalog/{kind}`, `GET /catalog/{kind}/{item_id}`,
  `POST /catalog/{kind}`, `DELETE /catalog/{kind}/{item_id}`. 404 on unknown kind.
- Tests: repo scoping, create validation, delete, unknown kind, auth + allowlist enforced.

## Phase 4 — batches into `users/{uid}/batches`

- `BatchRepository`: subcollection paths; drop `uid` filtering/comparison; keep `uid` in the
  response derived from the path (not stored); remove the now-unused `FieldFilter` import.
- Rewrite `tests/backend/test_batch_repo.py`; `test_batches.py` and `test_routes.py` should
  otherwise pass unchanged. Frontend client untouched.
- Re-create the one dev recipe under the new path; re-export the emulator data.

## Phase 5 — copy-forward in the batch

- `engine/dag.js`: `selection` resolves `options.selections?.[nodeId]` first, then the
  library `references[node.schema][refValue]`.
- `engine/index.js` `createCalculator` accepts `selections`.
- `adapters/session.js`: track `selections` in state; `rebuild`/`reset` accept them; expose
  `selections()` and `setSelection(nodeId, component)`.
- `store/snapshot.js`: `draftState()` includes `selections`; `freezePayload()` relies on the
  snapshot (provenance keeps `source_template_id` only — delete the `source_revision` hash).
- Selection handler: on pick, copy the component into `selections` and set the reference
  root; on load, materialise any reference root whose snapshot is missing (normal path, no
  migration script) and mark dirty so it persists.
- `batchClient`/`DraftPayload`/`BatchRecord`: add `selections`. Bump the draft payload
  `schema_version`; frozen records store it too.
- Delete `detectDrift`, the drift UI, and `tests/frontend/drift.test.js`.
- Tests: engine resolves from the snapshot; library edits do not perturb a loaded batch;
  snapshot survives save/load/freeze; missing-snapshot materialisation.

## Phase 6 — library view and store; retire localStorage

- `store/library.js`: fetch/list/create/delete against `/catalog`; own loading and error
  state; no coupling to the wizard, the autosave queue, or the solve loop.
- `store/referenceCache.js`: `syncLibraryItems(items)` replaces `syncUserItems`; licence
  seeds and records merge as today.
- `store/userCatalog.js`: delete `persist`, `readCatalogs`, `update`, and `localStorage`
  entirely. Keep `validateComponent` only if still used by the editor; otherwise move it.
- One-time import: read `brew_user_catalog`, POST each component, then remove the key. Log
  and continue on failure; never block the app.
- `adapters/libraryUi.js` + `partials/library.html`: kind tabs, schema-generated create form
  (reuse the existing field generator incl. unit display and taxonomy selects), delete with
  confirmation, seed records listed read-only. Delete `partials/user-catalog.html` and
  `userCatalogUi.js`.
- Entry points: chooser header button (app level); "manage library" links from the pickers
  and an empty-state CTA.
- Tests: store CRUD against a stub client; field generation; seed vs record precedence; a
  failed fetch does not break a loaded batch.

## Phase 7 — docs and gates

- `docs/engine.md`: selection resolution from batch snapshots.
- `docs/dag-artifacts/semantics.md` + `seed-substrate.md`: records vs seeds vs batch state.
- `docs/adding-a-node.md` unaffected; no artifact node changes in this plan (so no
  inventory re-emit required — confirm before closing the phase).
- `README.md`: auth/deploy notes (Google provider, allowlist env var, authorized domains,
  consent-screen state).
- `make verify` green.

## Risks

- **Cloud Run artifact absence** — if Phase 1's vendoring is missed, every record create
  fails in production. Add a startup log line naming the resolved artifact path.
- **Draft payload bump vs the localStorage gate** — the record import in Phase 6 must run
  before the old blob is discarded; do not bump the *artifact* `schema_version` in this
  plan.
- **Deleted users** — `check_revoked` only affects new token verification; already-loaded
  clients keep a valid session until token refresh.

## Commit requirements

- One commit per phase, imperative subject, scoped to that phase.
- No phase is complete until `make check` and `make test` pass.
- Any artifact change carries its re-emitted `docs/dag-artifacts/inventory.md` and the
  relevant prose doc in the same commit.
- Do not combine unrelated refactors with a phase.
