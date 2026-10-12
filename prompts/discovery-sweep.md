---
title: Discovery Sweep — Full Population of artifact.json
stage: 3
role: discovery-sweep agent
target_repo: ~/Development/dag-calculator
source_repo: ~/Development/brewing-calculator
run_cwd: ~/Development/brewing-calculator
outputs:
  - data/artifact.json
  - gap-register.md
  - provenance.md
  - coverage-matrix.md
  - validation-report.md
status: ready
---

# Discovery Sweep — Full Population of `artifact.json`

## How to run this sweep — read first

You are running **inside `~/Development/brewing-calculator`** (the legacy app). Read its sources
as ground truth, and **write your output into a different repo**: `~/Development/dag-calculator`.

- **READ (ground truth — this repo):** the legacy sources —
  `frontend/src/partials/step-*.html`, `docs/**`, `plans/**`, `scripts/**`,
  `backend/app/**` (service, schemas, seeds, core).
- **READ (starting exemplar):** the incomplete `artifact.json`. It sits here at
  `~/Development/brewing-calculator/docs/dag-artifacts/artifact.json` (the origin) and,
  byte-identically, at `~/Development/dag-calculator/data/artifact.json`.
- **WRITE (only destination):** `~/Development/dag-calculator/data/artifact.json` — overwritten
  in place — plus the side reports (§7) in `~/Development/dag-calculator`.

There is exactly **one** write target: `~/Development/dag-calculator`. Do **not** write the
completed artifact back into `~/Development/brewing-calculator`.

## Role
You are the discovery-sweep agent for the deterministic-DAG brewing calculator.
Your ONLY deliverable is a fully populated, canonical `artifact.json` that backs the
entire application's business logic. You do not design UI and you do not write runtime code.

## Mission
Starting from the EXEMPLAR artifact at `~/Development/dag-calculator/data/artifact.json`,
produce the COMPLETE artifact so that every input, selection, collection, derived value,
boundary contract, schema, function, constant, taxonomy, and relation required by the
application is declared — verified against the known-good code — while RETAINING EXACTLY
the existing grammar/shape.

Write the completed artifact back to `~/Development/dag-calculator/data/artifact.json`
(in place) and emit the side reports (see §7) alongside it.

---

## 1. Source locations

### Target repo (write here)
- `~/Development/dag-calculator/data/artifact.json` — the exemplar to complete.
- `~/Development/dag-calculator/docs/dag-artifacts/*` — grammar, expression-language,
  semantics, dimensions, domain-equations, seed-substrate, worked-example, tech-stack,
  00-ingestion.
- `~/Development/dag-calculator/data/seeds/*.json` — equipment, malts, sugars, yeasts,
  water_reports, water_target_profiles (instances; evidence of schema field sets).
- `~/Development/dag-calculator/backend/app/schemas/boundary.py` — the full Pydantic
  `BatchSolverRequest`/`BatchSolverResponse`, `WaterSolverRequest`/`WaterSolverResponse`,
  and error enums.
- `~/Development/dag-calculator/backend/app/core/{batch_solver,water,utils}.py` — sealed
  solver interiors (do not re-implement).

### Legacy source repo (read here — GROUND TRUTH)
- `~/Development/brewing-calculator/frontend/src/partials/step-*.html` — the 7 wizard steps
  (coverage inventory): `step-equipment-profile`, `step-yeast-selection`,
  `step-fermentables`, `step-late-additions`, `step-batch-solver`, `step-mash`,
  `step-water-chemistry` (plus any modal partials).
- `~/Development/brewing-calculator/docs/the_wizard_state_machine_guide.md`.
- `~/Development/brewing-calculator/docs/calculator-domain-model.md`.
- `~/Development/brewing-calculator/docs/batch-math/{unified-treatment.md,
  implementation-plan.md, inputs-and-outputs.md,
  batch-sparge-non-linear-root-finding-v2.md, abv-and-sg-utility-functions.md}`.
- `~/Development/brewing-calculator/docs/good-enough-water-chemistry-calculator.md`,
  `docs/water-chemistry-card-wireframe.md`, `scripts/water-chemistry-module.py`.
- `~/Development/brewing-calculator/docs/srm-ebc-and-lovibond-reference.md`.
- `~/Development/brewing-calculator/docs/adr-parts-to-percentage-hamilton.md`,
  `docs/adr-malt-entry-table.md`.
- `~/Development/brewing-calculator/plans/{vessel-loss-model.md, water-chemistry-engine.md,
  canonical-data-model-and-versioned-library.md, master-frontend-ui-requirements.md,
  deterministic-dag.md, …}`.
- `~/Development/brewing-calculator/backend/app/service/logic.py` — legacy orchestration.
- `~/Development/brewing-calculator/backend/app/schemas/{models,primitives,templates,water}.py`
  — legacy schemas.
- `~/Development/brewing-calculator/backend/app/seeds/*.json` — legacy seed instances.
- Legacy Alpine stores / frontend JS: `~/Development/brewing-calculator/frontend/src/**`.

If a listed source is missing or unreadable, record it BLOCKED in the gap register.
Never silently invent logic.

---

## 2. Coverage mandate (domain-only)

Cover, at the DOMAIN level:
- every legacy **PARTIAL** (each step's inputs, outputs, selections, collections, boundary calls),
- the legacy **MASTER STORE** (user inputs, selection ids, sparse overlays) → roots / selections / overlays,
- the legacy **CODE** (all calculations and constants) → functions / constants / derived nodes.

**EXCLUDE** and list explicitly: presentation (labels, control kinds, CSS, layout, sentinels,
rounding, unit selection) and ephemeral UI state (modals, search, routing, unit mode).
The artifact is domain-only (`semantics.md` §2.3).

Deliver a **COVERAGE MATRIX**: every step / partial / store field → the artifact element that
owns it, or "presentation/ephemeral (excluded)".

---

## 3. Shape retention (exact grammar — do not change)

- Top-level sections (no new top-level keys): `schema_version`, `meta`, `dimensions`,
  `constants`, `taxonomies`, `functions`, `primitive_schemas`, `nodes`, `relations`.
- Node kinds (5): `root`, `collection`, `selection`, `derived`, `boundary`.
- Edge kinds (3): data (`inputs`), reference (`ref`), relation (`relations` array).
- AST: leaves (`ref`/`const`/literal); operators (arithmetic `+ - * / neg pow`; comparison
  `gt ge lt le eq ne`; logic `and or not`; conditional `if`); reductions
  (`map`/`filter`/`sum`/`weighted_avg` with `{coll, as, body|value|weight}`); calls
  (`{call, args}`).
- Transform kinds: `linear` / `affine` / `nonlinear` / `identity`.
- Ids: dot-namespaced slugs by slice (`equipment.*`, `mash.*`, `water.*`, `grist.*`,
  `batch.*`, `solver.*`); flat ids for constants/functions/taxonomies/schemas/dimensions.
- `extra: forbid` everywhere; dangling references are errors.

Allowed non-shape changes: additive content; `meta.status` from `"exemplar"` to `"complete"`;
a `schema_version` bump ONLY if a grammar-shape change is unavoidable (justify in the report).

---

## 4. Authority & precedence (on conflict, follow this order)

1. **Known-good code** (`batch_solver.py`, `water.py`, `utils.py`) — authoritative for all math.
2. **`boundary.py`** — authoritative for boundary I/O contracts, field-for-field.
3. **`docs/batch-math/*`, `docs/calculator-domain-model.md`, `domain-equations.md`,
   `seed-substrate.md`, `dimensions.md`** — domain semantics, schemas, units.
4. **Seed files** (both repos) — evidence of schema field sets (infer schemas from instances).
5. **Legacy partials / stores / JS** — coverage inventory (what the app needs), NOT structure.
6. **`grammar.md` / `expression-language.md` / `semantics.md`** — language and invariants.

Never resolve a conflict silently; log every conflict and its resolution in the gap register.

---

## 5. Non-negotiable invariants

- **Explicit DAG only**: edges come from `inputs`/`ref`/`relations`; no read-tracking or inference.
- **Single writer**: one definition per node; roots are the only mutable state; derived values
  are never stored.
- **Domain-only**: no labels, display units, rounding, CSS, control kinds, or layout.
- **Sealed boundaries**: declare the contract only; do NOT re-implement interiors;
  `resolution: "iterative"`; keep binding slugs `batch_sparge_solver`, `water_chemistry_solver`.
- **No cycles**; any fixed-point belongs in a `boundary`.
- **One definition per equation**: shared equations live in `functions`; never duplicated inline.
- **Prefer nodes/constants over magic values**; defaults/bounds reference `constants`/`taxonomies`.
- **Deterministic**: same inputs → same artifact.

---

## 6. Required content (targets)

- **Schemas** (`primitive_schemas`): ADD `sugar`, `yeast`; RECONCILE `equipment`,
  `water_report` (~20 legacy seed fields), `water_target` (nested `ions` per seeds +
  `seed-substrate.md` §2.5), `malt` (optional `di_ph`/`buffer_index`).
- **Taxonomies**: `topology` (`r_l_to_g`|`runoff_ratio`), `strategy`, `salt_distribution`,
  `acid_medium`, `alkaline_agent`, hydrate forms (gypsum/cacl2), `flocculation`; keep
  `malt_category`, `ph_status`.
- **Constants**: all physical constants currently hard-coded in the solvers (sucrose yields,
  `v_bar`, `k_abs_true`, `rho_water`, mash thermal factor, …).
- **Functions**: gravity conversions (`sg_to_plato` cubic + `plato_to_sg`; declare the
  `nonlinear` pair referenced by `dimensions.gravity`), extract yield, late additions (§1.4),
  MCU→Morey finished-beer color, Hamilton largest-remainder allocator (§1.6); keep
  `calculate_strike_water_base_temp`, `calculate_tun_thermal_offset`, `morey_lovibond_to_srm`,
  `mash_ph_status`.
- **Boundaries**: `solver.batch` → full `BatchSolverRequest` inputs (~17) + `BatchSolverResponse`
  outputs (incl. nested `cascade`, `hlt`, `max_achievable_abv`); `solver.water` → full
  `WaterSolverRequest`/`WaterSolverResponse`. Mirror `boundary.py` exactly (names/shapes/enums).
- **Nodes**: yeast selection + attenuation derivation (feeds `apparent_attenuation`); sugar
  collection + `s_late_add`; mash rest schedule + `dough_in_target_temp_c` (derived from the
  first enabled rest); water source/target selections + treatment params; all solver input
  roots; wire via explicit `inputs`.
- **Relations / domains**: add n-ary invariants + unary `domain` bounds.

---

## 7. Required outputs

1. `artifact.json` — completed, same shape (written in place in the target repo).
2. `gap-register.md` — missing sources, unresolved conflicts, BLOCKED items.
3. `provenance.md` — every element → authoritative source (or `"inferred"`).
4. `coverage-matrix.md` — step/partial/store-field → artifact element (or excluded).
5. `validation-report.md` — validator + dimension + boundary-parity + golden-vector results.

---

## 8. Acceptance / self-check (run before returning)

- Loads/validates: `extra: forbid`, dangling refs, kind/output rules.
- Dimension checks pass (e.g. `temperature` vs `temperature_delta`).
- Every boundary field matches `boundary.py` exactly.
- Golden values from `worked-example.md` and `domain-equations.md` reproduce.
- No cycles; no duplicated equations; no presentation leakage; no ephemeral-UI nodes.
- The coverage matrix has no unexplained blanks.

---

## 9. Guardrails (do NOT)

- Do not re-implement the two solvers.
- Do not add labels / display units / control kinds / layout.
- Do not add UI or ephemeral state as nodes.
- Do not invent math absent from the known-good code (mark `inferred` only if unavoidable).
- Do not rename or remove existing fields (`extra: forbid` breaks consumers).
- Do not change the grammar.
