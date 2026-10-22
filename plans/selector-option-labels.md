---
title: Selector option labels everywhere
step: next
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [water-pin-visibility-and-test-matrix]
blocks: []
gate: make verify
status: accepted
revision: 1
revised: 2026-10-22
supersedes: —
---

# Plan — Selector option labels everywhere

## Why

Choice selectors render raw taxonomy codes where no `optionLabels` exists. The
existing guard (`tests/guards/option-labels.test.js`) is a hand-maintained list of
four water choices, so it drifted — twice, in conversation — from the truth. This
plan makes the guard derive from the step manifest and labels every choice node
that reaches a `<select>`.

## Accurate inventory (11 `choice` nodes)

| Node | Rendered as | Status |
| --- | --- | --- |
| `batch.topology` | `<select>` (generic) | **raw codes** |
| `batch.fermentation` | `<select>` (style card) | **raw codes** |
| `water.preferred_alkaline_agent` | `<select>` (generic) | **raw codes** |
| `batch.style_source` | `<select>` (style card) | labels hardcoded in template |
| `batch.sulfate_chloride_target_mode` | checkbox | values never shown as options |
| `water.salt_distribution` / `acid_medium` / `gypsum_form` / `cacl2_form` | `<select>` | labelled |
| `water.strategy` | radio group | not a select |
| `mash.preset_id` | not in the manifest | not rendered |

So three selectors actually render raw codes; two more are unlabelled in the
registry (one hardcodes labels in the template, one is a checkbox) and will get
labels anyway so the registry is the single source of truth.

## Changes

1. `views/registry/batch.js` — `optionLabels` for `batch.topology`
   (`r_l_to_g` → "Liquor-to-grist ratio (L/kg)", `runoff_ratio` → "Runnings ratio (r)").
2. `views/registry/style.js` — `optionLabels` for `batch.style_source`
   (`styleguide`/`experimental`), `batch.fermentation`
   (`ale`/`lager`/`wild`/`mixed`), `batch.sulfate_chloride_target_mode`
   (`unspecified`/`specified`).
3. `views/registry/water.js` — `optionLabels` for `water.preferred_alkaline_agent`
   (`BAKING_SODA` → "Baking soda (NaHCO₃)", `CHALK` → "Chalk (CaCO₃)",
   `PICKLING_LIME` → "Pickling lime (Ca(OH)₂)").
4. `partials/step-style.html` — the fermentation `<option>` reads
   `fmt.optionLabel(fermentationField.optionLabels, opt)`; the style-source
   `<option>` set collapses to `fmt.optionLabel` over `styleSourceModel.options`
   (removes the hardcoded duplicate).
5. `tests/guards/option-labels.test.js` — replace the hand list with a
   projection-driven pass (as in `write-targets.test.js`): every field whose
   control is `choice-select` must carry `optionLabels` covering exactly its
   taxonomy. This covers the nine in-manifest choice nodes and fails closed on
   any future selector.

## Non-goals

- `water.strategy` radios, `mash.preset_id`, the bundle-size chunk warning.

## Gates

`make check` then `make test`; `make verify` before done. No artifact change.
