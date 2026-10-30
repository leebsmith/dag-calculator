---
title: Hops card — one card, three collapsible sections
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: make verify
status: proposed
---

# Hops card — one card, three collapsible sections

## Problem

The hops card grew in three passes and kept three designs:

1. **Three heading vocabularies for one idea.** Boil and whirlpool additions are
   titled with `modal-drawer-title` (a drawer style borrowed as a card heading),
   the whirlpool group uses `step-section-title` (a second vocabulary, also used
   by Water), and Brew Day has its own disclosure classes. The whirlpool group
   also renders a `::after` rule that reads as a stray divider beside the
   "Assumptions" toggle.
2. **A unit affordance used as a disclosure.** "? Assumptions" is a
   `unit-badge`, the same control that toggles a display unit, so the pill
   promises a conversion it does not perform.
3. **One hop bill split across two stops.** Dry hops are a full step card and a
   full rail stop, although the card is descriptive only, has no IBU
   contribution, and belongs to the same bill as the boil and whirlpool rows.
4. **A total that does not say what it totals.** The card's roll-up reads
   "Total IBU target" and "Total hop mass" without saying that dry hops are
   excluded, and each section hides its own strip at zero rows.

## Decisions

- The Hops step card holds three peer sections — **Boil Additions**,
  **Whirlpool Additions**, **Dry Hops** — sharing one disclosure primitive:
  chevron, `.section-title`, `.section-meta`, an actions slot, and a
  `.section-body`.
- The three sections start open. Collapsing is an opt-in density tool, not the
  default.
- Each solved section keeps its own strip (`Boil IBU target`, `Boil hop mass`,
  `Whirlpool IBU target`, `Whirlpool hop mass`), always visible while the
  section is open.
- The card-level strip is a roll-up, not a fourth section: it sits outside the
  three disclosures and names its scope ("boil + whirlpool").
- Dry hops contribute no IBU and their quantities are authored in mixed units
  (oz, g, ml), so the card sums nothing for them; the section header carries the
  addition count and the body says the rows are descriptive.
- One class vocabulary: `section-title` replaces `modal-drawer-title`,
  `group-title`/`group-header` replace `step-section-title`/`step-section-header`,
  `section-toggle`/`section-chevron`/`section-meta`/`section-body` replace the
  Brew Day disclosure classes, and `summary-strip` replaces
  `grain-bill-summary`.
- The mass-unit pill appears in the boil and whirlpool section headers because
  it changes both solved tables; dry hops omit it (the unit is per row).
- The "Assumptions" disclosure becomes an underlined chevron toggle inside the
  whirlpool body, next to the cooling inputs it explains; the opened list sits
  in a tinted `detail-panel`. The `btn-link` class itself gains the pointer
  cursor, underline and focus ring it was missing, which also fixes the Water
  card's "view details" and Show/Hide controls.
- The Dry Hopping step leaves the manifest. `batch.dry_hops` is declared by the
  Hops step, so attribution and step status follow the one card.

## Workstreams

### W1 — one section vocabulary

`frontend/src/style.css` plus the partials that used the retired names.

- `section-title` carries the old `modal-drawer-title` typography; drawer headers
  keep the class because a section title is what they render.
- `group-title` / `group-header` keep the Water card's micro-label plus rule.
- `card-section`, `section-header`, `section-toggle`, `section-chevron`,
  `section-meta`, `section-actions`, `section-body` are the disclosure primitive,
  used by Brew Day and the hops card.
- `summary-strip` / `summary-strip-item` replace `grain-bill-summary` /
  `grain-bill-summary-item` (the strip totals hops and sugars too);
  `summary-strip--total` marks the card roll-up.

### W2 — section state

`frontend/src/views/producer/hopSections.js`,
`frontend/src/adapters/cards/hops.js`,
`frontend/src/adapters/cards/dry-hops.js`, `frontend/src/adapters/installers.js`.

- The hop card owns `hopSections`, `toggleHopSection`, `isHopSectionOpen`,
  `boilHopSectionMeta`, `whirlpoolHopSectionMeta`.
- The dry-hop card owns `dryHopSectionOpen`, `toggleDryHopSection`,
  `dryHopSectionMeta`.
- Both cards own their members outright, so no `SHARED` entry is needed; the
  dry-hop section partial stays owned by the dry-hops installer.

### W3 — hops card markup

`frontend/src/partials/step-hops.html`,
`frontend/src/partials/hops-dry-section.html` (renamed from `step-dry-hops.html`),
`frontend/src/partials/whirlpool-assumptions.html`.

- Boil/whirlpool bodies keep their tables, fields, hints and warnings; the
  duplicate "Whirlpool" group heading and its rule are gone.
- Section headers carry the addition count and IBU target, the mass-unit pill
  (boil and whirlpool only), and the section's Configure button.
- The dry-hop section keeps its table and gains a note that it is excluded from
  the totals.

### W4 — totals

`frontend/src/partials/step-hops.html`,
`frontend/src/adapters/cards/hops.js`.

- Per-section strips always render while the section is open; the mass readouts
  fall back to an em dash instead of an empty cell.
- The card roll-up is labelled with its scope and visually marked as a total.

### W5 — fold the dry-hop step

`frontend/src/views/steps.js`, `frontend/src/partials/editor.html`,
`frontend/src/views/registry/dry-hops.js`,
`scripts/frontend-ownership.mjs`, `docs/frontend-ownership.md`.

- Drop the `dry-hops` step; extend the Hops subtitle; add the dry-hop collection
  to the Hops fields.
- Drop the editor's `dry-hops` branch and exclusion.
- Widen the ownership guard's card-partial pattern to `*-section.html` so the
  renamed partial stays under the guard, then regenerate the ownership index.

### W6 — tests

`tests/frontend/hops-sections.test.js`, `tests/guards/ui-vocabulary.test.js`,
`tests/guards/display-only-units.test.js`, `tests/guards/reset-baseline.test.js`.

- Section defaults, independent toggles, section metas, the folded attribution,
  and the totals ignoring dry hops.
- A vocabulary guard that fails if a retired class name returns.
- The two guards that read the dry-hop fields now read them from the Hops slice.

## Verification

`make check` and `make test` (the manifest change makes this a full-suite
change). No `data/artifact.json` change, so the only generated artifact is
`docs/frontend-ownership.md`.
