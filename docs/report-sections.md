# Report sections

Generated from the registry literal in
[`backend/app/templates/report.typ`](../backend/app/templates/report.typ) — do
not edit by hand. Regenerate after adding, removing, or reordering a section:

```bash
node scripts/emit-report-sections.mjs
```

**Registry order is canonical render order.** The report spec selects a subset
by id (`sections=a,b`); it cannot reorder. A row's position is therefore the
section's position in every report.

Presence predicates decide whether a requested section renders at all
(`include = requested ∧ present`), keyed off output existence rather than
value so an unsolved boundary never renders plausible zeros. The authoring
checklist is [`adding-a-section.md`](adding-a-section.md).

| # | id | title | presence | source |
|---|---|---|---|---|
| 1 | `discussion` | Discussion | `present-discussion` | [`sections/discussion.typ`](../backend/app/templates/sections/discussion.typ) |
| 2 | `brewhouse` | Brewhouse | `present-brewhouse` | [`sections/brewhouse.typ`](../backend/app/templates/sections/brewhouse.typ) |
| 3 | `batch-facts` | Batch Facts | `present-batch-facts` | [`sections/batch-facts.typ`](../backend/app/templates/sections/batch-facts.typ) |
| 4 | `mash-rests` | Mash Rests | `present-mash-rests` | [`sections/mash-rests.typ`](../backend/app/templates/sections/mash-rests.typ) |
| 5 | `hops` | Hops | `present-hops` | [`sections/hops.typ`](../backend/app/templates/sections/hops.typ) |
| 6 | `purchases` | Purchases | `present-purchases` | [`sections/purchases.typ`](../backend/app/templates/sections/purchases.typ) |
| 7 | `process` | Process notes | `present-process` | [`sections/process.typ`](../backend/app/templates/sections/process.typ) |
| 8 | `yeast` | Yeast | `present-yeast` | [`sections/yeast.typ`](../backend/app/templates/sections/yeast.typ) |
| 9 | `fermentation-strategy` | Fermentation strategy | `present-fermentation-strategy` | [`sections/fermentation-strategy.typ`](../backend/app/templates/sections/fermentation-strategy.typ) |
| 10 | `volume-ledger` | Volume Ledger | `present-volume-ledger` | [`sections/volume-ledger.typ`](../backend/app/templates/sections/volume-ledger.typ) |
| 11 | `liquor-ledger` | Liquor Ledger | `present-liquor-ledger` | [`sections/liquor-ledger.typ`](../backend/app/templates/sections/liquor-ledger.typ) |
| 12 | `water-chemistry` | Water Chemistry | `present-water-chemistry` | [`sections/water-chemistry.typ`](../backend/app/templates/sections/water-chemistry.typ) |
| 13 | `limits` | Limits | `present-limits` | [`sections/limits.typ`](../backend/app/templates/sections/limits.typ) |
| 14 | `checklist` | Brew Checklist | `present-checklist` | [`sections/checklist.typ`](../backend/app/templates/sections/checklist.typ) |
