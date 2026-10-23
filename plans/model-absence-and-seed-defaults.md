---
title: Model Honesty — Absence, Selection Types, and Seed Defaults
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: [recipe-pipeline]
gate: unset means "no value" (never a sentinel); selections declare their value type; seed-derived values are pulled by defaults instead of pushed by host loops; make check/test green
status: done
---

# Model Honesty — Absence, Selection Types, and Seed Defaults

One missing concept produced most of the defects found while designing printable
reports: **the model could not say "no value yet."** Sentinel `0`, `{}` for an
unset selection, the `"none"`/`"freeform"` id sentinels, the reset-then-copy
cascade, the `> 0` pinned-ion heuristic, cached `seededValue`s, and the stale
style envelope after clearing are all spellings of the same gap.

This plan closes the gap in five ordered stages. Each stage is independently
shippable and leaves `make check` / `make test` green.

---

## 1. Decisions (locked)

| # | Decision |
|---|---|
| 1 | **Absence = no value.** An unset node has no value. No sentinel `0`. An unset `selection` resolves to `null` (not `{}`). Absence serializes as `null` in payloads — never a dropped key. |
| 2 | **`selection` declares its value type**: `output: { schema: <id> }`, replacing the top-level `schema`. Field name is `output` (continuity with `derived`/`boundary`). `collection.item_schema` stays on the node — it types each *element*, not the value. `schema_version` 4 → 5. |
| 3 | **Copy becomes pull.** Seed-derived roots become `default` expressions over their selection. 20 roots convert. The host write loops, `copyInCascade`'s reset-first step, cached `seededValue`, and value-equality provenance all go away. |
| 4 | **A set root is an override.** `hasRoot` is the provenance signal: unset = inherited, set = authored. An authored value survives a component change. |
| 5 | **Not doing:** envelope-as-derived (kills deliberate deviation and frozen reproducibility), `selection`-as-boundary, compiling selections away, `collection.item_schema` relocation. |

### Consequences accepted

- Validators gain a third outcome: **unresolved** (no value yet) is not **violated**.
- `unsetRoot` becomes a first-class store/engine operation.
- `artifact.schema_version` bumps, which resets per-device unit preferences once
  (`store/unitPrefs.js` keys `localStorage` on it).
- Frozen batches are unaffected: `valuation` captures resolved numbers.

---

## 2. Stage 1 — `selection.output: { schema }`

**Artifact:** five selections (`equipment.profile`, `batch.yeast`,
`batch.style`, `water.source_report`, `water.target_profile`); `schema_version: 5`.

**Consumers:** `engine/validate.js`, `engine/dag.js`, `engine/domains.js`,
`engine/units.js` (replace the `node.schema ?? node.item_schema` union with a
single `valueSpecOf`), `views/producer/projection.js`,
`adapters/stepAdapter.js`.

**Also:** teach `validate.js` to check `default` refs on `choice` nodes (needed
by Stage 5, where `water.strategy` gets a ref-based default), and reject an
`output` on a selection that names an unknown schema.

**Docs:** `grammar.md` §2/§2.3, `node-reference.md` §2/§3, re-emit
`inventory.md`.

---

## 3. Stage 2 — unset selection resolves to `null`

**Engine:** `dag.js` returns `null` for an empty `ref` and for an explicit `null`
batch snapshot (three spellings of "no component": `""`, `"none"`, `"freeform"`).

**Boundary seam:** `adapters/boundaryRequest.js` must treat `null` like
`undefined` when applying a declared wire default (`value == null`), or `null`
reaches Pydantic.

**Freeze:** `snapshot.js` already writes `null` for unset selections; add an
explicit `undefined → null` coercion so unresolved roots serialize as `null`
instead of being dropped by `JSON.stringify`.

---

## 4. Stage 3 — `unresolved` domain state

`domains.js`: a missing value yields `{ bounded: true, holds: null,
reason: "unresolved" }`. Non-finite *numbers* stay `holds: false` — a computed
`NaN` is a defect, a missing value is not.

**Consumers** must distinguish violation from unresolved:

- `adapters/stepView.js` — `violationCount` and `stepStatus` use `holds === false`.
- `store/userCatalog.js` — same.
- `partials/step-card.html`, `partials/step-water.html` — `validation.holds === false`.

---

## 5. Stage 4 — `unsetRoot`

- `store/masterStore.js`: `unsetRoot(nodeId)` deletes the key and notifies.
- `engine/dag.js`: `unsetRoot(nodeId)` deletes and invalidates.
- `adapters/session.js`: expose `hasRoot` / `unsetRoot` on the engine facade.
- `adapters/stepAdapter.js`: `unsetRoot` writes through; `resetField` unsets a
  pulled root instead of re-writing a cached value.
- Provenance (`views/producer/provenance.js`): a root whose `default` reads a
  selection is *seeded* while `!hasRoot(id)`; it is *authored* once set. The
  value-equality comparison survives only for the residual host-seeded roots.

---

## 6. Stage 5 — pull the 20 seed-derived roots

**Group A (17, placeholder defaults → selection refs):** the ten
`batch.style_*` envelope fields → `{ref: batch.style.<field>}`; the six
`water.target.*` ions → `{ref: water.target_profile.<field>}`;
`water.calcium_floor_ppm` → `if(target_profile_id != "", water.target_profile.calcium_floor_ppm, 50)`.

**Group B (3, static fallback → guarded selection value):**

- `batch.target_ibu` → `if(style_id != "" and style.ibu_min < style.ibu_max, (ibu_min + ibu_max) / 2, default_target_ibu)`
- `batch.target_srm` — same shape over `srm_min`/`srm_max`
- `water.strategy` → `if(target_profile_id != "", water.target_profile.mode, "AUTO")`

The `<` guard is what makes a stats-less style (34C) fall through to the
fallback instead of yielding `undefined`.

**Deletions:** the write loops in `cards/style.js`, `cards/yeast.js`,
`fieldActions.copyInCascade`, `stepAdapter.materializeDerivedRoots`, and
`seedDerivations` entries for the converted roots.

**Residual (deferred, stays host-seeded):** `batch.apparent_attenuation`
(style centroid), `batch.target_abv` (style centroid), `batch.fermentation`
(tag set-membership). The AST has no polygon geometry and no `in` operator.
`seedDerivations` keeps exactly these three, and is renamed/documented as the
declared exception list.

---

## 7. Out of scope (recorded, not executed)

- Collapsing the `"none"` / `"freeform"` target-profile sentinel ids. They become
  redundant once absence is real, but it is a UX change, not a model fix.
- A `style_analysis` boundary that would let the residual three become defaults.
- `required` / `optional` declarations. "Must have a value" is the natural
  companion of `unresolved`, but nothing consumes it yet.
- Any report/template work.

---

## 8. Outcome (as shipped)

All five stages landed in one change set. Deviations from the sketch above:

- `batch.target_srm` uses a bare `null` else-branch (no style → no target) and the
  now-orphaned `default_target_srm` constant was removed. `batch.target_ibu`
  keeps its constant fallback (30 IBU is a real target, not a sentinel).
- The water card now *unsets* the six ions, the calcium floor, and the strategy on
  preset selection (pull), and materialises them as explicit overrides when the
  user detaches the preset — so unchecking an ion yields absence, not `0`.
- `items_schema` stays on `collection`; `schema` moved to `selection.output.schema`.
- `app.engine` (the session facade) is exposed on the app root so tests can assert
  model values rather than display-converted fields.
- A guard (`tests/guards/manifest-integrity.test.js` A6) pins the exact set of 23
  selection-derived defaults; the residual host-seeded list is asserted in
  `tests/frontend/seed-derivations.test.js`.

Not done (unchanged from §7): sentinel id collapse, `style_analysis` boundary,
`required` declarations, report work.

### Legacy drafts

Old drafts carry materialised target roots (including `0` for ions the profile
does not declare) and a written strategy. They keep loading and behaving as
before; there is no migration that strips the copies. New selections converge on
the pull model.

## 9. Verification

Each stage: `make test` (frontend 471 baseline). Whole change:
`make check` (eslint + stylelint + ruff + tach) and `make test`, plus
`node scripts/emit-artifact-inventory.mjs` after the artifact changes.

**Tests that must change** (they encode the old push model):
`tests/frontend/style-card.test.js`, `tests/frontend/step-lifecycle.test.js`,
`tests/frontend/seed-derivations.test.js`, `tests/frontend/validate-artifact.test.js`,
plus any domain-state expectations.
