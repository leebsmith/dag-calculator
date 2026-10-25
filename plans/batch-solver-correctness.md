---
title: Batch Solver Correctness — absorption, capacity, thickness and findings
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [warnings, off-graph-identity]
status: proposed
---

# Batch Solver Correctness

An audit of the batch-sparge path against the vision in [`docs/vision.md`](../docs/vision.md):
the solver must invert targets into sizes deterministically, declare infeasibility, and never
report numbers it cannot justify.

Every number below was produced by **running the real solver**, not by reading it. The harness is
in Appendix B. Decision IDs (`D1`…`D25`) are stable references, not chronological order.

---

## 1. Findings

### A. Missing physical constraints

| # | Finding |
|---|---|
| **A1** | **No upper thickness bound.** Runoff mode at 2.5% ABV yields 6.22 L/kg (5.81 with correct absorption) with nothing to flag it — exactly the condition the L:G handle exists to escape. |
| **A2** | **Tun capacity is declared and never read.** `max_mash_tun_volume_l` exists in the schema and both seeds; nothing consumes it. Kettle has a warning relation; HLT errors; the tun is silent. Peak occupancy is the larger of the mash phase and the sparge phase. |
| **A3** | **`max_achievable_abv` is fermentation-only.** A 10% ABV batch at 20 L reads "reachable" (Cutaia at 40 °P allows ~14%) while the solve dies with `BRACKET_NO_SIGN_CHANGE`. The residual never changes sign out to M = 40 kg — genuinely infeasible, for volume reasons. |
| **A4** | **Absorption has two values and the wrong one is live.** `k_abs_true` = 1.67 L/kg (0.200 gal/lb) drives every solve; `equipment.grain_absorption_factor_l_per_kg` = 0.96 (0.115 gal/lb) is declared, ingested, and read by nothing. 0.200 is outside every published band. |

### B. Phase inconsistency

| # | Finding |
|---|---|
| **B1** | **`mash_transfer_loss` enters Phase 4 but not Phase 3.** Phase 3 solves the grist against `v_pre_boil`; Phase 4 builds the cascade against `v_drain = v_pre_boil + mash_transfer_loss`. Verified: `m_grist` is identical (6.345166 kg) at 0, 0.5 and 2.0 L loss, while delivered extract overshoots by 0.484% / 1.838%. Both shipped rigs set 0.5 L, so this is live for every batch. Correcting it raises the grist by **1.86%** (6.345 → 6.463 kg). |

### C. Typing and validation

| # | Finding |
|---|---|
| **C1** | `batch.intensive_value` is declared `mash_thickness` (L/kg) but carries a dimensionless runoff ratio in `runoff_ratio` mode. Display is already mode-correct via `views/registry/presentation.js`; the defect is artifact-level (declared dimension, default, wire contract). |
| **C2** | `MASH_TOO_THIN` fires only in `r_l_to_g`, and only below `k_abs_true` (1.67) — below both shipped rigs' `min_lgr_l_per_kg` (2.295). The mode that can actually produce an impossible mash (runoff) has no check. |
| **C3** | Validation is phase-local. Direct core calls: `r = −1` throws `ZeroDivisionError` (Phase 3 divides by `r + 1`); `L:G = −3` reports `MASH_TOO_THIN` instead of `INVALID_INTENSIVE_VALUE`. Pydantic masks this on the wire only. |

---

## 2. Decisions

IDs are stable references — findings above cite them by number, and they are not renumbered when
the list grows. Decisions are grouped by theme, not by number.

| ID | Decision | Theme |
|---|---|---|
| D1 | Units resolved (1.1 / 1.25 were qt/lb) | thickness |
| D2 | "Too thick" is two-tier: physical 1.67, rig 2.295 | thickness |
| D3 | Thin ceiling = 2.0 qt/lb policy constant | thickness |
| D4 | Ceiling enforced by a relation, warning only | thickness |
| D5 | Nothing is ever clamped | thickness |
| D6 | One-shot pin action, not a control | thickness |
| D7 | Trigger (ceiling) ≠ write (default seed) | thickness |
| D8 | `intensive_value` splits into two typed roots | thickness |
| D9 | The action does not promise success | thickness |
| D10 | The button is UI convenience only | thickness |
| D11 | Warning text tracks user units | findings |
| D12 | `mash_transfer_loss` is extract-bearing | solver |
| D13 | Findings are enumerated, not counted | findings |
| D14 | Tun capacity = derived phase nodes + relation | capacity |
| D15 | Absorption = 0.125 gal/lb, per-rig authoritative | solver |
| D16 | Capacity never blocks the solve; reports critically | capacity |
| D17 | `blocking` declared in the artifact; unfreezable | capacity |
| D18 | Remove `target_abv_reachable`; no new operators | findings |
| D19 | Pydantic owns shape, the core owns meaning | validation |
| D20 | Style is immutable identity; no graph edge | identity |
| D21 | Physical floor applies to the authoritative thickness | solver |
| D22 | Bracket failure names the physical cause | solver |
| D23 | `max_feasible_abv` beside `max_achievable_abv` | capacity |
| D24 | Ceiling overrides deferred, kept swappable | thickness |
| D25 | Pydantic bounds pinned with D8; drop `le = 1000` | validation |
| D26 | Batch derivations consolidated into `domain-equations.md` | docs |

### Thickness: floors, ceiling, and the switch

**D1. Units resolved.** The working figures 1.1 and 1.25 were qt/lb: 1.1 qt/lb = **2.2950 L/kg**
(the existing `equipment.min_lgr_l_per_kg`), 1.25 qt/lb = **2.6079 L/kg** (the existing
`default_mash_thickness_l_per_kg`). No new values were needed for either.

**D2. "Too thick" is already two-tier, and the tiers are correct.** Physical floor `k_abs_true`
= 1.67 L/kg, hard, solver-owned (below it the strike cannot wet the bed). Rig floor
`equipment.min_lgr_l_per_kg` = 2.295, soft, enforced by `mash_thickness_above_equipment_floor`.
No new equipment field; the work is documenting physical-vs-rig.

**D3. "Too thin" is a process ceiling, not an equipment spec.** Declared as a constant
`max_mash_thickness_l_per_kg`, dimension `mash_thickness`, value **2.0 qt/lb = 4.1727 L/kg**
(= 2.0 × the declared `qt_per_lb` factor 2.08635, so imperial display round-trips to exactly 2.0).
Not an equipment field: the quantity is derived per batch and the limit is enzymatic. Not host
code: business logic belongs in the artifact. Labelled **policy**, not physics — conversion
degrades continuously, so any value is a convention, which is why it warns. Under Palmer
absorption it fires at ≈ 3.6% ABV for equal runnings at 20 L.

**D4. Enforcement is a declarative relation, warning only.** `solver.batch.mash_thickness_l_per_kg
≤ constants.max_mash_thickness_l_per_kg`. One predicate covers both topologies; zero solver code;
cannot fire before a solve (correct — nothing to know yet). Advisory by construction: a client may
ignore it. Guard: the ceiling must exceed `default_mash_thickness_l_per_kg` and every declared rig
floor, so a future edit cannot make it self-contradictory.

**D5. Nothing is ever clamped.** Clamping an authored value breaks provenance (`hasRoot` would
claim a number the solve did not use), corrupts the freeze record, and teaches the user the wrong
model. Clamping a derived value is not definable in an inverted topology — it means rewriting the
input the user authored. Auto-switching topology changes intent, not a value. The only legitimate
clamp is against a declared domain bound (`clampToSelection`), and it applies to recommendations.

**D6. The affordance is a one-shot action, not a control.** A button with no stored state; its
visibility is derived (`thickness` is a number **and** boundary status is `ok` **and** thickness >
ceiling **and** topology is `runoff_ratio`). It disappears because the condition stops holding.
Offered only when thickness is *implied*; an authored thickness gets a warning, not a rewrite.
Rendered inside the existing relation warning so explanation and action appear together. This is
the existing pattern (`copyInCascade`, `resetSeededRoots`): mutate roots, debounce, re-derive.
Rejected: a persistent toggle (standing consent, cannot be invalidated by the engine, needs
payload state) and a declarative auto-cap (choosing `r` needs the solved mass → a cycle).

**D7. Trigger and write are different numbers.** Trigger = the ceiling (policy boundary). Write =
`max(2.6079, equipment.min_lgr_l_per_kg)`. Conflating them is self-referential and fires on almost
every batch: at r = 1, thickness is 5.33 at 3%, 4.19 at 4%, 3.49 at 5%, 3.01 at 6%, 2.66 at 7%.
Targeting the ceiling would also park the batch exactly on its own warning line.

**D8. `batch.intensive_value` splits into two typed roots.** `batch.mash_thickness_l_per_kg`
(`mash_thickness`) and `batch.runoff_ratio` (`dimensionless`). Forced, not stylistic: a single root
cannot carry a topology-conditional default because `units.js` rejects `if` branches with mismatched
dimensions (`Root "batch.intensive_value" default has if branches with dimensions "mash_thickness"
and "dimensionless"`). The request builder selects which root to send by topology.

**D9. The action does not promise success.** At 2.5% ABV, pinning 2.6079 moves `v_strike`
18.4 → 7.7 L and `v_sparge` 13.5 → 23.5 L. Thickness is satisfied; HLT or kettle capacity may then
fail — the model reporting that the batch does not fit, not the button failing. Label both writes.

**D10. The button is UI convenience only.** Solver: untouched. Artifact: constant + relation.
Removable layer: the button; the user can perform the same two edits. The artifact holds
evaluations, not edits — which is why the ceiling is expressible and the pin is not.

**D11. Warning text tracks the user's unit preference.** The ceiling renders through the same
formatter as fields (dimension `mash_thickness`, current unit mode) → `2.0 qt/lb` or `4.17 L/kg`.
Composed at render time, so a unit toggle re-renders. **Pre-existing gap:** relations carry only
`{id, holds}` and the UI renders a violation *count*; no per-relation text exists for any relation.
Reuse `views/registry/presentation.js` (`switch` on `batch.topology`; `hint` `{path, format}`) —
noting `applyPresentation`'s `format` receives only the raw number, so unit awareness needs the
dimension passed through.

### Solver correctness

**D12. `mash_transfer_loss` is extract-bearing.** Volume: the tun drains `V_drain = V_pre + loss`,
the kettle receives `V_pre`, the loss is discarded. The hose holds homogeneous wort, so the
discarded volume carries extract at `c = S_tun / V_drain`; the kettle's extract is therefore
`S_tun · V_pre / V_drain`. Crediting all of `S_tun` to `V_pre` (current) manufactures extract.
Correct formulation: solve for the tun extract that yields `ΔS` in the kettle — target
`ΔS · V_drain / V_pre` with `V_drain` in the residual's volume terms — and take the concentration
denominator as `V_drain`. Acceptance: an invariant test that realizes the kettle's post-boil
gravity from the cascade and asserts equality with the Phase-1 target (corrected formulation lands
at −0.000%). Rejected: extract-free loss — it would require the lost volume to be water that never
mixed, contradicting the field's own docstring ("retained in its transfer hose/pump").

Corroborated by the legacy loss model's mash→kettle balance
(`V_kettle_in = V_mash_liquid − absorption − dead − transfer`), which reduces what reaches the
kettle in volume **and** extract — the two are not separable.

**D15. Absorption is Palmer's baseline, and the per-rig field becomes authoritative.**
`k_abs_true` = 1.67 L/kg = 0.200 gal/lb (outside every band); `equipment.grain_absorption_factor_l_per_kg`
= 0.96 = 0.115 (inside lautering 0.10–0.15); Palmer = 0.125 gal/lb = **1.043176 L/kg**. The live
constant came from the legacy `batch_solver.py` and was never reconciled with the seed data it
contradicted. Decision: baseline 1.043176; the per-rig field is authoritative (BIAB 0.06–0.08,
lautering 0.10–0.15, commercial 0.08–0.10 — up to 2× spread, which is what equipment profiles are
for); **seed both shipped rigs at the baseline — confirmed: they move from 0.115 to 0.125 gal/lb,
+8.7%**; the global constant is the fallback. Cost: a `BatchSolverInput` field + wire key + parity
test + fixture regeneration; `K_ABS_TRUE_METRIC` and `constants.k_abs_true` move together (pinned by
`test_artifact_constants.py`).

**D21. The physical floor applies to whichever thickness value is authoritative.** The condition is
`thickness < k_abs_true` — the strike is below the bed's absorption capacity. It is reachable in
both topologies, but *masked* in one: runoff defines `v_run1` from the split and reverse-derives
`v_strike`, so a sub-absorption strike never appears as negative runnings, only as a low derived
thickness (r = 0.001 at 5% → 1.35 L/kg with 0.03 L of runnings). Apply the check to the input in
`r_l_to_g` and to the derived value in `runoff_ratio` (Phase 4 already computes it). Delete
`mash_thickness_above_husk_floor` — with a hard check it can never fire. Hard error class; does not
conflict with D16. Bonus: extreme splits become named physical failures instead of
`BRACKET_NO_SIGN_CHANGE`.

### Capacity

**D14. Tun capacity is a declarative check, never a solver input.** Palmer's displacement
**0.32 qt/lb = 0.667632 L/kg** (`constants.grain_displacement_l_per_kg`, dimension `mash_thickness`)
plus two derived nodes, because the binding phase changes with gravity and the fix differs:

- `mash.mash_phase_volume_l` = `displacement · m_grist + cascade.v_strike`
- `mash.sparge_phase_volume_l` = `displacement · m_grist + cascade.v_absorption + equipment.mash_dead_space_l + cascade.v_sparge`

`mash_tun_not_overfilled` compares the larger to `equipment.max_mash_tun_volume_l` (the AST has no
scalar `max`; use `if`). Severity **error**. No solver input, no error code, no wire change.

Sweep — HERMS 30L (40 L tun), r_l_to_g 3.0 L/kg, 20 L, Palmer constants:

| Target ABV | m_grist | mash phase | sparge phase | peak | headroom |
|---|---|---|---|---|---|
| 3.0% | 3.29 kg | 11.9 L | 25.8 L | 25.8 | 14.2 |
| 5.0% | 5.59 | 20.5 | 24.4 | 24.4 | 15.6 |
| 7.0% | 8.35 | 31.2 | 30.6 | 31.2 | 8.8 |
| 8.0% | 10.71 | **39.3** | 35.3 | **39.3** | **0.7** |
| 9.0% | — | — | — | `BRACKET_NO_SIGN_CHANGE` | — |

The physical wall (≈ 8.1% ABV) and the numerical wall are adjacent — which is why this check
matters for A3. Note the numbers are absorption-dependent: under the old 1.67 the peak reached
37.4 L at 7.0% and the solve failed at 7.5%.

**D16. Capacity findings never block the solve; they report critically.** An overrun does not make
the numbers wrong — it makes the batch unbrewable on that rig. Both facts matter, so the solve
completes and the finding carries severity `error` (= critical/unbrewable), keeping every readout
alive. Two severities remain enough: `warning` = quality/policy, `error` = unbrewable. The whole
capacity class takes one shape — derived value + relation:

| Finding | Compare |
|---|---|
| `kettle_not_overfilled` | `solver.batch.v_pre_boil` ≤ max kettle |
| `mash_tun_not_overfilled` | larger phase volume ≤ max tun |
| HLT liquor demand | `solver.batch.hlt.v_hlt_top_up` ≤ max HLT (replaces `HLT_TOO_SMALL`) |

**`HLT_TOO_SMALL` is therefore demoted** from a solver error to the derived relation: today an HLT
overflow wipes every readout while a tun overflow would not. The input-side `hlt_not_overfilled`
(starting volume) stays as the pre-solve sanity check.

What stays hard — no valid numbers exist: `MASH_TOO_THIN`, `ABV_UNREACHABLE`, `DEGENERATE_BRACKET`,
`BRACKET_NO_SIGN_CHANGE`.

**D17. Blocking-ness is declared in the artifact.** Each relation gains `blocking: true|false`.
Unfreezable needs an authority the *server* can read; it vendors `data/artifact.json` but cannot see
a JavaScript registry. Blocking is a domain fact ("if this fails, no brewable batch exists"),
comparable to a boundary's `domain.codes`, and it is not presentation vocabulary, so
`artifact-purity`'s deny-list does not apply. The registry keeps wording, formatting and actions
only. A boolean rather than a `severity` string, so a third level cannot appear by accident.

**A batch cannot be frozen while (a) the solve failed or (b) any blocking finding stands.** Mirrors
the existing refusal while a boundary solve is pending. Consequences: frozen bundles can never
contain a blocking finding (the archive is a record of feasible batches); frozen bundles are **not
retro-validated**; the refusal cites the finding, not just a disabled button. The solve-failure
clause matters because `relationStates()` is empty when the solver throws.

Cost: `schema_version` bump, `grammar.md` §4.2, inventory relations column, docs-sync re-emit,
backend freeze check, client button state. The alternative — client-only gating — lets an API client
freeze an unbrewable batch, defeating the point.

### Findings presentation

**D13. Full enumeration, not a count.** One registry keyed by relation id, complete for every
`artifact.relations[].id`, with a completeness guard. Severity `warning`/`error` (from D17's
`blocking`). Generic operand formatting: each operand (root / identity field / boundary output /
constant) resolves to its dimension and formats in the user's unit mode — no per-relation dimension
declarations needed. Explicit absent-operand branch ("not declared"), because today
`lhs ≤ undefined` is false and manufactures a violation. Optional per-entry action (the D6 pin),
dispatched by the existing `runAction`. Enumerated in the step body via `stepStatus`; the footer
`violationCount` stays as a summary badge — it is currently a sum across four mechanisms
(relations + node/field/collection domains), i.e. a quantity with no identity.

Report bundle: **no schema change.** `reportInputs().validation` already enumerates relations and all
three domain kinds by id. The bundle is a fact document; prose must not be frozen into it, and
server-side wording would duplicate the registry in Python. The renderer composes text.

**D18. Remove `target_abv_reachable`; add no AST operators.** The relation is tautological
(relations evaluate only after a successful solve, which already implies attainability), its
information is already shown via `max_achievable_abv` in the Target ABV hint, and the hard case is
covered by `ABV_UNREACHABLE`. No scalar `min`/`max`: the tun peak uses an `if`, the pin seed is
host-side, and the true reachability bound belongs in the solver (D23). Document the `if` idiom;
trim the six unused operators (`map`, `filter`, `neg`, `not`, `or`, `eq`) before extending.
`defined`/`isSet` noted and shelved as the honest fix for the `> 0` sentinel.

**D19. Validation is layered: Pydantic owns shape, the core owns meaning.** Pydantic → `422` +
`detail: [{loc, msg}]` means *malformed request*; the core → `{code, message, details}` means
*unsolvable input*. `solver.batch.domain.codes` declares the taxonomy — if Pydantic is the only
gate, `INVALID_INTENSIVE_VALUE` and `UNKNOWN_TOPOLOGY` can never be emitted and the artifact declares
vocabulary nothing can speak. The real rule is topology-conditional, which Pydantic cannot express
without duplicating domain knowledge. Anti-drift: Pydantic keeps transport-safe bounds only (finite,
positive, plausible magnitude); the core validates in `__post_init__` before any division, with
per-phase guards retained for direct calls; where a bound coincides, the artifact `domain` is the
authority and the Pydantic bound is pinned to it. New guard: **every code in `domain.codes` must have
a test that triggers it.**

**D22. Bracket failure names the physical cause.** On `BRACKET_NO_SIGN_CHANGE` /
`DEGENERATE_BRACKET`, evaluate capacity at the bracket's upper bound and, if a constraint is
exceeded, raise that named cause with numbers instead. Keeps the hard-error class; replaces an
opaque numerical failure with "the tun needs 44.1 L of 40 L". Only substitute when the check is
definitive at the bound. Depends on D14.

**D23. `max_feasible_abv` sits beside `max_achievable_abv`.** Keep `max_achievable_abv` as the
fermentation/attenuation limit (it feeds the Target ABV hint). Add `max_feasible_abv` = min over
fermentation, volume, tun, kettle, HLT, plus a `binding_constraint` taxonomy
(`fermentation | volume | tun | kettle | hlt`). The hint switches to the new bound and names the
binding constraint, so a tun-limited batch stops advertising a fermentation-only ceiling.

### Identity

**D20. Style is identity — immutable per batch; no graph edge, by design.** This confirms
[`off-graph-identity.md`](off-graph-identity.md) rather than adding to it. Style is snapshotted at
creation; the style card writes **roots**, never identity. `session.setIdentity` exists but is
called by nothing — and its implementation is a full `build()`, which is the correct answer for an
immutable input. So identity-referencing defaults (the style midpoints on
`batch.target_abv`/`target_ibu`/`target_srm`) create no edge *correctly*: nothing can change
underneath them. Optional guard: assert identity equality between the stored batch and the state
sent on save. **Action:** delete the dead `setIdentity` so the invariant is structural rather than
conventional, per the locked decision in `off-graph-identity.md` §1.

### Deferred

**D24. Per-grist / per-schedule ceiling overrides — deferred, kept swappable.** Global constant now;
if a per-schedule value is ever wanted the relation's rhs becomes `{ref: …}` — one line, same id.
Revisit only on evidence (decoction, huskless-heavy grists).

**D25. Pydantic bounds pinned when D8 lands; drop `le = 1000`.** Pydantic keeps transport safety
only; bounds coinciding with artifact `domain` are pinned by a test in the same pass as the root
split. `intensive_value: le = 1000` is an unowned arbitrary — the topology-aware core check owns the
meaningful range.

### Documentation

**D26. Consolidate the batch derivations into `domain-equations.md`; do not port the legacy docs.**
The legacy `docs/batch-math/` set and `plans/vessel-loss-model.md` exist in the predecessor checkout
but were never vendored here, while `batch_solver.py` cited them 39 times. Porting them verbatim
would **re-import defects**: `batch-sparge-non-linear-root-finding-v2.md` states
`k_abs,true = 0.20 gal/lb / 1.67 L/kg` — the value D15 replaces — and `unified-treatment.md`'s
absorption and transfer-loss treatment predates D12.

Decision: `docs/dag-artifacts/domain-equations.md` §2.4–2.7 is the authoritative derivation
(master balance, sub-equations, retention fractions and lauter efficiency, runnings volumes, gravity
assembly, cold-side reversal, the residual and its bracket, both constraint topologies, and the loss
taxonomy). Solver docstrings point there; the legacy files stay in the predecessor repo as history;
one provenance line records the lineage and which two statements are superseded.

**The runoff identity is the trap.** `unified-treatment.md` says the `{V_pre, r}` topology
"eliminates `V_mc` and `V_sol` from the root-finding residual". That is algebraically true —
`D1 = V_run1 + V_ret` exactly — and the code is identical, not divergent (verified: `v_mc + v_sol =
c_vol·M`, and `D1` computes to the same 12.972375 either way at r = 0.001). But the terms are still
required in the strike reversal, which is what makes the *reported* thickness sensitive to them:
dropping them moves 1.348 → 1.741 L/kg against a 1.67 floor. Removing them is therefore a
correctness bug dressed as a cleanup, so §2.5 states the cancellation and carries two guards
(`D1` explicit == simplified; `thickness == (V_run1 + V_ret − V_mc − V_sol)/M`).

**Implemented with this decision:** §2.4–2.7 written; the 39 docstring references in
`batch_solver.py` repointed to `domain-equations.md`; the placeholder note in the provenance block
replaced by the lineage + supersession statement; the stale "Stage 1.3 implements only {V_pre, R_L:G}"
comment corrected. The §2.7 table lists the four deviations still to be closed by D12/D15/D21/D14.

---

## 3. Build order — steps with context contracts

Dependencies are real, not preference. Each step is **one commit** unless stated; each carries a
context contract so an implementer reads only what the step needs.

**Cross-cutting gates for every step** (these are the review — there is no CI and no git hook in
this repository):

- `make check` and `make test` before the commit; `make verify` (includes the production build) at
  the end of each step; `make verify-full` once at the end of the batch.
- Run the six questions in `docs/vision.md` §6 against the diff.
- Artifact changes are atomic with inventory + glossary + prose docs (`AGENTS.md`).
- No new dependencies. No comments added to code unless a step asks for them.

**Generators** (re-run when the artifact changes; there is no emitter for `batch.json` or
`report-bundle.json` — regenerate those through the preview path and diff-review):

    node scripts/emit-artifact-inventory.mjs        # docs/dag-artifacts/inventory.md
    node scripts/emit-report-bundle-glossary.mjs    # docs/report-bundle-glossary.md

---

### Step 0 — D26 documentation consolidation — **done**

`domain-equations.md` §2.4–2.7 is the authoritative derivation; the 39 legacy references are
repointed; §2.7 tracks the deviations closed by the steps below.

---

### Step 1 — D15 absorption + D12 transfer loss (one commit, one fixture emit)

Both change every solved number, so they must share a single regeneration.

- **Read:** `backend/app/core/batch_solver.py` (constants block ~55–70; `grist_mass_residual`
  ~540–600; `solve_grist_mass` ~605–715; `resolve_stage_cascade` ~830–960; `solve_batch`
  ~1180–1270) · `backend/app/schemas/boundary.py` (`BatchSolverRequest`, ~119–140) ·
  `backend/app/services/batch_solver_service.py` · `frontend/src/adapters/boundaryRequest.js`
  (`solver.batch` map only) · `data/artifact.json` (`constants`, `nodes.solver.batch`) ·
  `docs/dag-artifacts/domain-equations.md` §2.4, §2.6, §2.7 · `tests/backend/conformance/`
  `test_artifact_constants.py`, `test_batch_solver_helpers.py`, `test_batch_solver_phase3.py`,
  `test_batch_solver_phase4.py`, `test_batch_solver_orchestration.py` ·
  `tests/backend/test_parity.py` · `tests/frontend/helpers.js` (equipment fixture values)
- **Edit:** the above + `data/seeds/equipment.json` (**both rigs to `1.043176`** — confirmed: the
  shipped rigs move from 0.115 to 0.125 gal/lb, +8.7%) · `tests/conformance/fixtures/`
  `equipment-imperial-map.json`, `report-bundle.json`, `batch.json` · `docs/dag-artifacts/`
  `domain-equations.md` §2.7 (drop the D12 and D15 rows), `seed-substrate.md` §2.4 (absorption
  description)
- **Do not read:** `frontend/src/views/**`, `frontend/src/adapters/cards/**`,
  `backend/app/core/water.py`, `backend/app/core/hop_solver.py`, `tests/conformance/fixtures/water*`,
  `docs/style-*`, `docs/historical/**`
- **Guards that will fire:** `test_artifact_constants` (constant value), `test_parity`
  (Pydantic↔dataclass field added), boundary wire-key conformance, `equipment-contract`,
  `artifact-docs-sync`, `glossary-sync`
- **Accept:** a new invariant test realizes the kettle's post-boil gravity from the cascade and
  asserts equality with the Phase-1 target; `m_grist` responds to `mash_transfer_loss`; `make verify`
- **Emit:** inventory; glossary if outputs shift; fixtures without emitters regenerated and diffed

---

### Step 2 — D21 physical floor + D19 layered validation

- **Read:** `backend/app/core/batch_solver.py` (`BatchSolverInput`, `solve_batch`,
  `resolve_stage_cascade`, `grist_mass_residual`, `solve_grist_mass`) ·
  `backend/app/schemas/boundary.py` · `data/artifact.json` (`nodes.solver.batch.domain.codes`,
  `relations`) · `tests/backend/conformance/test_batch_solver_phase4.py`,
  `test_batch_solver_orchestration.py` · `tests/backend/test_schemas.py`
- **Edit:** `batch_solver.py` (`__post_init__` on `BatchSolverInput`; the floor check on the derived
  thickness in the runoff branch), `schemas/boundary.py` (drop `le = 1000`), `data/artifact.json`
  (delete `mash_thickness_above_husk_floor`), and a **new**
  `tests/backend/conformance/test_domain_codes.py` that triggers every declared code
- **Do not read:** any frontend file; `water.py`; `hop_solver.py`
- **Guards:** `artifact-docs-sync`, `glossary-sync` (relation removed), `determinism`
- **Accept:** `r = −1` and `L:G = −3` both raise `INVALID_INTENSIVE_VALUE` before any division;
  a sub-absorption *derived* thickness raises `MASH_TOO_THIN`; every code in `domain.codes` has a
  triggering test; `make verify`
- **Emit:** inventory; glossary

---

### Step 3 — D8 split roots + D25 pinned bounds + D11/D13 message registry

- **Read:** `data/artifact.json` (`batch.topology`, `batch.intensive_value`, style defaults) ·
  `frontend/src/adapters/boundaryRequest.js` · `frontend/src/views/registry/presentation.js`
  (`INTENSIVE_VALUE` switch, `applyPresentation`) · `frontend/src/views/registry/batch.js`,
  `system.js` · `frontend/src/views/steps.js` (batch slice, ~line 100) ·
  `frontend/src/views/producer/scalar.js` · `frontend/src/adapters/stepView.js` ·
  `backend/app/schemas/boundary.py` · `tests/conformance/fixtures/boundary-wire-keys.json` ·
  `tests/frontend/boundaryRequest.test.js` · `tests/guards/installer-contract.test.js`
- **Edit:** artifact (two typed roots) · `boundaryRequest.js` (select by topology) ·
  `presentation.js` (delete the now-redundant switch) · `batch.js` / `system.js` / `steps.js`
  (two fields) · `schemas/boundary.py` · wire-key fixture · and a **new**
  `frontend/src/views/registry/findings.js` holding relation wording, severity lookup and the
  optional action; wire it in `stepView.js`
- **Do not read:** backend solver internals, water/hops, partials (step 6)
- **Guards:** `presentation-ids`, `artifact-consumers`, `installer-contract`, `unit-roundtrip`,
  `dimension-coverage`, wire-key conformance
- **Accept:** the unit toggle cannot convert the runoff ratio; a non-UI path gets the mode-correct
  default; every message formats through the user's unit mode; a completeness guard requires a
  registry entry for **every** `artifact.relations[].id`
- **Emit:** inventory; glossary

---

### Step 4 — grammar batch: D3/D4 ceiling, D14 tun, D16 HLT demand, D17 `blocking`, D18 removal

One `schema_version` bump, one docs re-emit.

- **Read:** `data/artifact.json` (`constants`, `nodes`, `relations`, `primitive_schemas.equipment`,
  `taxonomies`) · `frontend/src/engine/relations.js`, `validate.js` ·
  `scripts/artifact-inventory.mjs` (relations table) · `docs/dag-artifacts/grammar.md` §4.2,
  `semantics.md` (relations) · `docs/report-bundle.md` · `docs/adsco/ui.md` ·
  `backend/app/artifact.py` · `tests/guards/artifact-purity.test.js`, `schema-version.test.js`
- **Edit:** artifact (ceiling constant + relation; displacement constant + two phase-volume nodes +
  tun relation; HLT-demand relation; `blocking` on every relation; delete
  `target_abv_reachable`) · `relations.js` (expose `blocking`) · `artifact-inventory.mjs`
  (a `blocking` column) · `grammar.md` §4.2, `semantics.md`, `report-bundle.md`,
  `domain-equations.md` §2.4/§2.7 · `docs/adsco/ui.md` (planned affordances)
- **Do not read:** the batch solver (this step is artifact + engine only); cards; partials
- **Guards:** `artifact-docs-sync`, `glossary-sync`, `artifact-purity` (confirm `blocking` is not in
  its deny-list), `determinism`, `dimension-coverage`, `schema-version`
- **Accept:** the artifact validates on the bumped version; both new relations are `blocking: true`;
  the ceiling relation is `blocking: false`; inventory and glossary regenerated in the same commit
- **Emit:** inventory; glossary (both required)

---

### Step 5 — D22 bracket diagnostic + D23 `max_feasible_abv` / `binding_constraint`

Depends on Step 4's nodes and constants.

- **Read:** `backend/app/core/batch_solver.py` (`solve_grist_mass` failure paths, `solve_batch`,
  `max_achievable_abv`) · `backend/app/schemas/boundary.py` (`BatchSolverResponse`) ·
  `data/artifact.json` (`nodes.solver.batch.outputs`, `taxonomies`) ·
  `frontend/src/views/registry/presentation.js` (`TARGET_ABV` hint) ·
  `tests/backend/conformance/test_boundary_output_parity.py`, `test_boundary_fixtures.py` ·
  `tests/conformance/fixtures/batch.json`, `report-bundle.json`
- **Edit:** `batch_solver.py` (diagnose capacity at the bracket bound; compute the feasible bound and
  its binding constraint), `schemas/boundary.py`, artifact outputs + a `binding_constraint`
  taxonomy, `presentation.js` hint, wire/response fixtures
- **Do not read:** water/hops; cards; partials; `docs/style-*`
- **Guards:** `boundary-output-consumers`, boundary fixtures/parity, `artifact-docs-sync`,
  `glossary-sync`
- **Accept:** a 9% ABV batch reports the tun (not `BRACKET_NO_SIGN_CHANGE`); `max_feasible_abv` and
  `binding_constraint` appear in the response and the boundary contract
- **Emit:** inventory; glossary

---

### Step 6 — D6 pin action + D13 enumeration UI + freeze gate (D16/D17 enforcement)

- **Read:** `frontend/src/partials/editor.html` (footer count), `step-card.html`,
  `frontend/src/adapters/stepAdapter.js`, `stepView.js` · `frontend/src/views/registry/findings.js`
  (from Step 3) · `frontend/src/store/recipes.js` (freeze), `snapshot.js` (`reportInputs`) ·
  `backend/app/services/batch_service.py` + the batches route · `docs/report-bundle.md`,
  `docs/adsco/ui.md` · `tests/frontend/` card and editor tests
- **Edit:** a **new** `frontend/src/partials/findings.html` (included from `step-card.html` and the
  footer), adapter wiring for enumeration + the pin action, freeze refusal in `recipes.js`, the
  server-side freeze check, `docs/adsco/ui.md`, `docs/report-bundle.md` (frozen bundles never carry a
  blocking finding), `docs/engine.md` (findings), `plans/warnings.md` (status + single vocabulary)
- **Do not read:** solver internals; artifact (unless a message needs a new id)
- **Guards:** `alpine-handlers`, `presentation-ids`, `css-classes`, `include-integrity`,
  `control-states`, `glossary-sync`
- **Accept:** enumeration shows label + values + severity and the footer count remains; the pin
  button appears only when thickness is implied and self-clears; freeze is refused with the finding
  cited, client and server; a frozen bundle cannot contain a blocking finding
- **Emit:** glossary if presentation ids change

---

### Batch close

`make verify-full` (needs the predecessor checkout). Then update `TODO.md` and mark
`plans/warnings.md` and this plan's `status:` to reflect what shipped.

## 4. Unassigned

- `relationStates()` throws wholesale when the solve fails, so every finding disappears exactly when
  the batch is worst — per-relation `try/catch` in `relations.js`.
- Trim the six unused AST operators.
- Replace the boundary fingerprint/cache protocol (`sha256.js` + `boundary.js` + coalescing) with a
  dirty flag and last response per boundary.
- Provenance duplication: `styleAbvTouched` / `styleAbvCentered` vs `engine.hasRoot` +
  `views/producer/provenance.js`.
- `defined` / `isSet` on the shelf (D18).
- No retro-validation of frozen bundles.

---

## Appendix A — architecture review notes

Not decisions; context for why the boundary/derived split is not up for renegotiation.

**Graph shape.** 86 nodes, 111 unique edges (143 dependency slots), depth 7, three boundaries
(`solver.batch`, `solver.water`, `solver.hops`), 37 derived, 26 roots, 9 collections, 9 choices,
2 selections; 15 functions, 28 constants. Arithmetic in the artifact is ~9.4% of its bytes
(derived exprs 5.4%, function bodies 4.0%).

**Four things called "parity".** Field parity (Pydantic ↔ dataclass, intra-backend); numeric parity
(artifact AST ↔ Python solvers, one shared fixture); oracle parity (frozen snapshot of the legacy
pure modules, checked only by `make verify-full`); seam parity (wire keys, boundary outputs,
restated constants, ion constraints). Only numeric parity is live duplication, and it is pinned
because the solvers cannot be expressed declaratively.

**Why not make everything a boundary.** The observable topology is invariant up to the export
surface: anything the UI shows, a relation cites, or the bundle carries must remain an addressable
value. Collapsing the 37 derived nodes would keep the wiring and discard the algebra — losing
load-time dimension inference, determinism-as-consequence, synchronous evaluation and per-node
fixtures, to save single-digit percentages of artifact size.

**Over-delivery candidates (unassigned, not endorsed).** A general declarative calculator with a
style-driven solver bolted onto the view: the fingerprint/cache protocol, the six unused operators,
and duplicated provenance are the only fat identified; the style geometry (`engine/fermentation.js`,
`adapters/cards/style.js`) is legitimate host-side formulation work but is the largest single
block of logic outside the artifact.

## Appendix B — how the numbers were produced

Unless stated otherwise: `BatchSolverInput` with an 80/20 base/crystal grist
(`w_i` 0.80/0.20, `yield` 0.80/0.70, `mc` 0.04/0.05), `eta_conv` 0.75, `v_ferm` 20 L,
the HERMS 30L losses (dead 0.5 + 0.5, transfer 0.5 + 0.5, trub 0.5, boil-off 3.0 L,
`mash_transfer_loss` 0.5), and `solve_batch` called directly.

Absorption variants were produced by injecting `k_abs_true` into `solve_grist_mass` and
`resolve_stage_cascade` (the two entry points `solve_batch` uses), since the value is currently a
module-level default rather than an input. D15 turns that into a real input; until then the
injection is the only way to compare.

Tun peaks use Palmer's displacement (0.667632 L/kg) and, where stated, Palmer's absorption
(1.043176 L/kg). These tables should become fixtures or invariant tests when the corresponding
decisions land — numbers in prose rot, numbers in tests do not.
