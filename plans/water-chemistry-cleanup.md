---
title: Water Chemistry Cleanup + SO4:Cl Intent Readout
step: next
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [record-library-foundation]
blocks: []
gate: —
status: accepted
---

# Plan 2 — Water chemistry cleanup and the SO4:Cl intent readout

## Goal

Make water records behave like every other record — copied forward, read-only in the batch —
and delete the duplicated ion roots. Then state style intent for SO4:Cl as a batch input and
show it against the ratio the solver actually produces at the kettle.

## Non-goals

- Style-conformance water axis / any pass-fail verdict for the ratio
  (`style-water-axis-todo.md`).
- Kettle-weighted solver outputs — not needed; see the readout section.
- Grist ion contributions. Real but small, not in the seeds, and the comparison has no
  tolerance yet.
- Whirlpool/cooling work.

## Decisions already made (do not re-litigate)

- Source water and target water are both records; RO is a source report with zero ions, not
  a target.
- `sulfate_chloride_ratio` comes off the `water_target` record; the ion vector is the only
  authority. The picker may compute and display the implied ratio.
- `calcium_floor_ppm` lives on the target record (per the source document's macro-style
  dictionary), not as a batch root.
- Desired SO4:Cl is a batch input, default `1.0`, never seeded from the chosen profile.
  "Null" is expressed by an explicit two-member choice, never by a sentinel ratio.
- The readout is host-side presentation: no tolerance, no badge.
- The as-solved ratio is a kettle ratio, not a mash ratio.

## Phase 1 — artifact surgery and seeds

- Delete the twelve duplicated roots `water.source.*` and `water.target.*`.
- `solver.water.inputs` re-points at selection fields:
  `source.calcium_ca → water.source_report.calcium_ca`, …,
  `source.alkalinity_as_caco3 → water.source_report.total_alkalinity_caco3`,
  `target.* → water.target_profile.*`.
- Delete the `water.calcium_floor_ppm` root; point the boundary input at
  `water.target_profile.calcium_floor_ppm`.
- `primitive_schemas.water_target`: remove `sulfate_chloride_ratio`; keep
  `calcium_floor_ppm` with its `default: 50`.
- `primitive_schemas.water_report`: add `source_name` and `location` (free text), so a series
  of dated samples keeps its provenance.
- Seeds: delete `ro-distilled` from `water_target_profiles.json`; add a zero-ion RO report to
  `water_reports.json` carrying `source_name: "RO / Distilled"` and a note that it is a
  definition, not a lab result.
- Add the intent inputs: taxonomy `sulfate_chloride_target` (`unspecified` | `specified`),
  choice `batch.sulfate_chloride_target_mode` (default `unspecified`), root
  `batch.sulfate_chloride_target_ratio` (`dimensionless`, `gte 0`, default `1.0`).
  Naming is cosmetic; the step manifest places both on the style card.
- Tests: `validate-artifact`; seed conformance (7 targets, the RO report, new fields);
  removal cases for the deleted roots.
- Re-emit `docs/dag-artifacts/inventory.md`.

## Phase 2 — frontend plumbing off the roots

- `views/seedDerivations.js`: drop the water entries. Keep the style and yeast entries — those
  seed legitimate batch decisions and stay.
- `adapters/boundaryRequest.js`: `WATER_FIELDS` re-points the twelve ions and `ca_floor` at
  dotted selection paths. `tests/backend/conformance/test_boundary_wire_contract.py` must
  still pass.
- `views/steps.js` water step: remove the twelve ion fields and the calcium floor; list the
  source and target ions as selection-field readouts (`water.source_report.calcium_ca`, …)
  so the card still displays them without accepting input.
- `views/registry/water.js`: remove the ion and floor labels; add the two intent labels.
- `tests/frontend/seed-derivations.test.js`: water cases removed; style/yeast retained.

## Phase 3 — style card input

- `partials/step-style.html`: a checkbox bound to the mode choice plus a ratio number input
  disabled when unspecified, wired through `styleField()` / `edit()`.
- `adapters/cards/style.js`: display helpers for the mode and ratio.
- Tests: toggling the mode writes the choice root; the ratio persists and displays; the card
  renders without a selected style.

## Phase 4 — the SO4:Cl readout

Host-side helper (e.g. `views/waterRatio.js`), no DAG node:

- **As-solved**, kettle basis:
  - `salt_distribution = PROPORTIONAL` → the ratio of `post_salt_mash_ions` (the treated
    vector is identical for mash and HLT by construction).
  - `MASH_ONLY` → volume-weighted blend of `post_salt_mash_ions` with the copied source
    report's ions. Weight by *delivered* water reaching the kettle (the batch solver's
    cascade runnings/sparge), not by `water.v_hlt_treat_l`, which includes residual liquor
    that never ships.
- **Intent** → `batch.sulfate_chloride_target_ratio` when the mode is `specified`.
- **Delta** → multiplicative factor `as_solved / intent`, shown beside both ratios
  ("3.0 : 1 intent → 2.6 : 1 kettle, 0.87×").
- Undefined states: chloride ≤ 0 → "—" and no delta; mode unspecified → as-solved only; no
  solver result yet → "—".
- Placement: water card, immediately after the salt-addition readouts. Style card shows the
  intent value only.
- Tests: proportional identity, `MASH_ONLY` blend, zero-chloride guard, unspecified mode,
  delta factor arithmetic.

## Phase 5 — docs and gates

- `docs/dag-artifacts/domain-equations.md`: water input list and where the floor comes from.
- `docs/dag-artifacts/seed-substrate.md` §2.5: report/target schema changes, RO-as-report.
- Re-emit the inventory (Phase 1 does this; confirm it is current at close).
- `make verify` green.

## Risks

- **`calcium_floor_ppm` becomes per-profile.** All seven remaining seeds carry 50, so
  behaviour is unchanged today, but a user-authored target must now carry its own floor; the
  schema default keeps omissions valid.
- **Blend volume choice.** Pinning the weights to the cascade rather than the treatment
  volumes changes the number under `MASH_ONLY`; verify against what the solver dosed by
  comparing to `post_salt_mash_ions` under `PROPORTIONAL` (must reduce to identity).
- **RO report validity.** A synthetic report has no lab, no dates. Populate the metadata
  fields with an explicit non-lab convention rather than plausible-looking fake dates.
- **Wire contract drift.** Re-pointing `WATER_FIELDS` touches the backend conformance test;
  keep the rename map (`total_alkalinity_caco3 → alkalinity_as_caco3`) in one place.

## Commit requirements

- One commit per phase, imperative subject, scoped to that phase.
- No phase is complete until `make check` and `make test` pass.
- Every artifact change carries its re-emitted `docs/dag-artifacts/inventory.md` and the
  relevant prose doc in the same commit.
- Do not combine unrelated refactors with a phase.
