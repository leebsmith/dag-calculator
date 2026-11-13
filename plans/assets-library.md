---
title: Library assets — fragments, views, and the lupulin pilot
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: the synthetic lupulin fragment and the YCH 2022 fragment validate against the repo-owned contract; the merged hop-products seed is byte-stable; make check and make test green
status: proposed
---

# Library assets — fragments, views, and the lupulin pilot

Status: **proposed**. This plan defines the data contract and the incremental
migration path. Runtime asset serving is a separate, later layer.

## 1. Why

The current reference pipeline lives in the repo: `data/sources` holds raw
inputs, `scripts/build-*.mjs` normalize them, `data/seeds` holds the committed
catalog, and guards such as `seed-rebuild`, `hop-product-tables`,
`sources-manifest`, and `hop-row-schema` keep the copies honest.

The immediate pressure is **lupulin pellets**. One YCH 2022 sheet publishes
alpha minimum and maximum and total oils in mL/100 g for each variety. No other
lupulin product sheet we have found publishes all three. The current
`hop_product` row carries alpha preset and alpha min/max, but no oils, and the
hop-product source is a flat hand-curated list. The data model needs to represent
a product family, a source line, a crop year, and fields that are simply not
published.

The longer goal is an **out-of-repo library builder** that acquires and curates
the sources, emits schema-validated JSON, and publishes a release. The app repo
becomes a consumer of a pinned release rather than the place every scrape and
normalization script lives. That keeps private or raw source material out of the
public app repo and lets the library evolve on its own cadence.

## 2. Decisions (locked)

| # | Decision |
|---|---|
| 1 | **The repo owns the contract.** The fragment/view schema and the record fields are defined here; the assets app consumes and pins them. |
| 2 | **Fragments are per source line.** A sheet or product-line source becomes its own fragment, with provenance. |
| 3 | **The published asset is per catalog kind.** The final files are `hops.json`, `hop-products.json`, `malts.json`, `yeasts.json`, and so on. A fragment is a release partition of one kind, not a competing schema. |
| 4 | **Fragments remain canonical.** The per-kind view is generated from fragments; this makes crop-year updates and provenance cleaner. |
| 5 | **The assets app emits fragments, the asset-owned view, and the manifest.** The repo verifies and overlays the view on any still-legacy rows; it does not own fragment merge logic. |
| 6 | **Layer 1 keeps the frontend on bundled seeds.** The merged per-kind view is generated into `data/seeds`; the frontend does not change in the pilot. |
| 7 | **Layer 2 is a separate runtime-fetch decision.** Once the assets are authoritative and the merge is stable, `backend/assets` can be served and the bundled seed view can retire. |
| 8 | **Records stay pure.** Provenance is a sidecar; it never rides inside a seed row or a batch selection snapshot. |
| 9 | **One source per published field.** Derived values carry a derivation, not a source. Absence means “not published,” not zero. |
| 10 | **Facts, not copied prose.** The asset carries numeric facts, identity, and authored summaries. Source prose, logos, and the raw document stay out of the public repo. |
| 11 | **The artifact still schematizes the record.** New seed fields (the oils) are added to the `hop_product` primitive schema, not invented only in the asset contract. |

## 3. Architecture

```
assets app (out of repo)
  sources + curation
        │
        ▼
fragments/ych-cryo-2022.json        per source line
        │  merge by record id
        ▼
views/hop-products.json             asset-owned records
manifest.json                       release id, hashes, sources
        │  repo overlay (layer 1)
        ▼
data/seeds/hop-products.json        published seed view
        │
        ▼
frontend reference cache            bundled today, runtime in layer 2
```

The repo owns:

- the fragment/view schema and the record contract;
- the Pydantic models and JSON Schema parity guard;
- the overlay of the asset view onto still-legacy seed rows during migration;
- the guards that re-hash and re-merge the release;
- the docs that describe the product data.

The assets app owns:

- source acquisition, normalization, curation, and provenance;
- fragment and view assembly;
- release metadata and hashes.

## 4. Fragment format

A fragment is one source line. It is a valid asset on its own and a partition of
the kind view.

### 4.1 Envelope

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | integer | The fragment envelope contract version. |
| `contract` | object | Repo-owned schema id/version/hash the fragment conforms to. |
| `kind` | string | The catalog kind, e.g. `hop_product`. |
| `asset_id` | string | Stable fragment id, e.g. `ych-cryo-2022`. |
| `release_id` | string | The release that produced the fragment; shared by every fragment in the release. |
| `scope` | object | What this fragment owns: `product_form`, `manufacturer`, `brand`, `crop_year`, and optional notes. |
| `generated_at` | ISO timestamp | When the fragment was emitted. |
| `sources` | array | Source records (§4.3). |
| `records` | array | Pure records conforming to the repo’s record schema (§4.2). |
| `provenance` | object | Sidecar: record id → field → provenance entry (§4.4). |
| `notes` | string (optional) | Fragment-level curation notes. |

The `scope` is a declaration, not an enforcement boundary. The merge is by
record id; two fragments that claim the same record are a release conflict even
if their scopes differ.

### 4.2 Record

The record is the **pure** `hop_product` row, exactly the fields declared by the
artifact’s primitive schema. For the lupulin pilot the published fields are:

| Field | Meaning |
|---|---|
| `id` | Stable record id, e.g. `cryo-citra`. |
| `name` | Display name. |
| `manufacturer` | Maker. |
| `brand` | Product line. |
| `product_form` | `lupulin_pellet`. |
| `alpha_acid_min_pct` | Published minimum, as the repo’s fraction (0.22, not 22). |
| `alpha_acid_max_pct` | Published maximum. |
| `total_oil_min_ml_per_100g` | Published oil minimum, mL/100 g. |
| `total_oil_max_ml_per_100g` | Published oil maximum, mL/100 g. |
| `notes` | Authored summary; never copied source prose. |
| `url` | Product or source page. |

The fragment carries **published** fields only. The view adds the derived presets:

- `alpha_acid_pct` = midpoint of the published alpha range;
- `total_oil_ml_per_100g` = midpoint of the published oil range, when both ends
  exist.

A field that is not published is omitted from the record. It is not zero and it
is not filled from another source.

### 4.3 Source

| Field | Meaning |
|---|---|
| `id` | Stable source id, e.g. `ych-cryo-2022`. |
| `url` | The document URL. |
| `title` | Document title. |
| `retrieved_at` | ISO date. |
| `document_sha256` | SHA-256 of the retrieved document. |
| `pages` | Page count, optional. |
| `license` | Licence or terms note, optional. |
| `notes` | Acquisition or interpretation note, optional. |

The raw document is not committed to the public repo. The assets app may archive
it privately; the public release carries the URL, hash, and page references.

### 4.4 Provenance sidecar

The sidecar is keyed by record id, then by field:

| Entry field | Meaning |
|---|---|
| `source` | Source id for a published field. Exactly one. |
| `page` / `section` | Where in the document the value appears. |
| `basis` | `published`, `derived`, `authored`, or `identity`. |
| `derived_from` | For `derived`: the published fields the value is computed from. |
| `note` | Optional interpretation or caveat. |

Rules:

- every non-empty published field has exactly one source entry;
- every source reference names a source in the fragment’s `sources`;
- every derived value has `basis: derived` and `derived_from`, and no source;
- authored prose has `basis: authored`; identity fields may be `identity`;
- an absent field has no entry; the record simply omits it;
- a provenance key that names an undeclared field fails the release.

Example shape for one record:

- `alpha_acid_min_pct` → `{ source: "ych-cryo-2022", page: 2, section: "Citra", basis: "published" }`
- `alpha_acid_max_pct` → same source, page, section, `basis: published`
- `alpha_acid_pct` → `{ basis: "derived", derived_from: ["alpha_acid_min_pct", "alpha_acid_max_pct"] }`
- `total_oil_min_ml_per_100g` → `{ source: "ych-cryo-2022", page: 2, section: "Citra", basis: "published" }`
- `notes` → `{ basis: "authored" }`

A Lupomax fragment with no oil data simply has no oil entries and no oil fields.
The coverage report says “alpha published; oils not published.”

## 5. Manifest

The manifest is the release contract between the assets app and the repo.

| Field | Meaning |
|---|---|
| `release_id` | Stable release identifier. |
| `generated_at` | ISO timestamp. |
| `tool` | Builder/version that emitted the release. |
| `schema_version` | Envelope contract version. |
| `contract` | Envelope schema id/version/hash. |
| `artifact` | Artifact schema version and hash the records were validated against. |
| `sources` | Aggregated source list across fragments. |
| `fragments` | Per fragment: `asset_id`, `kind`, `path`, `sha256`, record count, source ids. |
| `views` | Per view: `kind`, `path`, `sha256`, fragment ids, record count. |
| `content_hash` | Canonical release hash, optional if the per-file hashes are enough. |

The repo’s guard must be able to:

- validate each fragment and view against the contract;
- re-hash each file and compare the manifest;
- re-merge the listed fragments and compare the view hash;
- confirm every record field is declared by the artifact’s record schema;
- confirm every record id appears in exactly one fragment;
- confirm every source/provenance reference resolves.

## 6. Contract ownership

The repo owns the schema:

- `backend/app/schemas/assets.py` defines the Pydantic envelope, source,
  provenance, fragment, manifest, and view models.
- `data/asset_schemas/fragment.schema.json` and
  `data/asset_schemas/manifest.schema.json` are the committed JSON Schema
  forms, generated from the Pydantic models and parity-guarded.
- The assets app pins the schema hash and validates before emitting.
- The backend validates the vendored release on load; the repo guard validates
  it in CI.
- The record fields are validated against the artifact’s `hop_product`
  primitive schema, not a second hand-written row schema.

The fragment model cannot meaningfully enumerate the artifact’s record fields as
Pydantic attributes, because the record contract is the artifact. The fragment
model therefore validates the envelope and provenance, and a separate
artifact-schema validator checks each record.

### 6.1 Artifact prerequisite: the oil fields

Add optional display fields to the `hop_product` primitive schema:

- `total_oil_min_ml_per_100g`
- `total_oil_max_ml_per_100g`
- `total_oil_ml_per_100g`

They are seed/display fields; no solver consumes them. Store the unit in the
field name rather than introducing a new dimension for a value the model does
not calculate. Add the presentation labels/hints and any picker display in the
same change.

This is a real artifact change: run `make generate` and update the inventory,
glossary, registry labels, and the report bundle fixture as the guards require.

## 7. Layer 1 — the merged seed view

The assets app emits `backend/assets/fragments/*.json`,
`backend/assets/views/hop-products.json`, and `backend/assets/manifest.json`.

The repo generates the published seed:

1. Start from the asset-owned view.
2. Read the still-legacy `data/sources/hop-products.json` rows.
3. Drop legacy rows whose ids are owned by the asset view.
4. Overlay the asset rows; fail on an unknown or duplicate id.
5. Add the derived presets (alpha midpoint, oil midpoint) if the assets app did
   not already include them.
6. Sort deterministically and write `data/seeds/hop-products.json`.

This is a strangler step. The fragment owns lupulin rows; the legacy source
continues to own the unmigrated rows. The asset-owned id set is explicit in the
manifest/guard, so there is never a silent duplicate.

The docs table in `docs/hops/hop-products.md` remains the human ledger. The
existing `hop-product-tables` guard is updated to validate the fragment/view
against that ledger, or the table is generated from the view. One number must
still live in one place; the fragment is the executable source for the pilot.

## 8. Layer 2 — runtime assets (later)

Once the assets are authoritative:

- the backend serves a public, versioned asset manifest and view;
- the frontend fetches once at boot into the reference cache, with a content
  hash and an IndexedDB/cache fallback;
- `data/seeds` retires or becomes a test/offline fallback;
- the batch selection snapshots keep frozen reports stable; the asset release
  hash is provenance, not batch state.

This layer is deliberately out of the pilot gate. The async boot, public route,
cache, and offline behavior deserve their own plan.

## 9. The lupulin pilot

The first real fragment is the YCH 2022 Cryo Hops overview sheet:

- `backend/assets/fragments/ych-cryo-2022.json`
- source: the YCH 2022 sheet, URL, retrieved date, PDF SHA-256, page references;
- one record per published variety;
- published alpha min/max and oil min/max (mL/100 g);
- derived alpha and oil midpoints in the view;
- authored notes and product URL;
- no copied sheet prose.

Other lupulin families follow as their own fragments:

- Lupomax 2025/2023: alpha published, oils not published;
- other concentrate/extract lines as their sources allow;
- a new crop year is a new fragment that supersedes the active record in a later
  release; the record id stays stable, and the manifest lists only the active
  fragment for that id.

The current `hop-products.md` §4 tables and the seed rows remain the comparison
target until the hop-product kind is fully migrated.

## 10. Test fixture

Start with a synthetic fixture before the real sheet:

- `tests/conformance/fixtures/assets/lupulin-test.json`
- `tests/conformance/fixtures/assets/lupulin-test.manifest.json`

The fixture has one source and two records:

- one complete record with alpha and oils;
- one record with alpha only, oils absent.

The view adds the derived midpoints. The manifest lists the fragment and the
view.

The fixture exercises:

- Pydantic envelope/provenance validation;
- artifact record-field conformance;
- source and provenance reference resolution;
- derived fields with `derived_from` and no source;
- absence preserved, not zero;
- deterministic merge and idempotence;
- duplicate id with different content failing;
- view hash matching the manifest;
- seed overlay producing the expected `hop-products` view.

## 11. Guards and tests

| Suite | Coverage |
|---|---|
| `tests/backend/test_assets.py` | Pydantic fragment/manifest, provenance references, derived/absent rules. |
| `tests/guards/assets-contract.test.js` | JSON Schema/Pydantic parity, fragment/view/manifest hashes, record field conformance, merge idempotence, duplicate conflict, seed overlay. |
| `tests/guards/hop-product-tables.test.js` | The fragment/view and the human ledger agree, or the ledger is generated. |
| `tests/guards/hop-row-schema.test.js` | Oil fields are schema-declared; seed rows remain pure. |
| `tests/guards/seed-rebuild.test.js` | The merged `hop-products` seed is reproducible from the assets plus legacy rows. |
| `tests/frontend/...` | The bundled seed view still loads; layer 2 adds fetch/cache tests later. |

The full gate remains `make check` and `make test`; artifact changes also run
`make generate` and `make verify`.

## 12. Migration phases

| Phase | Scope | Gate |
|---|---|---|
| P0 | Contract, Pydantic models, oil fields, synthetic fragment/manifest, guards. | `make check`, `make test`; schema parity. |
| P1 | YCH 2022 fragment, asset-owned hop-product view, seed overlay, docs, guards. | The seed is byte-stable; the frontend is unchanged; `make verify`. |
| P2 | Remaining hop-product fragments (T-90, extracts, Lupomax, other lines). | The hop-product kind is fully asset-owned; the legacy hop-product source retires. |
| P3 | Other kinds, one at a time: malts, yeasts, styles, water, equipment. | Each kind’s view is generated from fragments; its builder retires. |
| P4 | Runtime asset serving and the async frontend cache. | Separate plan; offline/caching/failure modes decided. |

## 13. Non-goals

- No solver changes; oils are display/seed data.
- No runtime fetch in the pilot.
- No copy of the raw source PDFs, source prose, or logos into the public repo.
- No merge of two sources into one field; one source per published field.
- No batch/report schema change for provenance in the pilot; selection
  snapshots already freeze values.

## 14. Risks

- **Duplicate truth during migration.** The asset-owned id set must be explicit
  and the guard must fail on duplicates. Never let a legacy row and a fragment
  both claim the same id.
- **Crop-year supersession.** Stable record ids plus a new fragment/release is
  the rule; the manifest lists only the active fragment for a record.
- **Artifact change.** The oil fields require `make generate` and the docs;
  the report catalog/fixture may change.
- **Prose and licensing.** Keep authored summaries; cite sources; keep raw
  material private; have a removal path for a source or field.
- **Layer 2 scope creep.** Runtime fetch changes boot, caching, tests, and
  failure modes; keep it out of the pilot.

## 15. Open decisions

1. Oil field naming and whether they are untyped display fields or a new
   `oil_content` dimension. The recommendation is untyped fields with the unit
   in the name.
2. `crop_year` at the fragment scope only, or also a record field. The
   recommendation is fragment scope plus authored notes for the pilot.
3. Whether the docs table is generated from the view or remains the human ledger
   with a guard. The recommendation is the ledger with a guard in P1, generated
   once the kind is fully migrated.
4. Whether the asset-owned view is committed under `backend/assets/views` or
   regenerated locally by the repo. The recommendation is committed, so the
   release is reproducible without the assets app.
5. The exact release cadence and how a new crop year is published (new fragment,
   same record id, manifest active set).

## 16. Execution checklist

- [ ] Define the Pydantic envelope/source/provenance/fragment/manifest/view models.
- [ ] Commit the generated JSON Schemas and the parity guard.
- [ ] Add the oil fields to `hop_product`, labels, and generated docs.
- [ ] Add the synthetic lupulin fragment and manifest fixtures.
- [ ] Add the asset contract/merge/overlay guards.
- [ ] Add the YCH 2022 fragment and the asset-owned hop-product view.
- [ ] Generate the merged `data/seeds/hop-products.json`; keep the frontend unchanged.
- [ ] Update `docs/hops/hop-products.md` and the hop-product table guard.
- [ ] Run `make generate`, `make check`, `make test`, and `make verify`.
- [ ] Move this plan to `plans/archive/YYYY-MM/` when the pilot is complete.
