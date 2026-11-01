---
title: YVH advanced-hop-product scraper
status: active
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make check + make test
---

# YVH advanced-hop-product scraper

The hop catalog covers varieties (beer-analytics, 401 rows) but not the advanced
products the bitterness model increasingly needs: flowable extracts, whirlpool
flowables, isomerized extracts, lupulin pellets, oils. Yakima Valley Hops stocks
19 of them and links each manufacturer's tech data sheet from the product page,
so the discovery layer can be scraped and the specs curated from the linked
sheets.

Reconnaissance on the live store:

- the storefront is Shopify; `/products.json?limit=250&page=N` returns all 279
  products in two requests with `title`, `handle`, `product_type`, `tags`,
  `body_html`, `variants`;
- `product_type` separates the advanced set: `Liquid Hop Product` (13),
  `Advanced Hop Products` (4), `LUPOMAX` (2);
- each `body_html` links the manufacturer TDS/whitepaper PDFs, and the text in
  those PDFs carries the alpha range, dose and placement (Incognito's 40–55 %
  and 50–200 g/hL came from one);
- `robots.txt` allows the whole catalogue and `/agents.md` asks agents to
  identify themselves and honour 429/`Retry-After`.

## Decisions

- **Feed, not HTML.** The JSON endpoint is structured, stable and two requests;
  scraping the product pages would re-derive fields the feed already has.
- **Advanced types only.** The variety catalogue stays on beer-analytics; malt,
  yeast, equipment and merch are out of scope. Two items in the advanced types
  are processing aids, not hop products (`hopaid-antifoam`, `hophaze`), and are
  excluded by a named denylist.
- **Spec-sheet URLs are recorded, not fetched.** The snapshot carries provenance;
  no PDF parsing enters the pipeline, so the scraper stays one dependency and
  the curated seed keeps the exact numbers.
- **Top-level array, sorted by handle, no timestamps.** `rowCount` in the sources
  manifest counts array length, and a sorted, timestamp-free file diffs cleanly.
- **Polite by construction.** Identified User-Agent with contact, 1.2 s throttle,
  `Retry-After` honoured on 429.
- **`--check` compares without writing**, so a curator can see what moved
  upstream before committing a new snapshot.

## Steps

- [x] Add `scripts/scrape/yvh/scrape_yvh.py` and its isolated requirements
- [x] Add the `scrape-yvh` Makefile target and help line
- [x] Run it, commit `data/sources/yvh-products.json`, re-emit the sources manifest
- [x] Add a source-contract guard for the snapshot
- [x] `make check` and `make test` green

## Result

`make scrape-yvh` writes `data/sources/yvh-products.json`: 17 advanced products
(19 under the store's advanced types, minus antifoam and haze), each with title,
type, tags, a plain-text description, the manufacturer spec-sheet URLs, and the
product URL. Two requests for the feed, one more for a second page; `--check`
re-ran to zero changes, so the snapshot is reproducible.

- The manifest gained the provenance entry (`mechanism: scrape`, upstream, scraper
  path), so `sources-manifest` holds the hash and row count.
- `tests/guards/yvh-products-source-contract.test.js` pins the record shape,
  the sorted order, the https spec links, the brands the hop model needs, and the
  exclusion of the two processing aids.
- `make check` and `make test` are green (762 backend tests, the frontend suite,
  the guards), and `make scrape-yvh CHECK=1` reports `0 change(s)`.

Not in scope, as planned: no PDF is fetched and no seed record is written. The
spec-sheet URLs are the provenance the curation step reads, and the catalogue
seed still edits by hand one product at a time. The brands YVH does not stock
(DynaBoost, Cryo, HyperBoost, CGX, Hop Shot, SubZero, Abstrax) need their own
sources.

