# Rationalize library cloning

<!-- claims: proposed batch.yeast.pof pof_status -->

**Status:** proposed
**Scope:** `frontend/src` and its guards/tests; `docs/` where the library UI is described.
**Gate:** `make check`, then `make test`.

## Why

A seed component can only become a user record by copying it. Both current
surfaces seal the copy immediately:

- the yeast picker's **Copy** calls `duplicateUserItem`, which creates the server
  record and refreshes the overlay;
- the catalog drawers' **Copy** calls `duplicateCatalogItem`, which does the same
  through `duplicateUserItem`.

An immutable copy cannot be adjusted, so the action cannot serve the case that
motivated it: "start from this seed, change one field, save." It also leaves a
second picker entry identical to the seed, and the Library cannot distinguish it
from an authored record.

Two related defects sit alongside it:

- `sta1` is a schema boolean, but the Library editor renders it as text and
  validation then rejects the string.
- The yeast card reads `selectedYeast` from the live reference cache, so deleting
  a record that a batch snapshotted makes the card look empty even though the
  engine still solves from the snapshot.

The seed list in the Library is the right home for cloning: it is the one place
that already shows "bundled" versus "mine". Today it is read-only for non-style
kinds, capped at 50 rows with no paging, and its search field sits so far above
the seed list that it reads as a global search.

## Locked decisions

1. **Clone is draft-before-seal.** Clone copies a seed into the Library editor;
   nothing is persisted until **Save and seal**. This matches style `Fork` and
   the immutable-record rule.
2. **The Library seed list is the only clone entry.** Remove **Copy** from every
   picker and drawer. Pickers select; the Library authors.
3. **Styles keep `Fork`.** Every other seed kind gets **Clone**.
4. **No clone-of-a-clone.** User records are not clone sources; `Clone` appears
   only on bundled seeds.
5. **No lineage metadata or hygiene extension in this change.** Clones are
   ordinary user records under **Your records** with the existing **Delete**.
   An "unused"/lineage view can be a later plan.
6. **No reference-count garbage collection.** Snapshots are embedded in batches
   and deleted with their batch. A library record with no current references is
   still a valid template.
7. **Deleting a record does not change a batch.** Existing drafts and frozen
   batches keep their selection snapshots; new batches cannot select the deleted
   record. The deletion confirmation must say so.
8. **One query filters both lists.** Seed paging is filter-first, then a visible
   limit, then **Show 50 more**. The limit resets when the query, kind or section
   changes.
9. **No artifact change.** This is a Library/UI behaviour change over existing
   schemas.

## Implementation

### 1. Library modal structure

- Move the search input below the Sources/Ingredients and per-kind tabs into a
  sticky filter bar above **Your records** and **Bundled seeds**.
- Give it a visible label or placeholder that names its scope, e.g.
  "Filter yeast records and bundled seeds."
- The panel is the scroll container; make the bar `position: sticky` with the
  panel background so it stays visible while scrolling to the seeds.
- Keep one `librarySearch` query for both lists.

### 2. Seed paging

- Add `librarySeedLimit` (initial 50) to the Library UI state.
- `librarySeedItems` filters the full seed catalog by the current query, then
  slices to the limit; `librarySeedCount` remains the filtered total.
- Add **Show 50 more** below the seed list when
  `librarySeedItems.length < librarySeedCount`.
- Reset the limit to 50 in `librarySetSearch`, `selectLibrarySection`,
  `selectSourceKind` and `selectLibraryTab`.

### 3. Clone action

- Add a `cloneLibraryItem(item)` action for seed records on non-style kinds.
- It builds a prefilled `libraryDraft`: copy the component fields, drop the
  catalog id field, append ` (copy)` to the title, and show a notice naming the
  source.
- Styles continue to use `forkLibraryItem` and its lineage fields.
- The editor heading/notice distinguishes a clone draft from a blank new record.
- **Save and seal** validates and creates the record through the existing
  Library create path.
- `CanCloneRecord` is true for non-style active kinds; the seed row shows
  **Clone** only there. No Clone action on **Your records**.

### 4. Boolean library fields (`sta1`)

- `libraryFields` emits `kind: "boolean"` for `type: "boolean"` fields.
- Render a tri-state select: **Unknown / Yes / No**.
  - Unknown clears the field (`undefined`), matching an unstated seed property.
  - Yes/No store real booleans.
- `librarySetField` coerces the selected value; `libraryFieldDisplay` renders
  the current boolean/absence.
- Label `sta1` as `STA1 / diastaticus` in the Library field model if a friendly
  label is available; otherwise keep the field id.

### 5. Remove picker copies

- Remove the **Copy** button from `modal-yeast-picker.html`.
- Remove the three **Copy** buttons from `draft-search-pane.html`.
- Remove `duplicateCatalogItem` from `catalogDraft` (method, config comment,
  `KEYS` entry) and `duplicateUserItem` from `stepAdapter` once unused.
- Keep `isUserItem` and the **mine** badge: they still distinguish records.
- Update the tests that assert the duplicate path.
- Update the living docs that describe **Copy**:
  - `docs/adsco/ui.md`
  - `docs/record-library.md`

### 6. Snapshot display fallback

- In `cards/yeast.js`, resolve `selectedYeast` from the reference cache first,
  then fall back to the batch selection snapshot (`engine.get("batch.yeast")`).
- Keep `selectedYeastId` from `batch.yeast_id`; the snapshot supplies the
  display fields when the source record is gone.
- Add a regression test: select a user yeast, delete it from the Library, then
  assert the batch still resolves `batch.yeast.sta1` and the card getter still
  returns the name/STA1 from the snapshot.

### 7. Deletion copy

- Update the Library delete confirmation to state: existing batches keep their
  copies; new batches cannot select the deleted record.
- Deleting a clone remains allowed while drafts or frozen batches reference it.

## Tests

- Library UI:
  - clone draft is prefilled and unsaved;
  - saving seals a new record with the clone's fields;
  - tri-state `sta1` stores `undefined`, `true`, `false` and passes validation;
  - seed paging reaches an entry beyond the first 50 and resets on query/tab;
  - the sticky filter bar state is bound to `librarySearch`.
- Picker removal:
  - no `duplicateCatalogItem`/`duplicateUserItem` handlers or Copy buttons remain;
  - selecting a seed still works and the **mine** badge remains.
- Snapshot fallback:
  - deleted clone keeps the batch's yeast maths and card display.
- Guards:
  - store-surface sees every new `$store` member;
  - template-scope/handler guards pass.

## Out of scope (phase 1)

- Reference-count garbage collection or shared snapshot storage.
- "Unused record" counts, lineage badges on user records, or bulk cleanup.
- Cloning a user record.
- Changing seeds or artifact schemas (phase 2 does this for POF only).
- Editing a saved Library record.

## Phase 2 — POF status (descriptive, no solver)

**Dependency:** phase 1’s seed Clone and Library editor.
**Decision:** no seed backfill. The scrape does not contain a POF attribute, so
every scraped and seeded strain is `unknown`. The only positive values come from
a user clone until a real vendor/curated source exists. M31 is known POF+ to the
user, but that knowledge is recorded on a clone, not asserted in the seed.

The field still earns its place: it establishes the data shape, makes the status
visible and editable, and lets a clone carry the fact into a batch snapshot and
report. It does not claim that the bundled catalog knows the value.

### 2.1 Data contract

- Add taxonomy `pof_status`: `unknown`, `positive`, `negative`.
- Add `pof` to the yeast primitive schema with the taxonomy and default
  `unknown`. It is a descriptive selection field like `flocculation`, not a
  solver input.
- Both yeast scrapers emit `pof: "unknown"` for every record:
  - parse a vendor POF field if one appears;
  - never infer it from `description` prose.
- `data/sources/whitelabs-yeasts.schema.json` gains `pof`. The beer-analytics
  source has no per-record schema; its scraper defines the shape.
- Re-emit `data/sources/beer-analytics-yeasts.json` and
  `data/sources/whitelabs-yeasts.json` so every record carries the key.
- `scripts/build-yeasts-seed.mjs` carries `pof` through, defaulting to
  `unknown`; regenerate `data/seeds/yeasts.json`.
- Add the field label to `data/labels.json`; `make generate` refreshes the
  generated registry, inventory, glossary, source manifest and fixture.
- No curated override file, no seed edits outside the builder, no inferred
  positives.

### 2.2 Surfaces

- Selected yeast row: a `POF+` / `POF−` badge beside the strain name.
- Yeast picker: three POF filter pills with counts, directly below the STA1
  pills.
- Library editor: a POF select with Unknown / Positive / Negative.
- Printed report: a `POF+` / `POF−` suffix on the yeast strain line, and the
  field in the report glossary.
- Clone path: cloning M31 copies `pof: unknown`; the Library select sets it to
  Positive; saving and selecting that clone makes the batch snapshot and report
  carry `POF+`.
- No solver input, boundary request, or `POF?` advisory.

### 2.3 Visual treatment

Match the STA1 surfaces exactly, content aside:

- Badge, pill and report suffix use the same classes, placement, separator and
  count format as STA1.
- `POF+` / `POF−` are shown only when known.
- Unknown POF has no badge and no report suffix; the picker’s Unknown filter and
  the Library select still expose it.
- The POF picker counts are initially all zero for Positive/Negative and the
  full catalog for Unknown. That is the honest state, not a UI defect.

### 2.4 Tests and gates

- Scraper contract: every emitted record has `pof`; no inference from prose;
  White Labs schema validates.
- Seed builder: `pof` survives, defaults to `unknown`, and every seed record has
  the field.
- Artifact: taxonomy and yeast schema validate; no solver consumer.
- UI: selected badge, picker pills/counts, Library select, report suffix only
  when known.
- Manual M31 path: clone the seed → set POF Positive → save and seal → select →
  report shows `POF+`; the seed remains unknown.
- `make generate`, `make check`, `make test`.

### 2.5 Out of scope (phase 2)

- Inferring POF from descriptions.
- A curated seed override table or any seeded positive/negative values.
- A solver input, boundary request, style-conformance rule, or POF advisory.
- Changing STA1’s boolean shape or its existing presentation.
- A `POF?` badge or report suffix.

## Verification

1. `make check`.
2. `make test`.
3. Manual: Library → Yeasts → search M31 → Clone → set STA1 **Yes** → Save and
   seal → select it on a batch → delete the clone → batch still solves with STA1
   from its snapshot and the card still names it.

## Acceptance checklist

- [ ] No **Copy** action remains outside the Library.
- [ ] Seed list pages beyond 50 and resets its limit on filter changes.
- [ ] Search is visibly attached to the active kind and sticky while scrolling.
- [ ] Clone opens an editable draft and seals only on Save.
- [ ] `sta1` is editable as Unknown/Yes/No and validates.
- [ ] Deleting a selected clone leaves the batch and its display intact.
- [ ] `make check` and `make test` are green.
