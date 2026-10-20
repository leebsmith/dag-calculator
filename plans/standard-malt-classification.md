---
title: Standard-Malt Classification — Generic Description Backfill
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: every seed malt carries standard_malt + generic_description; crosswalk covers all slugs; lint + tests + build green
status: done
---

# Standard-Malt Classification — Generic Description Backfill

> **Done.** Implemented across `4be62c5` (S.1 list), `a99ecec` (S.2 crosswalk),
> `4af9bdf` (S.3 builder + schema), `c4f2f7e` (S.4 guard). Every seed malt now
> carries `standard_malt` + `generic_description`.

## Goal

The seed's `notes` are spotty (1 empty, 84 truncated marketing paragraphs, 176
short flavor lines). Give every malt a **reliable generic description** by
classifying it against the `malt_database` standard-malt list (extended to cover
our catalog) and storing both a `standard_malt` id and a `generic_description`
on each seed malt — while keeping the specific `notes`.

## Background

`malt_database/config/standard_malts.tsv` is a source-independent reference of
67 standard malts/adjuncts, each with a one-line `notes`. Our 316-malt seed
cannot map onto it unambiguously as-is: ~40 categories have no entry (varietals,
distilling, functional/specialty, off-ladder crystal grades, roasted rye/wheat,
extra flakes) and a few families are inherently fuzzy (toasted/kilned cluster,
Munich light/dark).

## Decisions (locked)

1. **Output** — add `standard_malt` (id) + `generic_description` (text); keep the
   specific `notes`.
2. **Granularity** — one entry per **materially-distinct class** (not per-malt,
   not a coarse catch-all). `name` keeps the specific identity; the class keeps
   the brewing context.
3. **Varietals** — per-varietal entries (Maris Otter, Golden Promise, Chevallier,
   Halcyon, Pearl, Optic, Haná, Spring); each collapses its producer variants.
4. **Gaps** — extend the standard list rather than fall back to a generic bucket.
5. **Location** — in dag-calculator: the extended list and the crosswalk are
   committed under `data/sources/`; `build-fermentables-seed.mjs` applies them.
6. **Determinism** — the crosswalk is authored/reviewed and committed; never
   fuzzy-matched at build time.

## Data model

`data/sources/standard-malts.json` — id-keyed map of
`{ id, name, family, form, color_lovibond_min, color_lovibond_max, aliases,
description }` (seeded from the tsv + extensions; provenance in the manifest).

`data/sources/malt-standard-crosswalk.json` — `{ "<seed-slug>": "<standard-id>" }`,
one entry per seed malt.

Seed `malt` gains two plain-string fields (`standard_malt`, `generic_description`),
declared in `primitive_schemas.malt`; `category` (mash-pH taxonomy) is untouched.

## Pipeline

```
standard_malts.tsv ──vendor+extend──▶ data/sources/standard-malts.json
seed slugs ──propose+review──▶ data/sources/malt-standard-crosswalk.json
        build-fermentables-seed.mjs ──▶ data/seeds/malts.json (+ standard_malt, generic_description)
```

## Staging (one commit per stage)

- **S.1** Vendor + extend the standard list (varietals, distilling, specialty
  crystal, red/kilned specialty, off-ladder crystal bins, roasted rye/wheat,
  extra flakes) into `data/sources/standard-malts.json`; add to the manifest.
- **S.2** Author `data/sources/malt-standard-crosswalk.json` — rule-based
  proposal (producer-prefix strip → alias match → color bin → keyword rules),
  then curated review of the ambiguous/gap assignments.
- **S.3** `build-fermentables-seed.mjs` joins the crosswalk + list and emits the
  two new fields; add them to `primitive_schemas.malt`; resync inventory +
  `seed-substrate.md` §2.1 + `data/README.md`.
- **S.4** Guards: crosswalk coverage (every seed slug present, every target a
  valid standard id); manifest integrity.
- **S.5** Rebuild the seed; `make test` + `make check` + `vite build`.

## Out of scope

- Sugars (the standard list has no sugar entries).
- Editing/removing the existing `category`/`yield`/`color` fields.
- Per-malt yield/color reconciliation (this is description-only).
