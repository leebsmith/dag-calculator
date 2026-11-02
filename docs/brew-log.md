# Brew log

The checklist is the join between the solved recipe and the brewer's actions. It
covers before brew day, brew day and after brew day. The recipe owns the plan; the
checklist does not own completion or observations. Those arrive with the brew
session, the execution log beside a frozen recipe: the frozen batch is the plan,
the session records what actually happened, and it never writes back to the
recipe or its report bundle.

## Data

| File | Purpose |
|---|---|
| `data/seeds/brew-checklist.json` | Phases, sections, steps, levels, conditions, providers and observation links |
| `data/seeds/brew-observations.json` | Observation metrics shared with the brew session |
| `frontend/src/views/checklist/` | Pure selection, formatting, conditions and providers |
| `backend/app/templates/sections/checklist.typ` | The printed checklist and blank appendix |

The persisted plan is the `batch.brew_checklist` collection. Each row carries
`step_id`, `note`, `skipped` and `skip_reason`. The selected level is the
`batch.checklist_level` choice. Generated text is never persisted.

A session is a per-user document collection, scoped by the authenticated uid. It
snapshots the frozen checklist table at creation, so later catalog or artifact
changes do not rewrite an open or sealed log. It carries `batch_id`,
`batch_name`, `artifact_hash`, `frozen_at`, `level`, `status`, `started_at`,
`ended_at`, `finalized_at`, `steps`, `observations` and notes. `steps` holds done,
note, skipped and skip reason keyed by checklist step id. Observation fields are
`metric_id`, `step_id`, `at`, `recorded_at`, `source`, `method`, `raw`,
`corrected`, `correction`, `note`, `supersedes` and `void`.

## Levels

The levels are cumulative:

| Level | Meaning |
|---|---|
| `critical` | The short gate list: safety, sanitation, capacity, mash pH, volumes, gravities, pitch and packaging |
| `info` | The full brew sheet: every routine action with quantities and a done-when line |
| `debug` | Info plus expected values, methods, tolerances, N/A steps and model caveats |

A step declares its minimum level. At `debug`, a conditional step whose condition
is false is shown as N/A rather than omitted.

## Phases and sections

| Phase | Sections |
|---|---|
| Before brew day | Safety & site, Plan, Procure & prep, Equipment, Preflight |
| Brew day | Setup, Mash, Lauter, Boil, Knockout & transfer, Close-out |
| After brew day | Fermentation, Packaging, Review |

## Step fields

| Field | Meaning |
|---|---|
| `id` | Stable id; never reused |
| `section` | Section id |
| `level` | Minimum level |
| `kind` | `action`, `check`, `measure`, `auto` or `note` |
| `condition` | Optional named condition |
| `provider` | Optional pure text provider |
| `title` | Imperative title |
| `text` | Generated instruction, with `{{path}}` placeholders |
| `done_when` | Completion criterion |
| `observations` | Observation metric ids linked to the step |
| `safety` | Safety row; always critical |

`auto` steps are preflight gates evaluated from the solve. They are not physical
actions and are not editable.

## Conditions

The conditions are `always`, `has_boil_hops`, `has_whirlpool_hops`,
`has_dry_hops`, `has_late_sugar`, `has_mash_out`, `has_rests`,
`is_lager_or_mixed`, `has_water_target` and `has_yeast`. A condition reads the
engine; it never writes state.

## Providers

Most text is a template. A provider is used only where a list or a derived
sentence is needed:

- water setup, dough-in and sparge doses
- the enabled mash rests
- boil, whirlpool and dry-hop schedules

Providers receive the engine and the formatter and return text. They do not write
state, read the DOM, or import the store.

## The appendix and the Brew Sheet

The printed checklist ends with an observation log built from
`data/seeds/brew-observations.json`. At `critical` it prints the vitals; at
`info` the key readings; at `debug` the full set with expected values, units and
methods. The actual columns are blank in the planner phase; the session fills
them later.

`GET /brew-sessions/{id}/report` renders the session as a PDF from
`backend/app/templates/brew_session.typ`: the checklist with ticks and notes, the
observation table with raw/corrected values, and the variance table. The sheet is
generated from the session document; the frozen recipe report is a separate
document.

## Entry and variance

Live and deferred entry use the same row model. `at` is when the reading was
taken; `recorded_at` is when it was entered. A reading entered after brew day is a
paper-sourced row with its own timestamp. Missing readings stay absent; they are
never rendered as zero.

The session stores the raw reading and an optional corrected reading. The method
is always kept, and the correction records its kind and version so a later change
cannot silently reinterpret a stored reading. Automated hydrometer temperature and
refractometer-alcohol corrections run in
`frontend/src/store/observationCorrections.js`; a manual correction stays a
recorded value with its method.

The session compares the latest effective reading to the expected value in the
frozen checklist table. The verdict uses the metric tolerance: a pH band is an
absolute range, a volume or gravity tolerance is a plus/minus. Missing readings
render as "not recorded".

## Status and sealing

A session moves through `planned`, `brewing`, `fermenting`, `packaging`,
`complete` and `sealed`. Sealing sets `finalized_at`; after that, observations and
steps are append-only and the API rejects ordinary patches. The frozen batch and
its report bundle are never modified.

## Corrections

The session offers two automated corrections and stores the raw reading alongside
the corrected one:

- **Hydrometer temperature** — corrects to 20 C with the water-density polynomial.
  At the calibration temperature it is a no-op; a hot reading is raised and a cold
  reading lowered.
- **Refractometer alcohol** — Terrill's correction from the current Brix and the
  original Brix. It needs both readings; without them the corrected value stays
  absent rather than guessed.
- **pH / ATC** — the meter's temperature-compensated reading is the corrected
  value.

The user may always enter a corrected value directly. The method and correction
version travel with the observation.

## Adding a step

1. Add the step to the seed with a stable id and a section.
2. Choose the level, condition and, if needed, a provider.
3. Add observation metric ids only if the step has a reading.
4. Run `make check` and `make test`. The catalog guard rejects duplicate ids,
   unknown levels, sections, conditions, providers and unresolved expected paths.
5. If the change affects the printed shape, update the report fixture and
   `docs/report-sections.md` with `make generate`.

## What this doc does not cover

- Equipment calibration and cooling-curve promotion (Phase 3).
- Sensor ingestion or charts.
