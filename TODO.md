# TODO

Completed work lives in `plans/archive/<YYYY-MM>/` and in git history; this file
tracks only what is outstanding.

## Critical

* **Catalogue alphas are presets, not assays.** In flight under
  `plans/realize-hop-treatment-collapse.md`: the 61-row product catalogue becomes
  seven variants, and the per-variety tables move into `docs/hops/hop-products.md`
  with their vintage. Until that lands the seeded alphas are wrong — Incognito
  carries `0.20–0.55` against Haas's `40–55 %`, and Cryo and Lupomax share one
  range per variety although both are published (YCH 2022, BarthHaas 2025).
  Hop mass is the inverse of the allocated IBU through alpha, so a wrong alpha
  scales every mass in the row.

## Next (in order)

1. **Footer bar** — the shell landed: save state and conflict recovery, step
   position, boundary status, violation count, SAI, and the enumerated findings
   list. What remains is the gravity/ABV/SRM/IBU readouts and the LIFO ordering
   of soft warnings (`plans/warnings.md` W.1–W.5, still proposed).

## Before 1st printed recipe

* Brew checklist (the staged-notes replacement) — Phase 1 shipped: the
  generated pre/brew/post checklist with three levels and a printed blank
  appendix. Phase 2 shipped: frozen-batch sessions, checklist state, live and
  deferred observations, raw/corrected/method, automated hydrometer and
  refractometer corrections, variance, sealing and the printable Brew Sheet.
  Phase 3 (calibration and cooling-curve promotion) remains. See
  `plans/archive/2026-11/brew-checklist.md`,
  `plans/archive/2026-11/brew-session.md` and
  `plans/brew-measurement-promotion.md`.

## Later

* **Surface and fit the grain thermal factor** — `mash_thermal_factor` (0.41)
  drives `mash.strike_water_temp_base_c` but has no readout. Surface it near
  Strike Water Temp, then move it toward an equipment-scoped value estimated
  from observed strike-water outcomes (rolling average / regression). Needs a
  rig-level observation record.
* **Per-field taxonomy subsets** — a `domain: { in: [...] }` form for
  taxonomy-typed schema fields, so a row type can restrict a universal taxonomy
  to its valid members (e.g. a dry-hop row to `fermentation`). Needs grammar,
  validator, backend parity, and the inventory emitter to agree.
* Realtime cross-tab / multi-device sync (Firestore `onSnapshot`)
* Offline resilience (IndexedDB write-ahead overlay)
* Unit scaling (`plans/unit-scaling.md`)
* Lazy-load seed data (bundle size)
* **Style-conformance water axis** — nothing scores water against the chosen style today:
  `styleConformance.js` covers only `og`/`fg`/`abv`/`ibu`/`srm` and `styles.json` carries
  no water fields. Needs a desired water character, a realized character derived from the
  batch, a verdict layer, and a granularity decision (per style / category / water family).
* **App shell navigation** — the wizard toolbar mixes navigation (`Recipes`), per-recipe
  verbs (`Freeze`, `Move to trash`), a tool (library), and settings (`Units`, sign out) at
  equal weight; move to a labeled nav that collapses to a hamburger below a breakpoint,
  with verbs in a row overflow and settings top-right.
* **View recompute granularity** — wholesale `produce()` recompute is by design (A9
  determinism / A1 no-reactivity). Production runs HTTP-debounced; the synchronous path
  (`boundaryRunner.js` scheduleSolve) is tests-only. Revisit only if profiling shows jank
  as field count grows (cooling curves, style-water axis).
* **Water grid status chips** — `docs/adsco/ui.md` specifies Exact / Floor / Buffer /
  Floating / Compromise / Below-buffer per ion; the card renders `Target` / `Best fit` /
  `Buffer` / `Auto` / `No value`. Needs the remaining states surfaced from the
  boundary (telemetry still carries only free-text messages).
* **Artifact-declared routing** — the mode → pin-set mapping lives in the presentation
  registry, pinned to the Python router by a fixture. Moving it into `data/artifact.json`
  would remove the duplication outright, but `constants` is scalar-only today, so it
  needs a non-scalar value kind (grammar + `schema_version` + inventory + docs).
* **Recipe critiquers** — two prose-only LLM assistants (mash/yeast/style and
  boil/whirlpool) that critique a completed recipe against the background
  documents in `docs/mashing/reference/` and `docs/hops/reference/`; on demand,
  independently invokable, memoized, never fed back into the model. The program,
  the shared completion flag, the assistant registry, the dossier contract and
  the provider decisions are in `plans/recipe-critiquers.md`.
* **Catalog duplicate visibility** — malts, sugars and trace malts still hide a
  variety already in the draft, unlike the hop drawers, which keep it and show the
  row count (`allowDuplicates` on the shared catalog-draft mixin).

### Flavor charge

A batch addition that carries flavour and aroma but **no IBU**, dosed per volume
and recorded like any other charge. The reviewed products are captured here rather
than in the hop catalogue: an alpha-less row in a solver that derives mass from
IBU is the inversion backwards, and these belong to a different model. The dosing
bases differ, which is the design work.

| Product | Maker | Where | Dose |
|---|---|---|---|
| Spectrum | BarthHaas | dry hop | 1:5–1:10 T-90; 0.5–5 mL oil/hL; ≤1 g/L; ≤80 % of the charge |
| Prysma | BarthHaas | whirlpool / fermentation / post-filtration | 0.5–1.0 g/L; 1 kg ≈ 5–8 kg T-90 |
| Aromahop OE | Haas | late boil | 2.5 g/hL |
| PHA | BarthHaas | post-filtration | to taste |
| Euphorics | Haas | cold side / finished | 3–6 mL/bbl |
| Hop Hash | YVH | cold side | untested, variable |
| HyperBoost | YCH | dry hop | 1:100 T-90 (1:50 Cryo); 25–50 % of the charge |
| SubZero Hop Kief | Freestyle | dry hop / brite | 0.2 mL/L (no maker sheet yet) |
| Quantum / Omni / BrewGas / Skyfarm | Abstrax | any stage | 0.065 mL/L start; 0.3–2 oz/bbl |

Open questions when it is scoped: the dose basis per row (mL/L, oz/bbl, mass
ratio), the application stage (whirlpool, fermentation, bright), whether it prints
in the report and the brew checklist, and whether it needs its own catalog kind
rather than a `hop_product` row. The dry-hop card is the nearest surface but it
models hop contact, not a flavour dose.

### Report sections

Ten sections have landed — Brewhouse, Batch Facts, Mash Rests, Hops, Yeast,
Volume Ledger, Liquor Ledger, Water Chemistry, Limits and the Brew Checklist —
with the bundle and the render service (`GET`/`POST /batches/{id}/report`).
Brewhouse prints the two solved mash ratios (L/kg and r); Mash Rests prints only
the enabled schedule plus the total mash time; Water Chemistry carries the source
report, the target profile, the source-to-final ion table, the mash and sparge
treatment doses, predicted mash pH and solver telemetry; and Limits carries the
feasibility ceiling and binding capacity plus a closing extract ledger:
potential, conversion inefficiency, converted, mash tun and transfer losses,
into the kettle, late additions, post-boil, kettle losses, into the fermenter,
and the kettle-basis brewhouse efficiency. One bullet per remaining section; the
presence predicates are in `plans/report-renderer.md` §6.4. Queue order is the
order below.

* **Pinned ions section** — `water.pinned_ions` rows; the checked targets and their
  values, so a reader can see what constrained the water solver.
* **Style conformance section** — `conformance` is not `null`; SAI and the
  per-pillar verdicts already captured at freeze.

### Low priority

* **Shape-pin burn-down** — the complexity ratchet and its guard landed with the
  lint program (`tests/guards/shape-pins.test.js` re-measures every pin, so a
  ceiling can only be lowered). What is left is the residue it recorded: 47
  functions in 25 `frontend/src` files above `complexity 12`, eight files above
  400 lines, plus the script layer's pins from the drift-gates program. The
  interpreter leads (`views/producer/projection.js` 34, `engine/validate.js` 34,
  `views/producer/scalar.js` 21, `engine/ast.js` 22 — dispatch over the grammar,
  so the split is a table per node kind), then the solve and refresh paths
  (`boundaryRunner.js` 35 / 213 lines, `cards/water.js` 38 / 639 lines,
  `stepView.js` 19) and the stores (`userCatalog.js` 32, `unitPrefs.js` 27,
  `library.js` 18). Each split lowers its pin in the same commit and deletes it
  once the file is under the ceiling. The backend equivalent is now a hard
  ceiling — `max-complexity 10` in `backend/pyproject.toml`, no pins — so this
  queue is frontend-only.

## Engine robustness follow-ups

* **Non-finite propagation (L4):** `÷0` → `NaN/∞` is only flagged for root/choice
  domains, not derived nodes. Consider a global "derived values finite" guard.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

* `max` reduction; boolean **input** kind (roots need a dimension, choices a
  taxonomy — no boolean toggle node yet); list literals; map/dict value type.
* True nested boundary outputs (currently flattened to dotted keys).
