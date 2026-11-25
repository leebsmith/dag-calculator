# TODO

Completed work lives in `plans/archive/<YYYY-MM>/` and in git history; this file
tracks only what is outstanding.

## Next (in order)

1. **Footer bar** — the shell landed: save state and conflict recovery, step
   position, boundary status, violation count, SAI, and the enumerated findings
   list. What remains is the gravity/ABV/SRM/IBU readouts and the LIFO ordering
   of soft warnings (`plans/warnings.md` W.1–W.5, still proposed).

2. **Verify the mapping flow by hand** — phases A–B are shipped and covered;
   the manual pass against the vendored PDF and a real blend record is what
   remains (`plans/mapping-plans.md`).

3. **Import refinements** — the H.1 prompt/schema review, L0 prior hits, and
   keyboard traversal with batch actions; the editor's "Imported from…" panel
   landed (`plans/recipe-import.md` J.1/J.3).

4. **UI gate closure (enabling)** — write the UI contract (state, authoring
   actions, solve and failure), broaden the report oracle to the states a screen
   must render, and prove the contract with a reference renderer. Scoped in
   `plans/ui-gate-closure.md`; after it, UI design is the only gate.

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

* **Delta visibility in the current UI (deferred, parked 2026-11-25)** — showing
  which readouts moved after an edit and where they moved. Scoped against the
  surface layer and deliberately not built: it is a feature with its own design
  surface (settle timing across the debounced solve, display-precision diffing,
  cause vs effect markers, and an elsewhere rail), and the one-home-per-value card
  layout is the wrong place to design it. **Revisit when** the new UI exists and
  can be designed around the deltas; the impact primitive is already validated
  (`frontend/src/engine/impact.js`).

* **Recipe language (TOML, hand-authored)** — a source a person writes and the app
  reads deterministically: ratios where the app authors parts, mass where it authors
  mass, targets plus a required scale pin, registry names resolved with a hard fail.
  It lands as a *batch source* (a draft batch straight into the editor), not as an
  import document, so it never enters the ledger. See `plans/recipe-language.md`.

* **Hop allocation modes (shipped)** — a second authoring mode beside the
  two-pool IBU split: one kettle-and-whirlpool pool where the row shares are mass
  proportions and a single IBU target scales the bill, so a split authored
  elsewhere lands on this kettle's grams. The existing split stays the default and
  no stored batch migrates. The card strip and the report table ship with it;
  `plans/hop-allocation-modes.md` carries the decisions.

* **Sensory pairing and substitution (out of scope in-app)** — the chemometrics
  belong to an external notebook: this repo carries no β-pinene, limonene,
  selinenes, epoxides, esters or thiols, and the interaction weights have no
  calibration source. The app's contribution is the exact scaling plus the oil
  readout on the hop card (charge and L/G). The reasoning is preserved in the
  superseded `plans/archive/2026-11/hop-layering-assistant.md`.

* **Hop oil model (shipped, kettle only)** — the charge, per form, in the card and
  the report, scoped and labelled as kettle. Dry-hop oil is the known gap: the
  mechanics are documented and a v1 shape exists, but it is unmodelled. The
  Python mirror and a retention curve wait for a consumer and a measurement
  (`plans/hop-oil-model.md`).

* **Multi-strain yeast (deferred, narrowed)** — blends are now ordinary Library
  records: a yeast record with a `blend_of` composition, authored and deleted there
  only, picked by an import like any other yeast (`plans/mapping-plans.md`). What
  stays deferred is the *collection* form — several yeast rows with pitch-share parts
  and a derived blended attenuation — because a weighted mean is not co-pitch physics
  and a sequential pitch is time-dependent; deriving it would dress an authored guess
  as a derived value. **Revisit when** either (a) blends are common enough that one
  Library record per blend is real friction, or (b) a user model exists for pitch
  share and post-packaging attenuation (the brew-session observations could feed
  it).

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
* **Brew-day offline** — cache the frozen bundle, queue note writes. Solving is
  authoring-time; no boundary runs on the brew-day path.
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
* **Sparge-acid target** — the dose neutralises the HLT's residual alkalinity as a
  proxy for `SPARGE_ACID_PH`; it never models an HLT pH. Revisit only if an HLT pH
  readout is surfaced.
* **Per-row late-sugar time** — the checklist fixes the addition at 10 minutes. A
  per-row `addition_at_min` (0 = knockout) would let recipes differ; it needs the
  sugar schema, editor, volume-chain placement and a checklist provider.
* **Boundary message envelope (parked)** — findings travel as the 200 `telemetry`
  list; errors as 422 `code/message` plus an additive `messages` chain of the
  findings that preceded the failure. The card merges both into one log; the old
  client gate was removed. Full unification (one carrier, one key, always-200) is
  parked: reopen only if a second card wants the same merged log, errors routinely
  carry more than one condition, or a new boundary consumer needs identical
  handling. Renaming the success key `telemetry` → `messages` is not worth the
  frozen-bundle churn.
* **Recipe critiquers** — two prose-only LLM assistants (mash/yeast/style and
  boil/whirlpool) that critique a completed recipe against the background
  documents in `docs/mashing/reference/` and `docs/hops/reference/`; on demand,
  independently invokable, memoized, never fed back into the model. The program,
  the shared completion flag, the assistant registry, the dossier contract and
  the provider decisions are in `plans/recipe-critiquers.md`.
* **Catalog duplicate visibility** — malts, sugars and trace malts still hide a
  variety already in the draft, unlike the hop drawers, which keep it and show the
  row count (`allowDuplicates` on the shared catalog-draft mixin).

### UI container maintenance

Deferred from the 2026-11 CSS rationalization
(`plans/archive/2026-11/unconditionally-recommended-css-rationalization.md`):

* **Visual corrections** — each is a deliberate pixel change with before/after
  evidence: scope `unit-badge` hover/focus to buttons; render disabled
  `segmented-item` chips as disabled buttons; give the read-only brew-day header
  its own class without the pointer cursor; change the `alert` error paragraph to
  a `div`; normalize `catalog-item-name` / `-actions` to `div`; wrap the
  `import-delta` tables in `data-table-container`; add `region` wrappers in the
  import-transcribe / import-check groups; normalize heading levels and the
  `form-hint` tag mix.
* **Local visual harness** — the one-off Chrome fixture and computed-style
  comparator were not committed, departing from the plan's invariant #4. Add a
  local target (Chrome optional, baseline from `BASE=<ref>`, no screenshots in
  CI) if CSS refactors recur.
* **Guard refinements** — pin container state variants (`:hover`, `:focus`,
  `:disabled`, `is-readonly`) in the recipe registry, and derive the
  approved-token set from the registry instead of duplicating it in the guard.
* **Container composition** — extract `ui-card.html` / `ui-region.html` so step
  partials stop copying the card header/body; this is the structural anti-drift
  lever and deserves its own plan.
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

Twelve sections have landed — Brewhouse, Batch Facts, Mash Rests, Hops, Process
notes, Yeast, Volume Ledger, Liquor Ledger, Water Chemistry, Water Objectives,
Limits and the Brew Checklist — with the bundle and the render service
(`GET`/`POST /batches/{id}/report`). Brewhouse prints the two solved mash ratios
(L/kg and r); Mash Rests prints only the enabled schedule plus the total mash
time; Process notes prints the batch's free-text notes in authored order; Water
Chemistry carries the source report, the target profile, the source-to-final ion
table, the mash and sparge treatment doses, predicted mash pH and solver
telemetry; and Limits carries the feasibility ceiling and binding capacity plus a
closing extract ledger: potential, conversion inefficiency, converted, mash tun
and transfer losses, into the kettle, late additions, post-boil, kettle losses,
into the fermenter, and the kettle-basis brewhouse efficiency. One bullet per
remaining section; the presence predicates are in `plans/report-renderer.md`
§6.4. Queue order is the order below.

* **Style conformance section** — `conformance` is not `null`; SAI and the
  per-pillar verdicts already captured at freeze.
* **Render image** — the Dockerfile that ships the Typst binary and replaces the
  Cloud Run buildpacks; the render service itself is already live
  (`plans/report-renderer.md` §11 step 5).

### Backend module size

`app/main.py` carries 35 handlers in 720 lines and is the JSON seam by design: the
handlers are ~19 lines of delegation and `ruff` `C901` holds every function under
complexity 10. A seven-router extraction (system, solver, catalog, batches,
report, imports, brew-sessions) was scoped on 2026-11-23 and **declined** — one
author, 32 of 1,000 commits touch the file, and `routers/` was never a dropped
thread (`dev.py` exists to isolate the dev inspector). The risk was accretion
rather than complexity, so the backend now carries the frontend's ratchet:
`tests/guards/backend-shape.test.js` pins the ten modules over 400 lines, and
`tests/backend/test_route_table.py` pins the committed HTTP contract.

Re-open the extraction when `app/main.py` passes ~1,000 lines, a second author
commits, or a route takes more than a few seconds to find. The move is mechanical
and provable: the auth guard already walks `@app.*` and `@router.*` by AST, and
the route table compares method, path, status, response model, tags and
dependencies before and after. The runbook is
`plans/backend-router-extraction.md`.

### Low priority

* **Shape-pin burn-down** — the complexity ratchet and its guard landed with the
  lint program (`tests/guards/shape-pins.test.js` re-measures every pin, so a
  ceiling can only be lowered). What is left is the residue it recorded: 46
  functions in 25 `frontend/src` files above `complexity 12`, eight files above
  400 lines (`engine/validate.js` 541, `engine/fermentation.js` 506,
  `store/recipes.js` 463, `adapters/stepAdapter.js` 459,
  `views/producer/stylePlot.js` 422, `store/persistence.js` 414,
  `engine/units.js` 404, `engine/expression.js` 404), plus the script layer's
  pins from the drift-gates program. The interpreter still leads
  (`views/producer/projection.js` 34, `engine/dag.js` 26,
  `engine/validate.js` 21, `views/producer/scalar.js` 21), then the solve path
  (`adapters/cards/water.js` 38 / 296 lines after the 639-line split,
  `adapters/boundaryRunner.js` 35 / 234 lines, `adapters/stepView.js` 19) and the
  stores and catalogue (`store/userCatalog.js` 32, `store/unitPrefs.js` 27,
  `views/registry/catalog.js` 29, `engine/dag.js` 26). Each split lowers its pin
  in the same commit and deletes it once the file is under the ceiling. The
  backend equivalent is now a hard ceiling — `max-complexity 10` in
  `backend/pyproject.toml`, no pins — so this queue is frontend-only.

## Engine robustness follow-ups

* **Non-finite propagation (L4):** `÷0` → `NaN/∞` is only flagged for root/choice
  domains, not derived nodes. Consider a global "derived values finite" guard.

## Deferred language/engine features

Not needed by the current artifact; add only when a node requires them:

* boolean **input** kind (roots need a dimension, choices a taxonomy — no
  boolean toggle node yet); list literals; map/dict value type.
* True nested boundary outputs (currently flattened to dotted keys).
