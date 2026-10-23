---
title: Landing Page & Batch Setup
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [off-graph-identity]
blocks: []
gate: a landing page lists batches and manages equipment/water assets with no engine; a new-batch modal captures the invariant triplet and opens the style parameterization screen; make verify green
status: done
---

# Landing Page & Batch Setup

The landing page is **engine-free**: it needs persistence and the library only. The
first screen that requires an engine is the style parameterization screen, entered
after the new-batch modal writes the identity.

This is a consequence of `plans/off-graph-identity.md` (identity required at engine
construction), and it is a feature: the page cannot accidentally perform domain maths.

---

## 1. Landing page

| Region | Contents | Source |
|---|---|---|
| Batches | list grouped by `name`, ordered by `sequence`; each row shows style name, rig, water source label, status (draft/frozen), updated | batch records |
| Equipment | list + create + delete (delete = remove from pickers; existing batches keep their snapshot) | catalog kind `equipment` |
| Water sources | list + create + delete | catalog kind `water_report` |
| Action | **New batch** | modal |

No styles region: styles are catalogue reference data plus the inline experimental
path. No "project"/container entity exists.

CRUD is immutable-record style: **create** and **delete** only; "edit" is create-new +
delete-old (matching `semantics.md` §3.2). The backend catalog service already supports
the two kinds, their `id_field`s (`equipment.id`, `water_report.report_id`), and
validation.

---

## 2. New batch modal

1. **Equipment** — one of the user's equipment records (or a seed).
2. **Water source** — one of the user's water reports (or a seed). Required: an
   explicit "unknown source" record is a declaration, not an absence.
3. **Style** — a catalogue style, or *Experimental* (author the bounds inline).
4. **Name** — defaults to the style name; `sequence` assigned per name.

On confirm: snapshot the three components into `identity` (values + source id +
label, plus host-derived `style.fermentation`), seed the creation-time residuals
(`apparent_attenuation`, `target_abv` from the style centroid where available), create
the batch record, then open the **style parameterization** screen.

**Warning on confirm:**

> Rig, water, and style are fixed for this batch. To change them later, start a new
> batch.

No undo: the modal is the only writer of `identity`.

---

## 3. Style parameterization screen

The existing style card minus the picker:

- read-only: style name, bounds (the declaration), fermentation;
- writable: target OE/AE sliders, `target_abv`, `target_ibu`, `target_srm`,
  `apparent_attenuation`;
- read-only conformance preview against the fixed bounds.

Then the existing wizard continues (equipment readouts → water treatment → grist →
hops → mash → brew day), all batch-level.

---

## 4. API surface

| Need | Status |
|---|---|
| list/create/delete catalog items by kind | exists (`CatalogService`) |
| batch create with `identity` + `name`/`sequence` | new fields on `BatchRecord`/`DraftPayload` (from the identity plan) |
| batch list without valuation | exists (`list_batches`) |
| identity snapshot read for the header | part of the batch record |

---

## 5. Staging

| Stage | Work | Gate |
|---|---|---|
| L1 | Batch list + grouped rows; empty state; navigation into a batch | frontend tests |
| L2 | Equipment and water-source CRUD panels against the catalog API | frontend + backend tests |
| L3 | New-batch modal: triplet capture, warning, sequence assignment, creation | modal tests (no engine constructed) |
| L4 | Style parameterization entry; wizard resumes at the next batch step | end-to-end boot test |

---

## 6. Risks

- **Identity snapshot drift**: the modal must snapshot values, not store a live id
  reference. Assert by editing the equipment record afterwards and checking the batch
  is unchanged.
- **Sequence assignment** under concurrent creation; prototype scope allows a
  read-then-write with a collision check.
- **Unknown water source** must be an explicit record, or downstream ions resolve
  absent and the water solve runs on zeros — the hazard named in the identity plan.
- **No engine on the landing page**: do not import `createCalculator` there; the page
  must stay usable while a batch is broken or incomplete.

---

## 7a. Outcome (as shipped)

- The chooser already existed; **"New recipe" became "New batch"** and now opens the
  modal instead of creating a blank draft.
- **L2 asset CRUD**: a "Your setup" section lists equipment and water sources
  (seeds + the user's catalog records) with create and delete. The equipment form
  exposes the four fields that dominate the solver (kettle/HLT volume, boil-off,
  conversion efficiency), prefilled from the seed default; the water form exposes
  name + the six ions. "Update" is create-new + delete-old, matching the immutable
  record rule.
- **L3 modal**: name, equipment, water source (with an explicit *Unknown source*),
  style guide vs experimental (inline bounds), the "fixed for this batch" warning,
  and immediate persistence so the batch appears in the list.
- **L4**: on creation the editor advances to the style parameterisation step.
- **Guard**: opening a record without identity, or with a different draft payload
  revision, fails with a clear error instead of booting with an empty identity.
- Not done: renaming/moving batches between groups, batch/version comparison, and
  the target-vector cleanup.

## 7. Out of scope

- Batch/version comparison, diffing two batches' formulations.
- Renaming or moving batches between groups (grouping is by label; a rename is a label
  write).
- The target-vector cleanup (`pinned_ions`, `strategy`, floor ownership).
- Report rendering.
