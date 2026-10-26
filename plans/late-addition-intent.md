# Late-addition intent pin — P3b commit contract

Status: **implemented** (P3b landed); the program closed at P3c, and the scale
pins/sugar successor is `plans/pin-matrix.md`.
Successor to `plans/attenuation-refactor.md` P3a (landed).

The design gate in `plans/attenuation-refactor.md` §"P3b" is resolved in this
document. Read this file before touching the P3b code; do not re-derive the
decisions.

## 1. Why

The batch solver is ABV-first: `target_abv` is its scale constraint, and total
grist is an output. Sugar is already an input (`s_late_add`), so "solve sugar
mass for a target ABV" has no residual — any dose hits the target by moving the
grist.

The missing degree of freedom is **composition**, and the variable already
exists inside the composition block: `sugar_share = s_late_add / E`. P3b makes
that share an authored constraint:

- **scale** = ABV (unchanged);
- **composition** = sugar extract ÷ total post-boil extract (new pin);
- the design intent is expressed the way brewers describe it ("about 10 %
  sugar"), and is batch-size independent;
- multiple late additions become one sugar-extract budget split by Hamilton
  proportions, so a Belgian dark strong can combine D-180 candi syrup and
  dextrose without a balancing-row rule.

## 2. Decisions (locked)

1. **Batch-level mode, not per-row annotation.** `dose | share` selects which
   quantity is authored. This supersedes the earlier per-row answer; mixing
   authored mass and authored parts in one table is not a design goal.
2. **Share basis.** `sugar_extract_share = sugar extract / total post-boil
   extract`, a fraction in `[0, 1)`. It is *extract*, not fermentable extract
   and not grist mass. The UI shows the fermentable share as a readout.
3. **Wire.** `sugar_extract_share` is a `BatchSolverRequest` field. `0` means
   "dose mode" (the solver uses `s_late_add`); `> 0` means share mode (the
   solver evaluates `S = share · E(OE)` per candidate). No host-side inversion.
4. **Share mode covers fully fermentable sugars only** (`F = 1.0`, today's
   late-extract model). A non-fermentable late addition (lactose) belongs to
   dose mode; per-sugar `F` on the wire is deferred.
5. **Rows carry both representations.** `mass_kg` (authored dose) and `parts`
   (share weights) persist; the active mode decides which is authored. Share
   mode derives `resolved_mass_kg`; it never overwrites `mass_kg`.
6. **Hamilton allocation of extract.** Normalize `parts` over the share rows
   with the existing Hamilton largest-remainder helper (0.1 %); each row's
   extract is `pct × budget`, and `resolved_mass_kg = extract / yield`. The
   budget is `share × E`; the pct sums to exactly 1, so the extract splits
   exactly.
7. **Mode is persisted** as a choice root (`batch.late_addition_intent`,
   taxonomy `late_addition_intent`: `dose`, `share`). The share root defaults to
   `0`; both boundary inputs are always numeric (the engine treats `null` as
   "not ready", so never send null).
8. **Switch semantics.** First `dose → share` seeds the share from the current
   dose (`s_late_add / E`) and seeds `parts` from each row's current extract
   (`mass × yield`, Hamilton-normalized). After that, switching does not
   overwrite either side: both authored states round-trip exactly, with no
   materialization and no rounding drift. Explicit "adopt current dose" and
   "adopt share" actions re-sync on request.
9. **ABV remains the scale pin in P3b.** OG/FG pins are added by the successor
   `plans/pin-matrix.md`; the share remains orthogonal to the scale axis.
10. **One partial.** `step-late-additions.html` renders both modes from
    mode-aware columns/inputs; `modal-sugar-editor.html` edits `parts` in share
    mode and shows mass read-only. No second template.
11. **Freeze is self-describing.** The batch rows persist the share, parts, and
    resolved masses; a frozen bundle never re-solves. The share and parts are
    the intent; `resolved_mass_kg` is the recorded result.

## 3. The model

For a candidate `OE`, with `E = post_boil_extract_target(SG(OE), V_cold, gamma)`
and `s = sugar_extract_share`:

```
S      = s · E
M      = (1 − s) · E
UE     = M·(1 − F_malt_eff)·(1 − d) + S·(1 − F_sugar)     # F_sugar = 1
RE     = OE · UE / E
AE     = inverse_cutaia(RE)
ABV    = Cutaia(OE, AE)
```

This is the D1 composition block with `s_late_add := s·E`. **No equation
changes.** The only new work is *where S comes from*: Phase 1 computes it per
candidate instead of taking the input scalar.

`0 < s < 1`; `s = 1` is malt-free and must raise. The UI bounds the root to a
practical maximum (0.95) and warns above 0.90.

## 4. Artifact and wire

| Item | Change |
|---|---|
| taxonomy `late_addition_intent` | `["dose", "share"]` |
| root `batch.late_addition_intent` | choice, default `dose` |
| root `batch.sugar_extract_share` | percentage, default `0`, domain `[0, 0.95]` |
| derived `batch.s_late_add_request` | `if mode == "share" then 0 else s_late_add` |
| derived `batch.sugar_share_request` | `if mode == "share" then share else 0` |
| `solver.batch.inputs` | `s_late_add` → `batch.s_late_add_request`; add `sugar_extract_share` → `batch.sugar_share_request` |
| derived `batch.sugar_extract_total` | `if mode == "share" then share · solver.batch.s_post_boil_target else s_late_add` (display/effect input) |
| `primitive_schemas.sugar_row` | add `parts` (dimensionless), `resolved_mass_kg` (mass) |
| `primitive_schemas.grist_row` | no change |
| `BatchSolverRequest` / `BatchSolverInput` | `sugar_extract_share: float = 0.0` (0 = dose) |
| error surface | `INVALID_SUGAR_SHARE` (≤ 0 when share mode is intended? no: 0 is dose; the code is for `s ≥ 1` / non-finite) |
| findings | `sugar_share_without_sugar` (share > 0, no sugar rows), `sugar_share_high` warning (> 0.90) |

The request always carries both numeric fields. `sugar_extract_share = 0` is
the dose sentinel; the solver branches on `> 0`.

**Threading S.** The share-derived S is not just a Phase 1 input: it must reach

- `resolve_volumetric_reversal` (the `v_bar · S_late` pre-boil displacement),
- `solve_grist_mass` and `grist_mass_residual` (`S_post_target − S_late`),
- `_diagnose_bracket` (capacity diagnosis at the bracket bound).

Compute `S = s · reversal.s_post_boil_target` once after the OE solve and pass
it through. The equations and the composition pipeline are unchanged; only the
source of `S_late` is.

## 5. UI

**Dose mode** (default): `Sugar · Mass · Yield · Fermentable · Color`; mass
editable; P3a's sugar-effect block unchanged.

**Share mode**: a batch "Sugar share" input (`% of extract`), then
`Sugar · Parts · Mass (derived) · Yield · Fermentable · Color`. `parts`
editable, mass read-only. Summary adds the share, the sugar budget (kg), and
each row's pct of the budget. The P3a effect block reads
`batch.sugar_extract_total` instead of `s_late_add`, so its deltas remain
meaningful.

Mode switching and first-switch seeding are host-side (registry/card), not
artifact expressions. The adopt actions are host actions.

## 6. Commit contract

**Context to read first** (only these):

- `plans/late-addition-intent.md` (this file) and the P3b/P3c sections of
  `plans/attenuation-refactor.md`;
- `backend/app/core/batch_solver.py` (`solve_oe_from_composition`,
  `resolve_wort_composition`, `_solve_pipeline`, `_diagnose_bracket`);
- `backend/app/schemas/boundary.py`, `backend/app/services/batch_solver_service.py`;
- `data/artifact.json` (`solver.batch.inputs`, `batch.s_late_add`,
  `primitive_schemas.sugar_row`, taxonomies, roots);
- `frontend/src/adapters/boundaryRequest.js`;
- `frontend/src/views/steps.js`, `views/registry/late-additions.js`,
  `views/hamilton.js`, `views/producer/{table,collection,valuation}.js`;
- `frontend/src/adapters/cards/late-additions.js`,
  `adapters/cards/catalogDraft.js`;
- `frontend/src/partials/{step-late-additions,modal-sugar-editor}.html`;
- `tests/backend/test_batch_solver.py`,
  `tests/backend/conformance/{test_composition_regimes,test_boundary_fixtures,test_boundary_output_parity,test_boundary_wire_contract,test_domain_codes}.py`;
- `tests/conformance/{boundary-fixtures.test.js,fixtures/{batch,boundary-wire-keys,canonical-json,report-bundle}.json}`;
- `tests/frontend/{card-display,step-boundaries,attenuation-display}.test.js`;
- `docs/attenuation-model.md`, `docs/fermentability-and-yield.md`,
  `docs/dag-artifacts/{domain-equations,grammar,node-reference}.md`,
  `docs/adsco/ui.md`.

**Owns:** the artifact roots/taxonomy/boundary input/derived input nodes and
the sugar_row fields; the solver's Phase 1 share branch and the S threading
through Phases 2–4; the boundary request field and its Pydantic/parity
plumbing; the request builder; the late-addition UI, modal, registry and
Hamilton wiring; the new fixtures/tests; the docs listed above; generated
inventory/glossary/bundle fixture.

**Must not touch:** the composition equations (`UE`, `RE`, `AE`, `ABV`, the
Cutaia inversion); yeast/malt/sugar seeds; scrape sources; the dose-mode
numerics; P3a's effect decomposition beyond switching its sugar input to the
derived total; frozen-bundle code beyond its fixture.

**Gate:** `make generate`, `make verify`, `make verify-full`;
`git grep sugar_extract_share` has no stale allowlists; the default recipe's
numeric outputs are unchanged (the request gains two fields, the dose path is
byte-identical in results); the share fixture solves in one boundary call.

**Done when:** a designer can author "9 % of extract from sugar" with D-180 +
dextrose, see the per-row masses and the effect readout, switch modes and get
their authored dose back exactly, and freeze a self-describing batch.

## 7. Tests

1. **Share exactness.** One solve; `share × E` equals the returned sugar
   extract; `S/E == share` within solver tolerance; no host iteration.
2. **Hamilton split.** Two rows, non-round parts; pct sums to 1 at 0.1 %;
   `extract_i = pct_i × budget`; `mass_i = extract_i / yield`; the extract sum
   is exact.
3. **Belgian dark strong fixture.** D-180 candi syrup + dextrose, 9–12 % ABV,
   share mode. Assert the two masses differ by yield, the extract split follows
   parts, `grist.sugar_weighted_lovibond` uses the resolved masses, and the
   high-gravity capacity/finding path behaves.
4. **Mode round-trip.** Dose → Share → Dose restores both authored masses;
   Share → Dose → Share restores the share and both parts; first-switch seeding
   computes the share and parts from the current dose.
5. **Adopt actions.** Explicitly re-sync the other representation; no implicit
   overwrite.
6. **Freeze.** The frozen payload contains mode, share, parts, and
   `resolved_mass_kg`; no re-solve.
7. **Dose path unchanged.** Default recipe results identical; the new request
   fields are `s_late_add_request = s_late_add`, `sugar_extract_share = 0`.
8. **Guardrails.** `s = 1` raises; share mode with no sugar rows raises the
   finding; > 0.90 warns; non-numeric/missing rows are defensive.
9. **Effect readout.** P3a's deltas use the derived sugar total in share mode.

## 8. Risks

- **Feedback loop.** `resolved_mass_kg` is written after the solve; ensure the
  write does not retrigger `scheduleSolve`. Prefer computing it in the
  valuation and snapshotting it at freeze, or guard the write with an equality
  check and a "derived" flag.
- **Degenerate share.** As `s → 1` the malt target vanishes and the grist
  bracket degenerates. Guard at the solver (`s < 1`) and bound the UI (0.95),
  with a warning above 0.90.
- **Threading S.** Forgetting the share-derived S in `solve_grist_mass`,
  `_diagnose_bracket`, or the reversal produces a plausible-but-wrong batch.
  The default recipe (share = 0) will not catch it; the share fixtures must.
- **Rounding.** Allocate extract, not mass; masses are display values. Do not
  let rounded masses feed the next solve (they do not; the request carries the
  share).
- **P3a coupling.** Its effect decomposition currently reads `batch.s_late_add`;
  in share mode that node is the dose, not the effective sugar. Switch it to
  `batch.sugar_extract_total`.
- **Freeze compatibility.** Frozen batches embed their artifact; this commit
  must not attempt to re-solve old bundles.

## 9. Landing

Landed as P3b. The artifact roots, request field, solver share branch, host
allocation, mode switching, advisories, and freeze payload are in place. P3c
(`Close the attenuation refactor`) now closes the program.
