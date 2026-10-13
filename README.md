# DAG Calculator

A greenfield brewing calculator: a deterministic, explicit-DAG engine that
evaluates a declarative `artifact.json` (grammar, semantics, dimensions, domain
math, seeds, boundaries), driven by an Alpine/Vite frontend and a FastAPI
backend with Firebase auth and Firestore persistence.

## Source of truth

- **Business logic** lives in [`data/artifact.json`](data/artifact.json) — the
  canonical DAG. The engine (`frontend/src/engine/`) interprets it; tests enforce it.
- **Documents** explain the model and its history, but never override the artifact.

## Layout

| Path | Role |
|---|---|
| [`data/`](data/) | the artifact + seed catalogs |
| [`frontend/`](frontend/) | engine, views, adapters, stores (Vite + Alpine) |
| [`backend/`](backend/) | FastAPI JSON seam, solvers, auth, persistence |
| [`tests/`](tests/) | frontend engine/conformance/guards + backend pytest |
| [`docs/dag-artifacts/`](docs/dag-artifacts/) | **living spec** — grammar, semantics, dimensions, domain equations, expression language, seed substrate |
| [`docs/engine.md`](docs/engine.md) | **living** — how the reference engine works (data structures + interpreter) |
| [`docs/adding-a-node.md`](docs/adding-a-node.md) | **living** — recipe: add an input / derived value to the artifact |
| [`docs/historical/`](docs/historical/) | **frozen** ingestion/validation snapshots (not maintained) |
| [`docs/style-rulebook.md`](docs/style-rulebook.md) | CSS design-token conventions |
| [`plans/`](plans/) | execution history — step plans + explorations |
| [`TODO.md`](TODO.md) | remaining work |

## Commands

```
make local-dev   # Vite + Firebase emulators + uvicorn
make check       # eslint/stylelint + ruff + tach
make test        # frontend (node --test) + backend pytest
```

## Living vs. historical

The `docs/dag-artifacts/` spec is maintained in sync with the artifact; the
`docs/historical/` reports are frozen point-in-time records of the legacy →
artifact migration. See [`docs/historical/README.md`](docs/historical/README.md).

`docs/dag-artifacts/inventory.md` is **generated** from `data/artifact.json`
(`node scripts/emit-artifact-inventory.mjs`) and checked by the
`artifact-docs-sync` guard in `make test` — so an artifact change that isn't
re-synced into the inventory fails the gate.
