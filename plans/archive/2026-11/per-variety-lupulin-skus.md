---
title: Per-variety lupulin SKUs
status: shipped
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make check + make test
---

# Per-variety lupulin SKUs

Seeds one row per Cryo and Lupomax variety instead of one row per product line.
Amends the catalogue clause of
[`realize-hop-treatment-collapse`](realize-hop-treatment-collapse.md) ("variants
annotate a leaf; they are not rows per variety"); the four leaves, their `c`
scalars, the Tinseth model and the no-row-for-T-90 rule stand.

## Why

The single-row presets forced every brewer to retype a variety's alpha from the
same published table the document already carried, and the picker could not tell
Cryo Citra from Cryo Sabro. The document's per-variety tables were the only
usable record; the seed now carries them.

Staleness was the objection the collapse recorded. The answer is a guard, not a
promise: `tests/guards/hop-product-tables.test.js` parses §4.1–§4.3 and fails
when the seed and the document disagree.

## Settled decisions

- Scope: Cryo and Lupomax only. The other five product lines stay one row each.
- The variety-agnostic `cryo-hops` and `lupomax` rows are removed; stored batches
  keep their inline name and alpha, so they still render.
- Cryo presets are the midpoint of the YCH 2022 range, and the row carries that
  range. Lupomax presets are the published figure with no synthetic range.
- Vintage: Lupomax uses the 2025 sell sheet, with the 2023 crop for Cashmere,
  Columbus, Ekuanot and Idaho 7. Where both publish a figure, 2025 wins.
- Dolcita, HBC 1019 and Krush publish no Lupomax alpha, so they are not seeded.
- A row may name a variety the T-90 catalogue lacks (Cascade Organic, Citra
  Organic, HBC 586, HBC 682); `data/seeds/hops.json` is not a prerequisite.
- Vintage lives in row `notes`; no schema field is added.

## Steps

- [x] Rewrite `data/sources/hop-products.json` as 26 Cryo + 16 Lupomax rows plus
      the five single-product lines.
- [x] Rebuild `data/seeds/hop-products.json` and the sources manifest.
- [x] Resolve the alpha band from the product seed first, so seeded ranges render
      on the hop cards.
- [x] Rewrite `docs/hops/hop-products.md` §3, §4 and §7; update
      `docs/hops/README.md` and `docs/dag-artifacts/seed-substrate.md` §2.9.
- [x] Retarget the `cryo-hops` card tests to `cryo-citra`.
- [x] Add the document-to-seed guard.

## Residual risks

- The guard keeps the document and the seed consistent, not current. A new
  harvest still needs a deliberate refresh.
- Cryo Pop is a distinct blend product line and remains out of scope.
