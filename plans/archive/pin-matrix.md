# Scale pins and sugar data — commit contract

Status: **landed**. P1–P4 are in. The sugar database and effective
fermentability landed first; the three scale pins and preview block landed next;
the pin matrix and Style-card rework followed; this commit closes the feature.
Successor to `plans/archive/attenuation-refactor.md` (closed at P3c) and
`plans/archive/late-addition-intent.md` (P3b, landed).

This document is the executable contract for the next feature: an audited sugar
database, an effective late-addition fermentability on the wire, three scale
pins (ABV / OG / FG), and a live pin-preview matrix in the Late Additions card.

Read this document, then only the context files listed for the commit you are
doing. Do not read the whole repository per commit.

## 1. Why

The solver is ABV-first. That is one of three coherent recipe modes:

- pin ABV, solve OG/FG (today);
- pin OG, solve ABV/FG;
- pin FG, solve OG/ABV.

At the same time the sugar data is not honest enough for any of them. The wire
carries `s_late_add = Σ mass × yield` and the solver assumes every late addition
is fully fermentable. Dextrose monohydrate, liquid invert, candi syrup, molasses
and lactose are therefore mis-modelled in both dose and share modes. The sugar
seed also conflates as-is and dry basis and ADF with RDF.

## 2. Decisions (locked)

1. **Three recipe pins, one composition axis.** `batch.scale_pin ∈
   {abv, og, fg}`; dose/share remains a separate, orthogonal choice.
2. **Three persisted targets.** `batch.target_abv` (exists), `batch.target_og`,
   `batch.target_fg`. Roots default directly from the immutable style identity
   (midpoints); no style-change path exists.
3. **Active target editing on the Style card.** The Style card owns the pin
   selector, the active target input, the style reset, and the graph. The Late
   Additions panel is a read-only preview; it never edits the pin or target.
4. **Preview matrix.** One backend preview call returns three lightweight rows
   (OG/FG/ABV + status) when sugar is authored; no sugar means no preview
   solves. Rows are read-only previews at their own persisted targets; the
   active row is the batch. No auto-suggest.
5. **Panel behaviour.** The matrix expands when sugar is first authored and
   collapses when no sugar contributes (active sugar extract ≤ 0). The Late
   Additions card and its “Configure Sugars” button never go away. The Style
   card always exposes the active pin and target, so the pin is reachable for
   the ~85% of batches with no sugar.
6. **Warnings only.** Style envelope conflicts never block the solve or freeze.
7. **Composition is held in the authored representation.** Previews hold the
   authored dose in dose mode and the authored extract share in share mode; the
   caption states which.
8. **Sugar fermentability is one effective scalar.** `F_eff` is the
   extract-weighted real fermentability of the blend. It is computed from the
   sugar rows and sent on the wire; the solver applies it to the whole late
   extract.
9. **Mixed blends are allowed in share mode.** Lactose + molasses is
   representable; the share is total sugar extract, not fermentable extract.
   `parts` allocate extract, not mass.
10. **Sugar data is an in-repo, documented source file.** `data/sources/
    sugar-fermentability.json` + pinned schema + contract guard +
    `docs/sugar-database.md`. Null-fill only; conflicts go to review.
11. **Three-tier source, two-axis solver.** Store dry matter, extract
    efficiency, PPG/L°/kg, RDF, ash and carbohydrate profile for audit; derive
    only `yield_fraction` and `fermentability_fraction` for the seed. The solver
    never consumes ash or the carbohydrate profile.
12. **RDF is required; ADF is reference only.** Never run a sugar ADF through
    the malt 12 °P conversion. Pure sugar RDF is 1.0 even when its apparent
    attenuation exceeds 1.0.
13. **Canonical constants.** `385.641 L°/kg`, `8.3454`, `46.21 PPG`. The
    database's derived PPG/L°/kg must agree; no `383.8` / `8.3275`.
14. **RDF ranges use the midpoint** as the solver point, with the range retained
    in provenance and shown in the UI.
15. **Belgian knob removed.** It is a special-case ADF/sucrose advisory. The
    general ABV+FG composition-solving mode is deferred; the Style card becomes
    pin-aware and drops the unconditional fixed-AA ray.
16. **Documentation is part of each commit.**

## 3. The model

```
scale pin ∈ {abv, og, fg}          # active constraint
composition ∈ {dose, share}        # authored sugar representation

F_eff = Σ(extract_i · F_i) / Σ(extract_i)     # real, blend-weighted
UE    = E_malt·(1 − F_malt_eff)·(1 − d) + S_total·(1 − F_eff)
```

- Dose: `S_total = s_late_add`; previews hold that mass.
- Share: `S_total = share · E(OE)`; previews hold that share.
- ABV pin: root-find `OE` so ABV(target) holds.
- OG pin: `OE` is the target; solve the extract/grist balance.
- FG pin: root-find `OE` so apparent extract (FG) holds.
- Previews evaluate the same composition and target per pin, skipping grist and
  cascade.

Sign of a sugar-share increase at each pin:

| Pin | OG | FG | ABV | Style risk |
|---|---|---|---|---|
| ABV | ↓ | ↓ | = | OG/FG below floors |
| OG | = | ↓ | ↑ | ABV above band; FG below floor |
| FG | ↑ | = | ↑ | OG/ABV above bands |

## 4. Sugar source contract

`data/sources/sugar-fermentability.json` rows:

```jsonc
{
  "id": "d-180-candi-syrup",
  "name": "D-180 Candi Syrup",
  "aliases": ["belgian-candi-syrup-extra-dark"],
  "form": "liquid",
  "dry_matter_fraction": 0.775,
  "extract_efficiency_factor": 0.983,
  "ppg_as_is": 35.2,
  "l_deg_per_kg": 293.8,
  "rdf": 0.86,
  "rdf_min": 0.84,
  "rdf_max": 0.88,
  "sulfated_ash_fraction": null,
  "carbohydrate_profile": null,
  "basis": "real",
  "method": "vendor attenuation spectrum",
  "provenance": { "vendor": "Candi Syrup, Inc.", "url": "...", "retrieved_at": "...", "sha256": "..." }
}
```

Rules:

- `form` distinguishes dry crystal from liquid syrup.
- `dry_matter_fraction × extract_efficiency_factor` must equal
  `ppg_as_is / 46.21` within the declared tolerance.
- `l_deg_per_kg = ppg_as_is × 8.3454`.
- `rdf` is real; `rdf_min/max` are the published range; the seed uses the
  midpoint and keeps the range in `fermentability_provenance`.
- Every row cites a primary TDS/COA and a page hash.
- Overlay is **null-fill only**: an existing non-null seed value wins; a
  conflict is listed for review, never silently overwritten.
- Definitional rows: lactose `rdf = 0`; sucrose/dextrose anhydrous/invert
  (pure) `rdf = 1`; dextrose monohydrate `yield = 0.909`, `rdf = 1`.
- The seed stores `yield_fraction = dry_matter_fraction ×
  extract_efficiency_factor` and `fermentability_fraction = rdf`.

## 5. Commit sequence

### P1 — `Vendor the audited sugar database and effective fermentability`

Repo: `dag-calculator`. The prerequisite for every pin.

- **Context:** `scripts/build-fermentables-seed.mjs`; `data/sources/
  manifest.json`; `scripts/emit-sources-manifest.mjs`;
  `tests/guards/{seed-rebuild,sources-manifest,fermentables-source-contract}.test.js`;
  `data/seeds/sugars.json`; `data/artifact.json` (`sugar_row`,
  `solver.batch.inputs`, `constants`); `frontend/src/adapters/
  boundaryRequest.js`; `backend/app/core/batch_solver.py`;
  `backend/app/schemas/boundary.py`; `backend/app/services/
  batch_solver_service.py`; `tests/backend/conformance/
  test_composition_regimes.py`; `tests/conformance/fixtures/{batch,
  boundary-wire-keys,report-bundle}.json`; `docs/attenuation-model.md`;
  `docs/fermentability-and-yield.md`.
- **Owns:** new `data/sources/sugar-fermentability.json` + schema + guard +
  `docs/sugar-database.md`; seed overlay; sugar seed; artifact
  `batch.sugar_fermentability_effective` + `solver.batch` input; wire
  `sugar_fermentability`; solver input; fixtures/tests/docs.
- **Must not touch:** the scale-pin model; the UI pin matrix; yeast data.
- **Gate:** `make generate`, `make verify`; sugar contract guard; a mixed
  lactose/molasses wire test; the default recipe unchanged; the seed diff
  explainable row-by-row.

### P2 — `Add scale pins and the preview block`

Repo: `dag-calculator`.

- **Context:** P1 artifact/wire state; `backend/app/core/batch_solver.py`;
  `backend/app/schemas/boundary.py`; `backend/app/services/
  batch_solver_service.py`; `data/artifact.json` (`solver.batch`, taxonomies,
  roots); `frontend/src/adapters/boundaryRequest.js`;
  `frontend/src/adapters/stubBoundaries.js`; `tests/backend/conformance/
  {test_batch_solver_*,test_composition_regimes,test_boundary_*}.py`;
  `tests/conformance/fixtures/*`; `docs/dag-artifacts/domain-equations.md`.
- **Owns:** `scale_pin` taxonomy/root; `target_og`/`target_fg` roots;
  boundary inputs `scale_pin`/targets; `previews` output + row schema; OG-first
  and FG-first inversions; preview solver (no grist/cascade); error codes;
  fixtures/tests.
- **Must not touch:** sugar source/seed; UI panel; Style card.
- **Gate:** `make generate`, `make verify`; three pin regimes; preview parity;
  infeasible FG; default ABV path byte-identical.

### P3 — `Surface the pin matrix and remove the Belgian knob`

Repo: `dag-calculator`.

- **Context:** `frontend/src/partials/{step-late-additions,step-style}.html`;
  `frontend/src/adapters/cards/{late-additions,style}.js`;
  `frontend/src/views/{steps.js,registry/late-additions.js,
  registry/style.js,registry/presentation.js}`; `frontend/src/adapters/
  draftEditor.js`; `frontend/src/engine/fermentation.js`;
  `tests/frontend/{style-card,belgian-knob,late-addition-intent,
  attenuation-display}.test.js`; `docs/adsco/ui.md`.
- **Owns:** the collapsible 3×3 read-only matrix, red/green states and
  composition caption in Late Additions; Style-card pin selector, active target
  input, style reset, pin-aware graph, and Belgian-knob removal.
- **Must not touch:** solver, wire, seeds.
- **Gate:** `make verify`; matrix states; active pin changes; no-style branch
  absent; knob gone; ABV-only path unchanged.

### P4 — `Close the scale-pin feature`

- **Owns:** plan status, `TODO.md`, cross-links, final register.
- **Gate:** `make verify-full`.
- **Landed:** this commit.

## 6. Context discipline

- One commit per concern. P1 is data + wire only; P2 is solver + wire; P3 is UI.
- Do not re-derive the model in a commit; it lives here and in
  `docs/attenuation-model.md`.
- Generated artifacts are regenerated in the commit that invalidates them.
- Each commit body states the expected numeric delta and why.

## 7. Out of scope

- ABV+FG and OG+FG composition-solving modes.
- Time-dependent diastaticus kinetics.
- Interval arithmetic for RDF bounds.
- Hot-side late-addition volume displacement.
- Fermentation-space graph upgrade (real scales, palette); the graph stays,
  becomes pin-aware, and is upgraded later.

## 8. Landing notes

- The sugar overlay is null-fill only. Twelve non-null seed yields still
  disagree with the audited source (corn sugar, invert, candi syrups, molasses,
  maple, corn syrup) and are kept for review; the seed diff fills the missing
  RDFs (lactose 0, molasses 0.80, candi/invert ranges) and the missing rice
  syrup yield. The conflicts are printed by every seed build and listed in
  `docs/sugar-database.md`.
- Sugar provenance hashes are citation fingerprints of the vendor/method tuple
  until page bytes are captured; the source manifest pins the committed file.
- The preview block is one `solver.batch` call when sugar is authored; no-sugar
  batches skip the three preview solves. The active ABV path and the oracle are
  unchanged.
- The Belgian knob and its helper are removed; the ABV+FG composition-solving
  mode remains deferred.
- The Style card owns the pin selector, active target, and style reset; the
  Late Additions panel is read-only, so the pin remains reachable for batches
  with no sugar.
