---
title: Realize the hop treatment collapse
status: active
program: deterministic-dag-calculator
supersedes: plans/hop-catalogue-resume.md
gate: make check + make test
---
<!-- claims: proposed batch.cone_utilization batch.whirlpool_knockout_min batch.whirlpool_start_temp_c -->

# Realize the hop treatment collapse

Synthesised from the 2026-11-01 hop-catalogue conversation. The catalogue was
built by enumerating realised products; the abstraction that came out of it shows
the enumeration was the wrong shape. Bitterness is `load × yield`; the yield is a
property of the leaf's form; the leaf set is four wide; and every product fact
belongs in one document rather than 61 rows.

## Settled decisions

**Model**

- One model: Tinseth. `IBU = load × yield`, `load = α·m/V`,
  `yield = B(G)·f(t)·c`.
- `α` is a per-lot mass fraction; concentration lives entirely in `α`; `c` is a
  pure yield scalar.
- `G` is pre-boil in the boil and post-boil in the whirlpool; `V` is post-boil
  everywhere. The pair is the generous end: ~6 % optimistic, so solved mass runs
  low. Recorded, not repaired; calibration is a later constant.
- `IBU` is authored; `m` is the only solved unknown, via alpha demand then lot
  mass.
- The IBU split is authored; the basis stays posted temperature.
- Flameout is the whirlpool anchor at position 0; both tables count from it.

**Catalogue**

- Four leaves, one scalar each: whole cone · pellets · lupulin concentrate ·
  extract.
- Variants annotate a leaf; they are not rows per variety.
- Per-variety alpha tables (Cryo 2022, Lupomax 2025/2023) live in the document
  with vintage; the seed carries a nominal per variant.
- T-90 and whole cone have no catalogue row — the variety catalogue supplies them.
- Hash dropped. American Noble, pre-isomerised and flavour products out of scope.

**UI**

- Two cards, one named seam; the sign lives in the headers, not the cells.
- Kettle conditions strip: editable knockout, start temp, ambient, τ, curve;
  read-only echo of boil time and IBU target.
- One muted demand line per table; no per-row demand or dose column.

## Steps

### 1. Supersede the dossier

- [x] Move `plans/hop-catalogue-resume.md` to
      `plans/archive/2026-11/hop-catalogue-resume.md`; set `status: superseded`
      and name this plan as its successor.
- [x] Widen `plans/archive/README.md` prose from "completed or executed" to
      "completed, executed, or superseded".
- [x] Retire `TODO.md` Next #1 (schedule-derived whirlpool IBU) — it describes the
      forward model the mandate rejects — and renumber what follows.

### 2. The document and the catalogue collapse

- [x] Write `docs/hops/hop-products.md`: four leaves and their `c`; per-variety
      alpha tables with vintage and URL (Cryo YCH 2022, Lupomax 2025 and 2023);
      variant table with alpha basis, dose band, substitution guidance and sheet
      URL; why CO₂ and flowable share a leaf; the recorded disagreements; the cone
      gate; the exclusions; the vintage caveat.
- [x] Add it to the `docs/hops/README.md` index.
- [x] Rewrite `data/sources/hop-products.json` as seven curated variants: Cryo
      Hops, Lupomax, CO₂ extract (YVH), Hop Shot, Flex, DynaBoost, Incognito.
- [x] Delete `data/sources/hop-products-lupulin.json` and
      `data/sources/yvh-products.json` (after extraction).
- [x] Delete `scripts/scrape/yvh/`, the `scrape-yvh` target and its help line.
- [x] Delete `tests/guards/yvh-products-source-contract.test.js`.
- [x] Rewrite `scripts/build-hop-products-seed.mjs` for the variant source.
- [x] Retarget the hop-products case in `tests/guards/seed-rebuild.test.js`.
- [x] Rewrite `docs/dag-artifacts/seed-substrate.md` §2.9.
- [x] Rebuild seeds and re-emit the manifest.

### 3. Leaves, the cone gate, and the schema shrink

- [x] `hop_product_form` gains `whole_cone`; display labels carry the honest
      names.
- [x] Delete the `hop_product_type` taxonomy; `dry_hop_row.product_type` uses
      `hop_product_form`; the dry-hop picker offers three leaves.
- [x] `PRODUCT_FORM_UTILIZATION` (JS and Python) gains `whole_cone` as a supplied
      value, not a constant.
- [x] Add `cone_utilization` to `boil_hop_row` and `whirlpool_hop_row`
      (dimensionless, `gt 0`, `lte 1`, no default) and
      `CONE_UTILIZATION_REQUIRED`, emitted iff a row carries `whole_cone` and the
      field is null. Per charge, not batch: the engine skips a boundary whose
      inputs hold a null, so a nullable batch-level input would silently disable
      the whole hop solve.
- [x] Delete `t90_replacement_ratio` from `boil_hop_row`, `whirlpool_hop_row` and
      `hop_product`; delete `purpose`, `beta_acid_pct`, `total_oil_pct` and
      `variety_id` from `hop_product`.
- [x] Frontend: four-leaf boil and whirlpool pickers, three-leaf dry-hop picker,
      variant annotation, and the removal of the ratio read-out and the hardcoded
      product prose.
- [x] Fixtures, inventory, glossary and the hops model doc follow the artifact.

### 4. The timeline

- [ ] Add `batch.whirlpool_knockout_min` and `batch.whirlpool_start_temp_c`
      (default 99).
- [ ] Replace the whirlpool row's `duration_min` with `addition_at_min` (position
      after flameout, `gte 0`, `lte` knockout); derive exposure as
      `knockout − position`.
- [ ] Timeline origin becomes `(0, start_temp_c)`; `end_min` becomes knockout;
      every charge is checked against the passive curve, closing the anchor
      exemption.
- [ ] Migration: existing rows convert by
      `addition_at = max(duration) − duration`, with knockout defaulting to
      `max(duration)`, reproducing current numbers exactly.
- [ ] UI: renamed cards, seam note naming the sign, kettle conditions strip,
      `Add`/`Temp` columns, flameout chip.

### 5. Demand and the report

- [ ] `alpha_mass_kg` per hop result row; `boil_alpha_mass_kg` and
      `whirlpool_alpha_mass_kg` on `solver.hops`.
- [ ] Per-table muted demand line in the card and in the report hops section.
- [ ] Report: renamed column headers, the cone assumption when used, glossary
      paths.

### 6. Close out

- [ ] `docs/vision.md` §5 refusal bullet: never author a mass to obtain a target.
- [ ] Rewrite the `TODO.md` Critical as disposition, not disagreement.
- [ ] `make seeds`, `make generate`, `make check`, `make test`, `make verify`.
- [ ] Archive this plan under `plans/archive/2026-11/`.
