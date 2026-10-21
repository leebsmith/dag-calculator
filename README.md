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
| [`data/`](data/) | the artifact, the catalog registry (`catalogs.json`), and seed catalogs |
| [`frontend/`](frontend/) | engine, views, adapters, stores (Vite + Alpine) |
| [`backend/`](backend/) | FastAPI JSON seam, solvers, auth, persistence |
| [`tests/`](tests/) | frontend engine/conformance/guards + backend pytest |
| [`docs/dag-artifacts/`](docs/dag-artifacts/) | **living spec** — grammar, semantics, dimensions, domain equations, expression language, seed substrate, node reference |
| [`docs/engine.md`](docs/engine.md) | **living** — how the reference engine works (data structures + interpreter) |
| [`docs/adding-a-node.md`](docs/adding-a-node.md) | **living** — recipe: add an input / derived value to the artifact |
| [`docs/historical/`](docs/historical/) | **frozen** ingestion/validation snapshots (not maintained) |
| [`docs/style-conformance.md`](docs/style-conformance.md) | **living** — style-conformance assessor (adherence index + drift status) |
| [`docs/style-rulebook.md`](docs/style-rulebook.md) | CSS design-token conventions |
| [`plans/`](plans/) | execution history — step plans + explorations |
| [`TODO.md`](TODO.md) | remaining work |

## Commands

```
make local-dev   # Vite + Firebase emulators + uvicorn
make check       # eslint/stylelint + ruff + tach
make test        # frontend (node --test) + backend pytest
make verify      # check + test + production build
make build       # frontend bundle + dist assertions (unresolved includes, assets)
make test-oracle # assert the committed oracle snapshot matches the legacy checkout
make verify-full # verify + test-oracle
make coverage    # frontend line/branch + backend statement coverage
```

The frontend differential suite (`tests/conformance/parity.test.js`) compares
artifact functions against `tests/conformance/fixtures/oracle-parity.json`, a
snapshot of the legacy pure modules. Refresh the snapshot with
`node tests/conformance/emit-oracle-fixture.mjs --write` and confirm it with
`make test-oracle`; `make verify` itself needs no legacy checkout.

## Auth & deployment

Sign-in is Google-only (`signInWithPopup`, redirect fallback); anonymous auth
has been removed. The backend verifies ID tokens with `check_revoked=True`, then
requires a **verified email present in `ALLOWED_EMAILS`** (comma/space-separated,
case-insensitive). An unset or empty allowlist **fails closed**. `GET /session`
is auth-only and reports `{uid, email, allowed}` so the app can show a blocked
screen before signing the user out.

Firebase console setup:

- Enable the **Google** provider under Authentication → Sign-in method.
- Add every hosting domain (including `localhost` for dev) under Authentication →
  Settings → **Authorized domains**.
- Configure the OAuth consent screen (testing mode is fine for a small allowlist;
  external/published otherwise).

`make local-dev` passes `ALLOWED_EMAILS=dev@localhost` to the backend; sign in to
the Auth emulator with that Google account (or change the Makefile value).

Deployment notes:

- `make deploy-backend` vendors `data/artifact.json` and `data/catalogs.json`
  into `backend/app/_vendor/` before deploying (the Cloud Run source is
  `backend/`, so `data/` is otherwise absent). The backend logs the resolved
  artifact directory at startup.
- Set the production allowlist on Cloud Run, e.g.
  `gcloud run services update dag-calculator-backend --region us-east4 --update-env-vars ALLOWED_EMAILS=you@example.com`.
- Batches live at `users/{uid}/batches/{id}`; catalog records at
  `users/{uid}/catalog_items/{id}`. Firestore security rules should scope both to
  the authenticated uid (the browser only talks to the API).

## Seeds & scraping

Reference catalogs are rebuilt in two stages:

```
scrape / fetch (network)                  normalize (offline)              shipped
data/sources/*.json  ──────build-*.mjs──▶  data/seeds/*.json  ──▶  runtime cache
```

- **Raw sources** are committed under [`data/sources/`](data/sources/): the
  beer-analytics.com hop/yeast scrapes, the BJCP 2015/2021 style
  scrape+aggregate outputs, the malt_database fermentables scrape, and the
  standard-malt list + malt→standard crosswalk. `data/sources/manifest.json`
  records each source's mechanism, upstream, content hash, and row count (guarded
  by `tests/guards/sources-manifest`).
- **Scrapers/aggregators** live under [`scripts/scrape/`](scripts/scrape/)
  (Python): the beer-analytics hop/yeast scrapers and the BJCP category scraper
  + aggregator. Dependencies are per-pipeline `requirements.txt` files, kept out
  of the backend's dependency set.
- **Builders** are the Node `scripts/build-*-seed.mjs` normalizers. The
  fermentables pipeline is two-stage: `build-fermentables-seed.mjs` (source →
  `malts.json`/`sugars.json`, classifying each malt via the crosswalk) then
  `build-standard-malts-seed.mjs` (derives the generic `standard-malts.json`
  representative set from `malts.json`). Every builder exports its pure
  normalizer and writes only when run as a CLI, so
  `tests/guards/seed-rebuild` can assert the committed seeds equal a fresh
  rebuild of `data/sources/`.
- The BJCP scraper caches category HTML (not committed); the aggregator reads
  that cache offline. The styles seed is built from the **2021** aggregate; the
  **2015** aggregate is preserved as a source but not merged.

```
make scrape-yeasts              # crawl yeasts  -> data/sources/beer-analytics-yeasts.json
make scrape-hops                # crawl hops    -> data/sources/beer-analytics-hops.json
make aggregate-bjcp BJCP_CACHE=<cached-html-dir> BJCP_EDITION=2021
make seeds                      # rebuild data/seeds/ from data/sources/
```

Scrapers identify the operator in the `User-Agent` and throttle between requests.
beer-analytics.com content is © Beer Analytics (CC BY-SA 4.0). BJCP style-guide
content is © BJCP; this project uses it for personal, non-redistributed use.

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
