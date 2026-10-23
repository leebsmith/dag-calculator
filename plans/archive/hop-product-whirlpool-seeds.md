---
title: Flowable whirlpool hop-product seeds
status: executed
completed: 2026-10-23
program: deterministic-dag-calculator
depends_on: [whirlpool-hopping-model]
blocks: []
gate: make check && make test
---

# Plan — Flowable whirlpool hop-product seeds

## Goal

Give the whirlpool card a real product catalog for flowable CO₂ extracts. Today the
whirlpool picker searches the 401-variety `hop` catalog and `makeWhirlpoolRow` hardcodes
`product_form: "t90_pellet"`, so an extract always starts from a leaf/pellet alpha and
requires a manual override.

Add a `hop_product` catalog seeded with the two commercial flowable whirlpool extract
families (DynaBoost and Incognito), plus a generic fallback. Selecting a product copies
its form, typical alpha, and T-90 replacement ratio into the row.

## Decisions already made

- Use a new `hop_product` catalog; do not mix products into `hops.json` (that seed is a
  pure rebuild of the beer-analytics scrape).
- Seed the published alpha range midpoint as the editable default:
  - DynaBoost: 35–50% → 42.5%
  - Incognito: 20–55% → 37.5%
  - Generic: 45% (40–55% preset)
- All eight DynaBoost varieties: Citra, Mosaic, Simcoe, Sabro, Centennial, Idaho 7,
  Chinook, Ekuanot.
- All ten current Incognito varieties: Centennial, Chinook, Citra, Dolcita, Ekuanot,
  El Dorado, Galaxy, Krush, Mosaic, Sabro.
- Generic preset keeps a 1:8 T-90 replacement ratio and shows it.
- The IBU-share inverse model remains the only mass solver.
- The T-90 equivalent is inspector-only. It is `extract mass × replacement ratio`,
  shown only when the row carries a ratio. It is never used for IBU back-solving.
- Ratio-first authoring is deferred.

## Data model

Add `primitive_schemas.hop_product`:

| Field | Shape |
|---|---|
| `id`, `name`, `manufacturer`, `brand`, `variety_id`, `purpose` | text |
| `product_form` | taxonomy `whirlpool_hop_form` |
| `alpha_acid_pct`, `alpha_acid_min_pct`, `alpha_acid_max_pct`, `beta_acid_pct`, `total_oil_pct` | percentage `[0, 1]` |
| `t90_replacement_ratio` | dimensionless, `gte 0` |
| `notes`, `url` | text |

Add optional `t90_replacement_ratio` to `whirlpool_hop_row` (dimensionless, `gte 0`) so
the inspector can render the equivalent from the row snapshot.

Register `hop_product` in `data/catalogs.json` with `seed_key: "hopProducts"` and no
engine `references_key`; whirlpool rows copy values rather than resolving a reference.

## Seed pipeline

- `data/sources/hop-products.json` — curated 19-row source with official product URLs.
- `scripts/build-hop-products-seed.mjs` — percentage → fraction, sort by id, and verify
  every `variety_id` exists in `data/seeds/hops.json`.
- `data/seeds/hop-products.json` — generated flat id-keyed map.
- `Makefile` — add `seeds-hop-products` (depends on `seeds-hops`) and include it in
  `make seeds`.
- Regenerate `data/sources/manifest.json`.

## Runtime

- `frontend/src/store/referenceCache.js` — import and expose `hopProducts` in `BASE_SEEDS`.
- `frontend/src/adapters/cards/catalogDraft.js` — optional `catalog`, `catalogNameOf`, and
  `searchFields` config. This lets the whirlpool drawer switch catalogs without duplicating
  state, and routes “Copy” to the right user catalog.
- `frontend/src/adapters/cards/hops.js`:
  - `whirlpoolHopCatalogForm` state and setter.
  - `t90_pellet` → `hops`, `flowable_extract` → `hopProducts`.
  - `makeWhirlpoolRow` copies `product_form`, `alpha_acid_pct`, and
    `t90_replacement_ratio`.
  - Inspector getter `whirlpoolHopT90Equivalent`: live mass from the active draft row
    times the ratio, formatted in grams; empty when not applicable.
  - Product item meta: brand, alpha, manufacturer. No ratio in the picker.
- `frontend/src/partials/modal-whirlpool-hop-editor.html` — catalog form selector and the
  inspector-only T-90 equivalent line. Update alpha hints to the product ranges.
- `frontend/src/partials/step-hops.html` — update the flowable extract alpha hint.

## Tests

- Seed conformance for `hop-products.json` → `hop_product`.
- Backend `SEED_FILES` includes `hop_product`.
- Seed-rebuild guard for the new builder.
- Sources manifest guard (regenerated).
- Shared validation-parity fixture gains a `hop_product` case.
- Hops card: adding DynaBoost/Incognito copies form and alpha; inspector equivalent shows
  for a ratio-bearing row and hides for T-90.
- Catalog draft: dynamic catalog and `catalogNameOf` route add/copy correctly.

## Docs

- `docs/dag-artifacts/seed-substrate.md` — document `hop_product` and the curated source.
- `docs/whirlpool-hopping-model.md` — product alpha ranges, seeded presets, and the
  inspector-only T-90 equivalent (not a mass solver).
- `data/README.md` and `README.md` — mention the new source, builder, and seed.
- Re-emit `docs/dag-artifacts/inventory.md`.

## Gate

`make check` and `make test` green. Then archive this plan under `plans/archive/`, add the
archive index row, and record it under `TODO.md` Done.
