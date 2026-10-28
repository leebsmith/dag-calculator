# Fermentability provenance — Pass 1 refactor plan

Status: **complete**. Pass 1 landed in the producer (`malt_database` `823fd6e`,
`53852f0`, `afe1d4f`, `b26bc0a`; consumer `dag-calculator` `a82c7f5` (B1),
`2957f46` (B2), plus B3 yeast provenance). The passes this plan deferred landed
elsewhere: Pass 2 (sugar F, bounds as floors, STA1) and Pass 3 (the pin) as
`plans/archive/attenuation-refactor.md` and
`plans/archive/late-addition-intent.md`.

Deviations from the staging below, recorded so Pass 2 inherits the real shape:

- Provenance is keyed by the **source key** (the intermediate file stem), not
  the row's brand: Northern Brewer's dump carries L.D. Carlson products, and the
  citation belongs to the document. `source_id` is `<source>/<product-slug>`.
- Yield bounds are `unknown` in Pass 1 (the extract qualifier is unparsed);
  fermentability bounds are point/min.
- The consumer's row schemas (`grist_row`, `sugar_row`, `trace_malt_row`) had to
  declare the provenance fields, not just the catalog schemas, or the report
  catalog could not cover a frozen batch.
- Ingestion resolution lives in the engine (`ingredientPriors.js`), not in
  `catalogDraft.js`: collection rows are resolved when they enter evaluation, so
  direct engine callers and the session see the same rows.
- Yeast citations are aggregator-level (`kind: "aggregator"`, no page hash).

This document was the commit contract: each commit lists what it owns, what it
must not touch, and the gate that proves it.

## 1. Problem

`dag-calculator` asserts a category prior as if it were measured data:

- 0 of 467 malt source rows carry `fermentability_fraction`; all 361 seed rows
  hold a builder default (`build-fermentables-seed.mjs`).
- The 18 Briess extract rows publish a *fermentability* figure that the producer
  stores in the `yield_fraction` slot with `yield_basis: "fermentability"`; the
  importer then treats it as extract and forces `F = 1.0`.
- Yeast attenuation carries no provenance at all, so a scraped aggregator value
  and an authored record are indistinguishable.
- Nothing in a frozen bundle says whether a number was measured or assumed.

The producer already schedules the fix as **C.4** (`malt_database/plans/import-contract.md`):
stable `source_id` plus fetch metadata, "do it on the next rescrape". This pass
lands C.4 *as* the provenance increment and reruns extraction from the local
page cache.

## 2. Decisions (locked)

1. **Producer owns capture.** Contract and data live in `malt_database`; the
   consumer re-vendors a pinned copy. Both repos are committed and pushed.
2. **Rerun from the cache.** `malt_database/data/source/` (462 HTML + 59 PDFs,
   untracked). No live fetch. Each captured value records the page `sha256`;
   `retrieved_at` is the cached file mtime. ETag/`Last-Modified` conditional
   refetch remains a follow-up.
3. **Provenance is in-row**, one sibling object per captured value:
   `<field>_provenance = { bound, kind, vendor, url, retrieved_at, sha256 }`,
   `kind ∈ vendor | aggregator | authored | derived | prior`. Values stay flat
   scalars with their dimensions.
4. **Capture is nullable, resolution is downstream.** Seeds store `null` when
   the source is silent. Priors resolve **copy-forward** (when a catalog record
   is added to a batch), so frozen rows are self-describing and later prior
   changes cannot silently rewrite existing batches.
5. **Pass 1 changes no solver semantics.** Sugar F still blends at 1.0, `min`
   bounds are not yet floors, yeast ranges/STA1 are not captured, apparent AA
   above 1 stays rejected. Any numeric movement in Pass 1 must be attributable
   to the captured inputs alone.

## 3. Commit sequence

Ordering rule: producer commits land first; the consumer pins its own copy, so
producer data changes cannot break it mid-sequence. Each commit regenerates the
generated files it invalidates and nothing else.

### Repo A — `malt_database`

| # | Commit | Owns | Must not touch |
|---|---|---|---|
| A1 | `Plan C.4 as fermentability provenance` | `plans/import-contract.md`: C.4 field shapes, extraction matrix, cache-hash policy, the importer reinterpretation rule for `yield_basis` | schema, extractors, data |
| A2 | `Extend the malt contract with fermentability provenance` | `schema/malt.schema.json`, `schema/{bairds,dingemans,crisp,simpsons}.schema.json`, `bin/check.py` (coverage + null-vs-0) | extractors, `data/db`, `dist` |
| A3 | `Extract published fermentability from the cached pages` | `bin/{bairds,dingemans,crisp,simpsons}.jq`, `lib/malt.py`, `bin/unify.py`, `data/maltsters/*.json`, `data/db/malts.json`, `dist/malts.json` | consumer repo, live fetch, new maltster coverage |
| A4 | `Document the fermentability coverage and gaps` | `README.md`, `plans/import-contract.md` status | data |

**A2 field set.** `fermentability_fraction` (nullable),
`fermentability_provenance`, `yield_provenance` (provenance for the published
yield figure, including the `fermentability` basis), `source_id`, `source_url`.
Briess keeps its figure in `yield_fraction` with `yield_basis: "fermentability"`;
the importer reinterprets it. No duplicated number in the export.

**A3 extraction matrix.**

| Maltster | Anchor | Bound |
|---|---|---|
| Bairds | `Fermentability:</strong> 87.0% min` | min |
| Dingemans | `Final attenuation: min. 80.0 %` | min |
| Crisp | `Fermentability 87.2%` (desktop + mobile markup) | point |
| Simpsons | table column `Fermentability % (un-boiled)` | point |
| Briess | existing `box_value("Fermentability")` → stays in `yield_fraction` | point |
| Weyermann | none (PDFs publish extract/moisture/colour only) | — |

**A3 gate.** `make check`; coverage prints 23 captured product pages (Bairds 4,
Dingemans 15, Crisp 3, Simpsons 1) plus the 18 Briess basis rows. After the
importer's one-row-per-name dedupe that is 18 seed rows. Manual diff read of
every changed row. `data/source/` is never staged.

### Repo B — `dag-calculator`

| # | Commit | Owns | Must not touch |
|---|---|---|---|
| B1 | `Declare ingredient provenance in the artifact` | `data/artifact.json` (`yield_basis`, `yield_provenance`, `fermentability_provenance`, `attenuation_provenance`, prior constants), `make generate` outputs (inventory, glossary, bundle fixture), `docs/fermentability-and-yield.md` | seeds, adapters, UI, solver |
| B2 | `Consume the provenance-bearing malt export and stop imputing fermentability` | re-vendored `data/sources/{malt-database-malts,malt.schema}.json` + manifest; `scripts/build-fermentables-seed.mjs`; `scripts/build-standard-malts-seed.mjs`; `data/seeds/{malts,sugars,standard-malts}.json`; copy-forward resolver in `frontend/src/adapters/cards/catalogDraft.js`; priors in `frontend/src/adapters/boundaryRequest.js`; `frontend/src/views/catalog.js` (hide `*_provenance`); registry display; guards and tests | solver/boundary contract, sugar-F use, bound-as-floor, yeast data |
| B3 | `Stamp yeast attenuation provenance from the aggregator` | `scripts/build-yeasts-seed.mjs`, `data/seeds/yeasts.json` (provenance only), one doc line | ranges, STA1, `>1` guard relaxation, vendor scrape |

**B1 boundary.** Schema additions only. New collection fields add catalog paths,
so inventory and glossary diffs are expected; no numeric or behavioural change.
`make generate` + `make verify`.

**B2 boundary — the only behaviour-changing commit.** Reinterprets
`yield_basis: "fermentability"` (yield `null`, F takes the number, provenance
carried), stops builder substitution, resolves priors copy-forward with
`kind: "prior"`, and shows captured vs assumed in the ingredient tables. Expected
numeric diff: the captured products only; every other row must resolve to its
current prior. Guard: a test asserts the builder applies no default, and
`standard-malts` medians use captured members only. `make generate` +
`make verify`.

**B3 boundary.** Provenance stamping only — `kind: "aggregator"`, source URL per
row, scrape `generated_at`; per-page hashes do not exist for the yeast scrape
(the scraper caches no pages), so this is deliberately weaker than malt
provenance until the Pass 2 vendor fetch. Gate asserts the seed diff is
provenance-only.

## 4. Context discipline

- One repo per commit. No commit edits `malt_database` and `dag-calculator`.
- No commit touches the sealed solver or the boundary request/response contract
  until Pass 2.
- Every generated artifact is regenerated in the commit that invalidates it
  (`make generate` in B; `make dist` in A). No seed file is regenerated twice in
  Pass 1.
- Extraction and interpreter changes are separate commits (A3 vs B2) so a bad
  number and a bad mapping cannot land together.
- `tests/conformance/fixtures/report-bundle.json` and any oracle snapshot are
  regenerated in B1/B2 with the numeric diff explained in the commit body.

## 5. Verification matrix

| Claim | Proof |
|---|---|
| No imputation left | `build-fermentables-seed.mjs` has no `?? prior`; a guard test fails if one returns |
| Priors are honest | frozen rows with `kind: "prior"`; a bundle test asserts the stamp |
| Capture is attributable | every non-null F has a provenance object with url + sha256 |
| Only captured rows moved | seed diff enumerated per product in the B2 commit body |
| Yeast values unchanged | B3 diff is provenance-only |

## 6. Deferred to Pass 2 and 3

- **Pass 2 — functionality:** sugar F reaches the blend (retire the hard-coded
  1.0), `min` becomes a floor, yeast attenuation ranges + STA1 tri-state +
  dextrinase extent, apparent AA above 1 with basis declared, capture-bound
  relaxation. Yeast vendor scrape (PDF/HTML) lands here with per-page hashes.
- **Pass 3 — the pin:** the three late-addition intents at the boundary
  (target ABV vs fixed grain bill vs fixed OG), and replacing
  `AA_batch = min(AA_wort, cap)` so super-attenuation consumes dextrins instead
  of raising a ceiling.
