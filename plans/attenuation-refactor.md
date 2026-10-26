# Attenuation refactor — Passes 2 and 3

Status: planned. Successor to `plans/fermentability-provenance.md` (Pass 1,
landed). This document is the commit contract for the rest of the program: each
commit names the files to read first, the files it owns, what it must not touch,
and the gate that proves it.

Read this document, then only the context files listed for the commit you are
doing. Do not read the whole repository per commit.

## 1. Why

Pass 1 made the ingredient data honest. The solver still cannot represent three
of the four regimes that matter, and the fourth is accidental:

| Regime | Today |
|---|---|
| pure grist | works, but `F` is used as apparent attenuation while the sources publish a real fermentable fraction |
| grist + late additions | sugar F is hard-coded `1.0`; the yeast cap clamps the **blend**, so sugar cannot raise ABV |
| grist + diastaticus | unrepresentable: `min(AA_wort, cap)` cannot consume dextrins; `AE := OE(1−AA)` forces `AE ≥ 0`, so apparent attenuation can never exceed 1 |
| both | doubly wrong |

The inventory of the model's actors (OE, AE, AA%, ABV%, grist/late-add ratio) is
only coherent once extract composition is the primitive: `FE` and `UE` produce
alcohol and residual extract; `AE` and `AA` are derived and may cross 1/100 %.

## 2. Decisions (locked)

1. **Model in real, display in apparent.** Ingredient `F` is a mass fraction of
   its extract that is fermentable. The yeast's published attenuation is
   apparent and is converted where the model needs it. The UI shows apparent.
2. **Capture the basis.** `fermentability_basis ∈ real | apparent | unspecified`
   plus `fermentability_method` (verbatim, e.g. `IoB`, `Final attenuation`,
   `Fermentability % (un-boiled)`). Default `unspecified → real`, flagged.
3. **One conversion point for ingredients.** Apparent → real at a fixed 12 °P
   reference, host-side, in the request builder. The wire carries real `F`.
4. **The cap applies to malt only.** `F_malt_eff = min(F_malt, cap_real)`;
   sugar keeps its own `F`.
5. **Diastaticus is dextrin consumption.** `d = 1` iff `sta1 === true`, applied
   to the **malt** residue: `UE = E_malt·(1−F_eff)·(1−d) + E_sugar·(1−F_sugar)`.
   `sta1: null` models as `0` and raises an advisory. No curated `d` per strain.
6. **Priors are real-space values** derived from the old apparent observations
   at 12 °P: base 0.643, acid 0.635, crystal 0.398, roasted 0.121, sugar 1.000,
   default 0.643. Constant names stay `fermentability_prior_*`.
7. **Bounds are reported, not propagated.** A `min` remains a point in the
   solver; the bound travels in provenance and in the UI label.
8. **Wire renames land once, in D2:** `apparent_attenuation` → `malt_attenuation_cap`;
   `aa_wort`/`aa_batch` → `apparent_attenuation`/`real_attenuation`.
   Frozen bundles are unaffected (each embeds its own artifact).
9. **Documentation is part of each commit** (section 7).

## 3. The model

```
F_malt_eff = min(F_malt, cap_real(OE))          # cap converted per candidate OE
UE         = E_malt·(1 − F_malt_eff)·(1 − d) + E_sugar·(1 − F_sugar)
FE         = E − UE
RE         = UE                                  # real extract
ABW        = Cutaia(OE, AE)                      # solved jointly with RE
AE_app     = inverse(Cutaia RE regression)       # may be ≤ 0
AA_app     = (OE − AE_app) / OE                  # may exceed 1
ABV        = ABW · fg / 0.7907
```

The ABV-first inversion stays: root-find `OE` so `ABV(target)` holds, with the
composition block evaluated per candidate. `AE := OE(1−AA)` disappears.

**Regimes and the assertions that pin them** (D1 fixtures):

| Regime | Asserts |
|---|---|
| pure grist | unchanged for real-basis rows (round-trip identity at 12 °P) |
| + sugar (`F=1`) | `RE` flat, `OE↑`, `AA_app↑`, `ABV↑`; cap cannot suppress it |
| + STA1 (`d=1`) | `RE↓`; `AE_app` may go negative; `AA_app` may exceed 1 |
| + both | sugar adds `FE` only; `d` hits the malt residue only; no extra interaction |

## 4. Basis audit (result, lands in A5)

| Source | Basis | Method (verbatim) | Evidence |
|---|---|---|---|
| Bairds | real | `IoB` | extract 77.5 × 0.870 = 67.4 vs published fermentable extract 67.3 (4/4, Δ≤0.1) |
| Crisp | real | `IoB` | 78.6 × 0.872 = 68.5; PSY 410 laa/t ≈ 68.5 × 6.0 |
| Simpsons | real | `Fermentability % (un-boiled)` | 82.9 × 0.87 = 72.1; dry PSY 430 ≈ 72.1 × 5.96 |
| Briess extracts | real | `Fermentability` | vendor terminology; no yield published, assumption recorded |
| Dingemans | apparent (assumed) | `Final attenuation` | uniform `min 80.0 %` on 15 products; field corrupted on 19; 0.80 apparent → 0.635 real |

The old priors were apparent observations (they were used as `AA`). Converting
them preserves the current displayed behaviour within ±0.01, which is why the
default recipe barely moves while the 22 captured distilling malts move
substantially (real 0.87 displays as apparent ≈1.08).

## 5. Commit sequence

Ordering: A5 → D0 → D1 → D2 → D3; D4a → D4b → D5 in parallel after D1; P3a
after D2; P3b's design is closed (`plans/late-addition-intent.md`) and landed;
P3c closes the program.

### A5 — `Tag fermentability basis and method on the malt export`

Repo: `malt_database`. Depends on: Pass 1 (pushed).

- **Context:** `plans/import-contract.md`; `schema/malt.schema.json`;
  `schema/{bairds,crisp,simpsons,dingemans,briess}.schema.json`; `lib/malt.py`;
  `bin/unify.py`; `bin/check.py`; `README.md`; `data/source/` (read-only cache).
- **Owns:** those schemas; the four `bin/*.jq` extractors if the method label
  needs emitting; `lib/malt.py`; `bin/unify.py`; `bin/check.py`; `data/db` +
  `dist/malts.json` (regenerated); `README.md`; `plans/import-contract.md`.
- **Must not touch:** the consumer repo; the page cache (never staged).
- **Gate:** `make check`; the audit table above is the commit body's evidence;
  every non-null `fermentability_fraction` has `basis` + `method`.
- **Done when:** all 22 captured values are tagged, Dingemans is `apparent`,
  and the export validates.

### D0 — `Re-vendor the basis-tagged malt export`

Repo: `dag-calculator`. Depends on: A5.

- **Context:** `data/sources/malt-database-malts.json`;
  `data/sources/malt.schema.json`; `scripts/emit-sources-manifest.mjs`;
  `tests/guards/{fermentables-source-contract,sources-manifest}.test.js`;
  `scripts/build-fermentables-seed.mjs` (read only).
- **Owns:** the two vendored source files; `data/sources/manifest.json`.
- **Must not touch:** builders, seeds, artifact, frontend.
- **Gate:** `make check`; `git diff data/seeds/` is empty (the builder still
  ignores the new fields).
- **Done when:** contract and manifest pass and seeds are byte-identical.

### D1 — `Model extract composition and convert the fermentability basis`

Repo: `dag-calculator`. Depends on: D0. **The behaviour-changing commit.**

- **Context:** `backend/app/core/batch_solver.py`;
  `backend/app/core/utils.py`; `backend/app/services/batch_solver_service.py`;
  `backend/app/schemas/boundary.py` (read only — the wire is unchanged here);
  `data/artifact.json` (`constants`, `nodes["batch.yeast_cap"]`,
  `nodes["solver.batch"]`); `frontend/src/engine/ingredientPriors.js`;
  `frontend/src/adapters/boundaryRequest.js`; `scripts/build-fermentables-seed.mjs`;
  `tests/backend/test_batch_solver.py`; `tests/backend/conformance/test_batch_solver_*.py`;
  `tests/backend/conformance/test_recipe_smoke.py`;
  `tests/conformance/fixtures/{batch,numeric-parity,oracle-parity}.json`;
  `tests/conformance/emit-default-requests.mjs`;
  `docs/dag-artifacts/domain-equations.md` (§1–§2);
  `docs/fermentability-and-yield.md`; `plans/fermentability-provenance.md`.
- **Owns:** `backend/app/core/batch_solver.py`; `backend/app/core/utils.py`
  (inverse regression + negative-Plato path); `data/artifact.json` (prior
  **values**, row `fermentability_basis`/`fermentability_method` fields);
  `scripts/build-fermentables-seed.mjs` (carry basis + method);
  `frontend/src/adapters/boundaryRequest.js` (apparent→real conversion at 12 °P);
  `data/seeds/{malts,sugars,standard-malts}.json`;
  `tests/backend/conformance/test_composition_regimes.py` (new);
  `tests/backend/conformance/test_basis_conversion.py` (new);
  `tests/conformance/fixtures/*` and the oracle snapshot as regenerated;
  `docs/attenuation-model.md` (new, including the audit, the register, and the
  conversion error bound); `docs/dag-artifacts/domain-equations.md`;
  `docs/fermentability-and-yield.md`; `docs/dag-artifacts/inventory.md`
  (regenerated).
- **Must not touch:** wire field names; artifact node/output names; UI panels;
  yeast data.
- **Gate:** `make generate`, `make verify`; four-regime fixtures; the
  round-trip test (0.643→0.810, 0.398→0.500, 0.121→0.150); the conversion
  error bound asserted; `make verify-full` oracle delta explained in the body.
- **Done when:** regimes 2–4 are representable, prior-resolved recipes stay
  within the round-trip tolerance, and the captured distilling malts show
  apparent attenuation above 1.

### D2 — `Carry the malt attenuation cap and derived attenuation on the wire`

Repo: `dag-calculator`. Depends on: D1.

- **Context:** `backend/app/schemas/boundary.py`;
  `backend/app/services/batch_solver_service.py`;
  `frontend/src/adapters/boundaryRequest.js`;
  `frontend/src/views/registry/{batch,yeast}.js`;
  `frontend/src/views/steps.js`; `data/artifact.json` (`solver.batch` outputs,
  `batch.yeast_cap`); `tests/guards/{boundary-inputs,boundary-output-consumers,boundary-routes,stub-outputs}.test.js`;
  `tests/conformance/{boundary-fixtures.test.js,fixtures/batch.json,fixtures/boundary-wire-keys.json}`;
  `tests/backend/conformance/{test_boundary_wire_contract.py,test_boundary_output_parity.py}`;
  `docs/dag-artifacts/{grammar,node-reference}.md`; `docs/report-bundle-glossary.md`.
- **Owns:** the request field rename; the response output set; artifact nodes
  and readouts; registry labels and hints; wire/fixture/guard updates; generated
  inventory/glossary and the bundle fixture.
- **Must not touch:** the solver's internal pipeline; seeds; scrape sources.
- **Gate:** `make generate`, `make verify`; `git grep aa_wort` finds only the
  retired names in docs' history.
- **Done when:** the wire speaks `malt_attenuation_cap` and emits apparent and
  real attenuation; readouts match the new meanings.

### D3 — `Mark measured, assumed, and floored figures in the ingredient tables`

Repo: `dag-calculator`. Depends on: D2.

- **Context:** `frontend/src/views/steps.js`; `frontend/src/views/producer/table.js`;
  `frontend/src/views/registry/{fermentables,late-additions,yeast}.js`;
  `frontend/src/adapters/libraryUi.js`; `frontend/src/partials/{step-fermentables,step-late-additions,step-yeast}.html`;
  `tests/frontend/{card-display,water-card,step-boundaries}.test.js`;
  `docs/adsco/ui.md`; `docs/attenuation-model.md` (§register).
- **Owns:** column/readout rendering, labels, the `≤ 1.000` FG policy, tests,
  `docs/adsco/ui.md`.
- **Must not touch:** solver, wire, seeds.
- **Gate:** `make verify`; a display test for each of: captured real, captured
  apparent, floored (`min`), prior.
- **Done when:** no assumption is rendered as data and `min` reads as a floor.

### D4a — `Add the vendor yeast source contract`

Repo: `dag-calculator`. Depends on: D1 (numbers), independent of D2/D3.

- **Context:** `scripts/scrape/yeast_scraper.py`;
  `data/sources/beer-analytics-yeasts.json`; `scripts/emit-sources-manifest.mjs`;
  `tests/guards/{sources-manifest,seed-rebuild}.test.js`;
  `scripts/build-yeasts-seed.mjs`; `data/artifact.json` (`primitive_schemas.yeast`);
  `docs/fermentability-and-yield.md`.
- **Owns:** new per-vendor scraper(s) and a committed vendor source with a
  pinned schema + contract guard; per-page hashes and `retrieved_at`; manifest.
- **Must not touch:** the seed builder, seeds, the solver.
- **Gate:** `make check`; seeds byte-identical; every vendor entry carries
  `url` + page `sha256`; `sta1` is tri-state.
- **Done when:** STA1 and attenuation low/high are captured with citations.

### D4b — `Consume vendor yeast ranges and STA1 in the seed`

Repo: `dag-calculator`. Depends on: D4a.

- **Context:** `scripts/build-yeasts-seed.mjs`; `data/sources/` (vendor +
  aggregator); `data/artifact.json` (`primitive_schemas.yeast`);
  `tests/guards/seed-rebuild.test.js`; `tests/conformance/seed-conformance.test.js`.
- **Owns:** the yeast builder; `data/seeds/yeasts.json`; yeast schema fields
  (`attenuation_low_pct`, `attenuation_high_pct`, `attenuation_basis`, `sta1`,
  provenance); the assumption register rows for ranges/STA1.
- **Must not touch:** the solver, wire, UI.
- **Gate:** `make generate`, `make verify`; seed diff is explainable row-by-row
  (high end as cap, tri-state `sta1`).
- **Done when:** ranges and STA1 are in the seed with vendor provenance.

### D5 — `Model diastaticus as dextrin consumption`

Repo: `dag-calculator`. Depends on: D4b and D2.

- **Context:** `backend/app/core/batch_solver.py` (the `d` argument from D1);
  `backend/app/schemas/boundary.py`; `frontend/src/adapters/boundaryRequest.js`;
  `data/artifact.json` (`batch.yeast.sta1`, `batch.yeast_cap`);
  `frontend/src/views/registry/findings.js`;
  `tests/guards/{findings-registry,artifact-consumers}.test.js`;
  `tests/backend/conformance/test_composition_regimes.py`;
  `docs/attenuation-model.md`.
- **Owns:** the `sta1` wire field and artifact node; `d` wiring; the unknown-STA1
  advisory (findings registry + relation if blocking); tests; docs.
- **Must not touch:** the composition pipeline itself; seeds; scrape sources.
- **Gate:** `make generate`, `make verify`; regime 3/4 fixtures at the wire
  level; an unknown-STA1 advisory test.
- **Done when:** STA1 producers attenuate the malt residue, and unknown status is
  never silent.

### P3a — `Surface the sugar effect and the extract share`

Repo: `dag-calculator`. Depends on: D2.

- **Context:** `frontend/src/views/producer/{valuation,table,scalar}.js`;
  `frontend/src/views/steps.js`; `frontend/src/views/registry/late-additions.js`;
  `frontend/src/partials/step-late-additions.html`;
  `frontend/src/adapters/boundaryRequest.js`;
  `tests/frontend/{card-display,step-boundaries}.test.js`;
  `docs/adsco/ui.md`.
- **Owns:** the sugar share and ΔOG/ΔFG/ΔABV/Δgrist readouts; tests; docs.
- **Must not touch:** the solver, wire, seeds.
- **Gate:** `make verify`; the readout is derived, not persisted.
- **Done when:** a designer sees what the current sugar dose is doing without
  changing the pin.

### P3b — `Add the late-addition intent pin` (design closed)

Repo: `dag-calculator`. Depends on: P3a. **The commit contract is
`plans/late-addition-intent.md`; do not start it from this summary.**

The design gate is resolved:

1. affordance — a batch-level `dose | share` mode (per-row annotation
   superseded);
2. free variable — the sugar share of **total post-boil extract**, with
   Hamilton allocation of the sugar extract among late-addition rows;
3. inversion site — a **wire field** (`sugar_extract_share`, `0 = dose`), solved
   in Phase 1; the host derives row masses after the solve.

ABV remains the scale pin; OG-pinned mode is deferred. Implementation landed;
P3c closes the program.

### P3c — `Close the attenuation refactor`

Repo: `dag-calculator` (and a status line in `malt_database`). Depends on: all.

- **Owns:** this plan's status, `TODO.md`, the register's final state,
  cross-links from `docs/attenuation-model.md`.
- **Gate:** `make verify`.

## 6. Context discipline

- One repo per commit. Producer first (A5), then the consumer chain.
- D0 is data-only and must leave seeds byte-identical; D1 is the only commit
  that may change solver numerics; D2 is the only commit that may rename the
  wire.
- Generated artifacts are regenerated in the commit that invalidates them
  (`make generate` for the artifact, manifest when a source changes, the bundle
  fixture with the artifact).
- Each commit body states the expected numeric delta and why.
- Do not re-derive the model in a commit: the model lives in
  `docs/attenuation-model.md`; the code implements it.

## 7. Documentation per commit

| Commit | Docs |
|---|---|
| A5 | producer `README.md`, `plans/import-contract.md`, audit table |
| D1 | **new** `docs/attenuation-model.md`, `domain-equations.md` §1–§2, `fermentability-and-yield.md` (drop "Congress"), inventory |
| D2 | `grammar.md`, `node-reference.md`, glossary, readout hints |
| D3 | `docs/adsco/ui.md` |
| D4a | source-contract section + manifest |
| D4b | `fermentability-and-yield.md` (ranges, STA1), register |
| D5 | register A4–A6, advisory docs, `findings` messages |
| P3a | `docs/adsco/ui.md`, register A8/A11 |
| P3c | status + cross-links |

## 8. Assumption register (initial; lives in `docs/attenuation-model.md`)

| # | Assumption | Treatment | Enforcement |
|---|---|---|---|
| A1 | basis unknown for a source | `unspecified → real` | tagged row; audit table |
| A2 | ingredient conversion at fixed 12 °P | max ΔAA across 8–24 °P documented | `test_basis_conversion.py` |
| A3 | yeast attenuation is apparent | converted in the solver per OE | regime fixtures |
| A4 | STA1 = full dextrin consumption | `d=1`, malt residue only, time ignored | regime fixtures |
| A5 | `sta1: null` | `d=0` + advisory | advisory test |
| A6 | sugar immune to `d` | lactose stays unfermented | regime fixture |
| A7 | priors are converted apparent observations | values + round-trip | round-trip test |
| A8 | bounds reported, not propagated | `min` = point in the solver | display test |
| A9 | trace malts colour-only | no extract, no AA | existing guard |
| A10 | hot-side sugar displacement unmodelled | bounded by `v_bar·s_late_add` | doc only |
| A11 | `AE_app ≤ 0` | computed and displayed (`≤ 1.000`) | display test |
| A12 | frozen bundles never re-solve | embedded artifact | bundle guard |
| A13 | derate points apply before conversion | order stated | solver test |
| A14 | vendor ranges use the high end | low/high stored | seed test |
| A15 | Cutaia inverse vs mass-derived RE | residual asserted | parity test |

Executable claims: A2, A7, A15 are asserted by tests; a docs guard checks every
register row names an existing test file.

## 9. Risks

- **Numeric recalibration:** prior-resolved recipes should move only within the
  round-trip tolerance; captured distilling malts move a lot (correctly). The
  oracle snapshot is regenerated with the delta in the commit body. Frozen
  batches are unaffected; drafts re-solve on load.
- **Style conformance:** realized OG/FG/ABV shift, so `holds` flags and the
  style ray may move. Covered by D1's fixture updates; call out in the body.
- **Wire break (D2):** old clients would send `apparent_attenuation`; there are
  no old clients outside this repo, and bundles embed their artifact.
- **Scrape fragility (D4a):** vendor PDFs/HTML change; per-page hashes and a
  pinned contract guard make drift loud.
- **Dingemans basis:** assumed apparent; if a spec sheet later says real, the
  tag changes and its 15 rows re-resolve — recorded as a named risk.

## 10. Out of scope

- Time-dependent diastaticus kinetics (limit model only).
- Interval arithmetic for bounds.
- Hot-side late-addition volume displacement.
- Re-solving frozen batches under a newer artifact (fork + re-freeze instead).
