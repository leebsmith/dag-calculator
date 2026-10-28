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
| 1 | `brewhouse` | Brewhouse | `present-brewhouse` | [`sections/brewhouse.typ`](../backend/app/templates/sections/brewhouse.typ) |
| 2 | `batch-facts` | Batch Facts | `present-batch-facts` | [`sections/batch-facts.typ`](../backend/app/templates/sections/batch-facts.typ) |
| 3 | `yeast` | Yeast | `present-yeast` | [`sections/yeast.typ`](../backend/app/templates/sections/yeast.typ) |
| 4 | `volume-ledger` | Volume Ledger | `present-volume-ledger` | [`sections/volume-ledger.typ`](../backend/app/templates/sections/volume-ledger.typ) |
| 5 | `liquor-ledger` | Liquor Ledger | `present-liquor-ledger` | [`sections/liquor-ledger.typ`](../backend/app/templates/sections/liquor-ledger.typ) |
