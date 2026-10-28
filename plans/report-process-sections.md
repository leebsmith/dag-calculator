---
title: Report process sections — Brewhouse, Liquor Ledger, fermentable readouts
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [report-renderer, report-bundle]
blocks: []
gate: a frozen bundle renders a Brewhouse section (process inputs plus the conversion/brewhouse efficiency pair) and a Liquor Ledger that closes on the sparge demand, from values the bundle already carries; the generator stays numeric-free
status: implemented (phase 1 and phase 2)
---

# Report process sections

The report can explain *what* a batch is and *what it produced*, but not *how it
was run*. Conversion efficiency, mash thickness, runoff ratio, boil time, boil-off
rate, grain moisture, and the whole HLT budget are invisible. This plan adds two
sections — **Brewhouse** and **Liquor Ledger** — plus the two boundary outputs and
one authored target they need.

Read this before touching the process sections; do not re-derive the decisions.

---

## 1. Decisions (settled)

| # | Decision |
|---|---|
| 1 | **Brewhouse is the first section.** Registry order becomes `brewhouse`, `batch-facts`, `yeast`, `volume-ledger`. |
| 2 | **Brewhouse contents** — target ABV, topology, conversion efficiency, brewhouse efficiency, mash thickness, runoff ratio, boil time, boil-off rate, grain moisture. All defaulted roots except the two efficiencies. |
| 3 | **Liquor Ledger is last**, titled *Liquor Ledger* (not "HLT"), and is process-ordered: fill → first underlet → after strike → top-up → debt → salted sparge → second underlet → surplus. |
| 4 | **No dedicated Boil section yet.** Boil time and rate are Brewhouse fields; volumes are the ledger; hops are candidate sections of their own. Pre-boil gravity joins the solver-results line instead. |
| 5 | **`v_hlt_target` and `v_hlt_required` become boundary outputs.** `docs/calculator-assumed-dosing-practice.md` already names `solver.batch.hlt.v_hlt_target`; today the value is computed and discarded. |
| 6 | **Sparge water temperature is an authored, display-only target** — `batch.sparge_water_temp_c`, default 76 °C. Heating and cooling are not modelled: the HLT is heated to strike temperature, the top-up is cold, and the model cannot say what the sparge temperature actually is. The report prints the *target*. |
| 7 | **Brewhouse efficiency is a boundary output**, malt-only: extract into the fermenter ÷ the grist's potential extract. Late additions are excluded from the numerator, the denominator, and the volume basis. |
| 8 | **The generator stays numeric-free.** Both sections print frozen `formatted` strings; the efficiency pair and the HLT volumes are formatted at freeze. |
| 9 | **Presence** — Brewhouse keys off `batch.conversion_efficiency` (absent only on a thin/older bundle, which gives the fixture its absent case); Liquor Ledger keys off `solver.batch.hlt.v_hlt_debt`. |

---

## 2. Brewhouse efficiency — definition, not identity

Let

- `E = Σ wᵢ·yieldᵢ·(1 − mcᵢ)` — composite dry-basis yield (`composite_yield_fraction`);
- `M = M_grist` — solved dry grist mass;
- `S_kettle = extract_total_kg − sugar_extract_kg` — malt extract recovered in the kettle;
- `V_ferm` — fermenter volume; `V_cold` — cold post-boil volume **including** the
  late-addition volume, i.e. the ledger's basis `(V_post + late)·(1 − shrink)`.

Then

```
BE = (S_kettle · V_ferm / V_cold) / (M · E)
```

**It is not `η_conv · V_ferm/V_cold`.** Lauter retention is already inside
`M_grist`: `grist_mass_residual` solves `M` so the *recovered* kettle extract hits
the target, accounting for absorption, tun dead space and hose transfer. `M·E` is
therefore larger than `η_conv·E·M` by the retention, and `BE < η_conv` for every
batch. A test must pin a computed value, not an identity.

**Resolved at implementation:** the recovery ratio uses the solver's
`v_kettle_cold = V_ferm + dead·(1 − shrink)`, not the ledger's larger cold volume.
The extract target is defined on that basis, so mixing in the ledger's basis would
charge transfer and trub against extract a second time — the model treats those as
volumetric losses that never enter the extract chain. Recorded in
`domain-equations.md` §2.6.

---

## 3. HLT budget — what the ledger prints

```
v_hlt_debt          = hlt_dead_space + hlt_transfer_loss
v_hlt_after_strike  = hlt_starting_volume − v_strike
v_hlt_required      = sparge_demand + v_hlt_debt
v_hlt_target        = max(hlt_coil_floor, v_hlt_required)
v_hlt_top_up        = max(0, v_hlt_target − v_hlt_after_strike)
v_sparge_deliverable = v_hlt_after_strike + v_hlt_top_up − v_hlt_debt
```

All six are outputs as of commit 1. `required` is exposed to name the sparge
demand behind the target but is not printed: it equals the target unless the coil
floor binds. The ledger closes:
`fill − strike = after_strike`; `after_strike + top_up = target`;
`target − debt = deliverable`.

---

## 4. Layouts

```
Brewhouse
- Target ABV            5.5%
- Topology              Liquor-to-grist ratio
- Conversion efficiency 90.0%
- Brewhouse efficiency  81.9%
- Mash thickness        3.0 L/kg
- Runoff ratio          1.50
- Boil time             60 min
- Boil-off rate         3.0 L/hr
- Grain moisture        4.0%

  Conversion efficiency is mash recovery; brewhouse efficiency is malt extract
  into the fermenter and includes tun and kettle losses. Late additions are
  excluded from both sides of the brewhouse figure.
```

```
Liquor Ledger
HLT fill (heated to 68.3 °C)   30.0 L
First underlet                (15.0) L
HLT after strike               15.0 L
Top-up (cold) to 18.2 L          3.2 L
HLT debt                      (1.0) L
Second underlet (target 76.0 °C) 17.2 L
Surplus                          0.0 L
```

The ledger uses the volume ledger's accounting idiom: subtractions in
parentheses, bold intermediate totals (after strike, deliverable). The sparge
temperature rides on the second-underlet row as a *target*, never as an actual.

---

## 5. Data prerequisites

| Value | Path | State |
|---|---|---|
| HLT target | `solver.batch.hlt.v_hlt_target` | landed (commit 1) |
| HLT required | `solver.batch.hlt.v_hlt_required` | landed (commit 1) |
| Brewhouse efficiency | `solver.batch.brewhouse_efficiency` | landed (commit 1) |
| Sparge water temperature | `batch.sparge_water_temp_c` | landed (commit 2), default 76 °C |
| HLT fill / debt / after strike / top-up / deliverable | `batch.hlt_starting_volume_l`, `solver.batch.hlt.*` | exist |
| Strike draw | `solver.batch.cascade.v_strike` | exists |
| Salted sparge volume, surplus | `batch.sparge_salted_volume`, `batch.surplus_sparge_capacity` | exist |
| Coil floor, max HLT, HLT losses | `equipment.*` identity | exist |
| Strike temperature | `mash.strike_water_temp_c` | exists |
| Pre-boil gravity | `solver.batch.cascade.sg_pre_boil` | exists |
| Process inputs (ABV target, topology, conversion, thickness, runoff, boil time/rate, moisture) | `batch.*` | exist |

The conformance fixture currently carries none of the HLT outputs, `sg_pre_boil`,
the new root, or the HLT equipment fields — all four need enriching.

---

## 6. Commit sequence

### Commit 1 — boundary outputs
`v_hlt_target`, `v_hlt_required`, `brewhouse_efficiency`.

- `HltWaterBudget` fields, `resolve_hlt_water_budget` return, `BatchHltOutputs`,
  `BatchSolverResponse`, `_to_response`, artifact `solver.batch.outputs`.
- Five parity fixtures (`boundary-fixtures.test.js`, `emit-default-requests.mjs`,
  `style-card.test.js`, the report fixture emitter, smoke/orchestration tests).
- Conformance: a known input pins the BE value and asserts `BE < η_conv`.
- Docs: `domain-equations.md` §2.5–2.6 and the HLT section;
  `calculator-assumed-dosing-practice.md` (its `v_hlt_target` claim becomes true);
  inventory.

Gate: `make test`.

### Commit 2 — authored target and app readout
- `batch.sparge_water_temp_c` root + `default_sparge_water_temp_c` (76 °C,
  domain 40–100 °C), Batch Sparge step field (generic `step-card`, not the bespoke
  mash partial), registry label and hint.
- Brewhouse efficiency readout in the same step, beside conversion efficiency.
- `adding-a-node` note: the sparge temperature is display-only, like target ABV.

Gate: `make generate`, `make test`.

### Commit 3 — report sections
- Brewhouse section (registry first), Liquor Ledger (last).
- Pre-boil gravity on the solver-results line, relabelled
  `Pre-boil 12.1 °P · Post-boil 13.6 °P` to avoid "OG" ambiguity.
- Fixture enrichment (see §5), presence probes, render tests.
- Docs: `report-sections.md` regen, `report-renderer.md`, `report-bundle.md`
  if any display shape changes.

Gate: `make verify`.

---

## 7. Out of scope

- **Boil section** — revisit when the boil/whirlpool hop sections land.
- **Sparge temperature kinetics** — heating and cooling are deliberately not
  modelled; the target is a number, not a prediction.
- **HLT heating time / energy** — not modelled.
- **Below-cap attenuation** and the **extract-contribution table** — phase 2
  below.

---

# Phase 2 — fermentable readouts

Two content additions after phase 1: an extract view of the fermentable tables,
and the grist's attenuation limit when it is the binding constraint.

## 8. Extract-contribution table

A fourth table in **Batch Facts**, after the sugars table:

```
Extract Contribution
| Fermentable     | Amount | Extract | Extract % |
| American 2-row  | 4.3 kg | 3.4 kg  | 77.6%     |
| Crystal 40      | 0.8 kg | 0.6 kg  | 13.0%     |
| Candi Syrup D-180 | 0.5 kg | 0.4 kg | 9.4%      |
```

- **Rows** come from `grist.major_malts` + `batch.sugars`; trace malts are
  excluded (they are colour and mash-pH only, A9).
- **Extract** is the potential contribution: `mass × yield × (1 − moisture)` for
  malt, `mass × yield` for sugar. It is a mass, in the unit mode's mass unit —
  points stay in the PPG column of the mass tables.
- **Extract %** is Hamilton-normalised across malt + sugar, so it sums to exactly
  100.0 and sits beside the mass-based `Grist %` of the other tables. This is
  where a sugar's 9.8 % of grist mass and 9.4 % of extract become two numbers.
- **No total row.** Typst cannot sum, and the percentage column already closes at
  100; a total would need a producer-emitted string for one figure.
- **Contract:** `extract` and `extract_pct` join the existing row cells (no
  synthetic table key — `formatted_tables` keys must name collection nodes), so
  `bundle_format` bumps to **7**.

## 9. Below-cap grist attenuation

The mirror of *Above malt cap*: when the grist itself is the binding constraint,
realized attenuation sits below the yeast's cap and nothing explains it.

- **Boundary output** `grist_attenuation`: the grist's extract-weighted real
  fermentability converted to apparent at the batch's `OE` —
  `RE = OE · (1 − F)`, `AE` from `apparent_extract_for_real_extract`, then
  `(OE − AE) / OE`. It uses the **uncapped** composite (`aa_malt`), so the value is
  the grist's own ceiling rather than the clamped one.
- **Legacy path** (no per-row fermentability): the value falls back to the cap, so
  the row never prints.
- **Report:** a **Grist attenuation** row in the Yeast chain, beside the cap,
  printed **only when it is below the cap**. Presence is a template comparison of
  two state values (`solver.batch.grist_attenuation < batch.yeast_cap`), matching
  the existing `presents-derate()` idiom; the figure itself is the frozen string.
- It is deliberately **not** a signed delta: with sugar present, realized sits
  above the grist limit, so `realized − cap` cannot express "below".

## 10. Commit sequence (phase 2)

1. **Above-cap: one definition** — `style.js` reads
   `batch.attenuation_above_cap`; `attenuationCapSummary` keeps blend/cap and drops
   `lift`. No contract change.
2. **Extract table** — producer columns, `bundle_format` 7, fourth table, fixture,
   docs. Gate: `make verify`.
3. **Below-cap** — boundary output, Yeast row, conformance test for the conversion,
   fixture, docs. Gate: `make verify`.
