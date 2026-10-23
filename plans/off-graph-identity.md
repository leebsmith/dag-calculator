---
title: Off-Graph Identity — Equipment, Water Source, and Style as Immutable Context
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [model-absence-and-seed-defaults]
blocks: [landing-and-batch-setup]
gate: the artifact declares an `identity` section; the engine resolves identity-backed paths without nodes; 58 writable nodes become 43; make check/test/build green
status: proposed
---

# Off-Graph Identity

Equipment, water source, and style are **givens**, not computed state. Today they are
graph nodes (`*_id` roots + `selection`s) that are mutable, copied into the batch,
re-derived, and reconciled on every change — which generated a whole family of
questions (what happens when the style/water/rig changes, whether an override
survives, how to detect drift, whether the frozen payload is still meaningful).

Taking them **off the graph** answers all of them by construction: a batch receives
the three components as an immutable snapshot (values + source id + label) and never
dereferences them again.

---

## 1. Decisions (locked)

| # | Decision |
|---|---|
| 1 | **Identity is host-supplied and immutable.** `createEngine(artifact, { identity })`; no setter exists. Missing identity is a construction error. |
| 2 | **Memory, not linkage.** The batch stores the component values, the source id, and the human label. Editing or deleting the library record never changes a batch. |
| 3 | **Declared in the artifact** as an `identity` section mapping namespace → primitive schema, so identity-backed paths validate statically. |
| 4 | **58 → 43 writable nodes.** The 15 identity nodes and the three selections (`equipment.profile`, `water.source_report`, `batch.style`) are deleted. |
| 5 | **No container entity.** Grouping is a query over the batch label and/or identity equality; `parent_batch_id` carries explicit lineage only. |
| 6 | **Ownership asymmetry.** Equipment and water source are user-owned assets with library CRUD (list/create/delete) independent of any batch. Styles are catalogue data or an inline experimental declaration; no CRUD lifecycle. |
| 7 | **Old records are deleted** (one draft, no meaningful frozen history). The read path still gains a version guard so a surviving record fails loudly instead of rendering `undefined`. |

### Consequences accepted

- The WYSIWYG envelope editing disappears: bounds are the style declaration's, not batch state.
- The `style_*` reset/↺ affordance disappears with the envelope.
- Frozen payload shape changes (`identity` block added) — cheap now, expensive later.

---

## 2. Artifact

### 2.1 New section

```jsonc
"identity": {
  "equipment":    "equipment",     // namespace -> primitive schema
  "water.source": "water_report",
  "style":        "style"
}
```

Namespaces are dotted; the resolver takes the **longest identity-namespace prefix**.
Schema ids are keys in `primitive_schemas` (declarations, not instances).

### 2.2 Deletions (15 nodes + 3 selections)

Roots/choices: `batch.equipment_profile_id`, `water.source_report_id`,
`batch.style_id`, `batch.style_source`, `batch.fermentation`, and the ten
`batch.style_{og,fg,ibu,srm,abv}_{min,max}`.
Selections: `equipment.profile`, `water.source_report`, `batch.style`.

### 2.3 Ref rewrites

| Was | Becomes |
|---|---|
| `batch.style.og_min` (defaults, conformance) | `style.og_min` |
| `batch.style_id != ""` guards | deleted — identity is required, bounds may simply be absent |
| `water.source_report.calcium_ca`, `…total_alkalinity_caco3` | `water.source.calcium_ca`, `water.source.total_alkalinity_caco3` |
| `equipment.<field>` | unchanged (now identity-backed) |
| `batch.fermentation` | `style.fermentation` (host-derived at creation from the style tags) |

`batch.target_ibu` / `batch.target_srm` keep their guarded-midpoint defaults, with the
`style_id` guard dropped.

### 2.4 Version

`schema_version` 5 → 6; `meta.description` updated; inventory re-emitted
(`node scripts/emit-artifact-inventory.mjs`, guarded by `make test`).

---

## 3. Engine

1. `resolveValue(path)` resolution order: exact node id → longest node prefix + suffix
   (selection field / boundary output) → longest identity namespace + suffix → error.
2. `createEngine` requires `options.identity`; omit → throw
   `"identity is required (equipment, water.source, style)"`.
3. Identity is read-only: no setter, not in `roots`, not in `topoOrder`, not in
   `valuation`.
4. Delete the slice-level selection fallback in `paths.js` (it existed only for
   `equipment.*`; the remaining selections are addressed by full id).
5. Identity domain pass: validate identity component fields against their
   primitive-schema `domain`s (replaces the selection-based `fieldDomainStates` for
   identity namespaces).

---

## 4. Adapters, session, freeze

- `createSession({ identity })` passes it through; `rebuild` keeps it fixed.
- `freezePayload()`: `{ identity, valuation, provenance, valuation_format,
  schema_version, conformance }`. `provenance` now covers only the two remaining
  selections (`water.target_profile`, `batch.yeast`).
- `DRAFT_SCHEMA_VERSION` bump; read path rejects a mismatched record with a clear
  error.
- Attribution: `stepStatus`/`fieldSlice`/`selectionSlice` gain identity-namespace
  routing (`equipment`, `water.source`, `style`).

---

## 5. Cards

| Card | Read-only identity | Remains writable (batch) |
|---|---|---|
| Equipment | profile fields | `boil_off_rate_l_per_hr`, `conversion_efficiency`, `hlt_starting_volume_l` |
| Style | style declaration (bounds, name, fermentation) | OE/AE target sliders, `target_abv`, `target_ibu`, `target_srm`, `apparent_attenuation` |
| Water | `water.source.*` ions | target profile, target ions, floor, mash pH, strategy, forms, distribution |

`seedDerivations.js` shrinks again: style-centroid seeding becomes a **creation-time**
seed (host writes `apparent_attenuation`/`target_abv` once when the batch is created),
leaving only the yeast attenuation derivation live.

---

## 6. Persistence

- `BatchRecord`: `identity: {equipment, water_source, style}` (snapshots with id +
  label + values), `name`, `sequence`.
- Old records deleted; version guard on read.
- Backend catalog already supports `equipment` and `water_report` kinds with
  list/create/delete and per-kind `id_field` (`id`, `report_id`).

---

## 7. Docs

`grammar.md` (identity section; namespace = domain | level wording, with `project`
dropped — there is no level namespace), `semantics.md` (memory vs linkage; identity is
not state), `node-reference.md` (identity-backed paths; `hasRoot` only speaks for
batch roots), `engine.md` (resolver branch, required identity, freeze payload),
`adding-a-node.md` (identity vs root), `docs/adsco/ui.md` (cards as readers),
inventory re-emit.

---

## 8. Staging

| Stage | Work | Gate |
|---|---|---|
| S1 | Artifact: `identity` section, delete 15 nodes + 3 selections, rewrite refs, `schema_version` 6, inventory | validator + inventory guard green |
| S2 | Engine: resolver branch, required identity, delete slice fallback, identity domain pass | engine tests green |
| S3 | Session/adapters: pass identity, freeze payload, draft version, attribution routing | frontend suite green |
| S4 | Cards: demote the three to identity readers; move style-centroid seeding to creation | card tests rewritten |
| S5 | Persistence/backend: `BatchRecord.identity`, `name`/`sequence`, old-record wipe + guard | pytest green |
| S6 | Docs | `make verify` green |

---

## 9. Risks

- **Silent `undefined`** from a missed ref rewrite — the validator only catches refs in
  roots/choices/derived/boundary/relations. Mitigation: S1's gate plus a grep sweep of
  the 15 old ids across `frontend/src`, `tests`, `scripts`, `docs`.
- **Resolver ordering**: node ids win over identity namespaces; assert with a test
  (`equipment` is identity-backed *and* was a slice name).
- **Attribution**: `nodeId.split(".")[0]` no longer equals a card key for identity
  paths.
- **Creation-time seeding** must not become a live synchroniser (the thing this plan
  exists to remove).

---

## 10. Out of scope

- The target-vector cluster (support/`pinned_ions`, checked ⇒ valued, `strategy` as a
  request discriminator, calcium-floor ownership).
- Any project/container entity, naming, or grouping CRUD beyond a label + sequence.
- Report rendering.
