---
title: Fermentables Sourcing — beer-analytics catalog + Brewtarget yields
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: malts/sugars seed rebuilt from committed sources; crosswalk guarded; lint + tests + build green
status: superseded
---

# Fermentables Sourcing — beer-analytics catalog + Brewtarget yields

> **Superseded.** The malts/sugars seed is now built from the personal
> malt_database scrape (real notes + per-malt yield) instead of the
> beer-analytics + Brewtarget crosswalk proposed here. See
> `scripts/build-fermentables-seed.mjs` and
> `data/sources/malt-database-malts.json`. The beer-analytics-vs-Brewtarget
> source comparison below is retained for reference only.

## Goal

Give the malt/sugar catalogs a real, reproducible sourcing pipeline: keep
beer-analytics as the **catalog/metadata** layer (generic names, aliases,
popularity, descriptions/notes, color) and add **Brewtarget** as the
**per-malt yield** source, joined by a committed, reviewed crosswalk.

## Background

Today `data/seeds/malts.json` (115) and `sugars.json` (17) are the only
artifacts. They came from the legacy `~/Development/brewing-calculator/
scripts/build_fermentables.py`, which:

- had the beer-analytics catalog **baked in** (`RAW_FERMENTABLES`, 132 items —
  the scraped catalog), with no committed raw and no fetch code (the `urllib`
  import is unused);
- **synthesized** the technical fields from a hand-curated spec table and
  category defaults (yield/potential SG, color from names, a constant 4%
  moisture, category pH/buffer values).

That generator is not in this repo, and the catalog/notes are not
beer-analytics's actual prose. We want a first-party, reproducible pipeline.

Already settled in earlier work:

- **pH / buffer** are not seed fields: the water solver derives grain acidity
  from `category` + `color_lovibond` (`backend/app/core/water.py`,
  `GRAIN_ACIDITY`). `di_ph`/`buffer_index` were removed.
- **Moisture** is a batch-level solver input: `batch.grain_moisture_fraction`
  (default 4%) is forwarded as `mc_i` for every grain-bill row. `moisture_pct`
  was removed from the catalog and rows.
- **Yield** is the only technical seed field still open.

## Source comparison (findings)

| Source | Catalog | Yield | Color | Moisture | Notes | License |
|---|---|---|---|---|---|---|
| **beer-analytics** | 237 generic, deduped, aliases + recipes count | — | ✅ EBC/°L | — | ✅ full profile on every detail page (verified malt + sugar) | CC BY-SA |
| **Brewtarget** (`data/DefaultContent001-OriginalDefaultData.xml`) | 369, 275 producer-prefixed | ✅ 367/369 | ✅ 361 | ⚠️ 186 (median 4.2%, 1.9–9%) | ⚠️ 185/369, terse | GPL-3.0 |
| Brewer's Friend | large | ✅ PPG | ✅ | — | — | proprietary/ToS |
| Maltster sheets | per-malt | ✅ | ✅ | ✅ | ✅ | varied |

Brewtarget yield coverage is strong; its catalog is producer-specific and its
notes are half-empty, which is why it is an **enrichment** source, not the
catalog.

## Decisions (recommended; confirm the open ones)

1. **beer-analytics = catalog + notes + aliases + popularity + color.** Re-scrape
   it (index + detail pages) into a committed raw source. `notes` come from the
   site's detail descriptions (what we want), not from the legacy generator.
2. **Brewtarget = per-malt `yield_fraction`** (`YIELD / 100`), matched through an
   explicit committed crosswalk. Category default where unmatched.
3. **Crosswalk is deterministic and committed**, produced at authoring time —
   never fuzzy-matched during the build. Optional LLM assistance may *propose*
   matches, but the committed mapping is the source of truth.
4. **Generic-first** matching: prefer a generic Brewtarget entry; fall back to a
   named maltster only when no generic exists (e.g. Maris Otter → Simpsons).
5. **Yield-only** for now; beer-analytics color stays primary. Brewtarget color
   may be used as a cross-check later.
6. **One builder** (`build-fermentables-seed.mjs`) emitting malts + sugars.
7. **GPL-3.0**: accepted for the Brewtarget-derived yield (personal use;
   attribution + share-alike if the repo is ever distributed).

## Pipeline

```
beer-analytics scrape (network) ─┐
                                 ├─▶ data/sources/*.json (committed) ─▶ build-fermentables-seed.mjs ─▶ data/seeds/{malts,sugars}.json
Brewtarget fetch (network) ──────┘            │
                                              └─ fermentables-crosswalk.json (committed, reviewed)
```

1. **Vendor a beer-analytics fermentables scraper** (`scripts/scrape/`), modeled
   on the hop/yeast scrapers: parse the `/fermentables/` index by category
   (Base, Caramel/Crystal, Toasted, Roasted, Other, Adjunct, Unmalted Adjunct,
   Sugar, Malt Extract; exclude Fruit and Spices & Herbs), capturing:
   name, category/type, aliases (`data-search-term`), recipes count, detail-page
   description, color (EBC/°L), URL. Cache HTML locally; commit only the JSON
   (`data/sources/beer-analytics-fermentables.json`).
2. **Vendor/fetch Brewtarget fermentables** (normalize the XML, or use
   `default_db.sqlite` if it proves richer) into
   `data/sources/brewtarget-fermentables.json` (name, type, yield, color), with a
   GPL-3.0 notice. Commit the normalized JSON (not the 1 MB XML necessarily).
3. **Author `data/sources/fermentables-crosswalk.json`**: `catalog_id →
   brewtarget NAME` (or `null`), with `basis` (`generic` | `maltster` |
   `alias` | `manual`) and an optional `confidence`. Every catalog id appears;
   `null` is an explicit fallback. Review ambiguous matches; yield drives
   `m_grist`, so a caramel→base mismatch would be materially wrong.
4. **`build-fermentables-seed.mjs`**:
   - catalog id/name/category/type/notes/color from beer-analytics;
   - `yield_fraction` from the crosswalked Brewtarget `YIELD / 100`, else a
     category default (BASE 0.80, CRYSTAL 0.74, ROASTED 0.60, ACID 0.74;
     sugars 0.95–1.00);
   - map beer-analytics category → `malt_category` / sugar;
   - no moisture / di_ph / buffer_index.
5. **Manifest + guards**: add both sources to `data/sources/manifest.json`;
   guard (a) every catalog id is present in the crosswalk, (b) every matched
   yield is within a sane category band, (c) no duplicate ids, (d) sources hash
   match. Tests: seed conformance + a crosswalk-coverage test + fallback test.

## Data-model shape (target seed components)

- malt: `id, name, category, yield_fraction, color_lovibond, notes`
- sugar: `id, name, yield_fraction, color_lovibond, notes`

(Unchanged from today's schemas minus the removed moisture/pH/buffer fields.)

## Risks

- **Crosswalk quality** — the main risk. Mitigate with explicit review,
  generic-first preference, and category-band guards.
- **GPL-3.0** — yield data carries share-alike obligations if distributed.
- **Freshness** — new/renamed beer-analytics items require re-crosswalking; the
  completeness guard should fail loudly.
- **Brewtarget is community-curated** — prefer generic entries, spot-check
  outliers.
- **Notes source** — beer-analytics prose is CC BY-SA; the current seed's notes
  are legacy and will be replaced.

## Open questions (for review)

1. **Crosswalk preference**: generic-first (recommended) vs named-maltster-first?
2. **GPL-3.0** acceptable for the Brewtarget yield enrichment?
3. **Color**: yield-only (recommended) or also reconcile with Brewtarget color?
4. **Crosswalk authoring**: manual review only, or LLM-assisted proposals then
   reviewed and committed?
5. **Brewtarget raw**: commit the normalized JSON (recommended) or the original
   XML?
6. **Scope**: one builder for malts + sugars (recommended) or separate?
7. **Re-scrape beer-analytics**: proceed now (needed to get the real notes and
   current 237-item catalog), or keep the baked 132-item catalog for this step?

## Staging

- **F.1** Vendor the beer-analytics fermentables scraper + committed raw; keep
  the old seed buildable.
- **F.2** Vendor/normalize the Brewtarget fermentables raw + GPL notice.
- **F.3** Author the crosswalk (generic-first) + coverage guard.
- **F.4** `build-fermentables-seed.mjs` (beer-analytics metadata + Brewtarget
  yield + fallbacks) + tests.
- **F.5** Manifest entry, docs (`data/README`, `seed-substrate`), retire the
  legacy generator lineage notes.

## Out of scope

- LLM generation of yields or notes (considered; rejected/deferred).
- Per-malt moisture (batch-level by decision) and per-malt pH/buffer
  (category+color by decision).
- Per-field provenance in the seed (the committed sources/crosswalk carry the
  attribution).
