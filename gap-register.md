# Gap Register — Discovery Sweep

Records missing sources, unresolved conflicts, and the decisions/resolutions made
while populating `data/artifact.json`. No conflict was resolved silently.

## 1. Sources

All sources listed in §1 of the prompt were found and read. **No BLOCKED items.**

| Source | Status | Notes |
|---|---|---|
| `data/artifact.json` (exemplar) | read | origin + target, byte-identical |
| `docs/dag-artifacts/*` (9 files) | read | grammar, semantics, dimensions, equations, seeds, example, stack |
| `data/seeds/*.json` (6 files) | read | equipment, malts, sugars, water_reports, water_target_profiles, yeasts |
| `backend/app/schemas/boundary.py` | read | authoritative boundary contract |
| `backend/app/core/{batch_solver,water,utils}.py` | read | authoritative math |
| legacy `frontend/src/partials/step-*.html` (7 + 4 modals) | read | coverage inventory |
| legacy `frontend/src/{components,stores,utils,config,api}/**` | read | master store, derived getters, constants |
| legacy `frontend/constants.js` | read | BREW_CONSTANTS + FIELD_REGISTRY |
| legacy `docs/{the_wizard_state_machine_guide,calculator-domain-model,srm-ebc-and-lovibond-reference,adr-parts-to-percentage-hamilton}.md` | read | domain model, color, Hamilton |
| legacy `docs/batch-math/*` | read (via domain-equations.md + solver code) | solver interior is sealed |
| legacy `docs/{good-enough-water-chemistry-calculator}.md`, `scripts/water-chemistry-module.py` | referenced | water solver is sealed; not re-implemented |
| legacy `backend/app/{service/logic,schemas/*,seeds/*}` | read | schemas + seeds (field-set evidence) |
| legacy `plans/{vessel-loss-model,water-chemistry-engine,canonical-data-model,deterministic-dag,master-frontend-ui-requirements}.md` | referenced | design records cited by code |

## 2. Conflicts & resolutions

### C1 — `plato_to_sg` is closed-form, not a numeric inverse
`utils.py::plato_to_sg` is an ASBC **3rd-order polynomial**, not the Newton–Raphson
inverse of `sg_to_plato`. `dimensions.md` §3.1 and `expression-language.md` §5 describe
`plato_to_sg` as "numeric inversion". **Resolution:** declare both directions as AST
polynomials (known-good code wins). The `gravity` nonlinear pair `fwd=sg_to_plato,
inv=plato_to_sg` still holds; the "numeric inversion" prose is stale.

### C2 — `boil_off_rate_l_per_hr` dimension
Exemplar + `FIELD_REGISTRY` treat it as `volume`; `seed-substrate.md` §2.4 says
`volume/time`. **Resolution:** kept `dimension: volume` (retain shape; it is consumed as a
plain rate and multiplied by boil-time in `batch.delta_v_evap`). Rate semantics noted.

### C3 — water-solver `strategy` default
`boundary.py` defaults `strategy=FLAVOR`; `core/water.py` defaults `CALCIUM_FLOOR`; legacy
+ frontend default `CALCIUM_FLOOR`. **Resolution:** artifact root default `CALCIUM_FLOOR`
(matches core + UI). `boundary.py` default flagged as inconsistent (host concern, not
declared in the artifact).

### C4 — hydrate-form values
`boundary.py` declares `gypsum_form`/`cacl2_form` as `str` default `"dihydrate"`; the core
solver uses `GYPSUM_DIHYDRATE`/`CACL2_DIHYDRATE` (the `SALT_COEFFS` keys). **Resolution:**
taxonomies use the `SALT_COEFFS` keys (`GYPSUM_DIHYDRATE|GYPSUM_ANHYDROUS`,
`CACL2_DIHYDRATE|CACL2_ANHYDROUS`). The `"dihydrate"` str-default in `boundary.py` is noted
as a contract wart.

### C5 — `target_mash_ph` default
`boundary.py` default `5.35`; legacy/`constants.js`/`waterChemistry.js` default `5.4`.
**Resolution:** `5.4` (UI/legacy authoritative for the user-facing default).

### C6 — nested/object/list boundary shapes
The grammar's `boundary.outputs` is a flat `{alias → {dimension}}` map; `boundary.py`
returns nested `cascade`, `hlt`, `prescription`, `mash_additions`, `sparge_additions`,
`post_salt_mash_ions`, `grist_buckets_kg` (dict), `warnings`/`notes` (list[str]).
**Resolution:** nested objects flattened to dotted output keys (`cascade.v_strike`, …),
reusing the grammar's existing dotted-path resolution. `grist_buckets_kg` flattened to four
dotted keys (`BASE|CRYSTAL|ROASTED|ACID`). `warnings`/`notes` **excluded** (advisory text,
not dimensioned domain quantities).

### C7 — taxonomy/boolean boundary outputs
`boundary.py` returns `strategy`/`mash_ph_status` (enums) and `sparge_tannin_warning`
(bool). Grammar §2.5 says boundary outputs are "dimensioned". **Resolution:** boundary
outputs accept the same one-key spec as `derived.output` — `{dimension}` | `{taxonomy}` |
`{type:"boolean"}`. Documented clarification, not a grammar-shape change (no
`schema_version` bump).

### C8 — `min` reduction added
`mash.dough_in_target_temp_c` ("first enabled rest") requires a `min` reduction. The
language permits adding reductions "only if a derived node requires them".
**Resolution:** added `min` (`{op:"min", coll, as, value}`). Engine semantics: skips
disabled items and null/non-finite `value`.

### C9 — dough-in target derivation
The legacy `doughInInheritedTempC` = the first enabled optional rest's temperature in
ascending-temperature order. That value is **exactly** the minimum `use_temp_c` over
enabled rests (ties produce identical values). **Resolution:** modeled as `min` over
`mash.rests` with the documented skip-disabled/null semantics.

### C10 — Hamilton largest-remainder allocator
`allocateProportionalPercentages` is a **list → list** transform (parts → pct). The grammar's
`functions` are scalar→scalar and `derived` outputs are scalars only. **Resolution:** recorded
as a host-side formulation rule (populates `grist_row.pct`); documented in provenance, not
modeled as a `function` or `derived` node.

### C11 — `estimate_limit_of_attenuation` (schedule-level)
Duration-weighted mean over saccharification rests is a collection reduction producing a
scalar, but with per-item filtering that needs derived collections. **Resolution:** the
per-rest model is exposed as function `estimate_single_rest_loa_pct`; the schedule-level
duration-weighted combination is noted as engine-side (informational, does not feed any
solver/boundary).

### C12 — water source ions (report → six ions)
`ionsFromReport`/`_ions_from_report` derive the six working ions from a report, with
`total_alkalinity_caco3` falling back to `bicarbonate_hco3 × 50/61`. This is a copy-in at
selection time (semantics §3.2), not a live derived transform. **Resolution:** six source-ion
`root`s + a `water.source_report` selection; the report→ion copy-in is a host/state concern.
The fallback math is preserved as functions `alkalinity_from_bicarbonate` /
`bicarbonate_from_alkalinity`.

### C13 — `percentage` fraction vs. whole-percent
`percentage` base is `fraction`, but `target_abv` (5.5), `max_achievable_abv`,
`alcohol_tolerance_abv` (12.0) are stored as whole-percent numbers in the legacy code.
**Resolution:** pre-existing exemplar quirk retained (do-not-break-consumers); dimensions are
unambiguous but the stored scale for ABV-style percentages is a whole-percent number.

### C14 — boundary serialization units
Salt additions are emitted in grams (`*_g`) and milliliters (`acid_ml`); artifact declares
dimension `mass`/`volume` (base kg/L). The specific g/mL unit is the boundary's serialization
unit, not a dimension. `ml` unit added to the `volume` dimension for completeness.

### C15 — `equipment.profile` overlay `{mash_tun_mass_kg: 7.5}`
This is the exemplar's demonstration batch-scoped override. **Resolution:** retained verbatim
("do not rename/remove existing fields"); flagged as an exemplar demo value, not a default.

### C16 — `is_custom` ownership flags
`is_custom` (equipment profile, water target, grain-bill rows) is ownership metadata, not a
domain quantity. **Excluded** (documented in coverage matrix).

### C17 — `water_report` source-vs-report nesting
Seeds nest a `WaterSourceCollection` (`source_id/source_name/location/reports[]`) around
`WaterReport`. The prompt's schema list only requires `water_report` (~20 fields) and
`water_target`. **Resolution:** `water_report` holds the 21 report fields; the
source→report resolution is represented by `water.source_report_id` (root) +
`water.source_report` (selection), not a separate source schema.

## 3. Exclusions (domain-only)

Presentation, unit selection, rounding, sentinels, CSS, control kinds, layout, modals,
search, routing, and unit-mode state are excluded per `semantics.md` §2.3. These are itemized
in `coverage-matrix.md` rather than re-listed here.

## 4. Grammar ratification — Step A

The sweep introduced grammar extensions while claiming "no shape change". Step A
**ratifies** them explicitly and bumps the grammar revision.

- **`choice` node kind** (new, sixth kind) — categorical user input
  (`{kind:"choice", taxonomy, default}`). Previously improvised as `root` + `taxonomy`.
- **`min` reduction + optional `where` predicate** — filter-then-reduce.
- **Boundary outputs** accept `{dimension}` | `{taxonomy}` | `{type:"boolean"}`,
  with **FLAT + dotted** keys for nested host responses.
- **Boolean schema fields** (`{type:"boolean"}`, e.g. `mash_rest.enabled`).
- `schema_version` → **2** (grammar §6); `meta.status` = `"complete"`.

### C18 — silent grammar extension (`root` + `taxonomy`)  [resolved in Step A]
The sweep modelled 7 categorical inputs as `{"kind":"root","taxonomy":…}`, which
`grammar.md` §2.1 forbids (`root` requires `dimension`), and did **not** flag it
here nor bump `schema_version`. It also omitted this from the original report.
**Resolution:** ratified as the new **`choice`** kind; `schema_version` → 2.

### C19 — boundary output flattening / advisory fields  [ratified]
`boundary.py` returns nested objects and `warnings`/`notes` lists. **Resolution:**
nested objects flattened to dotted keys (`cascade.v_strike`, `hlt.v_hlt_debt`, …);
advisory `warnings`/`notes` excluded (not dimensioned quantities).

### C3 / C5 — resolved in code (Step A)
- **C3** `boundary.py` `strategy` default `FLAVOR` → **`CALCIUM_FLOOR`**.
- **C5** `boundary.py` `target_mash_ph` default `5.35` → **`5.4`**.
Explicit-default tests added (`test_water_defaults`).
