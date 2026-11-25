# Surface audit — the declared UI surface vs the artifact

Date: 2026-11-25
Status: audit + design note. The audit changed no source; this document is its
only output.
Scope: `frontend/src/views`, `frontend/src/adapters`, `frontend/src/store`,
`data/labels.json`, `tools/generate_artifact_dot.py`, `backend/app/templates/`,
`tests/guards/`.

## 1. Question

If we build the enabling layer (surface/manifest, oracle harness, stage guard,
impact query) and later replace the UI, what does the *current* app already
declare, where is it duplicated, and what must the manifest subsume? The audit is
deliberately about **declarations**, not code quality.

## 2. Definition

A **surface** is any declaration that says, for an artifact path:

- it is authorable or displayable (reachability),
- how it is labelled / united / optioned (presentation),
- which control renders it (affordance class),
- where it lives and in what order (grouping),
- or that it is part of the persisted state (serialization).

Five kinds of module currently carry surface declarations. None is authoritative.

## 3. Inventory of projections

| # | Module | Declares | Generated? | Consumers | Size |
|---|---|---|---|---|---|
| P1 | `frontend/src/views/steps.js` | workflow order, steps, per-step fields and nested readout rows | hand | `stepDisplay`, producer, guards, report-parity tests | 11 steps, 157 paths |
| P2 | `frontend/src/views/producer/projection.js` | per-field descriptor (`describeField`), default control, columns, display conversion | hand (logic) | producer, draft editors, cards | — |
| P3 | `frontend/src/views/renderers.js` | control kinds + editable/readout split | hand | markup dispatch, projection | 7 kinds |
| P4 | `frontend/src/views/registry/*` + `data/labels.json` + `scripts/emit-registry.mjs` | labels, units, hints, options, per-slice node tables, systems | mixed: `generated.js` emitted, slice files hand | cards, projection, catalog | 281 paths; 226 labels; 611 generated keys |
| P5 | `frontend/src/views/registry/catalog.js` | the freeze bundle's `catalog` (labels, dimensions, options, units, decimals) | derived at freeze | report, bundle fixture | 225 lines |
| P6 | `frontend/src/views/registry/fieldLabels.js` | labels for **schema keys** (library editors, import, validation) | hand | library/import | 222 lines |
| P7 | `frontend/src/views/registry/findings.js` | relation wording, severity, actions — keyed by relation id | hand, **completeness-guarded** | cards, producer findings | 166 lines; 9 relations |
| P8 | `frontend/src/adapters/importProjection.js` + `importDelta.js` | a second surface for imported documents: ledger→field projection, per-line delta with reasons | hand | import gate/commit | 280 + 233 lines |
| P9 | `tools/generate_artifact_dot.py` | graph projection including **identity** edges and relations | generated | `docs/artifact_dag.dot` | 413 lines |
| P10 | `backend/app/templates/sections/*.typ` | ordered report projection: section → artifact paths | hand | report renderer, docs | 16 sections, 173 paths |
| P11 | `frontend/src/store/snapshot.js` + `snapshotFormatters.js` | canonical state serialization (draft/freeze/report inputs), versioned | hand | autosave, freeze, import | 149 + 141 lines |

## 4. Coverage today

| Metric | Value |
|---|---|
| Artifact nodes | 133 (36 root, 12 choice, 70 derived, 10 collection, 2 selection, 3 boundary) |
| Valid scalar paths (nodes + 91 boundary outputs) | 224 |
| Paths declared by `steps.js` | 157 |
| Paths declared by `registry` tables | 281 |
| Union surface | 287 (steps adds 6 not in registry; 151 shared) |
| Nodes with a label | 79 / 133 (28 root, 10 choice, 32 derived, 9 collection; 0 boundary, 0 selection) |
| Label entries carrying unit/symbol | 29 |
| Roots/choices | 48 |
| Roots/choices bound in the step manifest's fields | 37 |
| Roots/choices unbound | **11** |
| Report paths (distinct, artifact-resolving) | 173 |
| Report paths with **no** declared surface | **9** |
| Report paths covered only by prefix/family inference | **29** |
| Nodes never mentioned on any surface (strict string match) | **27** |
| Boundary outputs not named in registry | 12 (all diagnostics; 4 `grist_buckets_kg`, 6 `post_dose_hlt_ions`, 2 water diagnostics) |

## 5. Findings

**F1 — Five partial manifests, no single source.** P1–P5 each declare part of the
same surface. `describeField` already throws on unknown ids, so the app is safe at
boot, but no module can answer "is every root reachable".

**F2 — Root coverage is unguarded.** Derived nodes, constants, and boundary outputs
have consumer guards; roots do not. 11 of 48 are not in the step manifest's fields. Several are
legitimate (constructed ids, preset paths), which is precisely why a literal scan
cannot be the guard.

**F3 — Label coverage is unguarded.** 54 of 133 nodes are unlabelled. Most are
choices/selections the cards label themselves, but nothing distinguishes "labelled
elsewhere" from "blank". Two label systems coexist: `labels.json` (path labels) and
`fieldLabels.js` (schema-key labels).

**F4 — Two graphs.** The engine's `buildGraph` creates edges only between nodes;
identity refs create none. `generate_artifact_dot.py` resolves identity and draws
those edges. So the rendered DAG is a **superset** of the runtime DAG. Only 8 of 48
roots have default-derived edges, all reading a selection (`water.target_profile`);
`batch.target_abv`'s default reads `style.abv_min` but has no adjacency. Any stage
derivation must use the diagram's graph, not `buildGraph`.

**F5 — Slice taxonomy is folklore.** `slice` is a bare string in 11 step entries and
9 registry modules, with no definition, membership rule, or order rule. Slices
cross-cut namespaces: `hops` is 15/15 `batch` nodes; `water` is 19 `solver` + 9
`water` + 1 `batch`; `mash` is the only namespace-clean slice.

**F6 — Report/UI duplication.** Six `water.mash_adjustment.*` nodes exist as derived
nodes solely for the report's water-chemistry table; `artifact-consumers.test.js`
allowlists them, noting "the UI keeps its own display delta". The UI recomputes what
the artifact already declares. Same shape for `batch.late_addition_volume_l`.

**F7 — Prefix inference is unsound as coverage.** 29 report paths are "covered" only
because a shorter declared base exists. Legitimate for dynamic families
(`${N.target}.${ion}`, `${kettleBlend}.${ion}`); illegitimate for boundary nodes,
where `solver.batch` would "cover" all 35 outputs. Families must be declared, not
inferred.

**F8 — Control selection is already centralized.** `defaultControl` + `rendererFor`
give a real affordance vocabulary. What is missing is the *authoring class* — e.g.
"ratio the user pins" vs "target the solver consumes" vs "inherited default" —
which cannot be derived from `kind` alone.

**F9 — State serialization is already a manifest half.** `snapshot.js` owns the
persisted payload, `DRAFT_SCHEMA_VERSION` versions it, and freeze already emits
`state.valuation`, `formatted`, `catalog`, `validation`.

**F10 — A completeness guard already exists, for one section.** `findings.js` is
keyed by relation id and `findings-registry.test.js` enforces full coverage. This is
the template for label/surface/root completeness.

**F11 — Report is the strongest oracle.** 173 distinct artifact-resolving paths are
cited directly in the Typst sections. Nine have no UI surface at all:
`batch.late_addition_volume_l`, `equipment.name`, `style.name`, and the six
`water.mash_adjustment.*`. The first is a readout gap; the last six are duplication
(F6).

**F12 — 27 nodes have no strict surface mention.** Classification:

- dynamic family members: `water.target.*` (6), `water.kettle_blend.*` (6) — set via
  `${base}.${ion}`;
- report-only: `water.mash_adjustment.*` (6), `batch.late_addition_volume_l`;
- boundary wire internals: `batch.s_late_add_request`, `batch.sugar_share_request`,
  `batch.sugar_fermentability_effective`;
- internal arithmetic not surfaced: `grist.mcu`, `batch.sugar_parts_total`,
  `mash.heating_rate_c_per_min`, `mash.enabled_min_temp_c`,
  `mash.enabled_max_temp_c`, `batch.sugar_fermentability_effective`.

Only the "internal arithmetic" group needs a disposition decision (intentionally
unsurfaced vs forgotten).

## 6. What the manifest must subsume

| Manifest section | Existing owner | Ready-made? |
|---|---|---|
| inputs + kinds + dimensions + domains + defaults | artifact | yes |
| authoring class (pin / target / inherited / table) | `defaultControl` (partial) | needs a class field |
| control + editable split | `renderers.js` | yes |
| labels / hints | `labels.json` → `generated.js` | yes |
| units / symbols / decimals | `registry/units.js` | yes |
| options | `generated.js`, seeds | yes |
| grouping + order | `steps.js`, `stepDisplay.js`, slice strings | editorial; must stay authored |
| relations + disposition | artifact + `findings.js` | yes, already guarded |
| boundary contracts | artifact (`inputs`/`outputs`/`resolution`/`domain.codes`) | yes |
| boundary wire shape | `boundaryRequest.js` + Pydantic | **no** — host-side |
| identity schemas | artifact + `fieldLabels.js` | split across two label systems |
| state serialization | `snapshot.js` | yes |

The only genuinely missing sections are the authoring class and the wire shape.

## 7. Impact query — design (build now, no UI)

**Purpose.** Answer "what moves when this changes" from declared edges, with no
read-tracking (A9 determinism is preserved: the query is a pure graph walk).

**Contract.**

- `impact(nodeId)` → `{ ancestors, dependents, boundaryFanOut, byDepth }`.
- `ancestors` / `dependents`: transitive closure over `adjacency` / `dependents`.
- **Boundary fan-out:** when the walk reaches a boundary node, every output of that
  boundary is treated as changed, so the walk continues through *all* output
  consumers. This is the rule that makes "dark grist → SRM" correct.
- **Identity:** identity refs are not graph nodes. The query takes an optional
  identity map and treats `equipment.*`, `style.*`, `fermenter.*`,
  `water.source.*` as terminal sources, so swapping a selection can be attributed
  to the fields the model reads.
- `diff(valuationA, valuationB)` → per-path `{ before, after, textBefore, textAfter }`
  using the producer's formatter (no new formatting logic).

**Validation without a UI.** Two frozen bundles (state A, state B) give two
valuations. Invariant: the set of paths whose values differ must be a **subset** of
`impact(changedRoot)`. Impact is a declared-dependency over-approximation, not a
promise that every dependent changes.

**Tests.** adjacency/dependents inverse symmetry; boundary fan-out; identity
attribution; subset invariant against two fixtures; determinism (same input, same
output; no memo mutation).

**Non-goals.** No UI consumption, no highlighting, no scheduling. The runner's
frontier walk already owns solve order.

## 8. Recommended sequence and acceptance criteria

1. **Manifest emitter** (subsumes P1–P5; leaves P8–P11 as consumers).
   Done when: emitted, byte-guarded like `inventory.md`, and `describeField` is
   derived from it rather than parallel to it.
2. **Surface + root coverage guard.** Declare families explicitly.
   Done when: every root/choice is reachable or allowlisted as inherited-only, and
   adding a root without a disposition fails the gate.
3. **Oracle harness.** Done when: every path in a frozen bundle's `formatted` is
   reachable, and every relation/domain violation has a disposition.
4. **Stage guard** (warning only, uses the DOT graph incl. identity).
   Done when: drift between editorial step order and derived stages is reported.
5. **Impact query** (this document §7). Done when: the subset invariant holds on
   two fixtures.

## 9. Risks and non-goals

- A manifest without consumers becomes speculative. Rule: every section must
  replace an existing projection; nothing net-new.
- Do not make stage order authoritative. Order is editorial (settled).
- Do not infer families by prefix for boundary nodes (F7).
- Consolidating labels (F3) risks breaking `docs-claims` and `ui-vocabulary`
  guards; expect fixture churn.
- This audit says nothing about card behaviour, which remains bespoke and correct.

## 10. Appendix

### A. Unbound roots/choices (11)

`batch.bract_floor_ratio`, `batch.scale_pin`, `batch.target_fg`, `batch.target_og`,
`mash.preset_id`, `water.target.alkalinity_as_caco3`, `water.target.calcium_ca`,
`water.target.chloride_cl`, `water.target.magnesium_mg`, `water.target.sodium_na`,
`water.target.sulfate_so4`.

Dispositions to decide: `scale_pin`/`target_og`/`target_fg` are style-card pins
(host-set); `mash.preset_id` is applied by a preset write; `water.target.*` is a
constructed family; `bract_floor_ratio` appears unsurfaced.

### B. Report paths with no declared surface (9)

`batch.late_addition_volume_l`, `equipment.name`, `style.name`,
`water.mash_adjustment.alkalinity_as_caco3`, `.calcium_ca`, `.chloride_cl`,
`.magnesium_mg`, `.sodium_na`, `.sulfate_so4`.

### C. Report paths covered only by prefix (29)

`batch.yeast.{form,manufacturer,name,temp_high_c,temp_low_c}`,
`solver.batch.hlt.{v_hlt_after_strike,v_hlt_debt}`,
`water.source.{calcium_ca,chloride_cl,laboratory,magnesium_mg,report_id,sodium_na,
source_name,sulfate_so4,total_alkalinity_caco3}`,
`solver.water.post_dose_mash_ions.{6 ions}`, `water.target.{6 ions}`,
`water.target_profile.name`.

### D. Unlabelled nodes (54)

Roots 8, choices 2, derived 38, collections 1, boundary 3, selection 2. Most are
labelled by their cards or by `fieldLabels.js`; the count is the size of the
unverified set, not a bug count.

### E. Method notes

Counts were produced by reading the artifact, the label file, the step manifest,
the registry tables, and the Typst sections, then resolving dotted tokens with the
same longest-prefix rule the DOT generator uses (node, then boundary output, then
identity namespace; `constants.`/`functions.`/`row.` skipped). "Strict" means an
exact path match; "family" means a declared shorter base. Both are reported because
the difference is the finding (F7).

## Addendum (2026-11-25)

Recorded after the surface layer shipped; the body above is left as written.

- **F6 withdrawn.** The six `water.mash_adjustment.*` nodes are final-minus-source;
  the water card's `ionDelta` is post-dose-minus-target. Different quantities, so
  the UI is not duplicating the node. They stay report-only by design.
- **§B reduced to one accepted gap.** Six of the nine are family members read by
  the water card; `equipment.name` and `style.name` are identity families. Only
  `batch.late_addition_volume_l` is unreachable, and it is allowlisted with a
  reason in `data/report-parity.json`.
- **F12 closed.** The arithmetic-only nodes are now declared under `internal` in
  `data/surface.json`, so no node is unsurfaced by accident.
- **The layer is enforced.** `data/surface.json` holds the declarations, and four
  guards hold them: coverage and mutation, manifest parity, the report oracle, and
  the stage order.
