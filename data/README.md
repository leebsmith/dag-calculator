# Data

- `artifact.json` — the canonical DAG (source of truth for business logic).
- `seeds/` — the immutable reference catalogs (malt/sugar/yeast/equipment/water/styles),
  the normalized, schema-conforming output of the build scripts.
- `sources/` — the raw, pre-normalization inputs the build scripts consume:
  the beer-analytics.com hop/yeast scrapes, the BJCP 2015/2021 style
  scrape+aggregate outputs, the malt_database fermentables scrape, and the
  standard-malt list + malt→standard crosswalk. `sources/manifest.json` records
  each source's mechanism, upstream, content hash, and row count.
- Scraped HTML is never committed; re-running the BJCP aggregator reads a local
  cache (see the root README).

Adding an input or derived value to `artifact.json`? See
[`docs/adding-a-node.md`](../docs/adding-a-node.md).
