---
title: Water Chemistry Cleanup, SO4:Cl Intent Readout, and Salt-Mode Honesty
step: next
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [record-library-foundation, remediation-2026-10]
blocks: []
gate: —
status: accepted
revision: 2
revised: 2026-10-21
supersedes: plans/archive/water-chemistry-cleanup.md (v1, accepted 2026-10-20, never executed)
---

# Plan 2 (rev 2) — Water chemistry cleanup, SO4:Cl intent, salt-mode honesty

## Why this revision exists

v1 was written before the October remediation (`de881ca`..`f1f30a4`) landed. The
artifact, seeds, engine, steps manifest, and boundary adapter are all **unchanged**
since v1, so every premise about the water model still holds. What changed is the
set of guards and contracts around them. v1's five phases are no longer
committable as separate green commits; the phase cut below is the smallest one
that keeps every commit green.

Hard constraints discovered against the current tree:

| Constraint | Consequence |
|---|---|
| `tests/guards/boundary-inputs.test.js` — a request builder must read *exactly* the boundary's declared `inputs` | Re-pointing `solver.water.inputs` (v1 Phase 1) without re-pointing `WATER_FIELDS` (v1 Phase 2) fails the guard and throws at runtime. Phases 1+2 must be **one commit**. |
| `tests/guards/manifest-integrity.test.js` (A6) — every manifest ref must resolve | Deleting the roots while `steps.js` still lists them fails A6. The manifest must change in the same commit. |
| `tests/conformance/boundary-fixtures.test.js` — `WATER_VALUES` hard-codes the 12 root paths + floor, and the stub engine throws on unexpected paths | Fixture must change in the same commit. v1 never mentioned it. |
| `backend/app/services/water_solver_service.py:28` — `assert_field_parity(WaterSolverRequest, WaterChemistryInput)` at import | Wire **aliases** must not change. Re-point `path` only; keep `total_alkalinity_caco3 → alkalinity_as_caco3`. |
| `tests/backend/conformance/test_boundary_wire_contract.py` + `tests/conformance/fixtures/boundary-wire-keys.json` | Derived from `WATER_FIELDS` wire keys. Alias-preserving edits leave the fixture untouched. |
| `backend/app/artifact.py:validate_component` rejects undeclared fields; `data/catalogs.json` sets `water_report.title_field = laboratory` | `source_name`/`location` must be in `primitive_schemas.water_report` before any seed or library record carries them, and the synthetic RO report must carry a non-empty `laboratory`. |
| `tests/guards/installer-contract.test.js` + `cards/style.js:598 KEYS` | Any new app member in the style card must be added to `KEYS`. |
| Template guardrails (A8/A10, utils barrel) | No inline formatting/predicates/assignments in partials; named methods; `fmt.*`; `reportError` instead of bare `catch`. |
| Boundary outputs admit only dimension/taxonomy/boolean; `solver.water.outputs` has no `warnings` key | Solver warnings cannot reach the UI without a contract change. All salt-mode mitigation must be derived host-side from declared outputs. |
| `docs/engine.md:233-234` documents the `water.source.*` / `water.target.*` root table | v1's doc list was incomplete; `engine.md` must change in Phase E. |

Not affected: `tests/backend/test_schemas.py:47` asserts the *Pydantic*
`WaterSolverRequest.calcium_floor_ppm` default (wire field survives), not the
artifact root.

## Goal

Water records behave like every other record — copied forward, read-only in the
batch — the duplicated ion roots are gone, and style intent for SO4:Cl is a batch
input shown against the ratio the solver actually produces at the kettle.

Then make the salt solver's mash/sparge assumption visible, because it is
currently a silent failure surface (see "Salt-mode honesty").

## Non-goals

- Style-conformance water axis / any pass/fail verdict for the ratio.
- Kettle-weighted **solver** outputs: the kettle blend is a host-side mass balance
  over delivered volumes, not a boundary quantity. (The *treated vessel* vectors
  **are** in scope — see below.)
- **Unmodelled additions, made visible instead of modelled**: grist ion
  contributions and sodium metabisulfite. Both get a "not modelled" note on the
  water card and a docs entry; neither enters the solver.
- Any change to `salt_distribution` **semantics** — this plan documents and surfaces
  the existing behaviour; it does not add a third mode. (The **dose volume** is
  explicitly *in* scope — see M4.)
- Whirlpool/cooling work.
- Editing `backend/app/core/water.py`. The core is a **sealed** boundary supernode
  (`docs/dag-artifacts/domain-equations.md:144`); it computes the HLT vector
  internally but does not return it. See M8 for how to surface it without reopening
  the seal.

## Decisions already made (do not re-litigate)

- Source water and target water are both records; RO is a source report with zero
  ions, not a target.
- `sulfate_chloride_ratio` comes off the `water_target` record; the ion vector is
  the only authority. The picker may compute and display the implied ratio.
- `calcium_floor_ppm` lives on the target record, not as a batch root.
- Desired SO4:Cl is a batch input, default `1.0`, never seeded from the profile.
  "Null" is an explicit two-member choice, never a sentinel ratio.
- The readout is host-side presentation: no tolerance, no badge.
- The as-solved ratio is a kettle ratio, not a mash ratio.
- `source_name` / `location` are free text on `water_report` (revisit as a catalog
  reference only if dated-sample provenance becomes a requirement).
- **Operator practice, recorded as the model of record.** Prior to the first
  underlet, **both acid and salts** (in proportion) are added to the **dry grist**.
  After the underlet and any top-up, the sparge treatments — **both acid and
  salts** — are added to the **HLT**, and the sparge is delivered by underletting.
  The HLT holds water plus sodium metabisulfite only until that point. That is
  `PROPORTIONAL`, and the split is exactly the solver's:

  | | Grist, before first underlet | HLT, after underlet + top-up |
  |---|---|---|
  | `PROPORTIONAL` salts | `dose_per_L × v_strike` | `dose_per_L × salted_volume` |
  | `PROPORTIONAL` acid | `mash_acid_ml` | `sparge_acid_ml` |
  | `MASH_ONLY` salts | `dose_per_L × v_strike` | **zero** |
  | `MASH_ONLY` acid | `mash_acid_ml` | `sparge_acid_ml` — unchanged |
  | Alkaline agent | on the grist | always zero, by construction |
- **Metabisulfite stays unmodelled, deliberately.** One 0.44 g tablet contributes at
  most ~1.0 g SO₄ and ~0.24 g Na per gram of Na₂S₂O₅ (full oxidation), so the
  concentration depends entirely on the HLT volume: ~7.8 mg/L SO₄ and ~1.9 mg/L Na
  per tablet per 15 US gal (56.8 L), but ~15 mg/L SO₄ in a 30 L HLT. Roughly half the
  time untreated top-up water displaces part of that dose. Variable in both
  dimensions, so it is surfaced as a known omission rather than guessed at.

## Salt-mode honesty

**Question:** can a user pick a salt solver mode and then treat the wrong
mash/sparge volume, producing a silent wrong answer they might brew from?

**Answer: yes, three ways.** The mode is a *declared assumption*, never observed
from practice, and nothing in the artifact, the solver, or the UI cross-checks it.

Mechanics (`backend/app/core/water.py:500-543`):

- The LP returns a **per-litre** dose. Mash always gets `dose × v_mash_treat_l`.
- `PROPORTIONAL` → HLT gets `dose × v_hlt_treat_l`; `MASH_ONLY` → sparge **salt**
  dose is zeroed.
- `post_hlt` is `source + added` under `PROPORTIONAL`, bare `source` under
  `MASH_ONLY`. Mash pH always uses `post_mash` (identical in both modes).
- **Sparge acid is computed in both modes** from `post_hlt` residual alkalinity.
  `MASH_ONLY` zeroes salts, not acid.

Failure matrix:

| # | Declared | Actual practice | Silent consequence |
|---|---|---|---|
| 1 | `PROPORTIONAL` | Mash dosed, HLT skipped | Solver overstates sparge salts → kettle SO4:Cl overstated; sparge acid was dosed against a *treated* HLT residual alkalinity that does not exist. |
| 2 | `MASH_ONLY` | HLT dosed out of habit | Solver assumes untreated sparge → kettle SO4:Cl understated; the error grows with the dose. |
| 3 | `MASH_ONLY` read as "leave the HLT alone" | Sparge acid skipped | Four of five sparge rows read `0 g`, the fifth (`acid_l`) stays nonzero. User performs an alkaline sparge while `sparge_tannin_warning` still describes the solver's acid-protected case. |

Aggravating factors:

- `registry/water.js:22` labels the choice **"Salt distribution"** with bare enum
  values — no hint of the consequence, and no hint that it only governs *salts*.
- There is **no `post_salt_hlt_ions` output**, so the treated sparge vector is
  never displayed. The frontend can only reconstruct it from the mode — which is
  exactly what Phase D does, so the readout inherits the assumption.
- No artifact relation mentions water or sparge, so there is no status indicator.
- **`MASH_ONLY` has zero test coverage** — `test_water_solver.py` exercises only
  `PROPORTIONAL` (the fixture default). The branch is untested on its own side.
- **Every solver warning is dropped.** `WaterChemistryOutput.warnings` is returned
  by the service (`_to_response`), but `solver.water.outputs` declares no
  `warnings` key, and the artifact output grammar admits only
  dimension/taxonomy/boolean — no list or string. So the existing "HLT surplus" and
  calcium-floor warnings never reach the DOM. A backend warning is therefore *not*
  a usable mitigation without a contract change.
- Two safety values that **are** declared outputs are also never shown:
  `prescription.sparge_tannin_warning` and `prescription.residual_hlt_water_l`
  appear in neither `steps.js` nor the water registry.

### Mitigations in this plan

- **M1 (Phase B) — choice labels, with a completeness guard.** `projection.js:191`
  builds `options` straight from `artifact.taxonomies`, and `applyPresentation`
  cannot override them, so today the select renders raw `MASH_ONLY`,
  `GYPSUM_DIHYDRATE`, `LACTIC_88`. Add a registry-level `optionLabels` map, pass it
  through the projection as a sibling of `options`, and render it through
  `fmt.optionLabel(labels, value)` (new `utils/strings.js` helper + tests + index
  row). A guard asserts **every taxonomy member used by a choice field has a
  label**, so a future `CACL2_HEMIHYDRATE` cannot appear raw. This is the "self
  documenting thereafter" mechanism, and it simultaneously fixes the raw-enum
  problem for the three dose-form choices.
- **M2 (Phase C) — self-describing doses.** One generated basis line on the water
  card: "masses assume dihydrate gypsum · dihydrate CaCl₂ · 88% lactic acid",
  derived from `water.gypsum_form` / `water.cacl2_form` / `water.acid_medium` via
  the same `optionLabels` map. Because it is derived from the roots the solver
  reads, the label cannot drift from the number. The per-row labels are
  form-qualified too ("Gypsum (dihydrate)").
- **M3 (Phase C) — treatment summary per vessel.** Each vessel: treat volume, each
  nonzero salt mass, acid dose. `PROPORTIONAL` states salts go to **both**;
  `MASH_ONLY` states the sparge is salts-free and acid-only. This is the mitigation
  for failure #1.
- **M4 (Phase C) — the dose volume is the HLT after top-up.** The repo already owns
  this concept: `batch.sparge_salted_volume` is displayed on the batch card as
  **"Sparge Salt Dosing Volume"** (`steps.js:174`, hint
  `V_sparge_salted = V_hlt_after_strike + V_hlt_top_up`). The water solver does not
  use it — `water.v_hlt_treat_l` defaults to `v_sparge_deliverable`, which is
  `salted_volume − v_hlt_debt`. So today the salt and acid masses are short by
  exactly the HLT dead space + transfer loss. **Derive** `v_hlt_treat_l` from
  `batch.sparge_salted_volume` (Phase A) and print that figure as the basis: "dose
  the N L in the HLT after top-up; M L of it ships". Dosing by concentration means
  the leftover liquor is correctly salted and the delivered sparge is correct.
  This also *repairs* the solver's own surplus formula: with the new basis,
  `treat − debt − demand` equals the true surplus (`deliverable − demand`), where
  the current default under-reports it.
- **M5 (Phase C) — surface what already exists.** Display
  `prescription.residual_hlt_water_l` and `prescription.sparge_tannin_warning`, and
  derive the two volume mismatches host-side: treat volume above the HLT content
  (over-salted, wasteful) and below it (under-salted HLT). Both computable from
  `batch.sparge_salted_volume` + `water.v_hlt_treat_l` + declared outputs.
- **M6 (Phase C) — semantics lock.** Under `MASH_ONLY` with an alkaline source:
  `sparge_dose_g` all zeros **and** `sparge_acid_ml > 0`; `mash_dose_g` = per-litre
  dose × strike volume. Under `PROPORTIONAL`: `sparge_dose_g > 0` when the HLT holds
  water. Under **both** modes, `mash_acid_ml > 0` and `sparge_acid_ml > 0` when the
  source needs acid — the distribution mode governs salts only, never acid.
- **M7 (Phase D) — the ratio states its basis** ("kettle, assumes sparge treated per
  mode"); under `MASH_ONLY`, "sparge: untreated, acid only", pointing at the Phase C
  summary rather than restating doses.
- **M8 (Phase A + C) — surface the treated water and its distance from the target.**
  The core computes `post_hlt = source + added` under `PROPORTIONAL` and bare
  `source` under `MASH_ONLY` (`core/water.py:500-502`) but never returns it. The
  service adapter can reconstruct it exactly from `result.post_salt_mash_ions` and
  `req.source` — `post_hlt = post_mash if proportional else source` — so add
  `post_salt_hlt_ions: IonProfile` to `WaterSolverResponse` and the matching six
  `solver.water.outputs`. The artifact then owns the whole treated picture:
  `post_salt_mash_ions` (already declared) and `post_salt_hlt_ions` (new).
  The water card shows **treated mash**, **treated HLT**, and the **kettle blend**
  against the **target profile**, each with a signed delta. Under `PROPORTIONAL` the
  two vessels are identical by construction and collapse to one block; under
  `MASH_ONLY` the HLT block visibly equals the source, which is exactly the
  consequence the mode name hides.
- **Why this is not the same as "kettle-weighted solver output":** the treated
  vectors are chemistry facts owned by the boundary. The kettle blend is a
  delivered-volume mass balance owned by the host. Both are shown; only the first
  crosses the boundary.
- **Not mitigated, by design:** failure #2 (declaring `MASH_ONLY` and dosing the HLT
  anyway) is still not *detected* — a declaration can never observe practice. M8
  makes it **visible**: the HLT block reads at source concentration, so a user who
  dosed it can see the contradiction against what they did. Automatic detection
  would require reading the brewer's mind, not another output.
- **M9 (Phase C) — the brew-day instruction branches on the mode.** `views/brewDay.js:42`
  already accepts `defaultInstruction`; `cards/brew-day.js:70` never passes one. Wire
  it to a derived `waterInstruction(stepId)` for `brew-day-setup`, `dough-in`, and
  `batch-sparge`, so the payload carries explicit, mode-specific directions. Zero
  doses are omitted; the acid is named by medium and strength; salt names carry their
  hydrate. Exact wording (example values from a 14.0 L strike / 16.0 L salted HLT):

  - `brew-day-setup` (both modes) → "Fill the HLT to 20.0 L. Add 1 crushed
    metabisulfite tablet per 15 US gal. Water and metabisulfite only — no salts or
    acid yet. (SMB is not modelled: ≤ ~8 mg/L SO₄ at one tablet per 15 US gal,
    ~15 mg/L in a 30 L HLT.)"
  - `PROPORTIONAL`, `dough-in` → "Dose the dry grist before underletting:
    gypsum 4.2 g (dihydrate), calcium chloride 2.1 g (dihydrate), 88% lactic acid
    1.4 mL. Sized for the 14.0 L strike."
  - `PROPORTIONAL`, `batch-sparge` → "After the strike is drawn and the HLT is
    topped up to 16.0 L: add gypsum 4.8 g, calcium chloride 2.4 g, 88% lactic acid
    1.0 mL to the HLT. Stir to dissolve, then underlet. 15.0 L ships; the remainder
    is dead space and transfer loss."
  - `MASH_ONLY`, `dough-in` → identical (the mash dose never changes with the mode).
  - `MASH_ONLY`, `batch-sparge` → "After the strike is drawn and the HLT is topped up
    to 16.0 L: no salts in the HLT. Add 88% lactic acid 1.0 mL only. 15.0 L ships."
  - Degenerate case: when every HLT addition is zero, print "No additions to the
    HLT — underlet with untreated water", never a blank.

  A user-authored `instructions` string still wins (`row.instructions || derived`);
  the derived text is also shown as the input placeholder so it is visible before
  printing.
- **Outside this plan:** the rendered recipe *document* is still Summary reporting.
  M9 feeds the brew-day payload it will consume, so the text exists and is tested;
  only the page template remains.

## Phase A — atomic artifact + frontend surgery

One commit. Every item below is required for the same commit to be green.

Artifact (`data/artifact.json`; `frontend/src/engine/artifact.json` is a symlink):

- Delete the twelve roots `water.source.*` / `water.target.*`.
- Delete the `water.calcium_floor_ppm` root and the `default_calcium_floor_ppm`
  constant.
- `solver.water.inputs` re-points at selection fields:
  `source.calcium_ca → water.source_report.calcium_ca`, …,
  `source.alkalinity_as_caco3 → water.source_report.total_alkalinity_caco3`,
  `target.* → water.target_profile.*`, `calcium_floor_ppm →
  water.target_profile.calcium_floor_ppm`.
- `primitive_schemas.water_target`: remove `sulfate_chloride_ratio`; keep
  `calcium_floor_ppm` with `default: 50`.
- `primitive_schemas.water_report`: add `source_name`, `location` (`{}`, free text).
- Add taxonomy `sulfate_chloride_target` (`unspecified` | `specified`), choice
  `batch.sulfate_chloride_target_mode` (default `unspecified`), root
  `batch.sulfate_chloride_target_ratio` (`dimensionless`, `gte 0`, default `1.0`).
- Convert `water.v_hlt_treat_l` from a **root to a derived node**:
  `inputs: {v: "batch.sparge_salted_volume"}`, `expr: {ref: "v"}`, output
  `volume`. The volume dosed is whatever is in the HLT after the fill rule — there
  is no free choice to model. Drop its `gte 0` root domain; it disappears from the
  water card's editable fields and reappears as a readout. This is the M4
  dose-volume correction (its default was `v_sparge_deliverable`, i.e.
  `salted − v_hlt_debt`).
- Stale-root hygiene: `masterStore.replaceRoots` (`store/masterStore.js:13-17`)
  copies whatever a draft carries. An old draft's persisted
  `water.v_hlt_treat_l` would land in the store as a non-root id. Filter unknown /
  non-root ids on load (or delete the key in the draft migration) and add an A4
  case that loads such a draft.

Backend contract (M8) — the sealed core stays untouched:

- `backend/app/schemas/boundary.py`: `WaterSolverResponse` gains
  `post_salt_hlt_ions: IonProfile`.
- `backend/app/services/water_solver_service.py:104-124` `_to_response`: derive
  `post_hlt = result.post_salt_mash_ions if salt_distribution == PROPORTIONAL else
  req.source`, and return it as `post_salt_hlt_ions`. One line, provably identical to
  the core's internal value given the documented contract.
  `_to_response` needs the request (or the mode + source ions) threaded through its
  signature.
- `data/artifact.json`: add the six `solver.water.outputs.post_salt_hlt_ions.*` keys
  (`concentration`, same ions as `post_salt_mash_ions`).
- `frontend/src/adapters/stubBoundaries.js`: add the six flattened stub values, or
  the offline path renders empty fields.
- **New guard — boundary output parity.** Nothing today checks artifact boundary
  `outputs` against the response models; a declared output that is never returned
  disappears silently (the field resolves to `null`). Add a conformance test
  comparing `top_level(solver.<id>.outputs)` to the response model's fields, with
  `warnings` / `notes` on an explicit allow-list. This is what would have caught the
  current "warnings are invisible" state.

Seeds:

- Delete `ro-distilled` from `water_target_profiles.json` (7 remain).
- Add a zero-ion RO report to `water_reports.json`: `report_id: "ro-distilled"`,
  `laboratory` set to an explicit non-lab convention (required — it is the catalog
  `title_field`), `source_name: "RO / Distilled"`, `location: ""`, zero ions,
  `notes` stating it is a definition, not a lab result. No plausible fake dates.

Frontend:

- `views/steps.js:246-286` — remove the twelve ion fields and the floor root; list
  the source and target ions as readout fields (`water.source_report.calcium_ca`,
  …, `water.target_profile.calcium_floor_ppm`) so the card still displays them
  without accepting input. Keep everything else in place; the intent fields join
  the style card in Phase B.
- `views/registry/water.js` — delete the ion and floor input labels; add readout
  labels for the selection-field paths.
- `views/seedDerivations.js` — drop the water entries; keep style and yeast.
- `adapters/boundaryRequest.js:113-119` — `WATER_FIELDS` re-points the twelve ions
  and `calcium_floor_ppm` at the dotted selection paths. Aliases unchanged.

Tests / fixtures (same commit):

- `tests/conformance/boundary-fixtures.test.js:70-96` `WATER_VALUES` — replace the
  root paths with the selection paths.
- `tests/frontend/seed-derivations.test.js` — water cases removed; style/yeast kept.
- Removal cases for the deleted roots (`tests/frontend/domains.test.js`,
  `tests/frontend/step-boundaries.test.js` where they assert on root ids).
- Seed conformance (`water_reports.json` RO report, `water_target_profiles.json` at
  7, the new fields).
- `validate-artifact` and `test_artifact.py` stay green.

Re-emit `docs/dag-artifacts/inventory.md` in this commit.

## Phase B — choice labels, then the style card intent input

**B1 — choice label plumbing (M1).** There is no option-label mechanism today:
`projection.js:191-195` copies `artifact.taxonomies[...]` verbatim, and
`applyPresentation` can only override `label`/`hint`/`display`.

- `views/registry/*.js`: an `optionLabels` map per field id, covering
  `salt_distribution`, `gypsum_form`, `cacl2_form`, `acid_medium` (and any other
  choice whose members read as codes). Values are the sentences that carry the
  consequence: `PROPORTIONAL` → "Both — mash and sparge get the same salt
  concentration"; `MASH_ONLY` → "Mash only — sparge gets acid, no salts";
  `GYPSUM_DIHYDRATE` → "Dihydrate (CaSO₄·2H₂O)"; `LACTIC_88` → "88% lactic acid".
  For `salt_distribution`: `PROPORTIONAL` → **"Split — grist and HLT"**;
  `MASH_ONLY` → **"Mash only salts"**. The second label is deliberately a
  *salts* adjective: `MASH_ONLY` still acids the HLT, and the wording must not imply
  otherwise.
- `views/producer/projection.js`: pass `optionLabels` through on the field model
  (sibling of `options`; do not change `options`' shape, to leave the select loop
  and `tests/guards/select-binding.test.js` alone).
- `utils/strings.js`: `optionLabel(labels, value)` — label when present, value
  otherwise; barrel export; assertions in `tests/frontend/utils.test.js`; index row.
- `partials/step-card.html`: render the option text through
  `fmt.optionLabel(f.optionLabels, opt)`.
- **Completeness guard** (`tests/guards/option-labels.test.js`): every taxonomy
  member reachable from a choice field must have a label. Adding
  `CACL2_HEMIHYDRATE` later fails the guard until it is labelled. This is the
  "self-documenting thereafter" guarantee.

**B2 — style card intent input.**

- `partials/step-style.html`: a checkbox calling a named `setSulfateChlorideMode()`
  and a ratio input calling `setSulfateChlorideRatio()` / `commitField()`, disabled
  when the mode is `unspecified` (use `x-if`/a getter — never dereference behind
  `x-show`, A10).
- `adapters/cards/style.js`: display helpers for the mode and ratio; **append both
  members to `KEYS`**.
- Tests: toggling writes the choice root; the ratio persists and displays; the card
  renders with no style selected; installer-collision guard passes.

## Phase C — self-describing doses, volume honesty, semantics lock

All frontend; no boundary or wire-contract change (see the warnings constraint
above — a backend warning would be undeliverable under the current output
grammar).

- `adapters/cards/water.js` (new card module, registered like the others, with a
  `KEYS` export): derive from declared outputs and roots — no engine path
  resolution in the template.
  - **Basis line (M2):** "Masses assume dihydrate gypsum · dihydrate CaCl₂ · 88%
    lactic acid", generated from the three choice roots through the same
    `optionLabels` map. Row labels are form-qualified ("Gypsum (dihydrate)",
    "Lactic acid (88%)").
  - **Per-vessel summary (M3):** vessel, treat volume, each nonzero salt mass, acid
    dose. `PROPORTIONAL` → "salts to mash **and** HLT"; `MASH_ONLY` → "sparge: acid
    only, no salts".
  - **Treated water vs target (M8):** three blocks, each six ions with a signed
    delta against `water.target_profile`:
    1. **Treated mash** — `post_salt_mash_ions`.
    2. **Treated HLT** — `post_salt_hlt_ions` (this is the mode made visible: under
       `MASH_ONLY` it equals the source report).
    3. **Kettle (blended)** — host-side mass balance:
       `(post_mash × (v_run1 + v_run2) + post_hlt × v_sparge) / (v_run1 + v_run2 + v_sparge)`,
       explicitly labelled as a delivered-volume estimate, not a measured value.
    Under `PROPORTIONAL`, blocks 1 and 2 are identical by construction — render one
    block and note "split mode: same concentration in both vessels". Deltas use
    `fmt`; zero is "0", absent values are "—".
  - **Dose basis (M4):** print `batch.sparge_salted_volume` as *the* volume to salt
    ("dose the N L in the HLT after top-up"), with the delivered sparge volume shown
    beside it for information only. Never present grams without the volume they
    belong to.
  - **Destinations, not just vessels.** Each block names where the dose physically
    goes, because "the mash" is ambiguous:
    - Mash → **dry grist in the tun, before underletting** — salts, **acid**, and any
      alkaline agent, all onto the grist. This is the operator's actual practice, and
      chemically identical to dosing the liquor.
    - Sparge → **the HLT, after the strike has been drawn and the top-up added**.
    The summary states the fill rule that produced that volume — the greater of the
    HERMS coil floor and the deliverable sparge requirement — so the operator can
    check it against what they did.
  - **Mismatches (M5):** treat volume above the HLT content → "over-salted, M L
    wasted"; below → "under-salted HLT by M L".
  - **Tannin badge:** `prescription.sparge_tannin_warning` adjacent to the acid
    dose, so the two cannot be read apart. Also surface
    `prescription.residual_hlt_water_l`.
  - **"Not modelled" note:** one line naming grist ions and metabisulfite, with the
    order of magnitude ("1 tablet / 15 US gal ≤ ~8 mg/L SO₄; ~15 mg/L in a 30 L HLT;
    less after untreated top-up"). Informational, not a warning.
- **Brew-day instruction (M9).** Wire `buildBrewDayPayload`'s existing
  `defaultInstruction` argument (`views/brewDay.js:42`) from `cards/brew-day.js:70`
  to a derived `waterInstruction(stepId)`, and show the same text as the input
  placeholder in `partials/step-brew-day.html`. Text is generated from the same
  formatted dose rows as the water card — one source, two surfaces. `row.instructions`
  still overrides.
- `views/steps.js` water slice: add `prescription.residual_hlt_water_l` and
  `prescription.sparge_tannin_warning` as readouts with the sparge additions.
- Formatting through the `fmt` barrel; `reportError` on every degradation path.
- Tests (M6): `MASH_ONLY` with an alkaline source → `sparge_dose_g` all zeros and
  `sparge_acid_ml > 0`, `mash_dose_g` = per-litre dose × strike volume;
  `PROPORTIONAL` counterpart → `sparge_dose_g > 0` when the HLT holds water;
  basis-line generation for all form/acid combinations; summary rendering for both
  modes; volume mismatch derivation; brew-day instruction text for both modes and
  the `instructions`-override path; installer collision guard.

## Phase D — the SO4:Cl readout

Host-side helper (e.g. `views/waterRatio.js`), no DAG node, built on the `fmt`
barrel and `reportError`. It consumes the **same kettle vector** Phase C renders —
one mass balance, not two:

- **As-solved, kettle basis** — from the Phase C blend:
  - `PROPORTIONAL` → the blend reduces to `post_salt_mash_ions`, because
    `post_salt_hlt_ions` is identical by construction (assert this as the identity
    test).
  - `MASH_ONLY` → the blend weights `post_salt_mash_ions` against the
    solver-provided `post_salt_hlt_ions` (= source) by delivered runnings and sparge
    volumes. No client-side reconstruction of the HLT vector.
- **Intent** → `batch.sulfate_chloride_target_ratio` when the mode is `specified`.
- **Delta** → multiplicative factor `as_solved / intent` ("3.0 : 1 intent → 2.6 : 1
  kettle, 0.87×"), assembled in the adapter, formatted via `fmt`.
- **Basis line (M7)** — always states the kettle basis; under `MASH_ONLY` adds
  "sparge: untreated, acid only", and points at the Phase C summary rather than
  restating the dose.
- Undefined states: chloride ≤ 0 → "—" and no delta; mode unspecified → as-solved
  only; no solver result → "—".
- Placement: water card, immediately after the treated-water blocks; style card
  shows the intent value only.
- Tests: proportional identity (`blend == post_salt_mash_ions`), `MASH_ONLY` blend
  against the solver-provided HLT vector, zero-chloride guard, unspecified mode,
  delta arithmetic, and the basis line for both modes. Also assert the
  `post_salt_hlt_ions` adapter derivation: `PROPORTIONAL` → equals
  `post_salt_mash_ions`; `MASH_ONLY` → equals the request's source ions.

## Phase E — docs and gates

- **`docs/calculator-assumed-dosing-practice.md` (new, living).** The dosing model of
  record: the two destinations, the mode matrix, the volume basis
  (`v_strike` / `batch.sparge_salted_volume` and the fill rule), what is *not*
  modelled (grist ions, metabisulfite, with magnitudes), what the calculator cannot
  verify (declared mode vs practice), how to deviate safely, a node-provenance
  table, and the instruction strings verbatim so doc and UI can be compared. Add the
  README row next to `docs/hot-side-hopping-agent-dosing.md`.
- `docs/dag-artifacts/domain-equations.md`: water input list, where the floor comes
  from, and that `v_hlt_treat_l` is the **sparge salt dosing volume** (HLT after
  strike + top-up), not the delivered sparge volume; cross-link the new doc.
- `docs/dag-artifacts/seed-substrate.md` §2.5: report/target schema changes,
  RO-as-report, `laboratory` requirement.
- `docs/engine.md:233-234`: replace the root table rows with the selection fields.
- `docs/dag-artifacts/inventory.md`: confirm current (Phase A re-emits it).
- `make verify` green.

## Risks

- **`calcium_floor_ppm` becomes per-profile.** All seven remaining seeds carry 50,
  so behaviour is unchanged today; the schema default keeps omissions valid.
- **Blend volume choice.** Pinning `MASH_ONLY` weights to the cascade rather than
  the treatment volumes changes the number; verify by reducing to
  `post_salt_mash_ions` under `PROPORTIONAL` (must be identity).
- **The readout now shows the assumption, but still cannot detect practice.**
  M8 puts the treated HLT vector on the card, so a `MASH_ONLY` declaration is
  visibly untreated water rather than an inference. It does not tell anyone whether
  the HLT was actually dosed.
- **Sealed-core containment.** `post_salt_hlt_ions` is derived in the service adapter
  from `post_salt_mash_ions` + request source + mode. That is exactly what
  `core/water.py:500-502` computes internally, but it is a *translation* of the
  documented contract: if the sealed core ever changes the rule, the adapter will be
  wrong until someone re-reads the docstring. No test can compare the two — the core
  does not expose its value. Keep the derivation to one line, next to the contract
  reference, so the coupling is obvious.
- **The kettle blend is an estimate.** `(post_mash × runnings + post_hlt × sparge)`
  assumes uniform concentration in each vessel and full mixing; it ignores
  stratification, grain retention of undissolved salts, and any post-kettle
  additions. Label it as an estimate on the card, never as a measured value.
- **The instruction reaches the brew-day payload, not yet the printed page.**
  M9 puts the mode-specific text into `buildBrewDayPayload`, which is the print
  source, but the rendered recipe document is still Summary reporting's job. Until
  that lands, the text is visible in-app (brew-day step placeholder) and in the
  payload only.
- **Unmodelled by decision.** Grist ions and metabisulfite are omitted from the
  solver and named on the water card. If metabisulfite later needs modelling, it is
  a source-vector addition, not a solver change — but the top-up displacement means
  a single dose cannot describe it.
- **Converting `v_hlt_treat_l` to derived changes doses and draft shape.** Salt and
  acid masses rise by `v_hlt_debt / v_sparge_deliverable` (≈7% in the stub fixture:
  15 L → 16 L) because the basis becomes the HLT content rather than the deliverable
  sparge. Drafts that persisted the old root keep an inert key until filtered (see
  Phase A); filter on load rather than silently recomputing, so the summary always
  describes the volume actually dosed.
- **`residual_hlt_water_l` becomes structurally nonzero** under the new default
  (it now includes HLT dead space). Treat it as an informational readout, not a
  warning; the surplus condition is `treat − debt − demand`, which the re-point
  makes correct for the first time.
- **Removing `default_calcium_floor_ppm`** touches the constant table — check
  `test_artifact_constants.py` and `inventory.md` for references.
- **Wrong-order commit.** Any attempt to split Phase A fails
  `boundary-inputs`/A6; if a hotfix lands mid-phase, re-run both after rebasing.

## Commit requirements

- One commit per phase; imperative subject; scoped to that phase.
- No phase is complete until `make check` and `make test` pass.
- Every artifact change carries its re-emitted inventory and the relevant prose doc.
- Phase A is explicitly permitted to span what v1 called Phases 1 and 2; it must
  not absorb Phase B/C/D work.
