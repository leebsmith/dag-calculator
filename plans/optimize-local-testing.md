# Optimize local testing

Status: **proposed**. Target machine: ASUS NUC6i3SYH — Intel i3-6100U (2 physical
cores / 4 threads), 2.3 GHz, 8 GB. Every number below was measured on this box on
2026-10-29; none is extrapolated.

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

- **App boot dominates.** `createStepApp()` 20–35 ms plus `boot()` 40–62 ms
  (because `boot()` runs a full stub solve) ≈ **80–95 ms per boot**. 288 tests in
  41 suites boot an app: 153 ms/test versus 63 ms/test elsewhere.
- **Process start-up.** 153 files × ~120 ms ≈ 18 s serial; the guard suite alone
  is 56 files of 1–11 tests each.
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

## 3. Phases

Each phase is independently committable and green. Numbers are the expected
change, to be replaced with measured ones in the phase note.

### Phase 0 — Ledger (½ h)

**Owns** `scripts/test-cost.mjs` (new).

Print, per test file: wall time, test count, whether the suite boots an app, and
the totals. The same command before and after every later phase, so the plan is
audited against one measurement rather than five opinions. Also capture
`make coverage` (frontend and backend) as the preservation baseline.

**Gate** the script runs; no test change.

**Commit** `Add a test-cost ledger`

### Phase 1 — `make quick`: check first, then the affected suites (1 day)

**Owns** `scripts/test-affected.mjs` (new), `scripts/run-tests.mjs` (accept an
explicit file list), `Makefile` (`test-affected`, `quick`, `test-guards`),
`.githooks/pre-push` (new, installed by `make hooks`), `AGENTS.md` (Commands),
`tests/guards/precommit-contract.test.js` or a new guard for the coupling table.

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

**Gate** `make quick` on a 12-file edit selects ~24 suites and runs in ≤ 20 s;
`make test` unchanged; the declared-coupling table has a guard test that fails when
a rule names a suite that does not exist.

**Commit** `Add the local quick loop: check, then the affected suites`

### Phase 2 — Concurrency (¼ day)

**Owns** `scripts/run-tests.mjs`.

Default `--test-concurrency` to three times the available parallelism (12 here,
which measured 26.5 s against 35.5 s at the default). Keep an env override so CI
can tune independently. Frontend gap at concurrency 12, measured:

| Suite | Today (default) | At 12 |
|---|---|---|
| Frontend (with guards) | 35.5 s | 26.5 s |

**Gate** full suite green at the new default; `make test` ≈ 48 s.

**Commit** `Run the frontend suites at the measured concurrency`

### Phase 3 — Cold start: validate and build the graph once (½ day)

**Owns** `frontend/src/engine/index.js` (`loadArtifact`), `frontend/src/engine/dag.js`
(`buildGraph`), one guard test.

Memoize validation on artifact identity (a `WeakSet`) and the graph on artifact
identity (a `WeakMap`). Both are pure functions of the artifact; a mutated clone is
a different object and still validates. This is a production win as well: every
sign-in and every `session.reset()` currently pays 10 ms to rebuild the same graph.

Expected: ~10 ms off every engine build (288 boots plus every reset), ~2.4 s serial.

**Gate** a guard asserts one graph object is reused for the same artifact and that
a modified clone is re-validated; full suite green.

**Commit** `Validate and graph-build the artifact once per process`

### Phase 4 — Reset instead of rebuild in the harness (1 day)

**Owns** `tests/frontend/appHelpers.js`, the converted suites.

`teardown()` already restores the baseline (`runner.reset()`, `session.reset()`,
cleared input drafts, `compute()`), at ~10 ms before Phase 3 and ~3 ms after,
against 80–95 ms for a fresh boot. Add `sharedTestApp()` (module-scoped, read-only
suites) and `withFreshApp(fn)` (reset between tests, mutating suites), and keep
`freshApp()` for suites that open drawers or dialogs — `teardown()` does not clear
card-local draft state (`maltDraft`, `catalogDraft`, `rowMenu`, `sortOpen`), and
that boundary is written in the helper, not discovered later.

Convert in risk order: the 14 read-only/guard suites, then `card-display` (26),
`step-boundaries` (22), `water-card` (19), `hops-card` (15), `style-card` (13),
`pin-matrix` (12), `report-format` (12), `mash-card` (11), then the rest.

**Safety net, because reset is the risky part.** A guard mutates roots, collections
and selections, resets, and deep-equals the baseline snapshot. Each converted suite
is additionally run once against `freshApp()` and must produce identical results;
a suite that fails the equivalence keeps `freshApp()` and is not rewritten.

Expected: ~20 s of serial work removed, −3 to −4 s of wall on two physical cores.

**Commit** one per group: `Share the app across read-only suites`, then
`Reset the app between card cases instead of rebuilding it`

### Phase 5 — Backend serial work before worker count (½ day)

**Owns** `tests/backend/test_report_render.py`, `tests/backend/test_report_sections.py`.

Typst compiles are 4.6 s of the backend's ~19 s. Reuse one session-scoped compile
per (paper, section set); keep exactly one byte-identical determinism compile, and
table-drive the seven `*_renders_alone_and_in_the_full_report` cases over the
compiled document.

Expected: −3 to −4 s. This comes before `pytest-xdist` because cutting serial work
is worth more than adding workers to two physical cores.

**Commit** `Compile the report once per paper in the backend suite`

### Phase 6 — Re-measure, then stop or continue (½ day)

Run `scripts/test-cost.mjs` and `make coverage`. Decide, on the numbers:

- `pytest-xdist`: only if the backend is still the gate's long pole; on two
  physical cores expect ≤ 1.6×, so ~19 s → ~12 s, for one dev dependency.
- Table-driving the largest display suites: only if the count itself is still the
  complaint. It saves little wall time and costs failure legibility.

If neither is justified, close the program.

**Commit** `Record the local-testing numbers` (plan + TODO).

## 4. Coverage protocol

- `make coverage` before and after each phase; no phase may lose covered lines or
  branches.
- Phases 1–5 delete zero assertions. If one must go, it goes in its own commit with
  the reason and the coverage delta.
- `make test` green at every commit; CI unchanged and still full.
- The affected lane never runs in CI.

## 5. Expected outcome on this box

| Gate | Today | After |
|---|---|---|
| Iteration that fails (`make quick`) | 57 s | **≤ 20 s** |
| Iteration that passes (`make quick`) | 57 s | ≤ 20 s + one gate run |
| Full gate `make test` | 56.9 s | **~44 s** (48 s after Phase 2, then −4 s Phase 4) |
| Full gate with `xdist` (if taken) | — | ~38 s |
| `make verify` | ≈ 70 s | ≈ 57 s |

`make test` will not go below ~40 s here: total serial work is ~105 s across two
physical cores, so ~2.5 effective lanes is the ceiling. The loop is where the
10× lives; the gate gets a 20 % cut.

## 6. Risks and non-goals

- **Risk — the loop hides a regression.** Mitigation: declared coupling for what
  imports cannot see, hard fallback on global inputs, pre-push hook, CI unchanged.
- **Risk — reset leaves card-local state behind.** Mitigation: the equivalence run
  per suite and the snapshot guard; unconverted suites stay on `freshApp()`.
- **Risk — a memoized graph changes behaviour.** Mitigation: pure-function
  memoization keyed on artifact identity, with a guard for the clone case.
- **Non-goal — parallel frontend and backend.** Measured counterproductive on this
  machine (44.6 s against ~53 s sequential).
- **Non-goal — lazy seed loading.** ~9 s of serial cold start, but it changes the
  bundle strategy for a per-process cost.
- **Non-goal — cutting the count.** The suite is broad because the artifact is
  broad; 949 distinct names.
- **Non-goal — renaming the gate.** `make test` means the full suite, here and in CI.

## 7. Closing the program

1. Append each phase's `Landed.` note with the measured before/after, the
   deviations, and the gate counts — this file is the audit trail.
2. Run `make test` and `make coverage` one last time; record both in the closing
   note.
3. Update `TODO.md`: the in-flight bullet becomes a **Done** entry with the final
   numbers and the archived pointer; the shape-pin burn-down stays queued.
4. `git mv plans/optimize-local-testing.md plans/archive/optimize-local-testing.md`
   and update every reference (`TODO.md`, `AGENTS.md` if it names the file, and any
   comment that points at it).
5. Install the pre-push hook with `make hooks` and confirm it refuses a push while
   `make test` is red.
