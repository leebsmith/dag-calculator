---
title: Brew Checklist — Phase 1 Planner
status: proposed
program: deterministic-dag-calculator
depends_on: [brew-log-contract]
blocks: [brew-session]
gate: make verify
---
<!-- claims: proposed batch.brew_checklist batch.brew_checklist.step_id batch.brew_checklist.note batch.brew_checklist.skipped batch.brew_checklist.skip_reason batch.checklist_level brew_checklist_step brew_checklist_step.step_id brew_checklist_step.note brew_checklist_step.skipped brew_checklist_step.skip_reason checklist_level -->

# Plan — Brew checklist (Phase 1)

## Goal

Replace the 12-row, mostly blank brew-day checklist with a generated, actionable
pre-brew, brew-day and post-brew checklist, rendered at three cumulative levels and
printed as part of the report. This phase is the **planner**: it produces the
document and the blank observation appendix. It does not add the session log.

The checklist is part of the recipe. It is authored, reviewed and frozen with the
batch. Completion and observed values belong to Phase 2.

## Why

The current surface is a skeleton:

- 12 steps in `data/seeds/brew-day-steps.json`.
- Only `brew-day-setup`, `dough-in` and `batch-sparge` receive generated water text
  (`frontend/src/adapters/cards/water.js`).
- The other nine steps are a name and a free-text note.
- `batch.brew_day_steps` stores `enabled` and `instructions`; it is never rendered
  by the report (`plans/report-renderer.md` still lists the checklist as pending).

The model already knows almost every number a brewer needs: HLT volume, strike
temperature, rest schedule, first-runnings volume, top-up target, sparge dose,
boil-off, hop schedule, OG, FG and the water doses. The checklist is the missing
join between those numbers and the brewer's actions.

## Non-goals

- Session persistence, observation entry, live/deferred logging or variance. Phase 2.
- Reusable measurement records, calibration or cooling-curve promotion. Phase 3.
- Changes to the batch, water or hop solvers.
- New brewing math. The checklist renders existing values; it does not compute new
  process targets.
- A second unit system or a second formatting path.
- Per-charge or per-rest checkboxes in v1; the first release uses one checkable row
  per action, with the charges and rests listed inside the row.
- Automatic step completion from data presence for physical actions.

## Decisions inherited from the contract

- Three cumulative levels: `critical`, `info`, `debug`.
- Checklist is recipe state; generated text is not persisted.
- State carries only `step_id`, `note`, `skipped` and `skip_reason`.
- The flat frozen table carries `kind: step` and `kind: observation` rows.
- The appendix is part of the checklist section.
- Observations never enter the DAG.
- `batch.brew_day_steps` is renamed to `batch.brew_checklist`.

## Current state

- `frontend/src/views/brewDay.js` owns the seed join and the payload builder.
- `frontend/src/adapters/cards/brew-day.js` owns the Alpine card and the
  `enabled`/`instructions` writes.
- `frontend/src/views/steps.js` exposes the `brew-day` step with one collection
  field.
- `data/seeds/brew-day-steps.json` has four sections and 12 steps.
- `batch.brew_day_steps` uses the `brew_day_step` primitive schema.
- `tests/frontend/brew-day-card.test.js` pins the 12-row default and the payload.
- The water card's `waterInstruction(stepId)` supplies the three generated strings.

## Architecture boundary

The checklist is **presentation over the solve**, not a new model layer. It reads
artifact values through the engine and formats them with the same formatter the
rest of the UI uses. It must not:

- write derived values into state,
- import the Alpine store or touch the DOM,
- compute new process targets,
- persist generated text.

The pure checklist module receives a read-only engine view and returns plain rows.
The Alpine card owns rendering, note editing, skip toggles and refresh.

## Data model

### Artifact

Add:

- `batch.brew_checklist` — collection, item schema `brew_checklist_step`.
- `brew_checklist_step` — primitive schema with `step_id`, `note`, `skipped`,
  `skip_reason`.
- `batch.checklist_level` — choice root, taxonomy `checklist_level`, default
  `info`.
- `checklist_level` — taxonomy `critical`, `info`, `debug`.

Remove or migrate:

- `batch.brew_day_steps` and `brew_day_step` are retired.
- Old rows are read before validation and migrated by the load path.

No artifact `schema_version` bump: adding nodes, a schema and a taxonomy is content,
not a grammar change. The check is `make generate` and the artifact validator.

### Seeds

- `data/seeds/brew-checklist.json` — the catalog: phases, sections, steps, levels,
  conditions, providers, done-when text, expected values and observation metric ids.
- `data/seeds/brew-observations.json` — the metric catalog shared with Phase 2.

The checklist catalog is hand-authored seed data, like the current brew-day steps.
The observation catalog is data, not a second dimension system: it references the
artifact's dimensions, base units and taxonomies.

### Migration

The old 12 step ids are retained as step ids in the new catalog so notes migrate
one-to-one:

`advance-prep`, `brew-day-setup`, `dough-in`, `mash-rests`, `first-runnings`,
`batch-sparge`, `pre-boil`, `active-boil`, `flameout`, `whirlpool`, `chilling`,
`fermenter-transfer`.

Migration rules:

- `instructions` becomes `note`.
- `enabled` is ignored; absence is not a skip.
- `name` and `section` are dropped; both are derived from the catalog.
- An unknown old id keeps its note and attaches it to the nearest phase section as
  a non-catalog note row; it is never silently discarded.
- New rows default to `skipped: false`, empty note.
- The draft payload schema version stays where it is; migration happens in the
  checklist materializer, not by refusing the batch.

## Catalog contract

Each step declares:

| Field | Meaning |
|---|---|
| `id` | Stable id; never reused |
| `phase` | `pre`, `brew`, `post` |
| `section` | Section id within the phase |
| `level` | Minimum level: `critical`, `info`, `debug` |
| `kind` | `action`, `check`, `measure`, `auto`, `note` |
| `condition` | Named predicate, optional |
| `provider` | Pure text provider key, optional |
| `title` | Imperative title |
| `done_when` | Completion criterion, templated with artifact values |
| `detail` | Standard-level explanation, optional |
| `diagnostic` | Debug-level expected values, assumptions, troubleshooting |
| `expected` | Expected-value source (path or provider) for observations |
| `unit` | Base unit for the observation, if any |
| `observations` | Metric ids linked to this step |
| `safety` | Boolean; safety rows are always critical |

`auto` steps are evaluated from the solve. They are preflight gates, not physical
actions. A failing `auto` step is a blocker; it cannot be ticked.

### Levels

- Include a step when its level rank is at or below the selected level.
- `critical` ≤ 35 steps; add a guard.
- `info` is the default and contains every routine action.
- `debug` adds expected intermediates, tolerances, provenance, methods, and N/A
  rows for conditional steps whose condition is false.
- A selected level is frozen into `batch.checklist_level` and the checklist table.

### Conditions

Named conditions are evaluated by the renderer, not by the step text:

- `has_boil_hops`, `has_whirlpool_hops`, `has_dry_hops`
- `has_late_sugar`
- `has_mash_out`
- `has_rests`
- `is_lager_or_mixed`
- `has_water_target`
- `has_yeast`

At `critical` and `info`, a false condition omits the step. At `debug`, it renders
as an N/A row with the reason.

## Content map

The catalog covers the full lifecycle, not only brew day.

| Phase | Sections | Critical examples |
|---|---|---|
| Pre | Safety & site, Plan, Procure & prep, Equipment, Preflight | Safety gates, recipe solves, equipment matches rig, ingredients present, yeast viable, sanitation, capacities and coil floor, all boundaries solve |
| Brew | Setup, Mash, Lauter, Boil, Knockout, Close-out | HLT fill/SMB/heat, dough-in, mash pH, first runnings, HLT top-up and sparge, pre-boil volume/gravity, boil and hops, whirlpool/chill, transfer/aerate/pitch/seal, clean |
| Post | Fermentation, Packaging, Review | Fermentation starts, temperature held, FG stable, packaging sanitation, transfer, carbonation, oxygen, seal |

The catalogue is deliberately detailed at `info`: strike and sparge temperatures,
rest-by-rest schedule, first and second runnings, hop charges with times, whirlpool
duration and temperature, pitch temperature, yeast range, dry-hop event and contact,
packaged volume. At `debug`, it adds expected values from the cascade, solver and
attenuation model, plus the model caveats (heating, cooling, fermentation
temperature and carbonation are not modelled).

## Renderer

Add a pure module, `frontend/src/checklist/`:

- `catalog.js` — loads the checklist and observation seeds, validates interfaces.
- `conditions.js` — named predicates over a read-only engine view.
- `select.js` — selects rows by level and condition; returns step and N/A rows.
- `render.js` — calls the provider and returns `{ title, text, detail, diagnostic,
  doneWhen, warnings, observations }`.
- `providers/` — one small pure provider per phase or concern:

  - preflight and plan
  - water setup, dough-in and sparge
  - mash schedule, strike and rests
  - lauter first runnings, top-up, sparge and pre-boil
  - boil schedule, late sugar and post-boil
  - knockout whirlpool, transfer and pitch
  - fermentation and packaging

Providers receive `{ get, resolve, format, level }` and must not import the store,
the DOM or Alpine. Reuse the existing pure helpers in `frontend/src/views/` and
`frontend/src/adapters/cards/` where they already exist; extract the water
instruction builders from the water card into a pure module first, then use them
from both places.

## UI

- Rename the step display to **Brew Checklist**; keep the slice behaviour local to
  the editor.
- Phase tabs or accordions: Before brew day / Brew day / After brew day.
- Level selector: Critical path / Standard / Diagnostic.
- Each row shows the title, generated text, done-when and warnings. The note field
  is editable. A skip toggle requires a reason.
- `auto` rows show pass/fail and are not editable.
- Remove `enabled` and editable instruction text. Generated text is read-only; the
  note is the user's addition.
- The checklist payload builder becomes `brewChecklistPayload`, with step rows and
  observation rows for the appendix.
- No completion checkbox in Phase 1. The printed report has the checkboxes.

## Report

Add a `checklist` section to the Typst registry, last in render order.

- Presence predicate: the frozen checklist table has rows.
- Group by phase and section.
- Step rows: checkbox glyph, title, generated text, note, skip reason.
- Observation rows: the appendix table with metric, expected, raw, corrected, unit,
  method, time and note. Phase 1 leaves the actual columns blank.
- At `critical`, the appendix is the vitals table. At `info`, the key readings. At
  `debug`, the full table with expected values and methods.
- The section prints the frozen level; changing the level means changing
  `batch.checklist_level` and re-freezing or forking.

## Flat frozen table

Build `formatted_tables["batch.brew_checklist"]` at freeze time:

| Column | Step row | Observation row |
|---|---|---|
| `kind` | `step` | `observation` |
| `phase` | phase label | phase label |
| `section` | section label | section label |
| `title` | step title | metric label |
| `text` | generated instruction | expected text or `—` |
| `level` | step level | metric level |
| `expected` | `—` | expected value |
| `unit` | `—` | unit |
| `method` | `—` | allowed methods |
| `note` | user note | user note |
| `skipped` | `Skipped: reason` or `—` | `—` |

Every cell is a `FormattedValue` with non-empty text. The table key is the
collection node `batch.brew_checklist`, so `check_formatted_tables` accepts it. No
`bundle_format` bump is expected. The Phase 0 spike proves this before the catalog
work begins.

## Phase 0 spike

Before building the catalog:

1. Add one generated step and one blank observation row to the existing checklist.
2. Emit them in `formatted_tables["batch.brew_checklist"]`.
3. Add a minimal Typst section that consumes the table.
4. Prove `parse_bundle` / `seal_bundle` and the report render both pass.

If the flat table cannot pass integrity, stop and amend the contract to use a
dedicated bundle block. Do not build 75 steps first.

## Work breakdown

| Commit | Work |
|---|---|
| 1 | Contract and phase plans |
| 2 | Phase 0 spike: flat table, one step, one observation row, report section |
| 3 | Artifact: `batch.brew_checklist`, `brew_checklist_step`, `batch.checklist_level`, `checklist_level`; migration; `make generate` |
| 4 | Seeds: checklist catalog and observation metric catalog; catalog guard |
| 5 | Pure renderer, conditions, providers; unit tests |
| 6 | Editor UI: phase tabs, level selector, notes, skips, auto rows |
| 7 | Report section and appendix; freeze table; render tests |
| 8 | Docs, generated files, fixtures, docs-claims, final `make verify` |

Each commit must leave the tree buildable. Commits 3 and 4 may be combined if the
migration cannot land without the catalog.

## Test matrix

- **Catalog guard:** unique ids, valid phase/section/level/kind, known condition,
  known provider, `critical` count ≤ 35, every step has a done-when line.
- **Path guard:** every expected artifact path resolves; every observation metric
  id resolves in the observation catalog.
- **Renderer:** level selection, cumulative inclusion, conditional omission at
  critical/info, N/A at debug, deterministic output, no `undefined`, `NaN` or raw
  `null`.
- **Migration:** old `instructions` become `note`; `enabled` is ignored; unknown
  ids preserve the note; old batches open.
- **UI:** level switch, note persistence, skip reason required, auto rows not
  editable, payload shape.
- **Report:** three level fixtures render; appendix is blank in Phase 1; the
  checklist section is present only when rows exist.
- **Bundle:** `formatted_tables` key and cells pass integrity; no bundle-format
  change.
- **Docs:** `make generate` outputs are byte-identical; docs-claims resolves the
  proposed and existing ids.

The local loop is `make quick`; the gate is `make test` and `make verify`. The
working diff is `data/`, `docs/` and the harness, so expect the quick selector to
fall back to the full suite; that is the gate, not an accident.

## Docs and generated files

- Add `docs/brew-checklist.md`: the living contract for phases, levels, conditions,
  providers, the appendix, and how to add a step.
- Regenerate: `docs/dag-artifacts/inventory.md`, `docs/report-bundle-glossary.md`,
  `docs/report-sections.md`, `docs/frontend-ownership.md`, the seeds manifest and
  the bundle fixture (`make generate`).
- Update `TODO.md`: replace the staged-notes bullet with this phase.
- Update the water card's ownership/coupling note if the instruction builders move.

## Acceptance criteria

- `make verify` is green.
- The editor shows the full pre/brew/post checklist with three levels.
- The report prints the checklist and the blank appendix at the selected level.
- `critical` is a short gate list (≤ 35 steps), `info` is the full brew sheet,
  `debug` adds expected values and N/A rows.
- Old batches open with their notes intact.
- Generated text is not stored in the batch state.
- No observation is modelled as a DAG value.
- The bundle table passes integrity without a format bump.

## Risks

- **Migration.** Renaming the node and dropping fields is the highest-risk change.
  Keep the load path tolerant and test an old-shaped record.
- **Bundle shape.** The flat table depends on the collection-key rule; the spike is
  the mitigation.
- **Critical bloat.** The catalog will want to make everything critical. The guard
  and the one-page test are the mitigation.
- **Provider complexity.** The shape ratchet will notice a 600-line provider file.
  Split by phase and keep providers table-driven.
- **Duplicate water text.** Extract the water instruction builders rather than
  copying them; keep one source.
- **Docs drift.** The plan proposes ids; every one must be in the claims comment
  until the artifact lands, then the comment is removed.

## Rollback

The phase lands as a commit series. Reverting the series restores the old node and
seed. Because the migration is read-tolerant, old-shaped rows remain readable by
the old code after a revert. A partially migrated batch that has already been saved
with the new schema needs the migration code to read it; do not remove the old
reader until the phase is green and archived.
