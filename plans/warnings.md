---
title: Warnings — Post-Solve Surfacing & LIFO Tracking
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [trace-malts]
status: partially shipped
---

# Warnings — Post-Solve Surfacing & LIFO Tracking

> **Status (batch-solver-correctness batch).** Relation findings now enumerate
> through `views/registry/findings.js` with severity `warning` / `error` derived
> from the artifact's `blocking` flag; the footer count remains as a summary
> badge, and a violated blocking finding refuses a freeze client- and
> server-side. The LIFO style/trace queue (W.1–W.5) remains proposed.

> **See also:** [`batch-solver-correctness.md`](archive/batch-solver-correctness.md) (D13, D16, D17, D22).
> That plan extends this one: severity becomes artifact-declared (`blocking` on relations),
> capacity overruns become `error` findings that do **not** block the solve but **do** block
> freezing, and the footer count gains full enumeration alongside it. Pick **one** severity
> vocabulary across both documents when this is built; do not ship `hard/soft` and `error/warning`
> side by side.

## Goal

A persistent footer bar that continuously displays, in LIFO order, soft
**post-solve warnings** — distinct from hard violations — alongside
style-conformance readouts (gravity / ABV / SRM / IBU ranges).

## Context (what already exists)

- `stepAdapter.compute()` aggregates HARD signals: `relations`, `domains`,
  `fieldDomains`, `collectionDomains` → `violationCount` + `stepStatus`
  (`frontend/src/adapters/stepAdapter.js:429-464`).
- `boundaryError` (hard solver failure) → an alert in the stage
  (`frontend/index.html:105`).
- The footer already renders `violationCount` (`frontend/index.html:172-175`).
- The water boundary now treats sparge acid as a prescription, not a warning. The
  former `prescription.sparge_tannin_warning` flag was removed; a nonzero sparge
  acid dose is the source of truth and is shown in the water card's Prescription.
- Trace malts (see `plans/` trace-malts feature) will produce a
  "% of total grist" signal post-solve.
- Style conformance vs. the style envelope is a TODO ("gate up front on mismatch").

## Locked decisions

1. **Two tiers.** `error` = unbrewable/blocking (a violated relation whose
   artifact `blocking` flag is true); `warning` = quality/policy. Separate
   channels, shared footer surface. Do not introduce a third vocabulary.
2. **Post-solve only.** Warnings derive from the valuation, never from
   authoring inputs. No pre-solve guessing.
3. **LIFO queue.** Newest-first, bounded (N visible + "+k more"), deduped by a
   stable warning id, re-evaluated on every solve, cleared when resolved.
4. **Warning identity.** `{ id, severity, message, nodeId? }` — deterministic
   from the valuation (a pure function), so persistence is optional.
5. **Display.** The footer bar (persistent, not tied to `activeStep`).
6. **Persistence.** Live/ephemeral while editing; the reviewer re-derives from
   the frozen valuation (warnings are pure functions of it).
7. **Reconcile, don't fork.** Extend `compute()`'s existing aggregation rather
   than introducing a second warning system.

## Initial warning taxonomy

- `style.conformance.{og,fg,abv,srm,ibu}` ← envelope drift (soft)
- `trace.pct_high` ← trace mass above a threshold % of total grist
  (requires the trace-malts feature + reviewer)
- `solver.soft.*` ← soft vs. hard boundary conditions (TBD)

## Architecture

- `frontend/src/views/warnings.js` — `computeWarnings(...)` returns
  `[{ id, severity, message, nodeId? }]`, a pure function of resolved values.
- `stepAdapter.compute()` calls it and stores `this.warnings` (LIFO).
- The `app-footer` partial renders the queue + conformance readouts.

## Staging

- **W.1** Severity model + hook; wire style conformance end-to-end.
- **W.2** LIFO queue (dedup, bound, order) + footer rendering.
- **W.3** Style conformance readouts on the footer.
- **W.4** Freeze-snapshot semantics + reviewer consumption.
- **W.5** `trace.pct_high` (once trace malts land).

## Open questions

1. `N` (visible warning count) and the eviction policy.
2. Reclassify `ABV_UNREACHABLE` from hard to soft?
3. Dedup by `id` only, or `id`+`message` (allow re-emergence after resolve)?
4. Conformance readout: always-on, or only when out of range?

## Out of scope

- Pre-solve warnings (explicitly rejected).
- Transient toast notifications (the queue is persistent, not transient).
- The reviewer itself.
