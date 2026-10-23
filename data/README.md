# Data

- `artifact.json` — the canonical DAG (source of truth for business logic).
- `seeds/` — the immutable reference catalogs
  (malt/sugar/yeast/hop-product/equipment/water/styles), the normalized,
  schema-conforming output of the build scripts.
  `seeds/standard-malts.json` is a **derived** catalog — one generic, median-based
  representative per standard-malt class, built by
  `scripts/build-standard-malts-seed.mjs` from `seeds/malts.json` (see
  `docs/dag-artifacts/seed-substrate.md` §2.8).
  `seeds/hop-products.json` is built by `scripts/build-hop-products-seed.mjs`
  from the curated `sources/hop-products.json` (see §2.9).
- `sources/` — the raw, pre-normalization inputs the build scripts consume:
  the beer-analytics.com hop/yeast scrapes, the BJCP 2015/2021 style
  scrape+aggregate outputs, the malt_database fermentables scrape, the
  standard-malt list + malt→standard crosswalk, and the curated flowable
  hop-product source. `sources/manifest.json` records each source's mechanism,
  upstream, content hash, and row count.
- Scraped HTML is never committed; re-running the BJCP aggregator reads a local
  cache (see the root README).

Adding an input or derived value to `artifact.json`? See
[`docs/adding-a-node.md`](../docs/adding-a-node.md).
