---
title: Card Refactor — Shared Catalog/Draft Helper + Per-Card Modules
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: lint + full test suite + build green with no test churn; stepAdapter.js shrinks materially
status: in-progress
---

# Card Refactor — Shared Catalog/Draft Helper + Per-Card Modules

## Motivation

`frontend/src/adapters/stepAdapter.js` has grown to ~2,176 lines and ~227
methods/getters. It is the single Alpine-reactive `app` object, but it now hosts
five bespoke card editors (yeast, style + sliders, mash, fermentables, hops) on
top of the core solve/persistence glue.

The real cost is **duplication**: every catalog-backed editor re-implements the
same ~100-line block:

- catalog getters (`xCatalog`, `xCategories`, `xFilteredCatalog`,
  `xVisibleCatalog`, `xCatalogTruncated`);
- drawer/search bookkeeping (`xDrawer`, `xSearch`, `openXSearch`, `closeXDrawer`,
  `toggleXCategory`, `handleXEscape`);
- draft-row actions (`openXEditor`, `cancelXEditor`, `saveXEditor`,
  `addCatalogX`, `removeX`, `inspectXRow`).

The five cards differ only in: seed key, row id field, category accessor, and
`makeRow`. That is what this refactor collapses. Bespoke interactions (the style
SVG region navigator, the SRM/IBU sliders) stay bespoke.

## Boundaries (locked)

- **Pure logic → modules** (`views/*.js`): already the pattern (`mash.js`,
  `hamilton.js`, `hops.js`). Add `views/catalog.js` for pure catalog filtering.
- **The one shared helper** → `adapters/cards/catalogDraft.js`: installs the
  repeated catalog/drawer/draft state + handlers onto `app`, parameterized by
  `{ prefix, Cap, nodeId, seedKey, idField, categoryField, makeRow, maxVisible }`.
- **Each card → its own module** under `adapters/cards/`, exporting
  `register<Card>(app, ctx)` (attach bespoke state/handlers) and
  `refresh<Card>(app, ctx)` (the compute hook). Free to do anything.
- **Kept in `stepAdapter.js`**: the draft *core* (`openDraft`, `closeDraft`,
  `saveDraft`, `normalizeDraft`, `editDraftCell`, `addDraftRow`,
  `removeDraftRow`, `patchDraftRow`) and the core ops
  (`setRoot`, `scheduleSolve`, `notify`, `edit`, `commitField`, `editCell`).
  They are shared, uniform, and not the duplication.

## Constraints the split must respect

1. **Reactivity + persistence.** Card state/handlers are installed on the raw
   `app` inside `createStepApp` (before `main.js` wraps it in
   `Alpine.reactive(...)`). Getters are installed with
   `Object.defineProperties` (not `Object.assign`, which would collapse them to
   values). Handlers use `this` exactly as the inline methods did, so Alpine's
   binding and the direct-call tests behave unchanged.
2. **`compute()` is the refresh dispatcher.** It calls each card's
   `refresh(this, ctx)` after the producer/solve refresh, passing `this` (the
   reactive proxy) so writes are tracked.
3. **Public API preserved.** Method/getter names stay identical
   (`openHopEditor`, `addCatalogHop`, `hopRows`, …), so templates and tests do
   not change.
4. **No data-model change.** Artifact nodes/schemas, persistence, and cross-card
   contracts (via engine roots) are untouched.

## The card context (`ctx`)

```js
const cardCtx = { engine, cache, ui, artifact };
```

Core operations stay on `app` (`this.setRoot`, `this.scheduleSolve`,
`this.notify`, `this.openDraft`, …). Cards import their own pure helpers
(`massFromIbu`, `displayValue`, `nonlinearFns`, `UNIT_SYMBOLS`).

## Trial: the hops card

Hops is the newest, least-entangled catalog card and exercises both a draft grid
and solver-dependent per-row readouts, so it is the best proof.

1. `frontend/src/views/catalog.js` — pure `filterCatalog(items, { activeIds,
   query, categories, categoryOf })` + `catalogCategories(items, categoryOf)`.
2. `frontend/src/adapters/cards/catalogDraft.js` — `installCatalogDraft(app,
   ctx, config)` installing the shared block with the naming scheme
   `<prefix>Drawer`, `open<Cap>Editor`, `addCatalog<Cap>`, `remove<Cap>`,
   `inspect<Cap>Row`, `handle<Cap>Escape`, etc.
3. `frontend/src/adapters/cards/hops.js` — `registerHopCard(app, ctx)` (calls the
   helper with `{ prefix: "hop", Cap: "Hop", nodeId: "batch.boil_hops",
   seedKey: "hops", idField: "hop_id", categoryField: "purpose", makeRow }`, plus
   `hopRows`, `computeHopRows`, `hopMass`, `hopAlpha`, `hopBoilPct`,
   `hopMinutes`, `hopIbu`, `hopPct`, `hopDraftPartsTotal`, `hopTotalMassDisplay`)
   and `refreshHopCard(app, ctx)` (recomputes `hopRows`).
4. `stepAdapter.js` — import the card, change `return { … }` to `const app = { … };
   registerHopCard(app, cardCtx); return app;`, and replace the inline
   `this.hopRows = this.computeHopRows(engine)` with `refreshHopCard(this,
   cardCtx)`. Delete the inline hops block.
5. `tests/frontend/catalog.test.js` — pure filter tests.

**Gate:** `npm run lint`, `npm test` (all green, existing
`hops-card.test.js`/`hops.test.js`/`style-card.test.js` unchanged), `npm run
build`; confirm `stepAdapter.js` shrinks by ~150-200 lines.

## Rollout after the trial

hops → late-additions (sugars) → fermentables (malt + trace) → yeast → style
(+ sliders) → mash. Each is its own commit; the helper is extended only if a
card exposes a genuine gap (not to force a framework).

## Risks

- **`this` binding**: handlers must keep using `this`; the helper installs them
  the same way the inline methods were attached.
- **Getter install**: use `Object.defineProperties`, never `Object.assign`.
- **Refresh timing**: `compute()` must pass the proxy (`this`), not the closed
  raw object.
- **Over-abstraction**: the helper stays narrow (catalog + drawer mechanics);
  bespoke cards stay bespoke.
