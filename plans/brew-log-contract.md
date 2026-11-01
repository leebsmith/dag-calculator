---
title: Brew Log Contract
status: proposed
program: deterministic-dag-calculator
depends_on: []
blocks: [brew-checklist, brew-session, brew-measurement-promotion]
gate: review
---
<!-- claims: proposed batch.brew_day_steps batch.brew_checklist batch.brew_checklist.step_id batch.brew_checklist.note batch.brew_checklist.skipped batch.brew_checklist.skip_reason batch.checklist_level brew_checklist_step brew_checklist_step.step_id brew_checklist_step.note brew_checklist_step.skipped brew_checklist_step.skip_reason checklist_level -->

# Brew log contract — reconciled design

This document records the decisions the brew-checklist and brew-log work must
share. It is not a task list. The phase plans own their own work breakdown, but
they may not re-litigate what is locked here without changing this contract.

The feature has one central distinction:

> The **frozen batch** is the plan. The **brew session** is the execution.
> They are different records with different mutability, and neither is allowed
> to impersonate the other.

## 1. The layers

| Layer | Contents | Store | Mutability |
|---|---|---|---|
| **Records** | Reusable authored measurements: water report, equipment calibration, cooling curve | Record library | Immutable; corrections create new records |
| **Plan** | Predicted volumes, gravities, pH, temperatures, doses, checklist text | Frozen batch and report bundle | Immutable |
| **Log** | Observed readings, timestamps, notes, deviations, step completion | Brew session | Append-only during entry; sealed at finalisation |
| **Promotion** | A log observation deliberately turned into a reusable record | Record library | New immutable record; existing batches untouched |

Variance, efficiency, attenuation, yield and FG stability are **derived views**,
computed from the plan and the log. They are never stored as a third truth.

## 2. Locked decisions

1. **The checklist is recipe state.** It is authored, reviewed, and frozen with
   the batch. Completion is not recipe state.
2. **The session is execution state.** It references a frozen batch and is
   mutable while the brew is being logged, then append-only after finalisation.
3. **The frozen batch is immutable.** A session never writes to the batch, the
   frozen valuation, or the report bundle. The report bundle remains the plan.
4. **One session per frozen recipe; multiple sessions allowed.** Re-brewing a
   frozen recipe creates another session, not another batch.
5. **Three cumulative checklist levels.** `critical` ⊂ `info` ⊂ `debug`.
   `critical` is the short gate list, `info` is the default brew sheet, `debug`
   adds expected values, tolerances, provenance and N/A steps.
6. **The checklist catalog is data.** Phases, sections, step ids, levels,
   conditions, done-when text, expected values and observation metric ids live
   in a seed. Generated text is not persisted.
7. **The observation row is raw + corrected + method.** Every reading keeps the
   value as taken, the corrected value where a correction applies, and the
   method and correction version that produced it.
8. **The effective value is `corrected ?? raw`.** Variance uses effective. The
   report prints both raw and corrected so the trail is auditable.
9. **One flat frozen table.** `formatted_tables` for the checklist collection
   carries both `kind: step` and `kind: observation` rows. The appendix is part
   of the checklist section; there is no second bundle block for observations.
10. **Paper first, entry later.** The printed report is the offline capture.
    Sessions must support deferred entry; live entry is optional, not required.
11. **Corrections are visible and versioned.** Hydrometer temperature correction,
    refractometer alcohol correction, and pH instrument/ATC recording. The raw
    reading is never replaced.
12. **Missing is not zero.** An unrecorded observation is `null` and renders as
    "not recorded". It is never inferred from the prediction.
13. **Promotion is explicit.** A session may propose an equipment calibration or
    cooling-curve record; the user confirms. No automatic equipment mutation.
14. **Observations never enter the DAG.** They are not roots, derived nodes, or
    boundary inputs. If an observation should change a future plan, it becomes a
    record and the future plan is re-solved.
15. **The rename is real.** `batch.brew_day_steps` becomes
    `batch.brew_checklist`; the UI, docs and inventory use the new name. Old
    rows migrate by step id.
16. **No sensor ingestion in v1.** Imports are manual or CSV later; live entry is
    typed or transcribed.
17. **No charts in v1.** The observation table and variance are enough for the
    first session release.

## 3. Levels

| Level | Question it answers | Typical contents |
|---|---|---|
| `critical` | Will this ruin the batch? | Safety, sanitation, capacity, mash pH/temp, gravity/volume gates, pitch, packaging |
| `info` | How do I brew it as designed? | Every routine action with quantities and a done-when line |
| `debug` | How do I prove or diagnose it? | Info plus expected values, tolerances, methods, provenance, N/A steps and troubleshooting |

A step declares its minimum level. The body has `headline`, `detail` and
`diagnostic` layers. The renderer includes a step when its minimum level is at
or below the selected level. At `debug`, a conditional step whose condition is
false is shown as N/A, not omitted, so the audit is complete.

## 4. Observation model

An observation row carries:

- `id`
- `metric_id`
- `at` — when the reading was taken
- `recorded_at` — when it was entered
- `source` — `live`, `paper`, `import`
- `method` — hydrometer, refractometer, pH meter, probe, scale, vessel mark,
  controller, calculated
- `raw` — the reading as taken, with entered unit
- `corrected` — the corrected reading, with unit; `null` when no correction
- `correction` — `{ kind, version, inputs }`
- `step_id` — the checklist step it belongs to
- `note`
- `supersedes` and `void` — correction without deletion

The metric catalog declares `id`, label, phase, section, step, level, dimension,
base unit, expected source, tolerance, correction kind, allowed methods and
whether the metric is repeatable. The expected source is an artifact path or a
named pure provider.

## 5. Flat frozen table

The checklist table has one row per rendered step or observation:

- `kind` — `step` or `observation`
- `phase`, `section`, `title`
- `text` — the generated instruction
- `level` — the row's minimum level
- `expected`, `unit`, `method` — observation columns; `—` for steps
- `note`, `skipped` — user state

Every cell is a formatted display value. The Typst section groups by phase and
section; step rows render as checkboxes, observation rows render as the appendix.
The table key is `batch.brew_checklist`, which is a collection node, so the
existing bundle integrity rule accepts it. No bundle-format bump is expected; if
the spike disproves that, the contract is amended before Phase 1 proceeds.

## 6. Paper workflow

1. Freeze the recipe.
2. Print the checklist at the chosen level, including the appendix.
3. Brew; write actuals on paper.
4. Later, create or open the session and transcribe the observations.
5. The session computes variance; the frozen plan is unchanged.
6. Optionally promote calibration readings to reusable records.

The paper form and the app use the same metric ids. Deferred entry is a primary
path, not a fallback.

## 7. Variance and derived views

For each metric with an expected value and an effective observation:

- `delta = effective − expected`
- `percent` where meaningful
- `verdict = within | above | below | missing`
- `band` from the metric catalog

Derived checks are computed, never stored:

- Brewhouse efficiency from actual OG, actual volume and grist mass.
- Apparent attenuation from actual OG and FG.
- Yield from packaged volume and OG.
- FG stability from the last two readings at least 48 hours apart.
- Mash pH verdict against the band.

## 8. Non-goals

- Observations as DAG values or solver inputs.
- Mutating a frozen batch or its report bundle.
- Silent hydrometer or refractometer correction.
- Automatic equipment calibration from one brew.
- Sensor ingestion, charts, or time-series analytics in v1.
- Replacing the existing record library with a session log, or vice versa.
- A second dimension or unit system for observations.

## 9. Phase map

| Phase | Plan | Gate |
|---|---|---|
| 1 | [brew-checklist](archive/2026-11/brew-checklist.md) — planner, levels, report appendix | `make verify` |
| 2 | [brew-session](archive/2026-11/brew-session.md) — session log, live and deferred entry, variance, Brew Sheet | `make verify` |
| 3 | [brew-measurement-promotion](brew-measurement-promotion.md) — calibration and cooling-curve records | `make verify` |

Phase 2 is blocked by Phase 1. Phase 3 is blocked by Phase 2 and the record
schema layer in [cooling-curve-determination](archive/2026-11/cooling-curve-determination.md).

## 10. Amendment rule

A phase plan may add detail. It may not reverse a locked decision. If a phase
discovers that a locked decision is wrong, change this contract in the same
commit as the phase plan that depends on it, and say why.
