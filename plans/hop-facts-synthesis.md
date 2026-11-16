---
title: Hop facts synthesis — from the sweep to the seed
status: proposed
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: make check + make test; the hop seed is reproducible from the committed sources, every row carries an alpha, and no contradicted zero enters a synthesis
---

# Hop facts synthesis — from the sweep to the seed

`plans/vendor-fact-envelope.md` measured what the sources publish: 3,427
observations over 401 ids, 250 varieties reachable, verdicts for eleven
attributes. This plan turns that into the catalog.

Decisions already taken, and not reopened here:

| Decision | Choice |
|---|---|
| Alpha | **replace** the crowd mean with the synthesized value; the row's provenance says which basis it has |
| `notes` | **drop** — generated prose with no upstream, and nothing replaces it |
| `url` | **re-point** at the source of the measurement; beer-analytics stays in provenance as the identity/popularity source |
| Id set | **keep all 401** and add the ~55 vendor-only varieties: ~456 rows |
| Aliases | fold the eight mechanical fixes into P1; they are not worth a phase |
| Report | **no oil in the report** in this plan; the hops section keeps its IBU table |

## 1. Why the alpha swap is the risk

`alpha_acid_pct` currently means "mean of what brewers typed". After this plan it
means "synthesized centre of published ranges, or the crowd mean where no source
publishes". Every IBU in the app moves, and saved batches keep their frozen
values — copy-forward, not rewrite.

Two invariants constrain the shape:

- **Every row needs a numeric alpha.** The engine skips a boundary whose inputs
  hold a null, so a hop without alpha disables the IBU solve rather than
  reporting an unknown. Absent is not an option here.
- **A contradicted zero is not a measurement.** 18 zeros in the sweep contradict
  a substantial value elsewhere; they are excluded from means and from
  precedence, and stay in the ledger.

## 2. Field map

The seed row keeps identity and popularity; measurements change basis.

| Field | After |
|---|---|
| `id`, `name`, `synonym`, `category`, `purpose`, `origin` | unchanged, from the beer-analytics scrape |
| `recipes_count`, `alpha_rating`, `pairings`, `flavor_profiles` | unchanged — popularity and descriptors, not measurements |
| `alpha_acid_pct`, `alpha_acid_min_pct`, `alpha_acid_max_pct` | **replaced** — synthesized; midpoint is an authored convenience where the rule yields a range |
| `beta_acid_pct` | retained as the derived centre; `beta_acid_min_pct` and `beta_acid_max_pct` are added |
| — | **new**: `total_oil_ml_per_100g`, `cohumulone_pct_of_alpha`, `myrcene_pct_of_oil`, `humulene_pct_of_oil`, `caryophyllene_pct_of_oil`, `farnesene_pct_of_oil`, `linalool_pct_of_oil` |
| `notes` | dropped |
| `url` | the source of the measurement; beer-analytics when the row is crowd-only |
| — | **new**: `alpha_provenance`, `beta_provenance`, `oil_provenance`, `alpha_acid_basis` |

Provenance shape follows the shipped malt and yeast layers: `bound`, `kind`
(`vendor` / `survey` / `aggregator` / `prior`), `vendor`, `url`, `retrieved_at`,
`sha256` where a document exists, plus the merge facts — `merge`
(`precedence` / `mean_range`), `sources_count`, `dispersion`, `crop_years`.

Rows carry the same provenance, copied at selection the way `traceMaltRows`
copies `yield_provenance`, so a frozen batch can explain its own numbers.

## 3. Phases

Each phase is one commit and must be green on its own; the pre-push hook runs
`make test` on every one.

### P0 — contract

- Declare the eleven new fields on `hop` and the provenance fields; declare the
  copies on `boil_hop_row` and `whirlpool_hop_row`.
- `make generate`: inventory, catalog, glossary, report sections, bundle fixture.
- Document the fields and their bases in `docs/hops/`.
- No values yet: absent fields are legal, so nothing moves.
- Add the **alpha invariant** guard: every seed row has a numeric alpha in
  `(0, 1]`. It passes today and keeps passing.

### P1 — source

- Commit the sweep observations as `data/sources/hop-facts.json`, hash-pinned in
  `data/sources/manifest.json`, with a source-contract guard on the observation
  shape (`stated_value`, unit, basis, kind, normalised).
- Fold in the eight alias fixes (`Brewer&#8217;s Gold`, `Hallertauer Blanc` vs
  `Hallertau Blanc`, `Mount Rainier`, `Red Earth`, `Willow Creek`, …).
- No seed change.
- Note in the doc that the alias work buys eight varieties, not thirty: the
  unmeasured tail is an absence problem, not a naming one.

### P2 — synthesis

- Extend `scripts/build-hops-seed.mjs`: load the scrape and the facts, apply the
  rules, emit.
- Rules, in order: resolve identity → drop contradicted zeros → per-field
  precedence ladder → `mean_range` where the count is at least three → carry
  `dispersion` and `crop_years` → crowd alpha for the tail with
  `kind: aggregator`.
- Add the vendor-only varieties (~55) with slugged ids; they enter the same row
  shape, with provenance.
- Drop `notes`; re-point `url`.
- **This is the commit that moves IBU.** Expect the report-bundle fixture and any
  alpha-sensitive conformance expectation to regenerate, and say so in the
  message rather than treating it as noise.

### P3 — surfacing

- Display mark for anything not vendor-sourced (`~`), source in the tooltip, the
  way priors are already marked.
- Hop detail shows the profile and, where present, oil; absent stays a dash.
- No report change; the oil line arrives with `plans/hop-oil-model.md`.

### P4 — retire

- Archive `plans/vendor-fact-envelope.md`; the matrix and verdicts live on in
  `docs/hops/vendor-fact-envelope.md`.
- Delete `scripts/scrape/probe_vendor_facts.py`, recording the deletion, as the
  yvh scraper was deleted.

## 4. Guards

| Guard | Asserts |
|---|---|
| `hop-facts` (new) | alpha present and in `(0, 1]` on every row; ranges ordered; oil fractions sum ≤ 1; no contradicted zero in a mean or a precedence winner; every provenance kind valid; every non-tail row has a source URL |
| `seed-rebuild` | the seed is reproducible from the committed scrape plus the facts |
| `hop-row-schema` | seeded fields are declared |
| `sources-manifest` | the facts file's hash and row count |
| `docs-claims` | the field documentation resolves |

## 5. Risks

- **Two bases in one column, permanently.** The tail keeps the crowd mean and the
  row says so. This is the design, not a gap to close later.
- **Thin tail rows.** 23 of the 152 crowd-only rows rest on fewer than ten
  recipes. Record the count in provenance; never clamp.
- **A silent null.** A hop that loses its alpha disables the IBU solve rather
  than reporting "unknown", which is why the invariant is a guard and not a
  convention.
- **Documentation bias in later features.** The synthesis makes basis and
  completeness explicit precisely so the assistant in
  `plans/hop-layering-assistant.md` can refuse to score what it does not know.
- **Scope creep into the report.** Oil in the report belongs to the oil model;
  keeping the hops section unchanged means a wrong IBU has one change to blame.

## 6. Open decisions

1. **`alpha_rating`** is beer-analytics' High/Medium/Low. Does it persist as a
   popularity label, get re-derived from the new alpha, or drop? Recommendation:
   keep it as a popularity label and rename later if it confuses; re-deriving
   would silently change a second field.
2. **Vendor-only id naming**: slug of the source name (`cekin`, `bullion-10a`).
   Collisions are possible with the scrape's ids; the builder must fail on one
   rather than suffix silently.
3. **Which vendor-only rows enter the picker's default filter.** Recommendation:
   only rows with a vendor or survey basis, with "show all" for the rest.
4. **`url` for a multi-source row**: the source that won precedence, or a
   landing note. Recommendation: the winner, with the full set in provenance.

## 7. Checklist

- [ ] P0: declare the fields and provenance; regenerate; document; add the alpha invariant guard.
- [ ] P0: `make check` and `make test` green with no values changed.
- [ ] P1: commit `data/sources/hop-facts.json` and the manifest entry; alias fixes; source-contract guard.
- [ ] P2: builder rules; vendor-only additions; drop `notes`; re-point `url`.
- [ ] P2: regenerate the bundle fixture; record the IBU-moving change in the commit message.
- [ ] P2: `hop-facts` guard green, including the contradicted-zero case.
- [ ] P3: display marks and hop detail; no report change.
- [ ] P4: archive the envelope plan; delete the probe.
- [ ] `make check`, `make test`, `make verify`.
