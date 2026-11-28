# Dry-hop schedule language

Status: **living — the contract for `batch.dry_hops` timing.** The grammar lives
in `data/artifact.json` (the `schedules.dry_hop` descriptor); the labels and the
day precision live in `frontend/src/views/dryHopSchedule.js`. This document
explains both and is held to the artifact by a guard.

Scope: when each dry-hop charge goes in, and how long it stays. It records intent
only — nothing here is solved, scheduled against dates, or read by the boundary
solvers. Dry hops add no IBU and are excluded from the hop totals.

## Invariants

- **No calendar dates.** A batch carries no event timestamps, so the language
  resolves to symbolic points and relative day offsets only.
- **References are relative selectors** — previous charge, next charge, or an
  ordinal. Charges have no ids.
- **One merged, ordered event vocabulary** serves both the application instant
  and the contact end.
- **Time is days**, fractional to two decimals. Minutes do not exist in this
  language.
- **The free-text Trigger field is gone.** Its prose was folded into Notes
  during migration.
- **The artifact is canonical.** The descriptor declares the vocabulary; the
  frontend module only adds labels and rendering.

## Vocabulary

- **Charge** — one dry-hop addition row.
- **Instant** — a point on the fermentation timeline.
- **Span** — how long the charge stays in contact.
- **Anchor** — what an instant is measured from: an event, pitch day, or another
  charge.
- **Offset** — signed days added to an anchor, so "3 days before packaging" is
  expressible.

## Grammar

Application is an **Instant**; contact is a **Span**.

### Instant

| Kind | Meaning | Shape |
| --- | --- | --- |
| `event` | A named point in the process, optionally shifted | `{ kind: "event", event: <event id>, offset_days: <signed days> }` |
| `day` | Fermentation day, pitch = day 0 | `{ kind: "day", day: <days ≥ 0> }` |
| `after` | Relative to another charge's application | `{ kind: "after", charge: <ref>, offset_days: <signed days> }` |

`offset_days` defaults to `0` and may be omitted.

### Span

| Kind | Meaning | Shape |
| --- | --- | --- |
| `for` | A fixed total time | `{ kind: "for", days: <days > 0> }` |
| `until` | Until an instant | `{ kind: "until", instant: <Instant> }` |
| `open` | No end recorded | `{ kind: "open" }` |

Because `until` takes an Instant, "until packaging", "until day 9", "until the
next charge" and "until 2 days after charge 1" are one constructor.

### Charge references

| Selector | Meaning | Allowed in |
| --- | --- | --- |
| `{ selector: "previous" }` | The charge immediately before this one | Application only |
| `{ selector: "next" }` | The charge immediately after this one | Contact only |
| `{ selector: "ordinal", ordinal: n }` | The n-th charge, 1-based | Application: n < own ordinal. Contact: n > own ordinal |

Direction is validated: application anchors point backwards, contact ends point
forwards. Cycles are impossible by construction. An ordinal is positional, so
reordering rows reorders the schedule — rows are a schedule, not a set.

## Event vocabulary

| Rank | Id | Label |
| --- | --- | --- |
| 0 | `pitch` | Pitch |
| 1 | `high_krausen` | High krausen |
| 2 | `mid_fermentation` | Mid fermentation |
| 3 | `terminal_gravity` | Terminal gravity |
| 4 | `post_diacetyl` | Post-diacetyl |
| 5 | `vdk_clearance` | VDK clearance |
| 6 | `hop_creep_plateau` | Hop-creep plateau |
| 7 | `biotransformation_equilibrium` | Biotransformation equilibrium |
| 8 | `cold_crash` | Cold crash |
| 9 | `packaging` | Packaging |

The order is a **coarse advisory**, not a fact: hop-kinetics milestones overlap
fermentation, so rank comparisons raise warnings, never errors. The legacy
application id `terminal` migrates to `terminal_gravity`, and `next_charge` is
not an event — it becomes `{ selector: "next" }`.

## Time

- Canonical unit: **day**, stored as a number; the artifact declares the unit,
  the frontend declares the two-decimal precision.
- Fractions are allowed to **two decimals** (`0.25` = six hours, `0.5` =
  twelve). Validation rejects more; the UI steps by `0.25` and accepts typed
  values.
- Display is days only with trailing zeros trimmed (`7 d`, `0.5 d`, `0.25 d`)
  and `+` / `−` for offsets (`+2 d`, `−3 d`).
- If sub-six-hour granularity is ever needed, extend the unit vocabulary; do not
  reintroduce minutes ad hoc.

## Semantics

Resolution is symbolic. Each instant becomes one of:

- a numeric day (`day`, or `after` a charge whose instant is numeric),
- a symbolic event point plus a signed offset,
- a symbolic reference to another charge's start plus a signed offset.

Each charge resolves to a start (its application instant) and an end:

- `for` → start + days,
- `until` → the given instant,
- `open` → no end.

Comparisons:

| Start | End | Check |
| --- | --- | --- |
| numeric | numeric | end > start, else error |
| event rank | event rank | end rank > start rank, else warning; equal ranks with a positive offset are fine |
| event | numeric / vice versa | unknown; no check |
| any | charge reference | direction and existence checked; ordering when both resolve numerically |

No absolute dates are produced. A relative timeline may be rendered for charges
that resolve numerically ("charge 2 at +3 d from charge 1"); the event-anchored
part stays symbolic.

### Canonical rendering

Application:

- `Terminal gravity`
- `Terminal gravity + 2 d`
- `Terminal gravity − 3 d`
- `Day 3`
- `3 d after charge 1`
- `Previous charge + 1 d`

Contact:

- `for 7 d`
- `until Packaging`
- `until the next charge`
- `until 2 d after charge 1`
- `no end recorded`

Read-only surfaces print these sentences; they never expose the raw expression
objects.

## Storage

### Descriptor

`schedules.dry_hop` in the artifact declares the time unit, the ordered event
list with ranks, the application and contact variant ids, and the reference
selectors. It carries no labels, option text or precision: those are
presentation and live in the frontend module, which the artifact purity guard
enforces. A guard pins the descriptor to that module so the two cannot drift.

### Row fields

`dry_hop_row` carries `application` and `contact` in place of
`application_event`, `contact_duration_min`, `contact_until` and
`time_of_application`. `application_stage`, `product_type`, `quantity`, `unit`,
`hop_id`/`variety` and `notes` are unchanged. A new charge defaults to
`application = { kind: "event", event: "high_krausen" }` and
`contact = { kind: "open" }` — the same intent the old null/null pair carried.

### Migration from legacy rows

| Legacy | New |
| --- | --- |
| `application_event` | `application = { kind: "event", event: <id> }`; `terminal` → `terminal_gravity` |
| `contact_duration_min` | `contact = { kind: "for", days: round(minutes / 1440, 2) }` |
| `contact_until` (event) | `contact = { kind: "until", instant: { kind: "event", event: <id> } }` |
| `contact_until = next_charge` | `contact = { kind: "until", instant: { kind: "after", charge: { selector: "next" }, offset_days: 0 } }` |
| both duration and until | duration wins (they were mutually exclusive) |
| neither | `contact = { kind: "open" }` |
| `time_of_application` prose | appended to `notes`, never dropped silently |

Editable drafts migrate on load (`migrateDryHopSchedule` in the adapter's
`loadState`); the reader is idempotent, so a migrated draft is untouched on the
next load. Imported recipe durations go through the same helper, so a BeerXML
minute count lands as a `for` span.

## UI, derived from the descriptor

- **Editor table**: hop, type, quantity and unit stay inline. The schedule is
  read-only there — the When and Contact columns print the sentences and the
  row's pencil opens the inspector. Three nested controls per cell did not fit
  and caused the clipping.
- **Inspector**: an Application block (kind, then the variant's value, then a
  signed offset in days) and a Contact block (kind, then duration, instant
  sub-form, or nothing for open). Every control comes from a descriptor variant;
  offsets are signed numbers with a `+`/`−` affordance.
- **Read-only Dry Hops table** and the report print the canonical sentences.
- **Trigger** is absent from both tables, the inspector and the labels.

## Validation summary

Errors: a reference to a missing charge; wrong direction for the selector; a
charge referencing itself; an ordinal out of range; a non-positive duration;
more than two decimals; a numeric end at or before the numeric start.

Warnings: equal event ranks with no positive offset; contact ending at the same
event it started from; a contact event ranked before its application event;
contact shorter than a day with an event anchor.

## Non-goals

- No dates, no absolute timeline, no fermentation prediction.
- No charge ids, and no schedule that survives row reordering by identity.
- No minutes, and no per-charge contact temperature model.
- Dry hops stay descriptive: they never enter the IBU, mass or boundary maths.
