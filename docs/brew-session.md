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
is always kept. Automated hydrometer and refractometer corrections are not
implemented yet; the UI accepts the corrected value and records the method.

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

## What is not modelled

- The printable Brew Sheet render path.
- Automated correction formulas.
- Promotion of calibration or cooling-curve records.
- Sensor ingestion or charts.
