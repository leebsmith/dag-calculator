---
title: Brew Measurement Promotion — Phase 3
status: proposed (outline, blocked)
program: deterministic-dag-calculator
depends_on: [brew-log-contract, brew-session, cooling-curve-determination]
blocks: []
gate: make verify
---
<!-- claims: proposed batch.brew_checklist -->

# Plan — Brew measurement promotion (Phase 3, outline)

This is a scope-level outline. It is blocked by Phase 2 and by the non-DAG record
schema layer described in [cooling-curve-determination](cooling-curve-determination.md).
It should not be detailed until that layer exists and a real session log has been
used.

## Goal

Turn a sealed session's observations into reusable, immutable measurement records:
equipment calibration, cooling curves, and lauter/sparge runoff tables. The next
batch copies the selected record forward; the observed batch is never rewritten.

This is the learning loop:

> observe → promote → improve the next plan

not:

> observe → silently change the plan

## Non-goals

- Automatic promotion or automatic equipment mutation.
- Editing a frozen batch or a sealed session.
- Sensor ingestion.
- Statistical fitting beyond the existing cooling-curve fit.
- Replacing the record library or the phase 1/2 stores.
- A calibration “profile” layer that silently overrides equipment identity.

## Decisions inherited from the contract

- Records are immutable; corrections create a new record.
- Promotion is explicit and user-confirmed.
- Existing batches keep their own identity and are never rewritten.
- The record schema layer references artifact dimensions, units and domains; it
  does not introduce a second dimension system.

## Candidate records

| Record | Source observations | Consumer |
|---|---|---|
| Equipment calibration | Measured dead space, transfer loss, boil-off, brewhouse efficiency | Equipment profile or a calibration record selected by a future batch |
| Cooling curve | Whirlpool/chill time and temperature points, ambient temperature | The whirlpool cooling time constant |
| Sparge runoff table | Lauter volume and gravity over time | Lauter and efficiency guidance |

The first release should pick one record kind; equipment calibration is the most
broadly useful. Cooling curves are the first record-library catalog in the existing
cooling-curve plan and should land there, not be duplicated here.

## Expected shape

- A sealed session exposes a “create record” action for each supported record kind.
- The app proposes values from the session; the user reviews and confirms.
- The server validates the record against the non-DAG record schema.
- The record is created in the library with a new immutable id.
- The session stores a link to the created record for provenance.
- Existing batches are untouched. A future batch selects the record into its
  identity and re-solves.

## Dependencies

- Phase 2's sealed sessions and observation rows.
- The record schema layer and library merge from
  [cooling-curve-determination](cooling-curve-determination.md).
- The equipment identity copy-forward path in the existing library.
- A decision on whether a calibration record is a new equipment profile or a child
  record that an equipment profile references.

## Open questions at detail time

1. Is equipment calibration a new equipment record (copy-forward) or a separate
   calibration record with an equipment id?
2. Does a session promote one record at a time, or a bundle of calibration values?
3. How are outliers and partial observations handled? Proposal: propose, never
   apply; the user chooses which readings to promote.
4. What is the provenance back-link from a record to the session that produced it?
5. Does the record schema layer need an `equipment_calibration` schema, or can the
   existing equipment schema carry measured fields?

## Acceptance

- A sealed session can create one supported record kind.
- The record is immutable and validated against the record schema.
- The session retains a provenance link.
- The observed batch and its report bundle are unchanged.
- A future batch can select the record and re-solve.
- `make verify` is green.

## Gate

`make verify`, after the record schema layer and Phase 2 have landed. Until then,
this plan is a scope record, not an executable task list.
