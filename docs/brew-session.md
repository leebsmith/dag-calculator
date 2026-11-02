# Brew session

A brew session is the execution log beside a frozen recipe. The frozen batch is
the plan; the session records what actually happened and never writes back to the
recipe or its report bundle.

## Data

- `brew_sessions` is a per-user document collection, scoped by the authenticated
  uid.
- The session snapshots the frozen checklist table at creation; later catalog or
  artifact changes do not rewrite an open or sealed log.
- A session carries `batch_id`, `batch_name`, `artifact_hash`, `frozen_at`,
  `level`, `status`, `started_at`, `ended_at`, `finalized_at`, `steps`,
  `observations` and notes.
- `steps` holds done, note, skipped and skip reason keyed by checklist step id.
- Observation fields are `metric_id`, `step_id`, `at`, `recorded_at`, `source`,
  `method`, `raw`, `corrected`, `correction`, `note`, `supersedes` and `void`.

## Entry

Live and deferred entry use the same row model. `at` is when the reading was
taken; `recorded_at` is when it was entered. A reading entered after brew day is
a paper-sourced row with its own timestamp. Missing readings stay absent; they
are never rendered as zero.

The session stores the raw reading and an optional corrected reading. The method
is always kept, and the correction records its kind and version so a later
change cannot silently reinterpret a stored reading. Automated hydrometer
temperature and refractometer-alcohol corrections run in
`frontend/src/store/observationCorrections.js`; a manual correction stays a
recorded value with its method.

## Status and sealing

A session moves through `planned`, `brewing`, `fermenting`, `packaging`,
`complete` and `sealed`. Sealing sets `finalized_at`; after that, observations and
steps are append-only and the API rejects ordinary patches. The frozen batch and
its report bundle are never modified.

## Variance

The session compares the latest effective reading to the expected value in the
frozen checklist table. The verdict uses the metric tolerance: a pH band is an
absolute range, a volume or gravity tolerance is a plus/minus. Missing readings
render as "not recorded".

## Corrections

The session offers two automated corrections and stores the raw reading
alongside the corrected one:

- **Hydrometer temperature** — corrects to 20 C with the water-density
  polynomial. At the calibration temperature it is a no-op; a hot reading is
  raised and a cold reading lowered.
- **Refractometer alcohol** — Terrill's correction from the current Brix and the
  original Brix. It needs both readings; without them the corrected value stays
  absent rather than guessed.
- **pH / ATC** — the meter's temperature-compensated reading is the corrected
  value.

The user may always enter a corrected value directly. The method and correction
version travel with the observation.

## Brew Sheet

`GET /brew-sessions/{id}/report` renders the session as a PDF from
`backend/app/templates/brew_session.typ`: the checklist with ticks and notes, the
observation table with raw/corrected values, and the variance table. The sheet is
generated from the session document; the frozen recipe report is a separate
document.

## What is not modelled

- Promotion of calibration or cooling-curve records (Phase 3).
- Sensor ingestion or charts.
