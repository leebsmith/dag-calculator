---
title: Alpine audit — what the wall changes and what it does not
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
status: complete (audit); transition adopted in `ui-redesign.md`
---

# Alpine audit

> Read-only audit for the wall-and-panel redesign. It answers one question: what
> in the Alpine layer assumes the step shell, and what has to change before the
> wall can mount every fieldset. The decision record is
> [`ui-redesign.md`](ui-redesign.md); this is the evidence behind its Stage 2.

## 1. Summary

The **data layer is already global** and survives unchanged. The coupling is in
the **shell and the step partials**:

| Layer | Verdict |
|---|---|
| Engine, session, producer, adapters/cards | unchanged |
| `CARD_REFRESHES` | already refreshes every card on every compute |
| `steps.js` / `stepDisplay` | becomes the fieldset manifest |
| `editor.html` | mounts one partial today; the wall mounts all |
| 11 step partials | read the global `activeStep`; need a fieldset scope |
| `navigation.js` / `stepAdapter` | stepper state replaces by chips and scroll |
| Modals | live inside step partials; all mount with the wall |
| Guards | ten encode the step shell; each needs an explicit update |

## 2. The `activeStep` coupling

**28 references across 13 files**, of which 11 are partials.

| Consumer | Current use | Wall replacement |
|---|---|---|
| 10 step partials (`step-*.html`) | card title and subtitle | the fieldset's own `title`/`subtitle` |
| `step-card.html` | `activeStep.slice` for `stepGroups` and `fieldsBySlice`; `activeStep.actions`; the equipment-only `activeStep.id` condition | a fieldset scope; the partial must not assume the global active step |
| `stepView.js` | `stepFindingItems` keyed by the active step's slice | per-fieldset findings or the panel's global list |
| `stepAdapter.js` | seeds `activeStep` and `activeIndex` | seeds `fieldsets`; keeps `stepStatus` |
| `navigation.js` | mirrors `activeStep` from `ui.activeIndex` | chips and scroll spy |
| `editor.html` | `x-for="step in [activeStep]"` | render all fieldsets; the catch-all `step-card` is used for more than one fieldset |

The generic `step-card.html` is the sharp edge: it is the catch-all partial for
equipment and batch today, and the wall needs it in two places at once with
different slices. It must take its slice and actions from a fieldset context, not
from the global.

## 3. Multi-mount inventory

| Concern | Evidence | Risk |
|---|---|---|
| Mount count | one partial at a time via `x-for` over a one-element array | seven fieldsets, ten partials, all mounted |
| Modals | 10 modal partials are included **inside** step partials | every modal shell mounts and evaluates when the wall mounts |
| Teleports | 17 `x-teleport` targets, ids derived from each modal's `data-config` | safe only if every config id stays unique; verify at multi-mount |
| Hidden subtrees | `x-show` still initializes and evaluates (`show-dereference` guard) | more expressions run on load; the guard's null discipline must hold |
| Static ids | no duplicate literal ids across current partials | re-check after partials are included twice (the `step-card` case) |
| Field ids | generated from field ids; a field in two fieldsets would duplicate | the Stage 0 screen map must assign every field exactly once |
| Selects | `select-binding` guard exists because remount applies value before options | the wall changes remount timing; revisit the guard's assumption |
| Listeners | 7 `document`/`window`/`querySelector` uses, none per-card | low risk |
| Read-only | one `fieldset :disabled` wraps the single slot | one wrapper around the wall |
| Tables | `table-architecture` requires fixed tables in a non-scrolling panel | fieldsets may need the panel wrapper |

## 4. Guard impact

| Guard | Assumption | Update |
|---|---|---|
| `include-integrity` | app-level `<load>` set equals `steps[].partial` plus extras | update with the fieldset manifest and drawer partials |
| `ownership` | every partial and app member has an installer owner | register new fieldset/drawer/panel/chips partials and keys |
| `template-scope` | aliases are declared by an enclosing `x-for` | the fieldset loop must declare its alias; partials must not reach outside |
| `x-data-thinness` | markup names an app factory or a declarative schema | add fieldset scope, panel and chips as factories |
| `alpine-handle` | `main.js` owns Alpine.$data for shell/config lookups | register the new components there |
| `show-dereference` | nullable objects are guarded before dereference | holds, but now for every modal and card at once |
| `select-binding` | remount happens at step/editor `x-if` boundaries | re-verify under multi-mount |
| `table-architecture` | fixed tables sit in non-scrolling panels | fieldsets must provide the panel |
| `engine-access` | views do not read the engine directly | the panel reads the producer, not the engine |
| `template-state` | row state comes from `rowState` only | unchanged |

## 5. Surfaces that move

- **Notes drawer:** `step-discussion` (discussion), the hop-strategy section inside
  `step-hops`, the fermentation-strategy section inside `step-yeast`, and
  `step-process` (process notes). The prose components (`formBuilder`,
  `proseFields`) stay; the markup moves.
- **Checklist:** the brew-day card's checklist surface becomes a drawer tab; its
  data and catalog stay.
- **Panel:** new, read-only, fed by the produced field index; the scale pin decides
  which of ABV/OG/FG shows a residual.
- **Chips:** new component; `stepStatus` per slice already exists and can feed the
  status dots; the scroll spy is the only new logic.

## 6. Transition

**2A — Decouple the partials (no visual change).** Introduce a fieldset scope;
replace `activeStep` in every partial with the scoped fieldset. Keep the
one-at-a-time shell. Add a guard: no step partial references `activeStep`.
Exit: single-step shell unchanged, `make test` green, guard green.

**2B — Multi-mount (the technical spike).** Render every current step partial as a
fieldset in the wall. Keep the stepper for now. Measure DOM nodes, mount time,
modal initialization, duplicate ids and focus.
Exit: all partials mounted, no duplicate static ids, no console expression
errors, modals open and close, the read-only wrapper disables the whole wall, and
a measured budget for the Stage 3 regrouping.

**Stage 3 onward** regroups fields per the screen map, adds the panel and drawer,
and Stage 7 removes the navigation state:

- `navigation.js` (`syncNav`, `selectStep`, `resetToStep`, `resetToDiscussion`,
  `next`, `prev`, `keyNav`), ui.activeIndex, ui.highwater, `stepperSteps`,
  `navDir`/`navClass` all retire.
- `resetToDiscussion` becomes "scroll the wall to the top".
- `stepStatus` survives as the chips' completeness input.

## 7. Measurements to take in 2B

| Measure | Why |
|---|---|
| DOM node count, one card vs all | the wall is the default view |
| Alpine init time | ten partials and ten modal shells at once |
| Duplicate ids under multi-mount | labels, fields, table rows, modal slots |
| Console expression errors | `template-scope` and null-safety under more subtrees |
| Read-only disablement | one wrapper vs per-fieldset |
| Focus/teleport | the first modal opened from any fieldset |

## 8. Risks

- **Modal weight.** Ten shells always mounted may cost more than the cards; if so,
  mount a modal lazily on first open, which is a small component change.
- **`step-card` context.** It is the one partial used by more than one fieldset;
  its `activeStep` reads are the first thing 2A must remove.
- **Guard churn.** Eight guards change in the same commit as the shell; that is
  expected, not incidental.
- **No automated duplicate-id check.** A static guard can catch literal ids; the
  dynamic ones are measured in 2B unless a headless DOM harness is added.

## 9. What this audit does not decide

Fieldset membership (Stage 0's screen map), widths, panel content, drawer layout
or the visual grammar. It only maps the Alpine transition.
