# Plan: 2026-11-12 water treatment model

Status: executing.

<!-- claims: proposed solver.water.post_dose_hlt_ions prescription.uncorrected_mash_ph solver.water.prescription.uncorrected_mash_ph water.route water.strategy solver.water.post_salt_mash_ions solver.water.post_salt_hlt_ions -->

## Objective

Make water treatment internally consistent end to end — model, solver, card,
report, docs — so every number has one meaning, every dose has a named driver,
and the authorship boundary (intent in, masses out) is visible.

Definition of done: `make verify` green; the acceptance scenarios below pass; no
user-facing text names a solver mode.

## Locked decisions

- Vocabulary: objectives (equalities), guardrails (inequalities), corrections
  (pH-driven), practice (declarations), doses, vectors, destinations, kettle.
- Modes are internal routing only; the route is derived from the objective set
  and never stored as state.
- One treated vector per vessel: stage 2 is "treated"; stage 1 leaves the wire.
- The kettle is the blend of the two treated vectors.
- pH is always corrected; the card always says so with a before → after line and
  both resolved corrections.
- The calcium floor is a minimum (`final Ca >= floor`) in every dosing mode,
  relaxed with one reported finding when infeasible, and graded only when a
  dosing route applied it.
- A floated ion that moves names its driver (never a bare "Auto").
- Equality objectives are never relaxed; a missed guardrail is a finding.
- No sticky target-grid lock; the empty objective set is one state with one
  name, live and after reload.
- The calcium floor is a parameter: selecting an objective set installs it,
  detaching keeps the visible value, "No objectives" resets it.

## Non-goals

- No authored acid/alkali dose; no pH-control switch; no authored calcium cap.
- No artifact node-id, wire-key or draft-key renames (presentation only).
- Not in this plan: reconciling the two "left in the HLT" volumes; a field
  provenance badge; modelling HLT pH for sparge acid. Log in `TODO.md`.

## Checklist

### P0 — Decision record

- [ ] `plans/2026-11-12-water-treatment-model.md` records decisions and the gap
      register (this file), with the claims header above.
- [ ] Add the two out-of-scope items to `TODO.md`.

### P1 — Corrected vectors and honest disclosure

- [ ] Core: HLT vector gets flavour salts only (grist-only agent excluded).
- [ ] Core: sparge acid returns `(ml, alk_correction_ppm)`.
- [ ] Core: compute and return `post_dose_hlt_ions`; return `post_salt_hlt_ions`.
- [ ] Service: delete `_post_hlt_ions`; map both HLT vectors.
- [ ] Schema: `WaterSolverResponse.post_dose_hlt_ions`.
- [ ] Artifact: declare six `post_dose_hlt_ions` outputs; repoint the six kettle
      inputs to the post-dose vectors.
- [ ] Doubles (`tests/fixtures/boundaryDouble.js`, `tests/frontend/helpers.js`):
      add the new outputs; make stage-2 alkalinity differ from stage 1.
- [ ] Tests: HLT rules (proportional/mash-only/zero-alk/agent), matrix
      invariants, kettle regression.
- [ ] Guards: ALLOW both stage-1 outputs; delete `postMashIons` and
      `postHltIons` registry constants.
- [ ] Docs: domain equations §3.2 and the dosing-practice §5 + sparge-acid
      assumption.
- [ ] `make generate` (bundle fixture, inventory, glossary).
- [ ] Core/service/schema/artifact/doubles: `prescription.uncorrected_mash_ph`
      output, with tests.
- [ ] Card: `waterVerdict.phLine` (before → after + both doses).
- [ ] Labels: pH-objective hint (always corrected; objectives optional).
- [ ] Card: floated-ion driver hint for alkalinity, keyed to the pH pair.
- [ ] Card: remove the target-grid lock; derive the selection from the objective
      set.
- [ ] Docs: ui.md pH line, grid notes, target-selector table.

### P2 — Route derived in the artifact

- [ ] Spike: confirm a taxonomy-returning derived node may reduce a collection.
- [ ] Add `water.route` (derived) reproducing `strategyForHeld` from
      `water.pinned_ions`; remove the `water.strategy` root.
- [ ] Boundary input and adapter map to `water.route`; delete the frontend
      routing function and all strategy root writes.
- [ ] Regenerate the default-request fixture; update its root map.
- [ ] Tests: parity, mode/status assertions, draft-with-old-root behaviour.
- [ ] Docs: ui.md state model, domain equations inputs.

### P3 — Guardrail semantics and findings

- [ ] Mode 1 floor becomes `Ca >= floor` (same lower bound as Mode 5).
- [ ] Fix the relaxation wording (guardrail, not equalities).
- [ ] Tests: Mode 1 above/below/infeasible floor; re-pin values.
- [ ] Audit only when applied: skip BASELINE, suppress when the unreachable
      finding already exists.
- [ ] Tests: pristine batch has no floor finding; shortfall yields one.
- [ ] Docs: findings section; calcium-minimum hint.

### P4 — Vocabulary

- [ ] Labels: "Ion objectives", "Calcium minimum", "Mash pH objective"; drop
      user-facing strategy labels.
- [ ] Card: "Objective (ppm)" column, "Objective <ion>" checkbox, "Practice"
      region.
- [ ] Statuses: Held / Held (min) / Best fit / Floated / Unset; route line in
      objective terms.
- [ ] Tests: all status and route-line assertions.
- [ ] Docs: ui.md vocabulary, practice wording.
- [ ] Report: objective line drops the strategy code.

### P5 — Surface removal

- [ ] Remove the twelve stage-1 outputs from the artifact and response schema;
      keep them as core locals.
- [ ] Move provider assertions to core-level tests; drop stage-1 keys from the
      doubles; remove the ALLOW entries.
- [ ] Docs: outputs table; grep for stale references.
- [ ] `make generate`; `make verify`.

## Acceptance scenarios

1. **The reported bug.** Source alkalinity 78; pin SO4/Cl/alk then untick
   alkalinity: objectives are SO4/Cl; the alkalinity row is floated with the
   correction hint; post-addition alkalinity is the corrected vector; the kettle
   is below it; the pH line shows before → after with both doses; no previous
   alkalinity value appears on the card.
2. **Cycle to no objectives.** From any preset, untick every ion: BASELINE, no
   pinned rows, no mineral dose, pH still corrected and disclosed, selector reads
   "No objectives" before and after reload, grid interactive, floor preserved.
3. **Pristine batch.** Ca objective unset/floated (not 50); calcium minimum 50
   with the guardrail hint; no calcium finding; pH line present.

## Verification

- Per commit: `make check` for the touched surface; `make test` before a phase
  is called done (data/docs are full-suite fallbacks).
- Artifact commits: `make generate` in the same commit; `make dot` if the graph
  changes.
- Final: `make verify`; local-only `make test-oracle` and `make test-visual`.
