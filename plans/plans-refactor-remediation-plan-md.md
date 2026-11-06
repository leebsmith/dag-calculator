# Refactor remediation — post-audit structural follow-through

**Goal:** Resolve the material deficiencies, test gaps and complexity hotspots identified in
`post-refactor-audit.md`, and codify the architecture in a root `DESIGN.md`.

**Source:** `@plans/refactor_remediation_plan.md `

**Rules:** one commit per phase; `make check` + `make test` green at every phase boundary;
`node scripts/shape-pins.mjs` after structural change; the `utils.js` barrel API is frozen.

---

## Phase 1 — Test relocations and pure unit gaps

- [x] **1.1 Relocate misplaced assertions**
  - [x] Merge the factory-surface checks from `tests/frontend/card-layers.test.js` into
        `tests/frontend/catalogDraftKeys.test.js` (catalog/chrome factories) and
        `tests/guards/installer-contract.test.js` (remaining card factories + cooling picker).
  - [x] Delete `tests/frontend/card-layers.test.js`.
  - [x] Move the `this.` source-text scan from `tests/frontend/libraryUi.test.js` into
        `tests/guards/composition.test.js`.
  - [x] Move the "every shipped water profile declares a non-empty target set" invariant from
        `tests/frontend/water-card.test.js` into `tests/conformance/seed-conformance.test.js`.
  - [x] Gate: `make check`, `make test` (total count stable at ~1,343), `node scripts/shape-pins.mjs`.

- [x] **1.2 Add missing hermetic tests (audit G4, G5, G6)**
  - [x] Hermetic tests for `views/import/emptySections.js` and `views/import/hopRouting.js`.
  - [x] Hermetic tests for `buildReportFormatted`, `buildReportTables`, `buildReportSummaries`
        in `views/producer/reportFormat.js`, with a stub engine/catalog.
  - [x] Guard that every `SYSTEM_NODES` value in `views/registry/system.js` resolves to a node
        in `data/artifact.json`.
  - [x] Gate: `make check`, `make test`, `node scripts/shape-pins.mjs`.
  - [x] Commit: `Relocate misplaced assertions and cover pure gaps`

## Phase 2 — Core architectural extractions

- [x] **2.1 Extract batch migrations (S1 / G1)**
  - [x] Create `frontend/src/store/batchMigrations.js` with pure functions:
        `seedSugarShareParts`, `migrateAttenuationDerate`, `seedIdentityResiduals`,
        `materializeSelections`, each receiving `{ engine, master, cache, artifact, setRoot, ... }`
        and returning a changed flag.
  - [x] Delegate from `adapters/stepAdapter.js`; keep `loadState` ordering and behaviour identical.
  - [x] Add `tests/frontend/batch-migrations.test.js`.
  - [x] Lower/remove shape pins in `eslint.config.js` in the same commit.
  - [x] Gate: `make check`, `make test`, `node scripts/shape-pins.mjs`.
  - [x] Commit: `Extract batch migration rules from the composition root`

- [x] **2.2 Extract auth boot (S2 / G2)**
  - [x] Create `frontend/src/adapters/authBoot.js` exporting `createAuthBoot({ authClient, stores,
        appHandle, persistence, reportError })` with `applyAuth`, `refreshSurfaces`,
        `refreshWithRetry`.
  - [x] Rewire `main.js` through the factory; preserve publish-user-last and one-time legacy import.
  - [x] Add `tests/frontend/auth-boot.test.js` with fake stores/clients.
  - [x] Gate: `make check`, `make test`, `node scripts/shape-pins.mjs`.
  - [x] Commit: `Extract the auth boot workflow from the shell`

## Phase 3 — Module splits and complexity reduction

- [ ] **3.1 Split `utils/format.js` (hotspot 2 / G9)**
  - [ ] Create `frontend/src/utils/format/{gravity,volume,mass,color,time,text}.js`.
  - [ ] Re-export every function from `frontend/src/utils.js`; no call site changes.
  - [ ] Move `tests/frontend/utils.test.js` coverage to per-group test files; keep a barrel smoke test.
  - [ ] Update/remove `utils/format.js` pins in `eslint.config.js`.
  - [ ] Gate: `make check`, `make test`, `node scripts/shape-pins.mjs`.
  - [ ] Commit: `Split the display formatters by dimension`

- [ ] **3.2 Realign water constraint semantics (S3 / hotspot 3)**
  - [ ] Move `checkedPins`, `valuedPins`, preset seeding and the checked/valued invariant to
        `views/waterLogic.js` as pure functions.
  - [ ] Leave `waterCardActions.js` with mutation/UI seams only.
  - [ ] Lower the water complexity pins in `eslint.config.js` in the same commit.
  - [ ] Gate: `make check`, `make test`, `node scripts/shape-pins.mjs`.
  - [ ] Commit: `Move the water constraint model into the view layer`

## Phase 4 — Rules and documentation

- [ ] **4.1 Draft `DESIGN.md`**
  - [ ] Add root `DESIGN.md` with rules R1–R6 from the audit, each with its enforcing guard.
  - [ ] Add `DESIGN.md` to the README source-of-truth table.
  - [ ] Gate: `make check`, `make test`.
  - [ ] Commit: `Codify the frontend architecture rules`

- [ ] **4.2 Implement the import-direction guard (R3)**
  - [ ] Add `tests/guards/import-boundaries.test.js`:
        `engine/` imports nothing above it; `views/` never imports `store/` or `adapters/`;
        `store/` never imports `adapters/`.
  - [ ] Gate: the new guard plus `make check`, `make test`.
  - [ ] Commit: `Guard the frontend import direction`

## Final

- [ ] `make verify` (check + test + production build).
- [ ] Archive this plan to `plans/archive/2026-11/` and commit.
