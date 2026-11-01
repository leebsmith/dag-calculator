---
title: Brew Session — Phase 2 Log
status: proposed (outline)
program: deterministic-dag-calculator
depends_on: [brew-log-contract, brew-checklist]
blocks: [brew-measurement-promotion]
gate: make verify
---
<!-- claims: proposed batch.brew_checklist batch.checklist_level -->

# Plan — Brew session (Phase 2, outline)

This is an interface-level outline. It is detailed enough to constrain the
implementation, but the task-level breakdown waits until Phase 1 lands and the
actual frozen checklist table shape is known.

## Goal

Add the execution log beside a frozen recipe: a `brew_session` that snapshots the
checklist, records observed values (live or from paper), computes variance against
the plan, and renders a Brew Sheet. The frozen batch remains the plan and is never
mutated.

## Non-goals

- Changing the checklist catalog, levels or report appendix. Phase 1 owns those.
- Editing the frozen batch or its report bundle.
- Automatic equipment calibration or measurement-record promotion. Phase 3.
- Charts, sensor ingestion, CSV import, or multi-device real-time sync.
- Live control of heating, cooling or fermentation.
- A second model of attenuation, efficiency or yield. Use the existing core
  formulas.

## Decisions inherited from the contract

- One session per frozen recipe; multiple sessions allowed.
- The session snapshots the rendered checklist and expected values at start.
- Observations are raw + corrected + method; effective = corrected ?? raw.
- Missing is `null`, never zero.
- Variance is computed, never stored.
- Paper is the offline capture; deferred entry is a primary path.
- Promotion is explicit and later.

## Session document

```
brew_sessions/{session_id}
  uid
  batch_id
  batch_name
  artifact_hash
  frozen_at
  level                    # critical | info | debug
  status                   # planned | brewing | fermenting | packaging | complete | sealed
  started_at
  ended_at
  finalized_at
  plan_snapshot            # checklist rows + expected observation values
  observations[]           # rows, append-only after finalization
```

`plan_snapshot` contains the rendered checklist rows at the selected level and the
expected values for every observation metric linked to those rows. It is a snapshot
of what the brewer was shown, not a live reference that can drift when the catalog
changes.

Observation rows follow the contract:

- `id`, `metric_id`, `step_id`
- `at`, `recorded_at`, `source` (`live`, `paper`, `import`)
- `method`
- `raw` (`value`, `unit`)
- `corrected` (`value`, `unit`) or `null`
- `correction` (`kind`, `version`, `inputs`) or `null`
- `note`
- `supersedes`, `void`

The metric catalog from Phase 1 declares dimensions, base units, expected sources,
tolerances, allowed methods and correction kinds.

## API surface

Provisional route names:

- `POST /brew-sessions` — create from a frozen batch, choose level and brew date.
- `GET /brew-sessions` — list, optionally filtered by `batch_id`.
- `GET /brew-sessions/{id}` — session document.
- `PATCH /brew-sessions/{id}` — status, notes, ended_at; optimistic concurrency.
- `POST /brew-sessions/{id}/observations` — append a reading.
- `PATCH /brew-sessions/{id}/observations/{observation_id}` — correct or void.
- `POST /brew-sessions/{id}/finalize` — seal the log; observations become
  append-only.
- `GET /brew-sessions/{id}/report` — the Brew Sheet.
- `POST /brew-sessions/{id}/report` — preview a draft Brew Sheet, if needed.

Ownership is structural through the authenticated uid. The session references a
frozen batch and must reject a draft batch, an unknown batch, or a batch owned by
another user.

## UI

Two tabs in the session view:

- **Checklist** — the Phase 1 rows with done, skipped and note state.
- **Observations** — a table grouped by phase and section, with expected values
  pre-filled, a raw field, a method picker, a corrected value, time and note.

Live entry:

- “Record” stamps `at` and `recorded_at`; `source: live`.
- The app can surface the next expected metric from the current step.
- Entering a reading does not auto-complete a physical step; it may suggest it.

Deferred entry:

- The session can be created after brew day.
- A bulk table allows entering all readings at once.
- `at` is editable; `recorded_at` is now; `source: paper`.
- Missing readings stay empty and render as “not recorded”.

Repeatable metrics (fermentation gravity and fermentation temperature) use an
append-only reading list. The latest effective reading is the current value; FG
stability is a derived check over the last two.

## Corrections

Correction kinds:

- `hydrometer_temp` — correct to the calibration temperature (20 °C); store sample
  temperature and the formula version.
- `refractometer_alcohol` — correct a fermenting-wort reading using the OG or
  original Brix; if the original is missing, leave `corrected: null` and mark the
  correction unavailable.
- `instrument_atc` — pH meter with automatic temperature compensation; store sample
  temperature and calibration state.
- `none` — volume, temperature and mass; `corrected` equals `raw`.

Each formula is versioned and tested against known vectors. The raw reading is never
overwritten. The report prints the correction kind and version.

## Variance and Brew Sheet

For each metric with an expected value and an effective observation:

- `delta = effective − expected`
- `percent` where meaningful
- `verdict = within | above | below | missing`
- `band` from the metric catalog

Derived checks:

- Brewhouse efficiency from actual OG, actual volume and grist mass.
- Apparent attenuation from actual OG and FG.
- Yield from packaged volume and OG.
- FG stability from the last two readings at least 48 hours apart.
- Mash pH against the target band.

The **Brew Sheet** is a separate render path from the frozen plan report. It
contains the checklist with ticks and notes, the observation table with
expected/raw/corrected/delta, the variance summary, and notes. The frozen plan
report keeps the blank appendix.

The session report is not a frozen fact unless the session is sealed. Sealing makes
observations append-only and corrections become new rows.

## Dependencies

- Phase 1: catalog, metric catalog, flat table, report appendix.
- Existing solver outputs for expected values: batch cascade, water prescription,
  attenuation and brewhouse efficiency.
- Existing auth and batch ownership rules.
- Existing report renderer for the Brew Sheet, or a separate Typst path if the
  bundle shape does not fit.

## Open questions to resolve at detail time

1. Should the session report reuse the report bundle shape or use a dedicated
   session template? Recommendation: a dedicated template; a session is a log, not
   a frozen fact.
2. Observation document limit: keep the array in the session document, or move to a
   subcollection when a repeatable metric exceeds a threshold?
3. Does `finalize` seal the session only, or also render and store a sealed Brew
   Sheet? Recommendation: seal the log first; sealed report can follow.
4. Should the session copy the Phase 1 observation metric catalog version, or rely
   on the frozen bundle's artifact hash plus the seed version? Recommendation:
   snapshot the metric metadata used by the session.
5. Exact formula sources and error bounds for the hydrometer and refractometer
   corrections. Pin them in `docs/brew-checklist.md` or a new living doc.

## Acceptance

- A session can be created from a frozen recipe and a draft/unknown batch is
  rejected.
- The checklist and expected values are snapshotted at start.
- Live and deferred readings both work; paper-sourced readings keep the brew-day
  time.
- Raw, corrected and method are stored and printed; effective drives variance.
- Missing readings render as “not recorded”, never zero.
- FG stability requires two readings at least 48 hours apart.
- The Brew Sheet renders the checklist, observations and variance.
- The frozen batch and its bundle are byte-identical before and after any session
  work.
- `make verify` is green.

## Gate

`make verify`. The outline graduates to a task-level plan after Phase 1 is green.
