---
title: UI redesign — the wall, the panel and the drawer
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [surface-audit]
status: proposed
---

# UI redesign

> **Sources:** [`docs/ui-contract.md`](../../docs/ui-contract.md) for what the UI may
> rely on, [`docs/artifact-arc.md`](../../docs/artifact-arc.md) for the station
> reading, [`docs/ui-readiness.md`](../../docs/ui-readiness.md) for the measured
> state. This plan changes the shell and the presentation only; it changes no
> model value, node or solver.

## Goal

Replace the gated step-card UI with a desktop workspace: a scrollable wall of
decision fieldsets, a fixed panel of determinations, and a bottom drawer for the
authored sidecars. Reauthor the CSS into its three tiers on the way.

Success is density and visibility: at 1280×720 a reader sees at least two
fieldsets and a dozen controls above the fold, with the outcome strip always in
view; at 1920×1080 at least three fieldsets and eighteen controls.

## Non-goals

- No mobile layout. Desktop only; native scroll below the baseline.
- No model, artifact, engine, solver or wire change.
- No new values, no new readouts, no derived value moved into a legend.
- No authoring-transform relocation; `data/authoring.json` is read, not changed.
- No dual-shell runtime. The work lands on a branch; the switch is one commit.

## Sources of truth for the design

| Surface | Owns |
|---|---|
| `docs/ui-contract.md` | state, actions, solve statuses, failure vocabulary |
| `docs/artifact-arc.md` | stations, the mandated order, the implied order |
| `docs/ui-readiness.md` | what is ready and what is not |
| `data/surface.json` | which paths exist, their class and families |
| `data/authoring.json` | every authorable action and its constraint |
| `frontend/src/views/steps.js` | the current field inventory to redistribute |
| [`alpine-audit.md`](alpine-audit.md) | what the wall changes in Alpine, and the 2A/2B transition |
| [`../mockups/ui-wall.html`](../mockups/ui-wall.html) | the visual reference for the shell, fieldsets, panel and drawer |

## Locked decisions

### Shell

1. **Desktop 16:9.** Reference resolutions 1920×1080 and 1280×720; below 1280 the
   app scrolls natively, with no tailored layout.
2. **Full-bleed wall.** No centred content column and no fixed page width. The
   panel is the only fixed width on the page.
3. **No media queries** beyond the theme block; the wall flex-wraps instead.

### Wall

4. **Seven fieldsets, no Process.** Targets and scale; Yeast and fermentation;
   Grist; Hops; Mash and sparge; Water; Boil and whirlpool. Process notes are a
   drawer section, not a fieldset.
5. **Width by role.** Full (Targets and scale), narrow 22 rem (Yeast), regular
   26 rem (Mash and sparge, Boil and whirlpool), wide 45 rem (Grist, Hops, Water).
   Targets is a full-width intent bar because it carries the pin, the targets, the
   two band sliders and the fermentation-space popover. Whole rem units are chosen
   from the mockup so two regular fieldsets pair at 1280 and two wide ones pair at
   1920 once the scrollbar gutter is reserved; `flex-grow: 0`; ragged rows accepted.
6. **Flat fieldsets.** 1 px border, legend on the border, 8–12 px padding, no
   elevation. Elevation is reserved for the panel and modals.
7. **Fields sized by role and never stretched.** A scalar is ~8–10 rem, selects and
   short text ~12–16 rem, long text ~20–24 rem, a table or prose block takes the
   row. Rows pack; nothing uses `flex: 1` to fill.
8. **No reordering.** DOM order equals visual order; no dense packing.
9. **No inline readouts**, with two exceptions, both the field's own value: the
   scale pin's residual and the band sliders' exact readout.

### Navigation and completeness

10. **Sticky chips replace the stepper.** One chip per fieldset, title plus a
    status dot; the active chip follows the scroll and focus. The chips are the
    completeness map. Activating a chip expands the fieldset, scrolls it to the top
    and focuses its first editable control, falling back to the legend when the
    fieldset is read-only — a scroll alone is not navigation.
11. **Legend: title, disclosure, and “n defaulted” only when non-zero.** No
    derived anchor values, ever.
12. **Expanded on load.** Per-session collapse memory; no auto-collapse.

### Panel

13. **Fixed 320–360 px, full height, never scrolls.** Only one solver group
    expands at a time; expanding another collapses the first.
14. **Order:** status line; the six-cell strip; the context line; Batch;
    Bitterness; Water; Style; Findings. Style carries the SAI and the dimension
    statuses; the fermentation space is a popover from the Targets controls, not a
    panel group.
15. **Strip:** ABV, OG, FG, IBU, SRM, pH. The pinned quantity among ABV/OG/FG shows
    a residual (`ABV −0.2`); the other two show absolutes.
16. **Context line** under the strip: equipment and style inline, truncated with a
    tooltip; a details popover reuses the report's Equipment and Brewhouse facts
    (same paths, labels and order).
17. **Read-only.** Nothing in the panel is editable.

### Drawer and modals

18. **Bottom dock over the wall only**, pushing the wall rather than overlaying
    it; no backdrop; `clamp(18rem, 38vh, 28rem)`; state remembered per session.
19. **One segmented pill** `[ Notes | Checklist ]` in the header; checklist segment
    carries its progress badge; shortcuts `N` and `C`; Esc closes; focus returns.
20. **Notes is one scroll of four peer markdown sections** — discussion, hop
    strategy, fermentation strategy, process notes. No add-row editors.
21. **Checklist is today's surface**, unchanged, reachable during brew day from
    the frozen bundle.
22. **Row editors remain centred modals:** 42 rem dialog, 72 rem workspace, the
    workspace top-biased; same field roles inside; internal scroll allowed.

### CSS

23. **Keep the class vocabulary.** 304 selectors and 1,561 template usages stay;
    the reauthor changes declarations and file structure, not names.
24. **Three tiers made structural:** primitives, semantic tokens, components.
    Components consume semantic tokens only.
25. **Both themes.** Every new component is checked in light and dark.

### Look

26. **Spacing and type scales stay.** The existing spacing scale and type sizes are
    retained. Discipline comes from role bands, not fewer tokens:
    - controls: 4 / 8 / 12
    - groups: 8 / 12 / 16 / 24
    - layout: 16 / 24 / 32 / 48
    - the micro steps (`--space-0-25`, `--space-0-5`, `--space-1-5`, `--space-5`)
      never appear outside the token layer.
27. **Three radii.** 6 px for controls, 16 px for containers and panels, the pill
    for chips and badges. `--radius-md` and `--radius-lg` retire from use.
28. **Flat by default.** Cards, fieldsets, the panel and the footer carry no
    elevation; structure is a 1 px border and a surface tint. One raised shadow
    for overlays (popover, menu, dialog). Focus is a ring, not a shadow.
29. **Type roles.** 12 px is the floor for anything read as a value;
    `--text-micro` (11 px) survives only for eyebrows, badges and table headers.
    Body and inputs stay at 16 px; values sit at 14–16.
30. **Status is status.** Danger, warning and success tokens appear only in
    selectors that name a state (`status`, `badge`, `finding`, `violation`,
    `error`, `warning`, `success`, `danger`, `invalid`). One accent for emphasis.
31. **Surface hierarchy.** Page canvas grey, containers white, wells grey, raised
    white plus the single shadow.
32. **File roles.** Controls, groups, layout, overlays and utilities are separate
    file families; a file's role decides its allowed bands.
33. **The grammar is guarded.** `tests/guards/visual-grammar.test.js` enforces
    rules 26–30 by file role. Its only exemption is `frontend/src/style.css`, the
    legacy monolith; the exemption shrinks as that file is dismantled and must be
    empty by the end of Stage 6. A stale exemption fails.

### Controls

34. **Unit pills.** A toggleable editable number shows a small unit pill in its
    label row; the global Units menu sets the per-dimension default. Values are
    bare where a pill names the unit; readouts carry the unit in their formatted
    text and have no pill.
35. **Sliders only on declared bands.** IBU and SRM use a slider plus an exact
    readout, in the Targets bar. The scale pin stays a segmented choice plus a free
    number; free values (L:G, runoff, volume, temperatures) never get a slider and
    are never silently clamped.
36. **The fermentation space is a navigator, not a decision.** It is a read-only
    popover from the Targets controls — feasible region, style band, locus and pin
    — with no click-to-set, so the wall stays the only authoring surface.

## Stage 0 — The screen map (no code)

**Scope.** One data file, `data/fieldset-map.json`, assigning every id currently in
the step manifest to exactly one home: a fieldset, the panel, the drawer, or
“retired”. Every root, choice, collection and selection in `data/surface.json`
appears once. The fieldset inventory in §Locked decisions is the target shape.

**Exit criteria**

- `node scripts/run-tests.mjs --files tests/guards/fieldset-map.test.js` passes:
  coverage of every current step field and every authorable action, no duplicates,
  no unknown ids.
- The map names, for each fieldset, its width role and the fields it owns.
- No open classification questions.

## Stage 1 — CSS tiers (mechanical, no visual change)

**Scope.** Split `tokens.css` into primitives and semantic tokens; add the layout
tokens (`--width-rail`, `--width-field-max`, `--size-control-h`, `--space-gutter`);
establish the role file names (`control-*`, `group-*`, `layout/*`, `overlay-*`,
`utilities/*`) and add `tests/guards/visual-grammar.test.js` with
`frontend/src/style.css` as its only exemption.

Component extraction is deferred to Stage 6: extracting now would put the old rules
under the grammar guard, which they cannot pass until the visible remap. The two
style queries are classified rather than deleted: the reduced-motion query stays,
and the `min-width: 60rem` step-field breakpoint goes with the step shell in Stage 7.
No class renames, no visual change at the baseline.

**Exit criteria**

- `make check` green, with the CSS guards updated deliberately rather than
  bypassed: contrast, vocabulary, classes, duplication, theme tokens, allowlist.
- `node scripts/run-tests.mjs --files tests/guards/visual-grammar.test.js` passes:
  `frontend/src/style.css` is the only exempt file, every new file complies with
  its role, and a stale exemption fails.
- Component CSS references only semantic tokens (strict-value rule; exceptions
  documented like the existing ones).
- The reduced-motion query stays; the `min-width: 60rem` breakpoint is recorded
  for Stage 7; the only other media query is the theme block.
- Local visual check at 1920×1080 and 1280×720 is pixel-stable.

## Stage 2 — Alpine transition and shell

The coupling and the risks are mapped in [`alpine-audit.md`](alpine-audit.md); this
stage follows its 2A/2B split.

**2A — Decouple the partials (no visual change).** The shell exposes a fieldset
manifest (`views/fieldsets.js`) and renders one entry through
`x-for="fieldset in [fieldsets[activeIndex]]"`. Partials read the `fieldset` x-for
alias — id, slice, title, subtitle, width, groups, fields — instead of the global
`activeStep`. Keep the one-at-a-time shell. Add a guard: no step partial references
the global active step.

**2B — Multi-mount.** Render every current step partial inside the wall; keep the
stepper for now; measure the audit's §7 list: DOM nodes, mount time, modal
initialization, duplicate ids, console errors, read-only disablement, focus and
teleports. The panel is a shell placeholder at this point.

**Budget.** The mounted wall adds at most 2.5× the single-card DOM node count, and
boot-to-interactive grows by at most 300 ms over the single-card baseline on the
local box, with no long task over 50 ms. If the modal shells are the cost, mount a
modal lazily on first open and record the choice.

**Exit criteria**

- 2A: the single-step shell is unchanged, the no-`activeStep` guard passes, and
  `make test` is green.
- 2B: all partials mounted; no duplicate static ids; no Alpine expression errors;
  modals open and close from any fieldset; the read-only wrapper covers the wall.
- The audit's §7 measurements are recorded against the budget, with a gap list for
  Stage 3.
- At 1920×1080 and 1280×720: no horizontal scroll, the panel is fixed and full
  height, the wall scrolls under the chip row.
- The chip row lists the current steps and follows the scroll.
- Activating a chip scrolls and focuses the first editable control; a read-only
  fieldset focuses its legend, with a visible landing cue.
- Keyboard order follows the DOM; focus is visible.
- The guards named in the audit are updated in the same commit.
- `make check` and `make test` green.

## Stage 3 — The seven fieldsets

**Scope.** Redistribute the existing fields per the screen map into the seven
fieldsets, reusing the current partials and field models. Targets becomes the
full-width intent bar: pin, targets, volume, the two band sliders and the
fermentation-space popover. Readouts move to the panel groups; no field behaviour
changes.

**Exit criteria**

- Every entry in the screen map is rendered exactly once, in its declared home.
- The field index produced by the producer is unchanged for every editable field
  (a parity test compares old and new field sets).
- `views/fieldsets.js` is authoritative: the coverage guard reads it, and
  `data/fieldset-map.json` has no remaining readers (Stage 8 deletes it).
- No fieldset shows a readout (except the scale pin residual and the band-slider
  readouts).
- The fermentation-space plot is read-only and opens from the Targets controls.
- `make test` green; the panel still shows placeholder groups.

## Stage 4 — The panel

**Scope.** Build the panel from the manifest descriptors and the engine: status
line, six-cell strip with the pin rule, context line with the details popover, the
three solver groups, the style group and findings.

**Exit criteria**

- The six cells, the context line, the style group and every group path exist in
  the surface manifest; no panel value is editable.
- The context popover's path list equals the report's Equipment and Brewhouse
  lists (a guard compares them).
- Only one group expands at a time; the panel never scrolls at 720p.
- Pending, blocked and error states render without inventing zero.
- `make test` green.

## Stage 5 — Drawer and modals

**Scope.** The bottom drawer with the segmented pill, the Notes tabs over the four
prose fields, the Checklist tab, shortcuts, and the modal sizing rules.

**Exit criteria**

- The drawer pushes the wall and never covers the panel.
- Notes is one scroll with four sections; the checklist matches today's surface.
- Opening a row editor from the wall keeps the focus trap; Esc and focus return
  behave as now.
- `make check`, `make test` green; include and ownership guards updated.

## Stage 6 — Density and themes

**Scope.** Extract the component files into their role names; apply the role
bands, the three radii, flat containers, the type roles and status discipline; burn
the visual-grammar exemption to nothing; check every component in both themes; run
the local visual harness against the baseline.

**Exit criteria**

- `node scripts/run-tests.mjs --files tests/guards/visual-grammar.test.js` passes
  with no violations and no exemptions.
- The visible remaps are deliberate and listed in the commit: micro spacing steps
  pulled into the bands, 8/12 px radii mapped to 6 or 16, container shadows
  replaced by borders, and 11 px values raised to 12.
- The density targets in §Goal are met at both resolutions.
- The contrast guard covers every new pair in both themes.
- `make test-visual BASE=<branch-point>` is reviewed locally.
- The wall matches `mockups/ui-wall.html` at 1920×1080 and 1280×720; every
  deviation is listed in the commit with a reason.
- No control falls below the 32 px desktop height.

## Stage 7 — Retire the step shell

**Scope.** Delete the stepper, the step-card shell, the `min-width: 60rem`
step-field breakpoint and the CSS it owned; point the view at the wall; update docs
and the readiness ledger. Retire the navigation
state the audit names: `navigation.js` (`syncNav`, `selectStep`, `resetToStep`,
`resetToDiscussion`, `next`, `prev`, `keyNav`), ui.activeIndex, ui.highwater,
`stepperSteps`, `navDir`/`navClass`. `resetToDiscussion` becomes “scroll the wall
to the top”; `stepStatus` survives as the chips' completeness input. Stage 8 is
the documentary and archive close-out.

**Exit criteria**

- No dead shell selectors, partials or navigation state remain; the CSS guards are
  clean and the `activeStep` guard is green.
- `docs/ui-readiness.md` records the new shell as built; `TODO.md` closes the
  design item.
- `make verify` green.
- The branch merges; `main` stays shippable throughout.

## Stage 8 — Retire and archive

**Scope.** Remove the transition scaffolding, update the living docs and archive
the record. No behaviour changes.

**Code removal**

- `frontend/src/partials/stepper.html`
- `frontend/src/adapters/navigation.js` and its installer entry and keys
- `frontend/src/views/steps.js` and `stepDisplay.js`; `views/fieldsets.js` is the
  only manifest
- `frontend/src/partials/step-card.html`, once every fieldset has its container
- the step, stepper, step-row, step-slot and step-card CSS that no class uses
- `stepStatus` survives for the chips; every other navigation member is gone

**Docs to update**

- `docs/adding-a-node.md`: fieldset manifest, not a step manifest
- `docs/ui-contract.md` §6: link the built shell instead of the open question
- `docs/ui-readiness.md`: scorecard records the shell as built
- `docs/adsco/ui.md`: reconcile the card/step container terms with fieldsets
- `TODO.md`: close the design item
- `make generate` refreshes `docs/frontend-ownership.md`

**Archive or delete**

- move `plans/ui-redesign.md` and `plans/alpine-audit.md` to
  `plans/archive/<completion-month>/`
- delete `data/fieldset-map.json`; the coverage guard now reads the fieldset
  manifest
- delete `mockups/ui-wall.html` (or move it to a frozen design archive) and remove
  every reference
- leave `plans/surface-audit.md` in place as the model-surface record

**Exit criteria**

- `rg "activeStep|activeIndex|highwater|stepperSteps|navDir|navClass" frontend/src`
  returns nothing.
- No living doc or partial describes the old shell; references survive only under
  `docs/historical/` and `plans/archive/`.
- `views/fieldsets.js` is the single manifest; its coverage guard passes; the
  fieldset map file is gone.
- No reference to `mockups/ui-wall.html` remains.
- `plans/archive/<completion-month>/` holds the plan and audit, and
  `tests/guards/archive-layout.test.js` passes.
- `make verify` green; the branch has merged and `main` is shippable.

## Whole-plan exit

- Density targets met at 1920×1080 and 1280×720.
- No model, artifact, engine or solver change in the diff.
- The visual-grammar guard is clean with no exemptions.
- Both themes, all guards, `make verify` green.
- The old shell gone; one shell, one navigation model.
- The fieldset map and mockup are removed, the plan and audit archived, and the
  living docs updated.

## Risks

- **The template surface is large.** 1,561 class usages mean a shell change touches
  many partials. Mitigation: keep names and field models; move containers only.
- **Guards will resist.** Contrast, vocabulary, duplication, allowlist and
  ownership all encode the old shell. Each stage updates them deliberately.
- **Visual regressions are invisible to CI.** `make test-visual` is local; the
  branch needs a manual pass at both resolutions.
- **The panel can become a second wall.** Mitigation: fixed height, one expanded
  group, drill-down instead of growth.
- **The grammar lands visibly in Stage 6.** Micro spacing steps, 8/12 px radii,
  container shadows and 11 px values are all remapped; the diff is visible even
  though the model is untouched.
- **File-role naming constrains the CSS split.** Rules must be grouped by control,
  group, layout or overlay, not by their legacy section.
- **Ragged rows at 1280.** Wide fieldsets occupy a row alone and the narrow Yeast
  card can be orphaned beside them; the empty space is canvas, not card interior,
  and is accepted for now. Revisit by folding yeast into the intent bar if it
  reads badly.
- **Modal weight under multi-mount.** Ten modal shells mount with the wall; if the
  audit's 2B measurement shows it costs too much, mount a modal lazily on first
  open.
- **Two shells briefly.** Mitigation: branch work, one switch commit, no runtime
  flag.

## Deferred

- Authored summaries in legends (e.g., “4 malts”): revisit if the wall feels
  anonymous.
- A true popout panel (second window) with `BroadcastChannel` state sync.
- Mobile: intentionally out of scope.
- The pin label style for residuals: settle during Stage 4.
