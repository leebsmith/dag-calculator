# Optimize local testing

Status: **in progress**. Reshaped 2026-10-29 for goal-driven execution; Phases 0–3
landed 2026-10-29, Phases 4–6 proposed. Target machine: ASUS NUC6i3SYH —
Intel i3-6100U (2 physical cores / 4 threads), 2.3 GHz, 8 GB. Every baseline
number below was measured on this box on 2026-10-29; none is extrapolated.

## 0. Execution model

This plan is executed as a sequence of goals, one per row of the map in §0.1,
not as one sitting. Each goal runs in a fresh session on the build agent. A
session's goal reviewer sees only that session's transcript, so the objective
quotes the phase's **Goal contract** rather than assuming the plan was read:

> Land Phase N of `plans/optimize-local-testing.md`. Its Goal contract is the
> scope; read it first. Stop at that phase's commit and do not start the next
> phase. No dependency changes, no test deleted or weakened, `make test` stays
> the full gate, and do not push.

Rules that hold for every goal:

1. **A gate is a recording, not a threshold.** Run the command, show the output,
   append the measured numbers. The figures in §5 are predictions and never
   pass/fail criteria; a goal that chases a wall-clock number chases noise on a
   two-core box.
2. **One commit per phase**, subject taken verbatim from the contract. Phase 4
   commits once per group.
3. **The plan is the audit trail.** Append the phase's Landed note (§0.2) in the
   same commit as the work.
4. **Stop at the commit.** The next phase is a new session and a new goal.
5. **A blocked goal names its conflict.** If the gate cannot pass without
   breaking a locked decision in §2, stop and say which one.
6. **Iterate narrow, gate wide.** Once Phase 1 lands, a goal uses `make quick`
   during iteration and `make test` at its commit. Before Phase 1 lands, use
   `make check` plus the suites it is changing.

### 0.1 Goal map

| Goal | Phase | Commit subject | Precondition |
|---|---|---|---|
| 1 | 0 Ledger | `Add a test-cost ledger` | none |
| 2 | 1 Quick loop | `Add the local quick loop: check, then the affected suites` | Goal 1 |
| 3 | 2 Concurrency | `Run the frontend suites at the measured concurrency` | Goal 2 |
| 4 | 3 Memoized cold start | `Validate and graph-build the artifact once per process` | Goal 3 |
| 5–15 | 4 Reset instead of rebuild, one group per goal (§3.5) | per group | Goal 4 |
| 16 | 5 Backend serial work | `Compile the report once per paper in the backend suite` | Goal 15 |
| 17 | 6 Re-measure and record | `Record the local-testing numbers` | Goal 16 |

Goals 1 and 2 are small and sequential; running them back to back in one session
is fine as long as the two commits stay distinct. Every other goal starts fresh.

### 0.2 Landed note

Each phase carries a `Landed.` line, appended by the goal that lands it:

```text
Landed <date> — `<sha>`
| Gate | Before | After |
|---|---|---|
| <command> | <measured> | <measured> |

Deviations: <what changed against this plan, or "none">
Coverage: frontend <a> → <b>; backend <c> → <d>
```

No phase is closed until its note exists. Goal 17 reads those notes to write the
closing summary, so their shape is fixed.

### 0.3 Corrections to the shape of the work

Measured against the tree while reshaping; these replace assumptions that would
otherwise be invented mid-run.

- **The harness helper is `createTestApp()`**, imported by 34 frontend suites;
  `teardown()` lives on the adapter (`frontend/src/adapters/stepAdapter.js`) and
  already resets the runner, the session, the input drafts, and recomputes.
  Phase 4 adds `sharedTestApp()` and `withFreshApp()` around it. There is no
  `freshApp()` today: the read-only suites convert first, and suites that open
  drawers or dialogs keep a per-test `createTestApp()` call.
- **41 suites boot an app**: 34 frontend, 6 guards, 1 conformance. The plan's
  "288 tests in 41 suites" is exact; the cost lives in those 41, not in the 153
  files.
- **`scripts/run-tests.mjs` always discovers** `tests/frontend`,
  `tests/conformance` and `tests/guards`. A file-list mode is new behaviour with
  its own refusal semantics, not a flag pass-through, and `make test` shells
  `npm test`, which calls that runner.
- **Node's test concurrency defaults to available parallelism minus one** —
  three here — which is why the measured optimum, 12, is three times it.
- **The pre-push refusal test is not goal-able.** Proving the hook blocks a red
  push needs a deliberately red tree; a goal must not manufacture one. Phase 1
  commits the hook; §7 keeps the demonstration.

## 1. Why — the measured baseline

| Gate | Today |
|---|---|
| `make check` | 9.9 s |
| `make test` | **56.9 s** |
| `make build` | 2.4 s |
| `make verify` | ≈ 70 s |

| Suite | Files | Tests | Serial (1 core) | Wall |
|---|---|---|---|---|
| Frontend (incl. conformance, guards) | 153 | 949 | 85.9 s | 30–35 s |
| Backend | 24 | 697 | — | 18–23 s |

The cost is set-up per test, not test count. 949 test names, 949 distinct: the
suite is dense, not duplicated.

- **App boot dominates.** `createTestApp()` 20–35 ms plus `boot()` 40–62 ms
  (because `boot()` runs a full stub solve) ≈ **80–95 ms per boot**. 288 tests in
  41 suites boot an app: 153 ms/test versus 63 ms/test elsewhere.
- **Process start-up.** 153 files × ~120 ms ≈ 18 s serial; the guard suite alone
  is 58 files of 1–11 tests each.
- **Repeated cold work.** Every engine build re-runs artifact validation (8.4 ms)
  and the graph build (~2 ms). `session.reset()` rebuilds the engine, so the same
  cost is paid again on every teardown.
- **Oversubscription is faster.** These tests are latency-bound: concurrency 12
  runs the frontend suite in 26.5 s versus 35.5 s at the default 3.
- **Parallel stacks do not help here.** Frontend and backend together took 44.6 s
  against ~53 s sequential, with both slowing down: two physical cores, no headroom.
- **Fan-out of an agentic edit.** Median source module is reachable from 11 test
  files; a random 12-file change touches **~24 of 153 test files (16%)**. Central
  files are worse: `units.js` → 46, `producer.js` → 17, `cell.js` → 21.

So the loop is the lever, the gate is not: an agentic iteration that fails (most
of them) can stop after ~20 s instead of 57 s, and the full suite runs once, at the
end, when the work is claimed green.

## 2. Decisions (locked)

1. **Two lanes, one name for the gate.** `make quick` is the local loop (`make
   check` then the affected suites); `make test` stays the full gate and is never
   renamed to point at the fast lane. CI keeps running `make test`.
2. **`make check` runs first, always.** It is 10 s and catches lint, shape pins,
   documentation claims and repo hygiene; on two physical cores that is the
   cheapest failure signal available. `make quick` builds this in so nobody has to
   remember it.
3. **The affected lane is a pre-filter, never evidence.** A change is not done
   until `make test` is green. A pre-push hook runs it, so "loop green" cannot
   quietly become "only loop".
4. **Fall back to the full suite whenever the mapping can under-run**: artifact,
   seeds, configs, the test harness, the Makefile.
5. **No new dependencies.** `pytest-xdist` is deferred; if it is ever added it is
   its own decision with its own commit.
6. **No test deletion.** Merge files and share fixtures; every assertion survives.
7. **Concurrency is a measured constant**, not a guess: 12 on this box, overridable.
8. **Gates record, they do not threshold.** Each phase states what to run and
   what to show; §5's numbers are predictions. A regression is a lower number in
   the next note, not a failed goal.

## 3. Phases

Each phase is independently committable and green. Numbers under **Predictions**
are to be replaced with measured ones in the Landed note.

### 3.1 Phase 0 — Ledger (½ h)

**Goal contract**

| Field | Value |
|---|---|
| Preconditions | none |
| Owns | `scripts/test-cost.mjs` (new) |
| Done when | The script prints per file: wall time, test count, whether the suite boots an app; then totals and a summary line. It runs from the repo root under `make check`'s lint contract. |
| Evidence | The script's full output on the current tree, and the same output captured as the baseline in this phase's Landed note. |
| Out of scope | Changing tests, the harness or the Makefile; any optimization. |
| Blocked if | No per-file timing can be obtained without adding a dependency; stop and say so. |
| Commit | `Add a test-cost ledger` |

**Work.** One command, run before and after every later phase, so the program is
audited against one measurement rather than seventeen opinions. Also capture
`make coverage` (frontend and backend) once, as the preservation baseline.

**Landed.** 2026-10-29 — `Add a test-cost ledger` (a note cannot carry the sha of
the commit that contains it; `git log --grep "Add a test-cost ledger"` finds it).

| Gate | Before | After |
|---|---|---|
| `node scripts/test-cost.mjs` | — | 153 frontend files (949 tests, 41 boot an app, 46.6 s serial) + 51 backend files (698 tests, 21.3 s wall); 68.0 s, exit 0 |
| `make check` | 9.9 s (§1) | 8.5 s |
| `make test` | 56.9 s (§1) | 56.1 s (frontend 949 pass; backend 697 pass, 1 skipped) |
| `make coverage` (frontend) | — | 96.06 % lines, 86.51 % branches, 91.31 % functions |
| `make coverage` (backend) | — | 96 % of 3207 statements, 118 missed |

Deviations:

- **The backend lane is in the ledger.** Phase 5 reads backend wall time from
  this script and §1 records a backend row, so a frontend-only ledger would leave
  that phase without an instrument. Backend rows are each file's pytest testcase
  time, summed from one JUnit XML run; per-module wall time needs a pytest
  plugin, and a plugin is a dependency — the contract's blocked-by condition. The
  suite wall (`21.3 s`) is measured around the run, and the difference to the row
  sum is process start plus collection shared by every file.
- **Frontend rows are one process per file** (`node --test-reporter=tap <file>`),
  serial, so a row is that file's own cost: module import, app boot and its
  tests. The plan's "Serial (1 core) 85.9 s" came from one runner at
  `--test-concurrency=1`, which also pays the shared runner parent; the ledger's
  serial total (46.6 s) is a different instrument and not comparable to it.
- **The ledger is noisy on this box.** The same tree measured 65.7 s, then
  48.5 s, then 46.6 s for the frontend lane while a background load average of
  about 3.0 held the box. Later phases compare rows, and repeat a run when a row
  moves against the direction the change predicts.
- **Baseline output**, the exact run recorded above (`node
  scripts/test-cost.mjs`, both lanes, against this commit's script):

```text
frontend suites: 153 files, one process each, serial
     ms  tests  boot  file
    118     11  -     tests/frontend/apiClient.test.js
    118      3  -     tests/frontend/artifact-functions.test.js
    107      9  -     tests/frontend/ast.test.js
    164      3  -     tests/frontend/attenuation-above-cap.test.js
     95      2  -     tests/frontend/attenuation-cap.test.js
    452     10  yes   tests/frontend/attenuation-display.test.js
    121      6  -     tests/frontend/authoring.test.js
    112      9  -     tests/frontend/batchClient.test.js
    105      8  -     tests/frontend/boundary.test.js
    132      6  -     tests/frontend/boundaryRequest.test.js
     97      3  -     tests/frontend/boundaryRunner.test.js
    628      6  yes   tests/frontend/brew-day-card.test.js
   2351     26  yes   tests/frontend/card-display.test.js
    316     10  -     tests/frontend/catalog-drawer.test.js
    207      8  -     tests/frontend/catalog.test.js
    202     25  -     tests/frontend/catalogDraft.test.js
    134      9  -     tests/frontend/collection-fields.test.js
    129      2  -     tests/frontend/conformance-display.test.js
    209     11  -     tests/frontend/dag.test.js
    126      3  -     tests/frontend/dimension-inference.test.js
    181     11  -     tests/frontend/domains.test.js
    669      6  yes   tests/frontend/draft-discard.test.js
    236     19  -     tests/frontend/engine.test.js
    117      3  -     tests/frontend/equipment-ingest.test.js
    184      1  -     tests/frontend/equipment-legacy.test.js
   1594      5  yes   tests/frontend/fermentation-space.test.js
    184     16  -     tests/frontend/fermentation.test.js
     96      6  -     tests/frontend/firebaseConfig.test.js
    508      4  yes   tests/frontend/freeze-shape.test.js
    391      5  yes   tests/frontend/hamilton.test.js
    104      1  -     tests/frontend/hop-parity.test.js
    141      4  -     tests/frontend/hop-rows.test.js
   1357     15  yes   tests/frontend/hops-card.test.js
     94      5  -     tests/frontend/hops.test.js
    361      5  yes   tests/frontend/ingredient-priors.test.js
    666      4  yes   tests/frontend/late-addition-effect-mirror.test.js
    748      8  yes   tests/frontend/late-addition-intent.test.js
    698      6  yes   tests/frontend/late-addition-parts.test.js
    131      7  -     tests/frontend/late-addition-rows.test.js
    479      5  yes   tests/frontend/late-addition-share-zero.test.js
    407      6  yes   tests/frontend/library.test.js
    212     17  -     tests/frontend/libraryUi.test.js
    183      6  -     tests/frontend/malt-card.test.js
    134      8  -     tests/frontend/malt-rows.test.js
    688     11  yes   tests/frontend/mash-card.test.js
    465      3  yes   tests/frontend/mash-preset-mirror.test.js
    132      7  -     tests/frontend/mash-rows.test.js
    105     14  -     tests/frontend/modal-focus.test.js
     97      7  -     tests/frontend/navigation.test.js
    454      3  yes   tests/frontend/number-input.test.js
     85      1  -     tests/frontend/observability.test.js
    259     36  -     tests/frontend/persistence.test.js
    876     12  yes   tests/frontend/pin-matrix.test.js
    407      1  yes   tests/frontend/realized-vitals.test.js
    139      6  -     tests/frontend/recipeList.test.js
    177     37  -     tests/frontend/recipes.test.js
    173      5  -     tests/frontend/relations.test.js
    770     11  yes   tests/frontend/report-catalog.test.js
   1088     12  yes   tests/frontend/report-format.test.js
    728      6  yes   tests/frontend/report-inputs.test.js
    149      6  -     tests/frontend/scale-preview.test.js
    126      2  -     tests/frontend/seed-derivations.test.js
    545      3  yes   tests/frontend/selection-validation.test.js
    618      6  yes   tests/frontend/selections.test.js
    291     13  -     tests/frontend/setup.test.js
     97      1  -     tests/frontend/sha256.test.js
    121      3  -     tests/frontend/standard-malts.test.js
   1909     22  yes   tests/frontend/step-boundaries.test.js
    855      8  yes   tests/frontend/step-lifecycle.test.js
    379      3  yes   tests/frontend/step-pipeline.test.js
   1040     13  yes   tests/frontend/style-card.test.js
    120      7  -     tests/frontend/style-conformance.test.js
    307      6  -     tests/frontend/style-plot.test.js
    194      8  -     tests/frontend/style-target.test.js
    195      3  -     tests/frontend/styles-seed.test.js
    143      3  -     tests/frontend/trace-malt-rows.test.js
    417      5  yes   tests/frontend/unit-decimals.test.js
    116      9  -     tests/frontend/unitPrefs.test.js
    123     13  -     tests/frontend/units.test.js
    157      6  -     tests/frontend/userCatalog.test.js
    199     32  -     tests/frontend/utils.test.js
    420     11  -     tests/frontend/validate-artifact.test.js
    408      3  yes   tests/frontend/volume-ledger.test.js
   1137     19  yes   tests/frontend/water-card.test.js
    413      5  yes   tests/frontend/water-gate.test.js
    420      2  yes   tests/frontend/water-ratio.test.js
    487      4  yes   tests/frontend/water-target-mirror.test.js
    101      8  -     tests/frontend/whirlpool.test.js
    157      8  -     tests/frontend/yeast-rows.test.js
    135      4  -     tests/conformance/boundary-fixtures.test.js
    673      5  yes   tests/conformance/ion-constraints.test.js
    268      6  -     tests/conformance/numeric-parity.test.js
    168      3  -     tests/conformance/parity.test.js
    198     12  -     tests/conformance/seed-conformance.test.js
    142      1  -     tests/conformance/validation-parity.test.js
    144      3  -     tests/guards/adapter-format-contract.test.js
    363      1  yes   tests/guards/alpine-handlers.test.js
    111      1  -     tests/guards/api-proxy.test.js
    169      2  -     tests/guards/artifact-consumers.test.js
    134      1  -     tests/guards/artifact-docs-sync.test.js
    130      1  -     tests/guards/artifact-purity.test.js
     87      2  -     tests/guards/attenuation-register.test.js
    119      4  -     tests/guards/boundary-inputs.test.js
    114      1  -     tests/guards/boundary-output-consumers.test.js
    117      1  -     tests/guards/boundary-routes.test.js
    115      4  -     tests/guards/control-states.test.js
    149      1  -     tests/guards/css-classes.test.js
    125      1  -     tests/guards/css-duplication.test.js
    273      3  -     tests/guards/describe-bundle.test.js
    271      1  -     tests/guards/determinism.test.js
    120      4  -     tests/guards/dialogs.test.js
    114      1  -     tests/guards/dimension-coverage.test.js
    514      5  yes   tests/guards/display-only-units.test.js
    433      4  yes   tests/guards/display-precision.test.js
    149      5  -     tests/guards/docs-claims.test.js
    110      1  -     tests/guards/engine-access.test.js
    139      2  -     tests/guards/engine-read-mirrors.test.js
    100      4  -     tests/guards/equipment-contract.test.js
    123      2  -     tests/guards/fermentables-source-contract.test.js
    115      8  -     tests/guards/findings-registry.test.js
    119      1  -     tests/guards/glossary-sync.test.js
    172      3  -     tests/guards/import-direction.test.js
     94      1  -     tests/guards/include-integrity.test.js
    341      7  yes   tests/guards/installer-contract.test.js
     99      3  -     tests/guards/malt-standard-crosswalk.test.js
    113      3  -     tests/guards/manifest-integrity.test.js
     91      1  -     tests/guards/mash-input-contract.test.js
     98      1  -     tests/guards/no-reactivity.test.js
    106      2  -     tests/guards/no-silent-catch.test.js
    108      2  -     tests/guards/number-input-contract.test.js
    160      1  -     tests/guards/option-labels.test.js
    376      9  -     tests/guards/ownership.test.js
    103     11  -     tests/guards/precommit-contract.test.js
     96      1  -     tests/guards/presentation-ids.test.js
    100      7  -     tests/guards/report-sections-sync.test.js
    377      2  yes   tests/guards/roots-only.test.js
     99      2  -     tests/guards/schema-version.test.js
    238     11  -     tests/guards/seed-rebuild.test.js
    100      1  -     tests/guards/select-binding.test.js
   1651      3  -     tests/guards/shape-pins.test.js
    192      1  -     tests/guards/show-dereference.test.js
    160      1  -     tests/guards/sources-manifest.test.js
    128      2  -     tests/guards/standard-malts.test.js
    206      3  -     tests/guards/store-surface.test.js
    103      1  -     tests/guards/stub-outputs.test.js
    114      8  -     tests/guards/sugar-fermentability-contract.test.js
     98      1  -     tests/guards/svg-length-bindings.test.js
    116      7  -     tests/guards/taxonomy-coverage.test.js
    350      1  yes   tests/guards/telemetry-classes.test.js
    104      2  -     tests/guards/unit-menu-coverage.test.js
    102      2  -     tests/guards/unit-roundtrip.test.js
    111      6  -     tests/guards/whitelabs-yeast-contract.test.js
    144      1  -     tests/guards/write-targets.test.js

frontend totals: 153 files, 949 tests, 41 boot an app, 46.6 s serial

backend suites: 51 files, one pytest run
     ms  tests  file
      9     11  tests/backend/conformance/test_artifact_constants.py
      4      4  tests/backend/conformance/test_basis_conversion.py
     11     21  tests/backend/conformance/test_batch_solver_helpers.py
    139     15  tests/backend/conformance/test_batch_solver_orchestration.py
      8     18  tests/backend/conformance/test_batch_solver_phase1.py
     12     13  tests/backend/conformance/test_batch_solver_phase3.py
     16     19  tests/backend/conformance/test_batch_solver_phase4.py
     63      3  tests/backend/conformance/test_boundary_error_contract.py
      3      1  tests/backend/conformance/test_boundary_fixtures.py
      4      5  tests/backend/conformance/test_boundary_output_parity.py
      3      4  tests/backend/conformance/test_boundary_routes.py
      4      5  tests/backend/conformance/test_boundary_wire_contract.py
     16      1  tests/backend/conformance/test_bundle_constructors.py
    330     17  tests/backend/conformance/test_composition_regimes.py
     28     27  tests/backend/conformance/test_domain_codes.py
      5      7  tests/backend/conformance/test_mash_ph_model.py
     27     27  tests/backend/conformance/test_numeric_parity.py
    619      1  tests/backend/conformance/test_recipe_smoke.py
     91      3  tests/backend/conformance/test_report_bundle_fixture.py
      0      3  tests/backend/conformance/test_report_inputs.py
      3      1  tests/backend/conformance/test_route_auth_coverage.py
    247     12  tests/backend/conformance/test_scale_pins.py
     10     12  tests/backend/conformance/test_taxonomy_coverage.py
      7     13  tests/backend/conformance/test_utils.py
      9      1  tests/backend/conformance/test_validation_parity.py
     50     26  tests/backend/conformance/test_water_chemistry_core.py
      0      1  tests/backend/conformance/test_water_fuzz.py
    533     14  tests/backend/conformance/test_water_matrix.py
    165     85  tests/backend/conformance/test_water_routing.py
    132      6  tests/backend/conformance/test_water_telemetry_contract.py
   1253     21  tests/backend/test_artifact.py
     47     15  tests/backend/test_auth.py
     25     24  tests/backend/test_batch_repo.py
    238     29  tests/backend/test_batch_solver.py
    342     17  tests/backend/test_batches.py
     83     11  tests/backend/test_catalog.py
      4      5  tests/backend/test_catalog_repo.py
     37     26  tests/backend/test_fingerprint.py
      9      5  tests/backend/test_firebase_wiring.py
     43     10  tests/backend/test_hop_solver.py
      1      2  tests/backend/test_ids.py
      7      5  tests/backend/test_parity.py
     69     27  tests/backend/test_report_bundle.py
    346      2  tests/backend/test_report_format_parity.py
   6064     17  tests/backend/test_report_render.py
   4578     30  tests/backend/test_report_sections.py
   1194     29  tests/backend/test_routes.py
     34     20  tests/backend/test_schemas.py
     17      2  tests/backend/test_styles_seed.py
     38      3  tests/backend/test_throttle.py
     47     22  tests/backend/test_water_solver.py

backend totals: 51 files, 698 tests, 21.3 s wall, 17.0 s inside pytest rows

test-cost: frontend 46.6 s serial, backend 21.3 s wall
```

Coverage: the preservation baseline, captured on this commit's tree — frontend
96.06 % lines / 86.51 % branches / 91.31 % functions; backend 96 % of 3207
statements (118 missed). Phase 0 touches no test or source path, so later phases
compare against these exactly.

### 3.2 Phase 1 — `make quick`: check first, then the affected suites (1 day)

**Goal contract**

| Field | Value |
|---|---|
| Preconditions | Goal 1 |
| Owns | `scripts/test-affected.mjs` (new), `scripts/run-tests.mjs` (file-list mode), `Makefile` (`test-affected`, `quick`, `test-guards`), `.githooks/pre-push` (new, installed by `make hooks`), `AGENTS.md` (Commands), a guard for the coupling table |
| Done when | `make quick` = `check` then `test-affected`; `make test-guards` runs guards only; `make test` is byte-for-byte the same command as today; the selector prints selected-of-total and why; the guard fails when a coupling rule names a suite that does not exist; `make hooks` installs the pre-push hook. |
| Evidence | `make check` and `make test` output at this commit; the selector's report on this branch's diff against `main`; if that diff is under 12 files, the same report on a 12-path selection, clearly labelled synthetic; the measured wall time of `make quick`. |
| Out of scope | Backend restructuring, concurrency, CI changes, converting suites. |
| Blocked if | A coupling rule cannot be expressed as a guard, or `make quick` can only hit its number by weakening `make test`. |
| Commit | `Add the local quick loop: check, then the affected suites` |

**Work.**

1. **Import map.** Parse every test file's relative imports, resolve them under
   `frontend/src/`, and walk transitively. Reverse it: changed source file → test
   files that reach it. `git diff --name-only <base>` supplies the change set;
   base defaults to `main`, overridable with `BASE=`.
2. **Declared coupling, for what imports cannot see.** Some suites assert a
   surface they do not import, so a changed path must select them explicitly. The
   table lives in the script, one entry per rule with a reason — the same pattern
   as `SHARED`:

   | Changed path | Also run | Why |
   |---|---|---|
   | `frontend/src/adapters/**` | `ownership`, `installer-contract`, `alpine-handlers`, `store-surface` | the guards read the assembled surface, not the card |
   | `frontend/src/views/**` | `ownership`, `presentation-ids` | field models and template bindings |
   | `frontend/src/engine/**` | `ownership`, `dimension-coverage`, `taxonomy-coverage` | grammar coverage follows the interpreter |
   | `data/**`, `docs/**`, `eslint.config.js`, `Makefile`, `tests/**/helpers.js`, `tests/**/util.js` | full suite | global inputs; selection cannot be trusted |

3. **Backend.** Skip the backend entirely when no `backend/**` or `data/**` file
   changed — 18–23 s saved on a frontend-only iteration. When it did change, map
   module → tests that import it, with a fallback to the full backend suite for
   `backend/app/core/**` and `backend/app/schemas/**`.
4. **Report the selection.** Always print how many files were selected of the
   total, and why (mapped / declared coupling / fallback), so an agent can tell a
   24-file loop from a 140-file one.
5. **`make quick`** = `check` then `test-affected`. **`make test-guards`** = guards
   only (8.7 s at concurrency 8) for artifact, seed and documentation edits.
6. **Pre-push hook** running `make test`, installed by `make hooks`, documented in
   AGENTS.md as the reason the loop may be narrow.

**Landed.** 2026-10-29 — `Add the local quick loop: check, then the affected suites`.

| Gate | Before | After |
|---|---|---|
| `make quick`, this branch's diff | — | 38.0–45.1 s over two runs (check + the full frontend suite: the diff changes the harness) |
| `make quick`, synthetic 12-path selection | — | 84 of 154 suites (539 tests) in 23.3 s; ≈ 35 s with `check` |
| `make test` | 56.1 s (Phase 0) | 48.1–60.9 s over two runs — 154 files, 954 tests; backend 697 passed, 1 skipped |
| `make test-guards` | — | 10.7 s — 59 files, 176 tests |
| `make check` | 8.5 s (Phase 0) | 7.3–11.5 s over two runs |
| `node scripts/test-cost.mjs` | 153 files, 949 tests, 46.6 s serial (Phase 0) | 154 files, 954 tests, 46.0 s serial; backend 51 files, 698 tests, 15.4 s wall |
| `make coverage` | 96.06 / 86.51 / 91.31 | unchanged; backend 96 % of 3207 statements |
| `.githooks/pre-push` | — | runs `make test`: 954 frontend and 697 backend tests passed |

The selector on this branch (under 12 paths, so a synthetic set follows it):

```text
$ node scripts/test-affected.mjs --dry-run
test-affected: 7 changed paths against main
frontend: 154 of 154 suites
  fallback: full frontend suite — Makefile matches Makefile: the harness decides what runs; mapping a harness change cannot be trusted
backend: skipped — no backend/** or data/** path changed
test-affected: dry run; nothing executed

$ node scripts/test-affected.mjs --dry-run --paths <12 synthetic frontend/src modules>
test-affected: 12 changed paths an explicit list
frontend: 84 of 154 suites
  mapped by imports (77): tests/conformance/ion-constraints.test.js, tests/conformance/numeric-parity.test.js, tests/conformance/parity.test.js, tests/conformance/seed-conformance.test.js, tests/conformance/validation-parity.test.js, tests/frontend/artifact-functions.test.js, tests/frontend/attenuation-above-cap.test.js, tests/frontend/attenuation-display.test.js, tests/frontend/batchClient.test.js, tests/frontend/boundaryRequest.test.js, tests/frontend/brew-day-card.test.js, tests/frontend/card-display.test.js, tests/frontend/collection-fields.test.js, tests/frontend/dag.test.js, tests/frontend/dimension-inference.test.js, tests/frontend/domains.test.js, tests/frontend/draft-discard.test.js, tests/frontend/engine.test.js, tests/frontend/equipment-ingest.test.js, tests/frontend/equipment-legacy.test.js, tests/frontend/fermentation-space.test.js, tests/frontend/freeze-shape.test.js, tests/frontend/hamilton.test.js, tests/frontend/hops-card.test.js, tests/frontend/ingredient-priors.test.js, tests/frontend/late-addition-effect-mirror.test.js, tests/frontend/late-addition-intent.test.js, tests/frontend/late-addition-parts.test.js, tests/frontend/late-addition-share-zero.test.js, tests/frontend/library.test.js, tests/frontend/libraryUi.test.js, tests/frontend/malt-card.test.js, tests/frontend/mash-card.test.js, tests/frontend/mash-preset-mirror.test.js, tests/frontend/number-input.test.js, tests/frontend/persistence.test.js, tests/frontend/pin-matrix.test.js, tests/frontend/realized-vitals.test.js, tests/frontend/relations.test.js, tests/frontend/report-catalog.test.js, tests/frontend/report-format.test.js, tests/frontend/report-inputs.test.js, tests/frontend/selection-validation.test.js, tests/frontend/selections.test.js, tests/frontend/setup.test.js, tests/frontend/step-boundaries.test.js, tests/frontend/step-lifecycle.test.js, tests/frontend/step-pipeline.test.js, tests/frontend/style-card.test.js, tests/frontend/unit-decimals.test.js, tests/frontend/unitPrefs.test.js, tests/frontend/units.test.js, tests/frontend/userCatalog.test.js, tests/frontend/volume-ledger.test.js, tests/frontend/water-card.test.js, tests/frontend/water-gate.test.js, tests/frontend/water-ratio.test.js, tests/frontend/water-target-mirror.test.js, tests/guards/alpine-handlers.test.js, tests/guards/artifact-consumers.test.js, tests/guards/boundary-inputs.test.js, tests/guards/boundary-output-consumers.test.js, tests/guards/boundary-routes.test.js, tests/guards/determinism.test.js, tests/guards/dimension-coverage.test.js, tests/guards/display-only-units.test.js, tests/guards/display-precision.test.js, tests/guards/include-integrity.test.js, tests/guards/installer-contract.test.js, tests/guards/manifest-integrity.test.js, tests/guards/option-labels.test.js, tests/guards/ownership.test.js, tests/guards/roots-only.test.js, tests/guards/store-surface.test.js, tests/guards/telemetry-classes.test.js, tests/guards/unit-menu-coverage.test.js, tests/guards/write-targets.test.js
  declared coupling (14): tests/guards/alpine-handlers.test.js, tests/guards/api-proxy.test.js, tests/guards/boundary-output-consumers.test.js, tests/guards/dimension-coverage.test.js, tests/guards/display-only-units.test.js, tests/guards/engine-access.test.js, tests/guards/engine-read-mirrors.test.js, tests/guards/import-direction.test.js, tests/guards/installer-contract.test.js, tests/guards/no-reactivity.test.js, tests/guards/ownership.test.js, tests/guards/presentation-ids.test.js, tests/guards/store-surface.test.js, tests/guards/taxonomy-coverage.test.js
backend: skipped — no backend/** or data/** path changed
test-affected: dry run; nothing executed
```

Deviations:

- **The 12-path loop missed the prediction: 84 suites, not ~24, and ≈ 35 s, not
  ≤ 20 s.** The selection is not a bug: the transitive walk enters the harness at
  `tests/frontend/appHelpers.js` → `frontend/src/adapters/stepAdapter.js`, the
  composition root that installs every card, so every suite that boots the app
  reaches almost every card module. Measured over all 123 `frontend/src/*.js`
  modules, the median module selects 49 of 154 suites (`units.js` 73, `main.js`
  3). The plan's §1 median of 11 is a direct-import count and does not describe
  this graph. The loop still turns that edit's 46 s of suite time into 23 s; the
  remaining gap is Phase 2's concurrency and Phase 3's cold start.
- **The coupling table is wider than the four seeded rules**, because the seeded
  table alone under-runs the guards that read a surface by path. Added, each with
  a reason in `RULES`: the fifteen template and stylesheet readers (a full-suite
  fallback there would have made every partial edit a gate run), the whole-tree
  guards (`import-direction`, `display-only-units`, `engine-access`), the store
  readers, the plan/claims coupling, and the harness and configuration globals.
  `tests/guards/test-affected-coupling.test.js` fails when any named suite or
  literal path stops existing; verified by planting `no-such-suite` and watching
  it fail, then restoring.
- **`tests/**/helpers.js` became `tests/**/*helpers.js`** (likewise `*util.js`):
  the literal seeded glob does not match `tests/frontend/appHelpers.js`, which is
  the harness file Phase 4 edits. `tests/**/*.json` was added for suite data read
  by path.
- **The backend lane walks the `app.*` import closure** and falls back to the
  whole backend for `backend/app/core/**`, `schemas/**`, `templates/**`, a
  dependency change, or a changed file no suite imports; the lane is skipped
  entirely when no `backend/**` or `data/**` path changed.
- **`scripts/run-tests.mjs` gained `--files` and `--dirs`** with their own
  refusal semantics: an empty list, a path outside the three roots, a non-suite,
  a missing file, and the two flags together all exit non-zero. Default discovery
  is unchanged, so `npm test` prints the same line and `make test` is
  byte-for-byte the same command.
- **Untracked files join the change set.** `git diff` omits them, and an agent's
  new module must not vanish from the loop.
- **`--paths` was added** for checking the mapping against a selection that is
  not a branch diff; it is what produced the synthetic report above.
- The pre-push refusal stays with §7: proving the hook blocks a red push needs a
  deliberately red tree.

Coverage: frontend 96.06 % lines / 86.51 % branches / 91.31 % functions →
unchanged; backend 96 % → 96 % (3207 statements, 118 missed).

**Predictions.** `make quick` on a 12-file edit selects ~24 suites and runs in
≤ 20 s; `make test` unchanged.

### 3.3 Phase 2 — Concurrency (¼ day)

**Goal contract**

| Field | Value |
|---|---|
| Preconditions | Goal 2 |
| Owns | `scripts/run-tests.mjs` |
| Done when | The runner defaults concurrency to three times available parallelism, with an environment override documented in the script's header; the full frontend suite is green at that default. |
| Evidence | `make test` output; `scripts/test-cost.mjs` before and after; `make coverage` before and after. |
| Out of scope | Backend workers (`pytest-xdist` stays deferred), CI workflow changes, test edits. |
| Blocked if | The suite is only green at a concurrency that also makes it slower; record both numbers and stop. |
| Commit | `Run the frontend suites at the measured concurrency` |

**Work.** Default `--test-concurrency` to three times the available parallelism
(12 here, which measured 26.5 s against 35.5 s at the default). Keep an env
override so CI can tune independently. Frontend gap at concurrency 12, measured:

| Suite | Today (default) | At 12 |
|---|---|---|
| Frontend (with guards) | 35.5 s | 26.5 s |

**Predictions.** `make test` ≈ 48 s.

**Landed.** 2026-10-29 — `Run the frontend suites at the measured concurrency`.

| Gate | Before | After |
|---|---|---|
| `make test` | 47.0 s (node's default: parallelism − 1 = 3) | 48.8 s, then 40.5 s, 38.3 s and 44.3 s on the committed tree — 154 files, 954 tests pass; backend 697 passed, 1 skipped |
| Frontend suite wall, back to back on one box | 30.3 s / 27.6 s at 3 | 25.2 s / 25.5 s at 12 |
| `node scripts/test-cost.mjs` | 154 files, 954 tests, 41 boot an app, 65.9 s serial; backend 51 files, 698 tests, 17.0 s wall | 70.2 s serial, then 47.9 s serial on a frontend-only rerun; backend 19.3 s wall |
| `make coverage` | 96.06 / 86.51 / 91.31 %; backend 96 % of 3207 statements, 118 missed | unchanged: 96.06 / 86.51 / 91.31 %; 96 % of 3207, 118 missed |
| `make check` | — | 6.4–7.0 s |

Deviations:

- **The default is computed, not pinned to 12.** The contract says three times
  available parallelism, not twelve; `scripts/run-tests.mjs` reads
  `os.availableParallelism()` (4 here, so 12) and multiplies, so a smaller box
  does not inherit a number measured somewhere else. `TEST_CONCURRENCY` overrides
  it — refused unless it is a positive integer — and an explicit
  `--test-concurrency` passed through by a caller wins over both.
- **The runner prints the lane count.** `run-tests: concurrency 12 (3 x 4
  available)` records which limit produced a timing; the old default was silent,
  so no transcript showed it. The line is omitted when the caller supplied the
  flag, since the caller then owns it. Printing it is what makes the default
  auditable rather than inferred.
- **The first `make test` did not improve** (47.0 → 48.8 s): the frontend lane
  fell 30.8 → 28.5 s but the backend lane rose 14.2 → 18.3 s on a box whose load
  average sat between 3.9 and 14. Later runs recorded 40.5 s, 38.3 s and 44.3 s
  on the committed tree, the frontend lane at 23–27 s each time. The back-to-back
  frontend A/B above is this phase's honest measurement; the gate number is a
  recording and moves with whatever else the box is doing.
- **The ledger cannot show this phase.** Each of its frontend rows runs in its own
  process, so concurrency only moves work between rows. Its two runs here (65.9
  and 70.2 s serial, then 47.9 s on a rerun with the backend lane skipped) differ
  by more than the change could produce and bracket Phase 1's 46.0 s: the
  instrument is insensitive, not regressed.
- **The change reaches every caller of the runner** — `make test`, `make
  test-guards`, `make coverage`, `make test-affected` — because it lives in the
  runner's default rather than in a Makefile flag. `make test` remains the same
  command; only the node invocation it builds gains one flag.

Coverage: frontend 96.06 % lines / 86.51 % branches / 91.31 % functions →
unchanged; backend 96 % (3207 statements, 118 missed) → unchanged.

### 3.4 Phase 3 — Cold start: validate and build the graph once (½ day)

**Goal contract**

| Field | Value |
|---|---|
| Preconditions | Goal 3 |
| Owns | `frontend/src/engine/index.js` (`loadArtifact`), `frontend/src/engine/dag.js` (`buildGraph`), one guard test |
| Done when | Validation is memoized on artifact identity and so is the graph; the guard asserts one graph object is reused for the same artifact and that a modified clone is re-validated; the full suite is green. |
| Evidence | The guard's assertions, `make test` output, and the ledger delta from the 288 boots. |
| Out of scope | Caching keyed on paths, timestamps or content hashes; changing reset semantics; touching the artifact schema. |
| Blocked if | A caller mutates the artifact clone in place after validation, so identity is not a sound key; stop and describe the caller. |
| Commit | `Validate and graph-build the artifact once per process` |

**Work.** Memoize validation on artifact identity (a `WeakSet`) and the graph on
artifact identity (a `WeakMap`). Both are pure functions of the artifact; a
mutated clone is a different object and still validates. This is a production win
as well: every sign-in and every `session.reset()` currently pays 10 ms to
rebuild the same graph.

**Predictions.** ~10 ms off every engine build (288 boots plus every reset),
~2.4 s serial.

**Landed.** 2026-10-29 — `Validate and graph-build the artifact once per process`.

| Gate | Before | After |
|---|---|---|
| one `createCalculator` on the shared artifact | 2.816 ms (50 builds) | 0.016 ms (50 builds) |
| `loadArtifact` alone | 1.604 ms/call | 0.000 ms/call after the first |
| `buildGraph` alone | 0.796 ms/call | 0.000 ms/call after the first |
| `make test` | 38.3–44.3 s on the Phase 2 tree (154 files, 954 tests) | 51.1 s, 52.0 s, 48.8 s, then 46.0 s on the committed tree — 155 files, 958 tests pass; frontend lane 27.1 s, backend 22.8 s; backend 697 passed, 1 skipped |
| `node scripts/test-cost.mjs` | 61.5 s frontend serial (one run on this tree before the change; the Phase 2 note recorded 47.9–70.2 s) | 55.2 s frontend serial, 155 files, 958 tests; backend 16.6 s wall (19.3 s before) |
| guard `tests/guards/engine-cold-start.test.js` | — | 4 pass; 3 of the 4 fail against the pre-change engine |
| `make check` | 6.4–7.0 s (Phase 2) | 8.2 s, then 11.2 s alongside the doc and plan edits |
| `make coverage` (frontend) | 96.06 / 86.51 / 91.31 % | 96.06 / 86.53 / 91.31 % |
| `make coverage` (backend) | 96 % of 3207 statements, 118 missed | unchanged |

Deviations:

- **The per-build prediction held; the serial prediction did not, and the ledger
  cannot see it.** A build costs 2.816 ms before and 0.016 ms after, so 288 boots
  plus every reset save well under a second of serial work — inside the ledger's
  run-to-run spread. Its frontend lane moved 61.5 → 55.2 s, which this change
  cannot account for, and its `boot` column is still a source scan rather than a
  count. The gate and ledger numbers are recordings; the A/B on one artifact
  object is this phase's measurement.
- **`buildGraph` keeps its complexity budget by delegation.** The body moved to
  `constructGraph` and the exported wrapper does the `WeakMap` lookup; with the
  branch inline, eslint refused the file at complexity 27 against a maximum of 26
  and no threshold was raised.
- **`docs/engine.md` gained one paragraph.** Its lifecycle section reads as if
  validation and graph construction run on every build; it now says both are
  memoized on artifact identity and that a clone is a different artifact. The
  contract did not own that file.
- **The guard is one file with four assertions**, not one assertion: the first
  load reads a `Proxy`-wrapped artifact and the second reads nothing; a clone with
  a bad `schema_version` and a clone with a dangling root default both throw while
  the already-validated original still loads; the graph object is identical across
  calls and a clone gets its own; two engines built from one artifact share
  `adjacency`, `dependents` and the graph. Reuse is keyed on the object a process
  holds, so the retained graphs are collectable with their artifacts — no path,
  timestamp or content hash is involved.
- **The gate did not fall** (38.3–44.3 → 46.0–52.0 s) on a box whose load
  average moved between 4.3 and 10 across the runs. Per §2.8 that is a recording,
  not a failed threshold; the win this phase buys is per boot, which Phase 4
  spends.

Coverage: frontend 96.06 % lines / 86.51 % branches / 91.31 % functions →
96.06 / 86.53 / 91.31 (the guard exercises both memo branches); backend 96 %
(3207 statements, 118 missed) → unchanged.

### 3.5 Phase 4 — Reset instead of rebuild in the harness (one goal per group)

The riskiest phase, and the one where a goal can satisfy the letter of the
instruction by converting everything and keeping only what passes. The contract
below is shared; the group table in §3.5.1 is the per-goal scope.

**Goal contract (all Phase 4 goals)**

| Field | Value |
|---|---|
| Preconditions | Goal 4 |
| Owns | `tests/frontend/appHelpers.js` in 4a only; otherwise only the group's suites |
| Done when | Every listed suite uses `sharedTestApp()` or `withFreshApp(fn)`; each converted suite has been run once with a fresh `createTestApp()` and produced identical results; a suite that fails equivalence reverts to a fresh boot and is named in the commit body; full suite green. |
| Evidence | `make test` output; the ledger before and after; one equivalence line per converted suite; the reset-baseline guard result once 4a lands. |
| Out of scope | Suites outside the group; new helpers beyond the three names in §0.3; changing assertions to fit the harness. |
| Blocked if | `teardown()` cannot restore a suite's baseline without clearing card-local draft state, and the suite is not on the fresh-boot list. |
| Commit | `Reset the app between card cases: <group>` (4a uses its own subject) |

**Work.** `teardown()` already restores the baseline (`runner.reset()`,
`session.reset()`, cleared input drafts, `compute()`), at ~10 ms before Phase 3
and ~3 ms after, against 80–95 ms for a fresh boot. Add `sharedTestApp()`
(module-scoped, read-only suites) and `withFreshApp(fn)` (reset between tests,
mutating suites), and keep a per-test `createTestApp()` for suites that open
drawers or dialogs — `teardown()` does not clear card-local draft state
(`maltDraft`, `catalogDraft`, `rowMenu`, `sortOpen`), and that boundary is
written in the helper, not discovered later.

**Safety net, because reset is the risky part.** A guard mutates roots, collections
and selections, resets, and deep-equals the baseline snapshot. Each converted
suite is additionally run once against a fresh boot and must produce identical
results; a suite that fails the equivalence keeps the fresh boot and is not
rewritten.

**Predictions.** ~20 s of serial work removed, −3 to −4 s of wall on two physical
cores.

#### 3.5.1 Phase 4 groups

41 suites boot an app; every one appears exactly once below. Sizes are measured
test counts for the named files.

| Group | Suites | Helper | Commit |
|---|---|---|---|
| 4a | `hamilton`, `realized-vitals`, `volume-ledger`, `alpine-handlers`, `display-only-units`, `display-precision`, `installer-contract`, `roots-only`, `telemetry-classes`, `ion-constraints` | `sharedTestApp()` | `Share the app across read-only suites` |
| 4b | `card-display` (26) | `withFreshApp` | `Reset the app between card cases: card-display` |
| 4c | `step-boundaries` (22) | `withFreshApp` | `Reset the app between card cases: step-boundaries` |
| 4d | `water-card` (19) | `withFreshApp` | `Reset the app between card cases: water-card` |
| 4e | `hops-card` (15) | `withFreshApp` | `Reset the app between card cases: hops-card` |
| 4f | `style-card` (13) | `withFreshApp` | `Reset the app between card cases: style-card` |
| 4g | `pin-matrix` (12) | `withFreshApp` | `Reset the app between card cases: pin-matrix` |
| 4h | `report-format` (12) | `withFreshApp` | `Reset the app between card cases: report-format` |
| 4i | `mash-card` (11) | `withFreshApp` | `Reset the app between card cases: mash-card` |
| 4j | `water-gate`, `water-ratio`, `water-target-mirror`, `late-addition-intent`, `late-addition-parts`, `late-addition-share-zero`, `late-addition-effect-mirror`, `attenuation-display`, `ingredient-priors` | `withFreshApp` | `Reset the app between card cases: water and late-addition suites` |
| 4k | `library`, `selections`, `selection-validation`, `number-input`, `unit-decimals`, `report-catalog`, `report-inputs`, `freeze-shape`, `mash-preset-mirror`, `step-lifecycle`, `step-pipeline`, `fermentation-space`, `brew-day-card`, `draft-discard` | `withFreshApp` | `Reset the app between card cases: library and lifecycle suites` |

4a converts the read-only suites first and installs the reset-baseline guard; 4b
through 4k convert in descending risk order. If a group cannot convert a suite
safely, it says so and leaves the suite on a fresh boot — that is a valid group
outcome, not a failed goal.

### 3.6 Phase 5 — Backend serial work before worker count (½ day)

**Goal contract**

| Field | Value |
|---|---|
| Preconditions | Goal 15 |
| Owns | `tests/backend/test_report_render.py`, `tests/backend/test_report_sections.py` |
| Done when | One session-scoped compile per (paper, section set); exactly one byte-identical determinism compile remains; the seven `*_renders_alone_and_in_the_full_report` cases are table-driven over the compiled document; backend suite green. |
| Evidence | Backend wall time before and after from the ledger; the determinism test still passing; the rendered-output assertions unchanged. |
| Out of scope | Changing the rendered output, adding typst fixtures, `pytest-xdist`, renderer production code. |
| Blocked if | Reuse makes a case pass for the wrong reason (a section set that shares a document but not a header state); stop and describe the coupling. |
| Commit | `Compile the report once per paper in the backend suite` |

**Work.** Typst compiles are 4.6 s of the backend's ~19 s. Reuse one session-scoped
compile per (paper, section set); keep exactly one byte-identical determinism
compile, and table-drive the seven cases over the compiled document.

**Predictions.** −3 to −4 s. This comes before `pytest-xdist` because cutting
serial work is worth more than adding workers to two physical cores.

### 3.7 Phase 6 — Re-measure and record (½ day)

**Goal contract**

| Field | Value |
|---|---|
| Preconditions | Goal 16 |
| Owns | this plan, `TODO.md` |
| Done when | `scripts/test-cost.mjs` and `make coverage` have been run; the closing note records both; `TODO.md`'s in-flight bullet is a Done entry with the final numbers; the plan is archived and every reference to its old path is updated. |
| Evidence | Final ledger and coverage output; `git log --stat` of the move; `make check` and `make test` green. |
| Out of scope | Adding `pytest-xdist` or any dependency; taking the table-driving option; demonstrating the pre-push hook. |
| Blocked if | Reference sweep finds a citation the goal cannot resolve without editing a frozen document; stop and name it. |
| Commit | `Record the local-testing numbers` |

**Work.** Run the ledger and coverage. Decide, on the numbers, whether the deferred
options are worth proposing — but only record the recommendation: the
`pytest-xdist` decision belongs to the user (§7). If nothing is justified, close
the program.

## 4. Coverage protocol

- `make coverage` before and after each goal; no goal may lose covered lines or
  branches.
- Goals 2–16 delete zero assertions. If one must go, it goes in its own commit with
  the reason and the coverage delta.
- `make test` green at every commit; CI unchanged and still full.
- The affected lane never runs in CI.

## 5. Predictions

Predictions feeding the plan, not gates. Every row is replaced by its measured
value in the phase's Landed note, including the rows that miss.

| Gate | Today | After |
|---|---|---|
| Iteration that fails (`make quick`) | 57 s | ≤ 20 s |
| Iteration that passes (`make quick`) | 57 s | ≤ 20 s + one gate run |
| Full gate `make test` | 56.9 s | ~44 s (48 s after Phase 2, then −4 s Phase 4) |
| Full gate with `xdist` (if taken) | — | ~38 s |
| `make verify` | ≈ 70 s | ≈ 57 s |

`make test` will not go below ~40 s here: total serial work is ~105 s across two
physical cores, so ~2.5 effective lanes is the ceiling. The loop is where the
10× lives; the gate gets a 20 % cut.

## 6. Risks and non-goals

- **Risk — the loop hides a regression.** Mitigation: declared coupling for what
  imports cannot see, hard fallback on global inputs, pre-push hook, CI unchanged.
- **Risk — a goal optimizes to its gate.** Mitigation: gates record rather than
  threshold, the locked decisions in §2, the per-suite equivalence note in Phase 4,
  and the human checklist in §7.
- **Risk — reset leaves card-local state behind.** Mitigation: the equivalence run
  per suite and the snapshot guard; unconverted suites stay on a fresh boot.
- **Risk — a memoized graph changes behaviour.** Mitigation: pure-function
  memoization keyed on artifact identity, with a guard for the clone case.
- **Non-goal — parallel frontend and backend.** Measured counterproductive on this
  machine (44.6 s against ~53 s sequential).
- **Non-goal — lazy seed loading.** ~9 s of serial cold start, but it changes the
  bundle strategy for a per-process cost.
- **Non-goal — cutting the count.** The suite is broad because the artifact is
  broad; 949 distinct names.
- **Non-goal — renaming the gate.** `make test` means the full suite, here and in CI.

## 7. Human checklist

Three items a goal must not own:

1. **Review Phase 1's coupling table.** Which suites assert a surface they do not
   import is a design judgment; the plan seeds four rules and the goal fills the
   rest.
2. **Review each Phase 4 group's equivalence note.** A group that converts
   everything and quietly keeps what passes is the failure this phase is meant to
   expose.
3. **Take the deferred decisions.** `pytest-xdist` is a dependency change with its
   own commit, and the pre-push hook's refusal is demonstrated on a throwaway
   branch with a deliberately red test — neither belongs to a loop.

## 8. Closing the program

1. Append each phase's Landed note with the measured before/after, the deviations,
   and the gate counts — this file is the audit trail.
2. Run `make test` and `make coverage` one last time; record both in the closing
   note.
3. Update `TODO.md`: the in-flight bullet becomes a **Done** entry with the final
   numbers and the archived pointer; the shape-pin burn-down stays queued.
4. `git mv plans/optimize-local-testing.md plans/archive/optimize-local-testing.md`
   and update every reference (`TODO.md`, `AGENTS.md` if it names the file, and any
   comment that points at it).
5. Install the pre-push hook with `make hooks` and confirm it refuses a push while
   `make test` is red — by hand, per §7.
