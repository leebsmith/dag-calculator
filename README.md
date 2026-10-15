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
| [`docs/dag-artifacts/`](docs/dag-artifacts/) | **living spec** — grammar, semantics, dimensions, domain equations, expression language, seed substrate, node reference |
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

## Maintaining the docs

The **mechanical** half of doc drift is guarded; the **prose** half is a manual
discipline. After any change to `data/artifact.json`:

1. **Re-sync the inventory** (the guard forces this):
   ```bash
   node scripts/emit-artifact-inventory.mjs
   ```
2. **Grep the prose** for what you touched, and update the narrative that still
   describes the old model:
   ```bash
   grep -rn "<id | field | taxonomy | function>" docs/dag-artifacts/ docs/engine.md
   ```
3. **Update the right prose doc** — a rough map:

   | Artifact change | Prose doc(s) |
   |---|---|
   | dimension / unit | `dimensions.md` |
   | primitive_schema | `seed-substrate.md` §2 |
   | function / constant / equation | `domain-equations.md` (+ `expression-language.md` for a new construct) |
   | node kind or shape | `grammar.md` + `semantics.md` |
   | invariant / model rule | `semantics.md` |
   | `schema_version` bump | `grammar.md` §5 (inventory is auto) |
   | engine behavior | `docs/engine.md` |
   | what a node id exposes | `node-reference.md` |
   | taxonomy | wherever it's used (`domain-equations.md` / `seed-substrate.md`) |

4. **Commit the prose with the artifact change** — a model change isn't done
   until the prose that describes it is updated in the same commit.
