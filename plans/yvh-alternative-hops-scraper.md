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

- [ ] Add `scripts/scrape/yvh/scrape_yvh.py` and its isolated requirements
- [ ] Add the `scrape-yvh` Makefile target and help line
- [ ] Run it, commit `data/sources/yvh-products.json`, re-emit the sources manifest
- [ ] Add a source-contract guard for the snapshot
- [ ] `make check` and `make test` green

## Result

Filled in on completion.
