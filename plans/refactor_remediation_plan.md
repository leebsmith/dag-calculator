# /plan refactor-audit-remediation

**Goal:** Address the material deficiencies, test gaps, and complexity hotspots identified in the `post-refactor-audit.md` document, establishing a cleaner separation of concerns and a comprehensive `DESIGN.md` contract.

**Execution Rules for opencode:**
1. **Atomic Commits:** Each phase must be committed separately.
2. **Continuous Green:** Before and after every file modification, `make check` and `make test` MUST pass. Do not proceed to the next step if tests are red.
3. **Shape Pins:** Run `node scripts/shape-pins.mjs` after structural changes (like extracting migrations or splitting formatters) to ensure complexity metrics ratcheted down or remained stable.
4. **Zero Call-Site Breakage:** For splits like `utils/format.js`, the public barrel API must remain identical.

---

## Phase 1: Test Relocations & Pure Unit Gaps
**Objective:** Clean up misplaced assertions and cover pure functions without changing any runtime architecture.

*   **Step 1.1: Relocate Misplaced Assertions (Audit Section 2)**
    *   *Instruction:* 
        *   Merge factory-level checks from `tests/frontend/card-layers.test.js` into `tests/frontend/catalogDraftKeys.test.js` and the assembled-app guard. Delete `card-layers.test.js`.
        *   Move the `this.` source-text scan from `tests/frontend/libraryUi.test.js` to `tests/guards/composition.test.js`.
        *   Move the "non-empty target set" invariant from `tests/frontend/water-card.test.js` to the seed-conformance suite.
    *   *Guard:* Run `make test`. Ensure total test count remains stable (~1,343).

*   **Step 1.2: Add Missing Hermetic Tests (Audit G4, G5, G6)**
    *   *Instruction:*
        *   Create unit tests for `views/import/emptySections.js` and `views/import/hopRouting.js`.
        *   Create hermetic tests with stub engines for builders in `views/producer/reportFormat.js` (`buildReportFormatted`, `buildReportTables`, `buildReportSummaries`).
        *   Create a guard test ensuring every value in `SYSTEM_NODES` (`views/registry/system.js`) resolves to a valid artifact node.
    *   *Guard:* Run `make test`.

---

## Phase 2: Core Architectural Extractions
**Objective:** Remove domain logic and state machines from the composition root and shell.

*   **Step 2.1: Extract Batch Migrations (Audit S1 / G1)**
    *   *Instruction:* Extract batch upgrade rules (`migrateAttenuationDerate`, `seedIdentityResiduals`, `materializeSelections`, `seedSugarShareParts`) out of `adapters/stepAdapter.js`.
    *   *Target:* Create `store/batchMigrations.js` containing these as pure functions receiving `{engine, master, cache, artifact}` and returning `changed` flags.
    *   *Test:* Add isolated unit tests for `store/batchMigrations.js`.
    *   *Guard:* Verify `adapters/stepAdapter.js` line count shrinks significantly. Run `node scripts/shape-pins.mjs` to confirm complexity pin compliance.

*   **Step 2.2: Extract Auth Boot (Audit S2 / G2)**
    *   *Instruction:* Extract the auth workflow (allowlist refusal, sign-out, retry, publish-user-last, legacy import) from `main.js`.
    *   *Target:* Create `adapters/authBoot.js` exporting a `createAuthBoot` factory with injected stores/clients.
    *   *Test:* Write a hermetic test for `adapters/authBoot.js` using fake stores and clients.
    *   *Guard:* Run `make test`.

---

## Phase 3: Module Splits & Complexity Reduction
**Objective:** Break down the highest-fan-in and highest-complexity modules.

*   **Step 3.1: Split `utils/format.js` (Audit Hotspot 2 / G9)**
    *   *Instruction:* Split the 514-line `utils/format.js` into dimension-specific files: `format/gravity.js`, `format/volume.js`, `format/mass.js`, `format/color.js`, `format/time.js`, and `format/text.js`.
    *   *Target:* Re-export all functions from `utils.js` (the barrel) so that no call-sites in the `cards/` or `views/` directories need to change. Move corresponding tests to match the new file structure.
    *   *Guard:* Codebase must compile without changing any `import { fmt } from '../utils.js'` statements. Run `make check`.

*   **Step 3.2: Realign Water Constraint Semantics (Audit S3 / Hotspot 3)**
    *   *Instruction:* Move the constraint model (`checkedPins`, `valuedPins`, `heldFromProfile`, preset seeding) from `cards/waterCardActions.js` to `views/waterLogic.js`.
    *   *Target:* `waterCardActions.js` should only retain `setRoot`, `compute`, and UI mutation. All derivations must be pure functions in `waterLogic.js`.
    *   *Guard:* Run `make test`. Ensure water-card complexity pins drop in `eslint.config.js` via the shape-pins script.

---

## Phase 4: Rules & Documentation
**Objective:** Codify the refactor's architectural boundaries to prevent future drift.

*   **Step 4.1: Draft `DESIGN.md`**
    *   *Instruction:* Create a root `DESIGN.md` file. Paste rules R1 through R6 exactly as defined in the `post-refactor-audit.md` executive summary. Add this file to the source-of-truth table in the README.

*   **Step 4.2: Implement Import-Direction Guard (Audit R3)**
    *   *Instruction:* Create an AST/import-graph guard test (e.g., `tests/guards/import-boundaries.test.js`) that enforces:
        *   `engine/` imports nothing above it.
        *   `views/` cannot import `store/` or `adapters/`.
        *   `store/` cannot import `adapters/`.
    *   *Guard:* Run the newly created guard test. It must pass against the current directory structure.