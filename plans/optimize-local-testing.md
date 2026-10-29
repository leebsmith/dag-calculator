# Optimize local testing

Status: **proposed**. Reshaped 2026-10-29 for goal-driven execution; no phase has
landed. Target machine: ASUS NUC6i3SYH — Intel i3-6100U (2 physical cores / 4
threads), 2.3 GHz, 8 GB. Every baseline number below was measured on this box on
2026-10-29; none is extrapolated.

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
