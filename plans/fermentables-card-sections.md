---
title: Fermentables card — one card, three sections
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: make verify
status: proposed
---
<!-- claims: proposed grist.total_mass -->

# Fermentables card — one card, three sections

## Problem

The extract bill is authored in two stops and read in three vocabularies.

1. **The artifact already treats it as one bill.** `grist.mcu` consumes
   `solver.batch.m_grist` with `grist.weighted_lovibond`,
   `grist.trace_malts_mass` with `grist.trace_weighted_lovibond`, and
   `grist.sugars_mass` with `grist.sugar_weighted_lovibond`; `grist.finished_beer_srm`
   is the one outcome. The UI splits that across Fermentables (grist + trace) and a
   separate Late Additions step (sugars).
2. **A total that does not say what it totals.** Three section-local colours sit
   under strips that all read "Weighted … color": `grist.weighted_lovibond`
   weights by `pct`, the trace and sugar ones weight by mass, and none of them is
   the beer. The quantity the model uses is labelled "Beer color" on the Batch
   step, and `grist.weighted_lovibond`'s registry hint already apologises for the
   confusion ("grain, not finished beer").
3. **The last pre-normalization card.** `8625b0e` renamed these two cards' classes
   to `section-title` and `summary-strip`, but they still use the old pattern —
   `table-header-toolbar`, a bare heading, a table, a strip — while the Hops card
   has the disclosure primitive (`synthesized-card card-section` >
   `section-header` > `section-toggle`/`section-chevron`/`section-meta`/
   `section-actions` > `section-body`) and a vocabulary guard behind it.

## Decisions

- One Fermentables card, three peer sections — **Major Grist** (parts), **Trace
  Malts** (mass; colour and mash pH, no extract), **Sugars** (dose or share) — in
  process order: grist, trace, sugars.
- The Late Additions step leaves the manifest. `batch.late_addition_intent`,
  `batch.sugar_extract_share`, `batch.sugars`, `batch.s_late_add`,
  `batch.sugar_extract_total`, `grist.sugars_mass` and
  `grist.sugar_weighted_lovibond` are attributed to Fermentables, and the card's
  subtitle names all three contributions.
- Section state is per installer, as Hops and Dry Hops already are: `malt` owns the
  grist disclosure, `traceMalts` the trace disclosure, `lateAdditions` the sugar
  one. No `SHARED` entry is needed, and the sugar section keeps its own partial so
  the card partial stays owned by the two grist installers.
- Each section header carries the row count and the section's mass, and the
  Configure button in `.section-actions`.
- **The per-section colour strips retire.** The three weighted colours are
  incomparable bases and none is the beer; the nodes stay live because `grist.mcu`
  consumes all of them. Mass moves into the header, so the trace section carries
  no body strip at all — the same reasoning that leaves the dry-hop section
  without one.
- The card-level strip is a roll-up, outside the disclosures, naming its scope:
  **total bill mass** (new `grist.total_mass`) and **beer color**
  (`grist.finished_beer_srm`).
- `grist.finished_beer_srm` stays the Batch step's field and is read in this card
  as presentation metadata. `createFieldAttribution` keeps the first claim, so
  listing it here as well would move its relation and domain badges off the Batch
  step.
- The pin preview moves inside the sugar section body and adopts the whirlpool
  "Assumptions" pattern (`btn-link detail-toggle` + `detail-panel`) instead of the
  duplicated `synthesized-card` + Show/Hide pair.
- `grist.total_mass` is derived: `solver.batch.m_grist` +
  `grist.trace_malts_mass` + `grist.sugars_mass`, dimension `mass`. The
  interpreter's `+` reads only two arguments, so the expression nests.

## Workstreams

### W1 — the node

`data/artifact.json`, then `make generate`.

- Add `grist.total_mass` beside the other `grist` derived nodes: three aliased
  inputs, a nested `+`, `output.dimension = "mass"`.
- Consume it from the Fermentables step, so `artifact-consumers` holds.
- Regenerate the inventory, glossary, manifest and bundle fixture.

### W2 — manifest and attribution

`frontend/src/views/steps.js`, `frontend/src/partials/editor.html`,
`frontend/src/views/registry/late-additions.js`.

- Delete the `late-additions` step; move its seven fields into `fermentables`.
- Add `solver.batch.m_grist` (the section meta reads it) and `grist.total_mass`
  (the roll-up reads it) to the Fermentables fields.
- Retitle the step: grist by parts, trace malts by mass, sugars by dose or share.
- Drop the editor's `late-additions` branch and its id from the generic-branch
  exclusion chain.
- `LATE_ADDITION_NODES.slice` becomes `fermentables`, or the card's field lookups
  return null once the step is gone.

### W3 — sections and state

`frontend/src/partials/step-fermentables.html`,
`frontend/src/adapters/cards/malt.js`,
`frontend/src/adapters/cards/trace-malts.js`,
`frontend/src/views/producer/gristRows.js`,
`frontend/src/views/registry/fermentables.js`.

- Rebuild the card as two owned sections plus an included sugar section and the
  roll-up, on the Hops markup.
- Add `maltSectionOpen` / `toggleMaltSection` / `maltSectionMeta`,
  `traceSectionOpen` / `toggleTraceSection` / `traceSectionMeta` and the same trio
  for sugars in `late-additions.js`.
- A shared `gristSectionMeta(rows, noun, massField)` helper in `gristRows.js`
  renders "n malts · mass" from a field, the way `hopSections.js` does for IBU.
- `FERMENTABLE_NODES` gains `totalMass` and `beerColor`; the roll-up getters read
  `grist.total_mass` from the slice and `grist.finished_beer_srm` from
  `fieldsById`.
- The grist section keeps "Weighted extract yield" — a grain property, and a
  percentage, so it cannot be mistaken for the beer's colour. Trace keeps none.

### W4 — the sugar section

`frontend/src/partials/fermentables-sugar-section.html` (new),
`frontend/src/partials/step-late-additions.html` (deleted),
`frontend/src/adapters/installers.js`.

- The section owns the intent select, the share input and its adopt actions, the
  table, the late-extract strip and the sugar-effect strip — the body of the old
  card, minus its two retired colour/mass strips.
- The `lateAdditions` installer trades `step-late-additions.html` for the new
  `*-section` partial, which the ownership guard already walks.
- `step-fermentables.html` loads it and the sugar editor modal, beside the malt and
  trace modals.

### W5 — pin preview

`frontend/src/partials/fermentables-sugar-section.html`,
`frontend/src/adapters/cards/late-additions.js`.

- Replace the `synthesized-card` wrapper and its Hide/Show button with the
  `btn-link detail-toggle` + `detail-panel` pair, `x-cloak` and the same opacity
  transition the whirlpool assumptions use.
- Keep the gating (`latePinPanelVisible` from `sugarIsActive`) and keep it
  collapsed by default.

### W6 — ownership and docs

`frontend/src/adapters/installers.js`, `docs/frontend-ownership.md`,
`docs/adsco/ui.md`, `docs/dag-artifacts/domain-equations.md`, `TODO.md`.

- Regenerate the ownership index (`node scripts/emit-ownership-index.mjs`).
- `docs/adsco/ui.md`: the scale-pin matrix and sugar-effect sections name the Late
  Additions card; they now describe the sugar section, and the "card … remain"
  sentence goes.
- `docs/dag-artifacts/domain-equations.md`: the grain-bill table gains the total
  mass equation next to the colour chain.
- `TODO.md`: the completed Hops entry gives way to this plan.

### W7 — tests

`tests/frontend/fermentables-sections.test.js` (new), plus the suites and guards
that read these surfaces.

- Section defaults (three open), independent toggles, the metas, the roll-up equal
  to the sum of the three masses, the roll-up colour equal to the solved SRM, and
  the scope labels in the partial.
- `pin-matrix`, `scale-preview` and the `late-addition-*` suites keep passing on the
  same members; update any that assert the step id or the moved markup.
- Guards that read the step list and the partials: `manifest-integrity`,
  `include-integrity`, `ownership`, `installer-contract`, `artifact-consumers`,
  `artifact-docs-sync`, `ui-vocabulary`, `css-classes`.

## Verification

`make check` and `make test`. The artifact change makes this a full-suite change,
so `make verify` before the commit. Generated output: the artifact inventory, the
glossary, the source manifest, the bundle fixture and `docs/frontend-ownership.md`.
