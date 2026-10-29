# AGENTS.md

## What this is

A brewing calculator built on a deterministic DAG engine. Business logic is
declared in **`data/artifact.json`** (grammar, semantics, dimensions, domain
math, seeds, boundaries); a JS engine (`frontend/src/engine/`) interprets it,
an Alpine/Vite frontend renders it, and a FastAPI backend provides the JSON
seam, solvers, Firebase auth, and Firestore persistence.

## Source of truth

- **`data/artifact.json` is canonical.** The engine interprets it; tests enforce
  it; `docs/` explains it but never overrides it.
- Docs in `docs/dag-artifacts/` + `docs/engine.md` + `docs/adding-a-node.md` are
  **living** and must stay in sync with the artifact. `docs/adsco/ui.md` (the
  reconciled UI model) and `plans/adsco-contract.md` (reconciled solver decisions)
  are living too. `docs/historical/` and the vendored `docs/adsco/*` specs are
  **frozen** — do not maintain. `docs/hops/README.md` indexes the hop prose and
  `docs/hops/whirlpool-hopping-model.md` is its living contract; the transcripts
  under `docs/hops/reference/` are background, not frozen.
- **`docs/vision.md` is the intent layer**: the inversion thesis, why a boundary
  sits where it does, what the tool refuses to do, and the review checklist. It
  constrains design decisions; it never overrides the artifact.

## Layout

| Path | Role |
|---|---|
| `data/` | artifact + seed catalogs (`sources/` raw → `seeds/` normalized) |
| `frontend/src/engine/` | reference interpreter for the artifact |
| `frontend/src/` | views, adapters, stores (Vite + Alpine) |
| `backend/` | FastAPI app (Python 3.12, `uv`) |
| `tests/` | frontend engine/conformance/guards + backend pytest |
| `docs/` | living spec + frozen historical |
| `docs/hops/` | living hop index + model; background transcripts under `reference/` |
| `plans/` | execution history + reconciled decisions (`adsco-contract.md`) |
| `scripts/` | seed builders (`.mjs`) + scrapers (`scrape/`, Python) |

## Commands

    make local-dev      # Vite + Firebase emulators + uvicorn (http://localhost:5173)
    make save-data      # snapshot emulator data (Firestore + Auth) to emulator-data/
    make check          # eslint/stylelint (src, tests, scripts) + ruff + tach + repo hygiene
    make test           # frontend (node --test) + backend pytest — the gate
    make quick          # check + the suites the working diff can reach (the loop)
    make test-affected  # only those suites (BASE=<ref>, default main)
    make test-guards    # the guard suites only (artifact, seed and documentation edits)
    make test-fuzz      # seeded water-solver invariant sweep (CASES=200 SEED=...)
    make verify         # check + test + production build (hermetic)
    make verify-full    # verify + oracle-snapshot check against the legacy checkout

CI runs `make check`, `make test`, and `make build` on every push and pull request
(`.github/workflows/verify.yml`). `make test-fuzz` and `make test-oracle` stay
local: one is generative, the other reads the legacy checkout.

`make quick` is the local loop, not the gate: it runs `make check` and then only
the suites the working diff can reach. The selector is a pre-filter — imports,
plus a declared coupling table for guards that read a surface they do not import
— and it falls back to the full suite for global inputs (`data/`, `docs/`, the
harness). A change is not done until `make test` is green; `make hooks` installs
`.githooks/pre-push`, which runs it on every push.

When an agent uses the loop, the contract is:

- `make quick` finds failures; `make test` claims done. Loop green is never
  evidence of completion, and the pre-push hook is a safety net, not permission.
- Quote the selector's `N of M suites` line and its reason: `fallback:` means the
  command already is the gate, and `0 of N suites` means the diff against `BASE`
  is empty and nothing ran — loop before committing, or pass `BASE=<ref>`.
- Escalate on a fallback, on an empty selection, or on a failure outside the
  selected suites; a failure outside is a mapping gap, so fix the coupling table
  rather than re-looping.
- `data/**`, `docs/**` and the harness are full-suite fallbacks by design: a
  "quick" run over them costs the gate.
- Do not run `check` and `quick` back to back, and do not run `test`
  mid-iteration.

After any `data/artifact.json` change:

    make generate   # eager: inventory, glossary, manifest, seeds, bundle fixture

`make hooks` installs the committed git hooks (`.githooks/`): pre-commit reruns
the Node generators and stages what changed, pre-push runs `make test`. The
pre-commit hook is a convenience: `make check` re-checks the frozen-path and
manifest/lock rules, and `make test` remains the gate.

Local state is `emulator-data/` (gitignored): the Firestore documents and the
Auth emulator's accounts. `make local-dev` imports the snapshot on start and
`scripts/local-dev.mjs` saves it every five minutes and once more on Ctrl+C —
before the emulator stops, because a terminal interrupt otherwise kills it
first. `make save-data` takes an on-demand snapshot, `make clean` saves and then
stops, and `make reset-data` deletes the snapshot; `make local-data` prints which
state the next run starts from. Unit preferences are the one exception — they
live in the browser's `localStorage` and never reach the emulator.

## Governance & Modes

- **Plan mode**: Strictly read-only analysis. Inspect codebase, map dependencies,
  and outline proposals. Do not write to disk or run mutating commands.
- **Build mode**: Implement scoped changes. Run `make check` and `make test` to
  verify all gates pass before completing a task.
- **Dependencies**: Never modify dependencies in `package.json` or `pyproject.toml`
  without explicit user instruction.

## Conventions

- **JS** (frontend): ES modules, `node --test` for tests, eslint + stylelint.
- **Scripts** (`.mjs` seed builders and emitters, `.py` scrapers): the same lint
  contract as the source — eslint rules plus the shape caps for `.mjs`, ruff for
  `.py`. A script's stdout is its interface, so `no-console` is off there.
- **Python** (backend): `uv run`, pytest, ruff (line-length 100), tach boundary
  checks. Scraper deps are isolated per-pipeline and never enter the backend.
- **Docs are checked, not only trusted.** Generated docs are byte-compared by
  their guards; prose docs are held to the paths they cite — every backticked
  dotted token in a living doc must resolve to a node, schema, boundary output,
  section, report-catalog path, or bundle key
  (`tests/guards/docs-claims.test.js`). A plan may cite ids it proposes by
  declaring `<!-- claims: proposed a.b c.d -->`. Frozen docs and
  `plans/archive/` are exempt.
- **Commits**: concise imperative subject (`Pin the malt-database import contract`).
- **Artifact changes are atomic with their docs.** A model change is not done
  until `inventory.md` is re-emitted and the relevant prose doc updated in the
  same commit (see `docs/adding-a-node.md` and `README.md` "Maintaining the docs").
- **No comments in code** unless asked.

## When unsure

- Adding an input/derived value → follow `docs/adding-a-node.md`.
- Current/next work lives in `TODO.md`; prior decisions in `plans/`.