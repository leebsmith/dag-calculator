---
title: Style Card (BJCP style selection + envelope)
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [Step G]
blocks: []
gate: make check/test green
status: in-progress
---

# Style Card — BJCP style selection + fermentation envelope

**Goal:** a "Style" step card (after Equipment, before Yeast) that ingests the BJCP
styles seed, lets the user pick a style or define an experimental one, materializes
the style's ranges as editable batch roots, and derives a fermentation target
(AA + ABV) from the style's feasible OE/AE region that seeds the batch solver.

## Decisions (finalized)

1. Step order: `equipment` → **style** → `yeast`.
2. Ingest `styles.json` via `referenceCache`, mirroring `yeasts`.
3. Binary gate `batch.style_source` ∈ `{styleguide, experimental}`.
4. Envelope as **10 range roots** (`batch.style_*_min/_max`) — ranges throughout.
5. **Live** centroid (frontend pure module) → seeds `batch.apparent_attenuation`
   (AA*) and `batch.target_abv` (ABV*).
6. Envelope roots **editable in both modes** (copy-in on select).
7. `notes` = read-only prose (`overall_impression` + `comments`); no root (free
   text is not a root kind).
8. `batch.fermentation` choice ∈ `{ale, lager, wild, mixed}`, auto-set from tags.
9. Search over `name` + `id` + `category_name` + `tags`; category dropdown +
   strength/color/fermentation filter pills.

## Model

| Node | Kind | Detail |
|---|---|---|
| `batch.style_source` | choice | taxonomy `style_source` (`styleguide`/`experimental`), default `styleguide` |
| `batch.style_id` | root | `reference`, default `""` |
| `batch.style` | selection | schema `style`, ref `batch.style_id` |
| `batch.fermentation` | choice | taxonomy `fermentation` (`ale`/`lager`/`wild`/`mixed`), default `ale` |
| `batch.style_og_min` / `_max` | root | gravity, `gte 0`, default `0` |
| `batch.style_fg_min` / `_max` | root | gravity, `gte 0`, default `0` |
| `batch.style_ibu_min` / `_max` | root | ibu, `gte 0`, default `0` |
| `batch.style_srm_min` / `_max` | root | beer_color, `gte 0`, default `0` |
| `batch.style_abv_min` / `_max` | root | abv, `gte 0`, default `0` |

New taxonomies: `style_source`, `fermentation`. All root defaults are literals so
the A6c selection-seeded-default whitelist is untouched (copy-in happens in the
adapter, as with yeast).

## Centroid algorithm (see `docs/style-card-centroid.md`)

OE = P(OG), AE = P(FG) (ASBC cubic) → box; Cutaia `ABV(OE,AE)` with ρ = 0.7907;
feasible region = box ∩ {ABVmin ≤ ABV ≤ ABVmax}; vertices = corners + level-curve
edge crossings (quadratic closed-form horizontal / quartic Brent vertical);
linear-sided n-gon → shoelace centroid → `AA* = (OE*−AE*)/OE*`, `ABV* = ABV(OE*,AE*)`.
Stats-less styles → `null` (no seeding).

## Implementation checklist

### Artifact
- [ ] Add `style_source` and `fermentation` taxonomies.
- [ ] Add `batch.style_source`, `batch.style_id`, `batch.style`, `batch.fermentation`.
- [ ] Add the 10 `batch.style_*_min/_max` roots.
- [ ] Regenerate `docs/dag-artifacts/inventory.md`.

### Ingestion
- [ ] Import `styles` in `store/referenceCache.js` (references + seeds).

### Fermentation module
- [ ] `frontend/src/engine/fermentation.js`: `styleCentroid(...)` → `{ aa, abv, og, fg, oe, ae }` (or `null`).
- [ ] ASBC cubic + `platoToSg` inversion + Cutaia + Brent + shoelace centroid.
- [ ] Unit tests cross-checked against backend `utils.py` (21A, 22C, 25B, 1A; no-stats → null).

### Adapter
- [ ] `styleCatalog` / `filteredStyles` / `styleCategories` / filter-pill state / `visibleStyles`.
- [ ] `selectStyle(id)`: set `batch.style_id` → copy-in 10 ranges → set `batch.fermentation` → centroid → set AA/ABV.
- [ ] `clearStyleSelection()`: clear `style_id` + `fermentation`.
- [ ] Fermentation classification from `tags` (+ name fallback).

### Step, partial, registry
- [ ] `views/steps.js`: insert `style` step after `equipment`.
- [ ] `partials/step-style.html`: source toggle; styleguide picker (search + dropdown + pills + table); experimental number inputs; selected readout.
- [ ] `views/registry/style.js` + register in `registry/index.js`.

### Docs
- [ ] `docs/style-card-centroid.md` (algorithm + worked examples + degenerate rules).
- [ ] `docs/dag-artifacts/seed-substrate.md` style-card note.

### Tests & verification
- [ ] `tests/frontend/fermentation.test.js`; adapter select/clear tests.
- [ ] `make check` + `make test` green (frontend + backend + guards/conformance).

## Out of scope (deferred)

- Graphical OE/AE picker (reuses the same module).
- Style conformance gating (recipe vs `style_*` envelope).
- Yeast `fermentation` field (needs a future `build-yeasts-seed.mjs` URL/name
  classification) to enable the yeast screen.
