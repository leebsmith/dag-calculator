---
title: User-Authored Catalog Items (CRUD)
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: user items for all seven catalogs add/edit/delete, validate against the primitive_schema, resolve via selection and picker, and drift-detect on edit/delete; lint + tests + build green
status: proposed
---

# User-Authored Catalog Items

## Goal

Let a user add their own malt/yeast/hop/sugar/equipment/water-report/water-target
records that sit alongside the immutable seeds: pickable, schema-conforming, and
drift-detected like seeds, but editable by their owner. Storage is device-local
(localStorage) for now; Firestore comes later.

## Background

Seeds are immutable, flat id-keyed maps consumed two ways (see seed-substrate):

- **Selections** (`equipment`, `yeast`, `style`, `water_report`, `water_target`)
  resolve a chosen id against `references[schema][id]` (`engine/dag.js:198`);
  freeze records `source_template_id` + a content hash, and `detectDrift`
  re-hashes on open/fork (`adapters/stepAdapter.js:229`).
- **Collections** (`malt`, `sugar`, `hop`) are picked from `seeds[seedKey]` and
  copied into a denormalized row (`adapters/cards/catalogDraft.js`); no
  id-resolution, no drift.

A user item is a third class: a full component in the same `primitive_schema`,
owned by the user, merged into both views at lookup time.

## Decisions (locked)

1. **Identity** — reserved `u:` prefix; `id === key` (satisfies conformance).
2. **Merge** — a live overlay: `user > seed` on id lookup; the prefix prevents
   collision.
3. **Seeds immutable** — no editing/overriding seeds; user items are additive
   with full CRUD on their own items; **duplicate-as-mine** clones a seed into a
   new `u:` item.
4. **Validation** — user items must conform to the existing `primitive_schema`
   (dimensions, domains, taxonomies); rejected on save with field errors.
5. **Drift** — selection-referenced user items get provenance + drift for free
   (they live in the merged `references`); collection items snapshot into rows
   at add-time, like seeds (no retroactive propagation).
6. **Storage** — `localStorage`, `schema_version`-stamped (mirrors
   `store/unitPrefs.js`); no export/import yet.
7. **Scope** — `malt`, `yeast`, `hop`, `sugar`, `equipment`, `water_report`,
   `water_target`. Mash schedules (a `rests[]` template, a different shape) are
   deferred.

## Data model

`localStorage["brew_user_catalog"]` =
`{ schema_version, catalogs: { malt: {"u:…": {…}}, yeast: {…}, … } }`.

Each component carries the same fields as its seed `primitive_schema`, plus `id`
equal to its `u:` key. The `u:` id is a slug of the user's name (`-2` suffix on
collision).

## Live overlay

- New store `store/userCatalog.js` owns the per-catalog overlays, CRUD,
  persistence, and validation, and exposes merged lookups.
- `store/referenceCache.js` makes `references[schema]` and `seeds[seedKey]` live
  merged views. The engine captured `cache.references` once
  (`adapters/engineAdapter.js:30`), so the overlay must mutate the per-schema
  maps in place (or back them with a Proxy) — never reassign `cache.references`.
- `adapters/engineAdapter.js` hydrates the overlay before constructing the
  cache/engine, so the first solve already sees user items.

## Validation

Reuse the engine's domain/taxonomy checks (`engine/domains.js`) against the
target `primitive_schema`. No `artifact.json` change (schemas already exist,
`id` is unconstrained) — no `schema_version` bump.

## Provenance & drift

No engine change. `freezePayload`/`detectDrift` already hash
`cache.references[schema][id]`; a `u:` item therefore behaves like a seed —
edit → "changed", delete → "missing". Frozen `valuation` snapshots the
component, so frozen batches stay stable and drift is explicit.

## UI/UX

- Menu-bar "My ingredients / profiles" surface: per-catalog list + add/edit/
  delete.
- Pickers (`adapters/cards/catalogDraft.js` + selection pickers) show the merged
  catalog with a "mine" badge on `u:` items, and a "duplicate as mine" action on
  seed rows.
- Equipment is authored/validated in its ingested (metric) shape, matching
  `references.equipment` (see `store/equipmentIngest.js`).

## Files

- **Create** `store/userCatalog.js`, a menu-bar CRUD partial + handlers, a
  client-side primitive-schema validator (reusing `engine/domains.js`).
- **Modify** `store/referenceCache.js`, `adapters/engineAdapter.js`,
  `adapters/cards/catalogDraft.js`, selection pickers, `index.html`,
  `store/index.js`.

## Verification

- Add/edit/delete a user item in each of the seven catalogs; `u:` collision
  handling; invalid fields rejected; a `u:` equipment/yeast/water item resolves
  and freezes; edit-after-freeze → drift "changed", delete → "missing";
  collection user items snapshot (no retroactive propagation).
- `make test` + `make check` green.

## Staging (one commit per step)

- **U.1** `store/userCatalog.js` (persistence, prefix, validation) + unit tests.
  *commit: add user catalog store with local persistence and schema validation*
- **U.2** Live overlay in `store/referenceCache.js` + `engineAdapter.js`
  hydration. *commit: merge user items into the reference cache as a live overlay*
- **U.3** Picker merge + "mine" badge + duplicate-as-mine.
  *commit: surface user items in catalog pickers with badge + duplicate-as-mine*
- **U.4** Menu-bar CRUD surface.
  *commit: add menu-bar CRUD for user ingredients and profiles*
- **U.5** Wire into `store/index.js`, document the class in
  `docs/dag-artifacts/seed-substrate.md` §1.
  *commit: document the user-authored items class*

## Out of scope

- Mash-schedule templates (different shape).
- Editing/overriding seed items.
- Firestore persistence and cross-device export/import.
