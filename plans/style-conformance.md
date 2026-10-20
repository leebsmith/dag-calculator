---
title: Style Conformance — Structural Adherence Assessor & Surfacing
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [warnings]
status: accepted
---

# Style Conformance — Structural Adherence Assessor & Surfacing

## Goal

Surface, continuously, how far a brew's realized vital statistics drift from the
picked style's envelope, without pretending to be a sensory judge. Deliver a
single **Style Adherence Index (SAI)**, a tiered **drift status** per dimension,
and an unambiguous answer to "**which node is out of bounds**" — across the
footer, the Style card, inline field badges, and (via the freeze payload) the
recipe document.

The assessor is specified **ab initio** in `docs/style-conformance.md`. It is a
structural audit only: it maps the five BJCP vital statistics (OG, FG, ABV, IBU,
SRM) plus two relational dimensions (Apparent Attenuation, BU:GU) to a drift
measure. It produces **no BJCP /50 score and no medal tier**.

## Locked decisions

1. **Structural adherence only.** No sensory score, no medal tier. The single
   scalar is the SAI (0–100), an adherence index, not a quality grade.
2. **Canonical math.** Apparent-extract Cutaia (`(0.372 + 0.00357·OE)(OE−AE)`,
   ASBC Table 1 cubic), Plato-space AA, and the existing feasible-region
   geometry are the single source of truth — already pinned frontend↔backend.
3. **Relational bounds are exact, not damped.** AA is bounded by the feasible
   region; BU:GU is bounded by the IBU×OG rectangle ratio extrema.
4. **JND tolerance model.** Each dimension gets a boundary-independent tolerance
   band `τ`; `z = excess / τ` drives a four-tier status (Within spec → Grace
   ≤1 JND → Noticeable drift 1–2 JND → Severe bleed >2 JND).
5. **Per-dimension gating.** A dimension is checked iff its envelope is complete
   (`min < max`). No style, a stats-less style, or experimental mode simply
   produce no baseline for the missing dimensions — never a false flag.
6. **Post-solve, pure.** The assessor is a pure function of the valuation,
   computed in the frontend after each solve; its result is frozen into the
   freeze payload so downstream (recipe document) reads it without recomputing.
7. **Realized values only.** Conformance compares realized outputs (post-boil
   gravity, realized FG/ABV, finished-beer SRM, total IBU), not authored targets.

## Deferred (explicitly out of scope now)

- **Backend mirror** of the conformance module — no backend consumer exists until
  the recipe document pipeline renders server-side. The freeze payload carries
  the frontend-computed `conformance` block; the backend stores it verbatim.
- **Recipe document section** — gated on `plans/recipe-pipeline.md`; the seam is
  the frozen `conformance` block produced here.
- **Real-extract Cutaia** migration of the solver — the solver and picker
  geometry are built on the apparent-extract form; a future, separately-planned
  change. Documented in `docs/style-conformance.md` §Non-goals.
- **Psychophysical modifiers** (haze turbidity bonus, sulfate-finish IBU
  compression, residual-extract IBU coupling).

## Steps

1. **`docs/style-conformance.md`** — ab initio spec: inputs, canonical math,
   tolerance model + tier taxonomy, pillar aggregation + SAI, per-dimension node
   bindings, gating rule, frozen `conformance` block shape, non-goals. Registered
   as living in `README.md`.
2. **Materialize realized FG + ABV** as derived nodes (artifact functions +
   `batch.realized_fg` / `batch.realized_abv` + `docs/adding-a-node.md` + engine
   test + `emit-artifact-inventory`).
3. **Conformance module** — `frontend/src/engine/styleConformance.js` (pure),
   reusing `fermentation.js` math; unit tests.
4. **Adapter wiring** — `stepAdapter.compute()` produces `app.styleConformance`
   and `app.styleSai`; `freezePayload()` gains a `conformance` block.
5. **Surfacing** — footer SAI chip; Style-card conformance block; Batch-slice
   "Vitals" readout group (OG/FG/ABV/SRM/IBU); producer `out.conformance` inline
   badges; slice-level `stepStatus` aggregation.

## Gates

`make check`, `make test`, `node scripts/emit-artifact-inventory.mjs` (step 2),
and the artifact-docs-sync guard.

## Out of scope

Pre-solve warnings; sensory scoring/medal tiers; unit-scaling; the recipe
document renderer itself.
