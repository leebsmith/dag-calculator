# Brew checklist

The checklist is the join between the solved recipe and the brewer's actions. It
covers before brew day, brew day and after brew day. The recipe owns the plan; the
checklist does not own completion or observations. Those arrive with the brew
session.

## Data

| File | Purpose |
|---|---|
| `data/seeds/brew-checklist.json` | Phases, sections, steps, levels, conditions, providers and observation links |
| `data/seeds/brew-observations.json` | Observation metrics shared with the future brew session |
| `frontend/src/views/checklist/` | Pure selection, formatting, conditions and providers |
| `backend/app/templates/sections/checklist.typ` | The printed checklist and blank appendix |

The persisted state is the `batch.brew_checklist` collection. Each row carries
`step_id`, `note`, `skipped` and `skip_reason`. The selected level is the
`batch.checklist_level` choice. Generated text is never persisted.

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

## The appendix

The printed checklist ends with an observation log built from
`data/seeds/brew-observations.json`. At `critical` it prints the vitals; at
`info` the key readings; at `debug` the full set with expected values, units and
methods. The actual columns are blank in the planner phase. The brew session fills
them later.

## Adding a step

1. Add the step to the seed with a stable id and a section.
2. Choose the level, condition and, if needed, a provider.
3. Add observation metric ids only if the step has a reading.
4. Run `make check` and `make test`. The catalog guard rejects duplicate ids,
   unknown levels, sections, conditions, providers and unresolved expected paths.
5. If the change affects the printed shape, update the report fixture and
   `docs/report-sections.md` with `make generate`.

## What this phase does not do

- No completion state and no timestamps.
- No observation entry and no variance.
- No session persistence and no measurement records.
- No automatic equipment calibration.

Those belong to the brew-session phase and the measurement-promotion phase.
