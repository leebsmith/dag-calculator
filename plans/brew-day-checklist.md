---
title: Brew Day Checklist Card
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [water]
blocks: []
gate: make check + make test green; checklist persists in drafts and frozen valuations
status: proposed
---

# Brew Day Checklist Card

## Goal

Add a configuration-only **Brew Day Checklist** step immediately after Water
Chemistry. The card lets the brewer choose which workflow steps appear in the
printed/exported recipe and write per-step instructions. It is not an active
brew-day log.

The calculator assumes a single-batch, batch-sparge process throughout.

## Confirmed decisions

- **Layout:** implement as a manifest step in the current single-active-card
  wizard. Do not restore the retired horizontal flex-row stepper.
- **Placement:** step index 9, after Water Chemistry and before Dry Hopping.
- **Gating:** inherit the existing high-water mark behavior. No new
  “Water Chemistry resolved” validation gate.
- **Defaults:** all 12 steps unchecked with blank instruction overrides.
- **Persistence:** model the checklist as an artifact collection
  (`batch.brew_day_steps`). Draft autosave, freeze, load, and fork then work
  through the existing collections seam with no backend schema change.
- **Future DAG hydration:** keep a `brewDayDefaultInstruction(stepId)` fallback
  behind the textarea binding. It returns `""` now; it can later read computed
  values without changing the markup or row schema.

## Data model

Add `primitive_schemas.brew_day_step`:

```jsonc
{
  "step_id": {},
  "section": {},
  "name": {},
  "enabled": { "type": "boolean" },
  "instructions": {}
}
```

Add `nodes["batch.brew_day_steps"]` as a collection using that schema.

`data/seeds/brew-day-steps.json` is the canonical section/step list:

- Preparation: Advance Prep, Brew Day Setup
- Mashing & Lautering: Dough-In / Underlet, Mash Rests, First Runnings, Batch
  Sparge
- The Boil: Pre-Boil, Active Boil, Flameout
- Knockout & Transfer: Whirlpool, Chilling, Fermenter Transfer

`referenceCache` seeds every draft with 12 disabled rows (blank instructions) so
the frozen payload is complete even before the card is touched.

## UI

`frontend/src/partials/step-brew-day.html`:

- Four `synthesized-card` accordions, header rendered as a button with
  `aria-expanded`.
- A count badge on each header when `activeCount > 0`
  (`"4 steps active"`).
- One checkbox row per step. Checked means include the step in the output.
- A textarea revealed by `x-show="row.enabled"` for the instructions.
- Bindings use `:checked`/`@change` and `:value`/`@input` so the future default
  fallback stays possible. No `x-model`.

`frontend/src/adapters/cards/brew-day.js` owns the Alpine state and handlers:

- `brewDayRows`, `brewDayOpenSections`
- `brewDaySections` getter with active counts
- `brewDayPayload` getter (enabled steps grouped by section, process
  `single_batch_batch_sparge`)
- `toggleBrewDaySection`, `isBrewDaySectionOpen`
- `toggleBrewDayStep`, `setBrewDayInstruction`
- `brewDayInstruction`, `brewDayDefaultInstruction`

Writes go through `engine.setCollection("batch.brew_day_steps", rows)` then
`notify()` for autosave. No `scheduleSolve()` is needed because no domain value
depends on the checklist.

## Files

- `data/artifact.json` — schema + collection node
- `data/seeds/brew-day-steps.json` — canonical checklist metadata
- `frontend/src/store/referenceCache.js` — default rows
- `frontend/src/views/brewDay.js` — pure config/materialization/payload helpers
- `frontend/src/views/registry/brew-day.js` + `registry/index.js` — node ids and
  collection labels
- `frontend/src/views/steps.js` — manifest entry
- `frontend/src/adapters/cards/brew-day.js` — card state machine
- `frontend/src/adapters/stepAdapter.js` — register card
- `frontend/src/adapters/stepView.js` — refresh rows
- `frontend/src/partials/step-brew-day.html` — accordion UI
- `frontend/index.html` — render branch + fallback exclusion
- `frontend/src/style.css` — accordion/checkbox/textarea styles
- `tests/frontend/brew-day-card.test.js` — card behavior
- `docs/engine.md`, `docs/dag-artifacts/inventory.md` — docs sync

## Tests

- 4 sections, 12 rows, all disabled by default.
- Toggle a step: active count and grouped payload update.
- Set instructions: override appears in the payload.
- `loadState` hydrates a partial collection and materializes missing rows.
- `draftState`/`freezePayload` include `batch.brew_day_steps`.
- `teardown` restores disabled defaults.
- Run `node scripts/emit-artifact-inventory.mjs`, `make check`, `make test`.
