---
title: Boil hop forms — extracts in the boil, the floor as the split
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: make verify
status: proposed
---
<!-- claims: proposed boil_hop_row.product_form -->

# Boil hop forms — extracts in the boil, the floor as the split

## Problem

1. **The boil cannot say what form it is.** `boil_hop_row` is alpha, time
   fraction, parts and share; `BoilHopRow` on the wire carries the first three.
   Every boil charge is solved as T-90, and §8 of the hop model doc says so in as
   many words. A flowable extract boiled late is therefore solved at `1.0` when
   the form earns `1.15`.
2. **The product matrix does not match the pickers.** Flowables are offered in
   the whirlpool drawer, where the product does not belong; lupulin is offered
   there too, which is right. The boil drawer offers varieties only.
3. **The split contradicts the floor band.** The hot/cool threshold is `76.7 °C`
   (170 °F). The "Isomerization Floor" band runs `76–79 °C` and the card applies
   its **midpoint**, `77.5 °C`. So picking the band that means "isomerization
   effectively stops" books the charge as **hot** — the opposite of the band's
   meaning, and live today.

## Decisions

- **The matrix is the product rule:** the boil offers T-90 or flowable extract;
  the whirlpool offers T-90 or lupulin; dry hops stay descriptive. The 61
  products split 19 flowable (boil) and 42 lupulin (whirlpool), so nothing is
  orphaned.
- **One form vocabulary.** `boil_hop_row` gains `product_form` using the shared
  taxonomy, default `t90_pellet`; the taxonomy is renamed `whirlpool_hop_form` →
  `hop_product_form` because it now spans both processes. No second enum, no
  per-process value set, no validation branch: the pickers are the only writers,
  and the field is new, so no stored row can carry a third value.
- **The boil multiplier is isothermal.** A boil has no cooling curve, so the form
  scalar is its base value — flowable `1.15`. It is a **lumped mechanical
  efficiency**: no vegetative adsorption (the model does not subtract absorption
  separately) plus resin dispersion at ≥90 °C; the same scalar's `0.80` low end
  exists because a cooling whirlpool loses emulsification. A rolling boil is
  maximum heat and shear, so `1.15` is the consistent end, and it is an
  assumption borrowed from the ≥90 °C measurement, not a measured boil figure.
- **The extract ramp is deleted, not demoted.** With flowables out of the
  whirlpool there is no path that carries one, no stored row that does (checked:
  zero `flowable_extract` in the local snapshot), and the only other consumer is
  our own conformance vectors. Deleting it removes the temperature branch from
  the solver and the stub; the scalar map stays because the boil uses it. The
  docs delete the whirlpool-extract material outright rather than qualifying it.
- **The split is anchored to the floor band's top.** Hot is *above* the band
  (`79 °C`), cool is at or below it, so the band's own midpoint classifies as
  cool. The constant is renamed `ISOMERIZATION_FLOOR_C` and guarded against the
  seed band so the two cannot drift. The report label follows (`> 79 °C`).
- **Flameout is boil-only and late.** A flowable boil charge is legal from one
  minute up; a zero-minute charge cannot solve (Tinseth time factor is zero) and
  a flowable stand is not represented, so the card says so rather than inventing
  a branch.
- **No migration.** The boil form field is new, so every stored boil row
  backfills to `t90_pellet`; no draft holds a flowable whirlpool row.
- **Excluded:** standardized bittering extracts (Flex — a different class with
  its own `1.15–1.25×` boil band), lupulin in the boil, a flameout/stand
  treatment for extracts, and any oil or sensory output.

## Workstreams

### W1 — contract and model

`data/artifact.json`, `backend/app/schemas/boundary.py`,
`backend/app/core/hop_solver.py`, `backend/app/services/hop_solver_service.py`.

- Rename the taxonomy to `hop_product_form` (taxonomy entry plus both row
  schemas; the boil schema adds the reference).
- `boil_hop_row.product_form` and `BoilHopRow.product_form`, default
  `t90_pellet`.
- `mass_from_ibu` takes the form multiplier; the boil loop passes
  `product_form_utilization(row.product_form)`.
- `product_form_utilization` loses its temperature argument and branch: a map
  lookup, used by both processes.
- Rename `WHIRLPOOL_HOT_TEMP_C` to `ISOMERIZATION_FLOOR_C` and set it to `79.0`.

### W2 — pickers and row defaults

`frontend/src/adapters/cards/hops.js`, new or extended row producers,
`frontend/src/adapters/boundaryRequest.js`.

- The boil drawer gets the whirlpool's form switch: `t90_pellet` → varieties,
  `flowable_extract` → products filtered by form. Lupulin is not offered.
- The whirlpool drawer's switch offers `t90_pellet` and `lupulin_pellet` only.
- A boil row seeded from a product carries its alpha and ratio, with a late-boil
  default time.
- The request builder sends `product_form` on boil rows.
- The offline stub applies the same multiplier on the boil path.
- The T-90 equivalent line and the extract dose ceiling move from the whirlpool
  inspector to the boil inspector, and a hint names flameout as unmodelled.

### W3 — the floor split

`backend/app/core/hop_solver.py`, `tests/backend/test_hop_solver.py`,
`backend/app/templates/sections/hops.typ`, `tests/frontend/hops-card.test.js`.

- Classify by the band's top; update the split tests (one charge at the band's
  midpoint is cool, one above the top is hot).
- Add a coupling test asserting `ISOMERIZATION_FLOOR_C` equals the seed band's
  `temp_max`.
- Report label becomes `Hot (> 79 °C)`.

### W4 — report

`frontend/src/views/producer/reportFormat.js`,
`backend/app/templates/sections/hops.typ`.

- Boil table gains `Form`; the whirlpool table gains `Alpha`.
- Hop amounts print in grams (the default mass unit is kg at one decimal, which
  renders a 35 g charge as `0.0 kg`).
- A muted line says masses are the product to weigh, solved from the row's alpha
  and form, and that the catalog alpha is a preset to replace with the lot CoA.

### W5 — vectors and fixtures

`tests/conformance/fixtures/hop-parity.json`,
`backend/scripts/emit_report_bundle_fixture.py`, `tests/conformance/fixtures/report-bundle.json`.

- Drop the four parity cases that carry a flowable whirlpool charge, and add a
  boil-flowable case so the extract path keeps a parity vector at its new home.
- The report fixture gains a flowable boil row; its whirlpool rows stay T-90 and
  lupulin.
- Regenerate with `make generate`; the bundle hash moves.

### W6 — docs

`docs/hops/whirlpool-hopping-model.md`, `docs/dag-artifacts/seed-substrate.md`,
`docs/dag-artifacts/inventory.md` (generated), `TODO.md`.

- The model doc: the product-form table loses the flowable low-temperature rows;
  "Flowable extract practice" becomes the boil extract contract (grams, CoA
  alpha, isothermal `1.15`, the lumped-efficiency framing); §8 loses the
  point-estimate and cool-whirlpool bullets and replaces the boil-gap bullet with
  the new rule; the split is described against the floor band.
- `seed-substrate.md` §2.9: two product families (19 flowable, 42 lupulin), two
  sources, the lupulin aliases and one brand per manufacturer, midpoint alpha,
  the `variety_id` exception, and the T-90 ratios by brand.
- `TODO.md` gains the plan.

### W7 — tests and gates

- Solver: a flowable boil charge is `1/1.15` of the T-90 mass at equal alpha and
  time; a T-90 charge is unchanged.
- Request builder and stub parity for the boil form.
- Card: the boil catalog offers flowables and not lupulin; the whirlpool offers
  lupulin and not flowables.
- Report: `Form` and `Alpha` columns, gram amounts, the CoA note.
- Guards: taxonomy rename (`taxonomy-coverage`), `include-integrity`,
  `ownership`, `artifact-consumers`, `artifact-docs-sync`.

## Verification

`make check`, `make test` (the artifact change makes it a full-suite run) and
`make verify`. Generated output: the inventory, the glossary, the source
manifest, the section list and the bundle fixture. Rendered check: the Hops
section alone from the fixture, in the report's default units.
