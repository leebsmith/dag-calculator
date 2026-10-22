---
title: Water Pin Visibility, Profile Intent, and the Solver Test Matrix
step: next
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [water-chemistry-cleanup]
blocks: []
gate: make verify
status: executed
revision: 1
revised: 2026-10-22
supersedes: —
---

# Plan — Water pin visibility, profile intent, and the solver test matrix

## Why

A first-visit user opened the water step, applied `hoppy-ipa`, and saw a
Target column of six em dashes while the panel above showed six populated
targets. Three separate defects produced that screen:

1. **A vocabulary mismatch.** `frontend/src/adapters/cards/water.js` keys rows
   by report ids (`sulfate_so4`) and compares them against the router's short
   ion ids (`so4`), so `pinned.has(ion)` is always false. Every row renders
   `targetText: "—"`, `deltaText: "—"`, `status: "Auto"` in every mode. The
   solver was correct: sulfate landed on exactly 250 ppm and chloride on 50.
2. **Profiles declare contradictory intent.** `data/seeds/water_target_profiles.json`
   gives each profile a full six-ion vector *and* a `mode`. The mode wins, so
   four of the six stored targets are silently inert. Applied profiles seed
   `water.strategy` from `mode` (`seedDerivations.js`), which is why the screen
   opened on Flavor Balance without a click.
3. **Nothing tested the projection.** Numeric parity and the seam contract pass;
   the only card-level tests cover `kettleBlend` and the brew-day copy. There is
   no test that a pinned ion renders a target, and no test matrix across beers,
   waters, or solver settings.

The fix is not one line. The row model must be derived from a single ion
registry, profiles must stop carrying targets their mode discards, and the
solver's routing/constraint surface needs coverage that would have failed this
screen *and* would catch its cousins.

## Decisions (locked in review)

| # | Decision |
|---|---|
| 1 | Grid vocabulary: a targeted ion shows its value and signed Δ; a floated ion shows `(Auto)`; status is `Target` or `Auto` for now. |
| 2 | Profiles carry **only the ions their mode targets**; `mode` stays as authored metadata. Applying a profile writes `water.strategy = AUTO`. |
| 3 | Profile change **resets** every profile-derived root to its artifact default, then applies. Explicit application is destructive (matches copy-in). |
| 4 | Mode 5 pins are capped at **1–4**. The cap is necessary, not sufficient: a pin the source already meets forbids every salt that adds it, which is a per-target infeasibility the modal must not promise against. |
| 5 | The empty-pin fallback in `_solve_dynamic_sparse` is **deleted**. AUTO that cannot classify resolves to **Mode 3** (best fit); explicit `CUSTOM` with no pins raises `PINNED_IONS_REQUIRED`. |
| 6 | Labels distinguish **held** (hard equality), **best fit** (least squares), and **float**. Mode 3 reads "all six, best fit", never "pins all six". |
| 7 | Source of truth for pin sets: the presentation registry in `views/registry/water.js`, pinned against the backend router by a generated fixture. No artifact change; no new response field. |
| 8 | Coverage: invariant sweep + routing truth table + card sweep + recipe smoke in `make test`; seeded fuzz behind `make test-fuzz` with `CASES`/`SEED`. No goldens. |
| 9 | Feasibility is declared per scenario (`tolerance_ppm` or `expect_telemetry`), never as a global tolerance. |

## Non-goals

- Artifact-declared routing table (would require non-scalar `constants`; logged
  in `TODO.md` as a follow-up).
- The richer status chips in `docs/adsco/ui.md` (Exact / Floor / Buffer /
  Floating / Compromise / Below-buffer) — deferred, logged in `TODO.md`.
- Selector option labels for the other seven unlabelled choice nodes; same class
  as this work, deliberately split into its own change (logged in `TODO.md`).
- Kettle-weighted solver outputs; grist ions; metabisulfite modelling.

## Constraints discovered against the current tree

| Constraint | Consequence |
|---|---|
| `tests/guards/presentation-ids.test.js` — cards must not hardcode artifact paths | Row paths stay registered in `views/registry/water.js`; the adapter derives from the registry, not from literals. |
| `tests/guards/option-labels.test.js` — exact coverage for labelled choices | `water.strategy` labels stay out of scope unless its `optionLabels` are completed for all seven members. |
| `tests/guards/stub-outputs.test.js` — declared ⊆ stub keys | Safe: no new boundary output is introduced. |
| `tests/backend/conformance/test_boundary_outputs_match_response_fields.py` — declared outputs == response fields minus `ALLOW` | Confirms the response-field route is a contract change; avoided by decision 7. |
| `tests/conformance/boundary-fixtures.test.js:WATER_VALUES` — hard-codes the sample water request and throws on unexpected paths | Seed/profile edits do not touch it; solver-signature edits must not either. |
| `tests/backend/test_water_solver.py:test_error_surface_complete` — exact `WaterSolverErrorCode` set | `PINNED_IONS_REQUIRED` must be added to the enum **and** the expected set in the same commit. |
| `backend/app/schemas/boundary.py` + `assert_field_parity` at import | `max_length=4` on `custom_pinned_ions` is wire-compatible; do not rename fields. |
| `frontend/src/adapters/fieldActions.js:copyInCascade` is additive and also runs for the source-report picker | The reset must be scoped to `water.target_profile`; resetting to an artifact default requires the default to be a primitive (it is: `0`, `50`, `"AUTO"`). |
| `tests/guards/determinism.test.js` (A9) | Reset-then-apply must be a pure sequence of `setRoot` calls; no provenance flags. |
| `docs/adsco/README.md` — vendored specs are design inputs, frozen; divergence is recorded in `plans/adsco-contract.md` | Do **not** edit `boundary-deltas.md`, `style-selection-and-ion-entry.md`, or `required-solver-telemetry-messages.md`. |
| No `data/artifact.json` change | `emit-artifact-inventory.mjs` is not required; `artifact-docs-sync` stays quiet. Say so in the commits. |

## Phases

### Phase 1 — Row model from one ion registry (the reported bug)

- `views/registry/water.js`: add `WATER_IONS` — per ion: report key, solver/pin
  key, label — plus `pinnedIonsFor(mode, custom)` moved beside it so the adapter
  has no ion tables.
- `adapters/cards/water.js`: `IONS`, `SOURCE_ION`, `PIN_ION` deleted; rows derive
  from `WATER_IONS`. Floated target renders `(Auto)`.
- `tests/frontend/water-card.test.js`: regression — in `CALCIUM_FLOOR`, sulfate
  and chloride carry the target and a numeric Δ; the other four render `(Auto)`;
  in `BASELINE` all six are `(Auto)`.

### Phase 2 — Profiles declare intent; profile change resets

- `data/seeds/water_target_profiles.json`: flavour profiles drop Ca/Mg/Na;
  `soft-pilsner` keeps all six. `mode` retained.
- `views/seedDerivations.js`: `water.strategy` derives `"AUTO"`; `water.target.*`
  and `water.calcium_floor_ppm` unchanged.
- `adapters/fieldActions.js`: `copyInCascade` resets the derived roots to their
  artifact defaults before applying the new component (scoped per selection).
- Tests: seeding a profile yields exactly its authored ion set, `AUTO` strategy,
  and a derived mode equal to the authored `mode` (via the Phase 4 fixture);
  switching `soft-pilsner → hoppy-ipa` clears the four absent ions.

### Phase 3 — Pin cap, honest empty state

- `backend/app/schemas/boundary.py`: `custom_pinned_ions` gains `max_length=4`.
- `backend/app/core/water.py`: empty-pin fallback deleted; AUTO fall-through
  returns `MODE_3`/`OPTIMIZE`; explicit CUSTOM with no pins raises
  `PINNED_IONS_REQUIRED`; a telemetry NOTE records the AUTO→Mode 3 resolution.
- `backend/app/schemas/boundary.py`: add the error code; update
  `test_error_surface_complete`.
- Water card + `partials/water-pins-modal.html`: fifth pin disabled with the
  "up to four; the rest float" note and the no-promise caveat. Named helpers —
  no predicates or assignments in the template.
- Tests: schema rejects five pins; AUTO with an unclassifiable vector resolves
  to OPTIMIZE and doses; explicit CUSTOM with no pins errors with the new code.

### Phase 4 — The matrix

- `tests/backend/conformance/test_water_routing.py`: exhaustive AUTO truth table
  (2^6 target subsets × pin shapes), pinning each expected `(mode, canonical)`.
- `tests/conformance/fixtures/ion-constraints.json` + a pytest that regenerates
  and `--check`s it (`UPDATE_FIXTURES=1` to write): canonical mode → pin set,
  including the CUSTOM/collection row.
- `tests/conformance/fixtures/water-scenarios.json`: pairwise covering array over
  beer (bucket/colour/mass/thickness), water (RO → highly mineralised), and
  settings; self-guard asserts every level and every pair appears.
- `tests/backend/conformance/test_water_matrix.py`: invariants only — non-negative
  and finite, dose reapplication reproduces the ion vector, pinned ions hit their
  target unless the case declares `tolerance_ppm` or `expect_telemetry`, Ca floor
  honoured or explained, PROPORTIONAL/MASH_ONLY vessel rules, acid/agent
  exclusivity, residual HLT, determinism.
- `tests/frontend/water-card.test.js`: card sweep across the six modes — numeric
  target rows equal the pin set exactly, no unexplained `(Auto)`.
- `tests/conformance/emit-default-requests.mjs` + `test_recipe_smoke.py`: six
  recipes (pilsner → imperial stout) through the real adapter and solvers.
- `make test-fuzz`: invariant-only seeded search, `CASES`/`SEED` overridable,
  excluded from `verify`.

### Phase 5 — Labels and docs

- `views/producer/projection.js`: reference-picker `optionLabels` from the
  component `name` plus the derived constraint summary; option tag + hint
  sentence per decision 6.
- Docs: `plans/adsco-contract.md` (new locked decisions; amend decision 5 to
  distinguish vector-derived routing from mode-driven pinning),
  `docs/adsco/ui.md` (locked; grid semantics, modal note, vocabulary),
  `docs/adsco/README.md` (ui.md + contract as the operative layer),
  `docs/dag-artifacts/seed-substrate.md` §2.5 (profile shape, `mode` metadata),
  `README.md` (`make test-fuzz`), `tests/backend/conformance/README.md` (matrix).

## Gates

Per phase: `make check` then `make test`. Phase completion: `make verify`.
No artifact change, so no inventory re-emit.
