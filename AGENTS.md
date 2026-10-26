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
  **frozen** — do not maintain.
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
| `plans/` | execution history + reconciled decisions (`adsco-contract.md`) |
| `scripts/` | seed builders (`.mjs`) + scrapers (`scrape/`, Python) |

## Commands

    make local-dev   # Vite + Firebase emulators + uvicorn (http://localhost:5173)
    make check       # eslint/stylelint + ruff + tach
    make test        # frontend (node --test) + backend pytest
    make test-fuzz   # seeded water-solver invariant sweep (CASES=200 SEED=...)
    make verify      # check + test + production build (hermetic)
    make verify-full # verify + oracle-snapshot check against the legacy checkout

After any `data/artifact.json` change:

    make generate   # eager: inventory, glossary, manifest, seeds, bundle fixture

`make hooks` installs the committed pre-commit hook (`.githooks/`), which reruns
the Node generators and stages what changed. The hook is a convenience: `make
test` remains the gate.

## Governance & Modes

- **Plan mode**: Strictly read-only analysis. Inspect codebase, map dependencies,
  and outline proposals. Do not write to disk or run mutating commands.
- **Build mode**: Implement scoped changes. Run `make check` and `make test` to
  verify all gates pass before completing a task.
- **Dependencies**: Never modify dependencies in `package.json` or `pyproject.toml`
  without explicit user instruction.

## Conventions

- **JS** (frontend): ES modules, `node --test` for tests, eslint + stylelint.
- **Python** (backend): `uv run`, pytest, ruff (line-length 100), tach boundary
  checks. Scraper deps are isolated per-pipeline and never enter the backend.
- **Commits**: concise imperative subject (`Pin the malt-database import contract`).
- **Artifact changes are atomic with their docs.** A model change is not done
  until `inventory.md` is re-emitted and the relevant prose doc updated in the
  same commit (see `docs/adding-a-node.md` and `README.md` "Maintaining the docs").
- **No comments in code** unless asked.

## When unsure

- Adding an input/derived value → follow `docs/adding-a-node.md`.
- Current/next work lives in `TODO.md`; prior decisions in `plans/`.