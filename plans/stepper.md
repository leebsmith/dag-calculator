---
title: Stepper — replace the footer step tracking
status: proposed
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: make check + make test
---

# Stepper — replace the footer step tracking

> **Status (2026-11-07).** Planned; decisions confirmed; not started.

Replace the footer's active-step title and `Step N of M` counter with a centered
stepper under the menu bar. The stepper is a progress readout and a navigation
aid: completed steps are clickable, pending steps are disabled, and the active
step is marked. The left previous/next rail and the arrow-key navigation stay.

## Locked decisions

1. **Keep the left rail.** The stepper jumps to completed steps; the rail stays
   the linear next/previous affordance and the arrow keys keep working.
2. **Render every step.** Pending steps are visible and disabled. This replaces
   the old `visibleSteps` slice, which hid everything past the watermark.
3. **Placement.** Directly under the menu bar, above the collapsible "Imported
   from" banner: the stepper is chrome, the banner is batch metadata.
4. **Integrated partial, no nested component.** The wizard state already lives on
   the single Alpine root. A second `x-data` object would fork `currentStep` and
   `highWaterMark` from the state the rail, keyboard and cards read.

## Existing state (the behaviour to reuse, not duplicate)

| Brief | Repo | Notes |
|---|---|---|
| `currentStep` | `activeIndex` in `frontend/src/ui/uiStore.js` | mirrored onto the view by `syncNav()` |
| `highWaterMark` | `highwater` in the same store | raised by `next()` and `resetToStep()`, never by `selectStep()` |
| click back | `selectStep(index)` in `frontend/src/adapters/navigation.js` | already refuses an index above the watermark and never lowers it |
| step labels | `steps[].title` in `frontend/src/views/steps.js` | ten authored steps, not the four-item sample |
| state derivation | `syncNav()` | `visibleSteps` is dead: no partial reads it |
| footer to remove | `frontend/src/partials/editor.html` | the step title and the `Step N of M` counter |
| pinned chrome | `frontend/src/style.css` | the App Shell section already names a stepper |

"Completed" means *reached*, matching the brief's "completed or revealed". It is
not a validation verdict; `stepStatus` stays a separate concern.

## Execution checklist

- [ ] Derive the all-step state in `frontend/src/adapters/navigation.js` and replace `visibleSteps` with `stepperSteps`; update the base member in `frontend/src/adapters/stepAdapter.js`.
- [ ] Add `frontend/src/partials/stepper.html` with the nav, ordered list, precomputed state classes, disabled pending steps and `aria-current`.
- [ ] Load the partial under the menu bar in `frontend/src/partials/editor.html` and delete the two footer step-tracking spans.
- [ ] Add the token-only stepper CSS to `frontend/src/style.css` and delete the dead `.footer-step` rule.
- [ ] Extend `tests/frontend/navigation.test.js` for the three states, pending disabled flags, `aria-current`, and watermark preservation when navigating back.
- [ ] Run `make check` and `make test`; resolve any failure.

## Steps

### 1. Derive one stepper model in `frontend/src/adapters/navigation.js`

Replace `visibleSteps` with `stepperSteps`. Every semantic decision is made here
so the template holds no comparisons, arithmetic or string assembly:

```js
function syncNav() {
  const view = getView();
  view.activeIndex = ui.activeIndex;
  view.highwater = ui.highwater;
  view.activeStep = steps[ui.activeIndex];
  view.stepperSteps = steps.map((step, index) => {
    const current = index === ui.activeIndex;
    const reached = index <= ui.highwater;
    return {
      id: step.id,
      index,
      title: step.title,
      state: current ? "active" : reached ? "completed" : "pending",
      disabled: !reached,
      ariaCurrent: current ? "step" : null,
    };
  });
}
```

`selectStep` remains the only click path and its existing guard remains the
authority on the lock. In `frontend/src/adapters/stepAdapter.js`, replace the
`visibleSteps: []` base member with `stepperSteps: []`.

### 2. New partial `frontend/src/partials/stepper.html`

```html
<nav class="stepper" aria-label="Recipe steps">
  <ol class="stepper-list">
    <template x-for="step in stepperSteps" :key="step.id">
      <li class="stepper-item">
        <button
          type="button"
          class="stepper-btn"
          :class="step.state"
          :disabled="step.disabled"
          :aria-current="step.ariaCurrent"
          @click="selectStep(step.index)"
          x-text="step.title"
        ></button>
      </li>
    </template>
  </ol>
</nav>
```

- `<nav>` plus `<ol>` carries order; separators are decorative CSS
  pseudo-elements, not focusable text.
- `disabled` is a real disabled attribute, so pending steps are skipped by the
  keyboard as well as the pointer.
- The active step keeps `aria-current` and stays clickable as a no-op.

### 3. Wire the partial and remove the footer tracking

Immediately after `</header>` in `frontend/src/partials/editor.html`:

```html
<load src="src/partials/stepper.html" />
```

Delete the two footer spans: the active-step title and the `Step N of M`
counter. The rest of the footer (save state, solving, violations, SAI and
findings) is unchanged. Delete the now-dead `.footer-step` rule from
`frontend/src/style.css`.

### 4. Style the stepper in `frontend/src/style.css`

Add a subsection to the App Shell block. The declarations stay token-only for
the strict-value stylelint rule:

```css
/* --- Stepper: menu-bar progress and completed-step navigation --- */

.stepper {
  flex: none;
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
}

.stepper::-webkit-scrollbar {
  display: none;
}

.stepper-list {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: max-content;
  margin: 0 auto;
  padding: 0 var(--space-2);
  list-style: none;
}

.stepper-item {
  display: flex;
  align-items: center;
}

.stepper-item + .stepper-item::before {
  content: "/";
  margin: 0 var(--space-1);
  font-size: var(--text-xs);
  color: var(--sys-text-tertiary);
}

.stepper-btn {
  padding: var(--space-2) var(--space-3);
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--sys-text-secondary);
  background-color: transparent;
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.stepper-btn.active {
  background-color: var(--sys-surface-hover);
  color: var(--sys-color-action-subtle-text);
  font-weight: var(--font-weight-semibold);
  cursor: default;
}

.stepper-btn.completed {
  color: var(--sys-text-primary);
}

.stepper-btn.completed:hover {
  background-color: var(--sys-surface-hover);
}

.stepper-btn.pending {
  color: var(--sys-text-tertiary);
  cursor: not-allowed;
}

.stepper-btn:focus-visible {
  outline: 2px solid var(--sys-border-focus);
  outline-offset: 2px;
}
```

`margin: 0 auto` with `overflow-x: auto` centers the list when it fits and keeps
the start reachable when ten labels overflow a narrow viewport.

### 5. Tests

Update `frontend/src` imports only through the existing test entry point. In
`tests/frontend/navigation.test.js`:

- Give the fixture steps titles.
- Replace the `visibleSteps` assertion with `stepperSteps`.
- Assert the three states and the disabled flags:
  - `activeIndex` 1, `highwater` 2 → `["completed", "active", "completed"]`,
    none disabled, the active row carrying `ariaCurrent: "step"`.
  - `activeIndex` 0, `highwater` 1 → `["active", "completed", "pending"]`, the
    pending row `disabled: true` and `ariaCurrent: null`.
- Extend the back-navigation test: after clicking a completed step, assert the
  watermark is unchanged.

The template guards do the rest: the handler guard resolves `selectStep`, the
scope guard validates the loop alias, and the include-integrity guard resolves
the new load.

## Files touched

- `frontend/src/adapters/navigation.js`
- `frontend/src/adapters/stepAdapter.js`
- `frontend/src/partials/stepper.html` (new)
- `frontend/src/partials/editor.html`
- `frontend/src/style.css`
- `tests/frontend/navigation.test.js`

No artifact, seed, schema, backend or report change. `make generate` is not
needed.

## Out of scope

- Persisting the watermark across reloads; it stays ephemeral UI state and
  resets on sign-out.
- Scoring "completeness" from validations or boundary status.
- Removing or restyling the left rail.
- Changing the import stage nav, which is a separate three-stage control.

## Verification

1. `make check` — eslint and stylelint, including the token rule.
2. `make test` — navigation suites plus the template, handler, store and
   include guards.
3. Manual: open a batch, confirm the footer no longer shows a step counter, the
   stepper sits under the menu bar, the active step is tinted and bold, clicking
   a completed step returns to it without lowering the watermark, and a pending
   step cannot be clicked or focused.
