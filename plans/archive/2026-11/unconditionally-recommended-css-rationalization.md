---
title: Unconditionally recommended CSS rationalization
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: every rename commit preserves matched declarations and layout; make check and make test green
status: shipped
---

# Unconditionally recommended CSS rationalization

Status: shipped. This file records the part of the UI-container rationalization
that holds regardless of the naming, sequencing, or tooling choices. The choices
are recorded as settled in §9 and the shipped evidence is in §10.

## 1. Why

The UI is copy-driven: nine step partials plus modals and import panes, each
copying a card header, a card body, two to four card sections and table wrappers.
A consistent vocabulary compounds because every new partial inherits it. The
current vocabulary has already been cleaned twice — `plans/archive/2026-11/hops-card-sections.md`
retired eight class names, `plans/archive/2026-10/css-consolidation.md`
consolidated the surfaces — and it drifted again. The existing
`tests/guards/ui-vocabulary.test.js` only checks a hardcoded retired list, so a
new synonym passes review.

The multiply-named containers, counted in `frontend/src/partials`:

| Concept | Names today | Uses |
| --- | --- | --- |
| Page card | step-card, plus the dormant card rule | 9 |
| Boxed region | synthesized-card, with card-section as a collapsible modifier | 22 (11 collapsible) |
| Centred surface | library-panel, signin-panel, library-overlay | 3 |
| Unboxed region | library-section, landing-imports, step-group, map-section | 11 |
| Region heading | section-title, library-heading, import-section-title | 35 |
| Micro-heading | synthesized-title, group-title | 20 |
| Empty state | table-empty-cell on td and on div | 9 |
| Static field label | form-label on span | 19 |
| Row actions | table-action-cell on div | 6 |
| Read-only step header | brew-day-step-toggle on div | 2 |
| Catalog pane | catalog-drawer-content and siblings | 6 |
| Item card | catalog-item-card | 8 |
| Detail pane | detail-panel | 2 |
| Drawer | modal-workspace-drawer and modal-drawer parts | 6 |

The recipes, not taste, constrain the scheme:

- The dormant card rule and step-card are different surfaces; step-card wins.
- card-section is **already taken**: it carries `gap: 2` for a synthesized card
  that hosts a disclosure. It cannot become the generic boxed-region name without
  moving that meaning to a modifier.
- library-panel and signin-panel differ in surface, radius, padding, gap,
  max-width, max-height and overflow. They cannot share a base rule.
- group-title is semibold; synthesized-title is bold. import-section-title
  inherits the 16px body size; section-title is 14px.
- data-table-container adds a border, radius and surface. Wrapping a bare table in
  it draws a second box.

## 2. The invariant core

These hold regardless of the names chosen, the sequencing, or whether the visual
harness is committed.

1. **Acceptance is declaration equivalence.** A rename commit may preserve the
   matched declarations and layout, and nothing else. A change that alters a
   computed value is a different change.
2. **Derive the scheme from the recipes.** Group by actual declaration sets,
   express variants as modifiers, and never merge two visually distinct rules
   into a forced shared base.
3. **The durable artifact is the guard, not the rename.** Add a container
   contract that fails on an unregistered new container, a recipe change, or a
   wrong element. It must be introducible against today's names, so it does not
   depend on the rename landing first. Without it, the cleanup decays.
4. **Keep CI hermetic; browser checks are local tools.** Commit the
   generator/comparator, not screenshot baselines; generate baselines from a git
   ref; skip cleanly when Chrome is absent. Static checks belong in make test and
   CI; rendering checks follow the test-fuzz and test-oracle precedent.
5. **Prove the change even if the tool is not committed.** A one-off static
   declaration/cascade diff plus a computed-style snapshot is required evidence
   for this pass.
6. **Corrections are separate commits with before/after evidence.** Affordance
   and behaviour changes — hover scoping, disabled chips, read-only cursor, table
   wrappers, region wrappers — are never mixed into a zero-drift rename.
7. **Every rename commit is self-contained and green.** Retired-name entries, the
   CSS allowlist, and the living doc change in the same commit as the rename.
8. **Reverse decisions are recorded.** If the pass supersedes the 2026-10
   sheet/panel decision or the 2026-11 drawer-title decision, say so and why.
   Plans are decision records; silent reversal is the failure mode.
9. **No dependencies and no artifact changes.** Templates, CSS, guards and docs
   only; no `package.json` or `pyproject.toml` edit, no make generate.

## 3. Working scheme (proposal, not part of the invariant)

This is the scheme the invariants are expected to protect. The names remain open
(§6); the shape does not.

```
card                         page surface
├── card-header / card-title / card-subtitle
├── card-body
└── card-section[--collapsible]      boxed region
    ├── card-section-header > eyebrow[--group]
    └── card-section-actions

region[--divided | --spaced]         unboxed named area
└── region-title[--pane]

sheet[--library | --signin]          centred surface
sheet-overlay

section-toggle / section-body / section-meta / section-chevron
```

Distinct leaves stay distinct: catalog-item-card, detail-panel,
modal-workspace-drawer and modal-drawer parts, data-table-container, alert.
Element rule: `section` for card, card-section, region and sheet; `div` for item,
detail and modal; `span` for a title only when it sits inside
`button.section-toggle`.

## 4. Proof standard

The environment has Chrome, Node with a global WebSocket, and ImageMagick, so no
dependency is needed.

1. Freeze the current commit in a scratch worktree.
2. Generate a static container fixture from the partials: tags, classes and
   nesting preserved; Alpine directives stripped; everything visible; the
   app-shell → step-body → step-card-content nesting kept so container queries
   resolve.
3. Snapshot computed styles for every container element (all properties plus
   bounding rects) and screenshots at 1280px and 600px.
4. Repeat after the rename. The computed-style JSON diff must be empty and
   `compare -metric AE` must report zero.
5. Run a static cascade diff as the second proof: parse `frontend/src/style.css`
   before and after, and for every mapped element assert the ordered matching
   rules and final winning declarations are identical.
6. Take the baseline twice first to establish the noise floor. Computed styles
   are deterministic; scrollbars and font loading are not.

## 5. Guard standard

- A registry of approved container blocks and variants: name, allowed element,
  normalized declaration set or hash.
- A static guard, in CI, that fails on a recipe drift, a wrong element, or an
  unregistered new container.
- Extend `tests/guards/ui-vocabulary.test.js` with every retired name.
- Extend `tests/guards/control-states.test.js` for the form-label rule and
  `tests/guards/table-architecture.test.js` only where the rule is cheap.
- Update `tests/guards/css-allowlist.json` in the same commit; stale entries
  fail.
- No Chrome, no screenshots, no baselines in CI.

## 6. Decisions (settled by §9)

The table below is retained as the option record; §9 records the choices made.

| Decision | Options |
| --- | --- |
| Page-card name | card, or keep step-card |
| Sheet names | sheet plus modifiers, or keep library-panel and signin-panel |
| Region-title size | one 14px class, or 14px plus a 16px pane modifier |
| Landing heading | merge with card-title, or keep its own name |
| Sequencing | guard first against current names, or rename first |
| Commit granularity | per block, or one diff |
| Static guard location | CI, or local only |
| Visual harness | commit as a local tool, or use once and discard |
| Corrections | include none, or approve each with evidence |

## 7. Scope and constraints

- No new dependencies, no artifact changes, no generated data.
- `docs/adsco/ui.md` gains a one-page container vocabulary with the element and
  modifier rules.
- A superseded decision gets one paragraph naming the prior plan and the reason.
- The three prior cleanups are the evidence base; this plan does not re-litigate
  their outcomes beyond the specific reversals recorded above.
- Deferred corrections, each a separate visual change: unit-badge hover/focus
  scoping; disabled segmented items as buttons; the read-only brew-day pointer
  cursor; wrapping the import-delta tables; adding region wrappers in the import
  panes; the alert paragraph-to-div and catalog item span-to-div tag changes.

## 8. Acceptance

The invariant core is satisfied when:

- the scheme doc exists and the guard registers every container in use;
- a rename commit carries static equivalence evidence and a zero-diff visual
  snapshot;
- corrections are filed separately with their own evidence;
- make check and make test are green on every commit.

## 9. Execution checklist

The open decisions are settled for this pass as follows: page card is `card`;
sheets are `sheet` with `--library` and `--signin`; `region-title` is 14px; the
import panes keep `pane-title` because the UA heading size differs by tag;
`landing-heading` keeps its name; the guard lands with the rename; the visual
harness is used once and not committed; corrections are deferred.

- [x] Record the baseline: before copies of `frontend/src/style.css` and the
      partials, plus the container inventory used by the proof.
- [x] Page cards: `step-card` -> `card`, `step-card-header` -> `card-header`,
      `step-card-content` -> `card-body`; delete the dormant `card` rule.
- [x] Sheets: `library-panel` -> `sheet--library`, `signin-panel` ->
      `sheet--signin`, `library-overlay` -> `sheet-overlay`.
- [x] Boxed regions: `synthesized-card` -> `card-section`, the existing
      `card-section` -> `card-section--collapsible`, `synthesized-header` ->
      `card-section-header`, `synthesized-actions` -> `card-section-actions`;
      every boxed region becomes a `section`.
- [x] Unboxed regions: `library-section` -> `region--divided`,
      `landing-imports` and `step-group` -> `region`, `map-section` ->
      `region--spaced`.
- [x] Titles: `section-title` and `library-heading` -> `region-title`,
      `import-section-title` -> `pane-title`, `synthesized-title` ->
      `eyebrow`; `group-title` stays because its UA margin differs.
- [x] Leaves: `table-empty-cell` -> `empty-state`, `catalog-drawer-*` ->
      `catalog-pane-*`, `div.table-action-cell` -> `row-actions`,
      `span.form-label` -> `field-label`.
- [x] Guards: boundary-aware retired-name matching, a container contract and
      recipe registry, and the CSS allowlist update.
- [x] Docs: add the container vocabulary to `docs/adsco/ui.md`.
- [x] Proof: static declaration and element mapping diff, plus a Chrome
      computed-style fixture; both must be empty.
- [x] Gates: make check, make test, make build.
- [x] Archive this plan and commit the completed pass.

## 10. Postscript — shipped evidence

Proof, recorded after the pass: 24 selector pairs with 0 declaration changes;
2,334 elements with 0 class-mapping failures; 43 partials and 11,613 elements
with 0 computed-style and 0 layout diffs. The fixture was generated from the
partials before and after, stripped of Alpine directives, with animations and
transitions disabled, and compared in Chrome 157 headless over computed styles
and bounding rects.

Two recipes deliberately stayed separate because merging them would have moved
pixels:

- `pane-title` stayed for the import panes. The old `import-section-title` set
  no font size, so an `h3` rendered at the user-agent 18.72px while an `h4`
  rendered at 16px; one `region-title` size could not preserve both.
- `group-title` stayed. `eyebrow` carries `margin: 0`, while the group heading
  relied on the user-agent heading margins.

**Superseded decisions.** `plans/archive/2026-10/css-consolidation.md` Q1 kept
`library-panel` and `signin-panel` as separate elevation roles and declined a
panel primitive. This pass consolidated both into the `sheet` block but kept
each rule intact as `sheet--library` and `sheet--signin`, so the elevation
recipes did not merge. `plans/archive/2026-11/hops-card-sections.md` kept
`section-title` for drawer headers; this pass renamed that vocabulary to
`region-title` and kept the drawer use, preserving the declaration set.

**Harness deviation.** The visual fixture and comparator were used once and not
committed, which departs from invariant #4. The durable artifact is the static
container contract; committing a local visual harness remains in `TODO.md`.
