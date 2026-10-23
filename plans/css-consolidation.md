# CSS Consolidation & Drift Guardrails

Status: proposed
Scope: frontend stylesheet and its guardrails
Out of scope: card behaviour, artifact/data changes, backend

Revised after review against `bf4cee8`, then revised again to adopt the review
recommendations: the two open questions are now decisions, the phases are
renumbered into execution order (guards before cleanup), and the stylesheet
split is deferred. Corrections are recorded in
[Review findings](#review-findings) so they are not re-litigated.

## Goal

Reduce one-off CSS and prevent structural drift without changing the rendered
UI. Raw values are already token-guarded by stylelint; the gap is duplicated
component recipes, dead selectors, and the single 2,500-line stylesheet.

## Baseline

Measured at `bf4cee8` (after the water card restructure):

- `frontend/src/style.css`: 2,482 lines, 334 rule blocks, 260 distinct classes.
- 36 groups of byte-identical declarations, covering 92 selectors.
- 38 styled classes with no static reference (some dynamic or legacy).
- 20 selectors that recur across rule lists (not the same thing as duplicated
  declaration blocks).
- 43 fully-dead rules occupying **316 lines (12.7%)**, plus 3 rules that need
  selector-level surgery because only one selector in the list is dead.
- Same-line gates as today: `make check` = eslint + stylelint + ruff + tach;
  `make test` = node --test (includes `tests/guards/`) + pytest. There is no CI
  workflow; `make verify` is the local gate.

The landed guard measures **35 duplicate rule-block groups** and **34
unreferenced classes** at `3c84b15`. The earlier draft's 36/38 came from a
per-selector/looser-token definition; the guard's rule-block and exact-token
definitions are the ones that stay reproducible.

## Tracking

Execution order is top to bottom. Guards land before cleanup so the allowlist
doubles as the cleanup work list.

| Phase | Status | Acceptance gate |
|---|---|---|
| 0. Decisions & rule alignment | Complete | Decisions recorded; rulebook amended; no code change |
| 1. Guardrails | Not started | Guards run in `make test` on a seeded baseline; rulebook updated |
| 2. Water CSS collapse | Not started | Water card renders identically; dead water rules removed; `make check` passes |
| 3. Backlog paydown | Not started | Duplicate groups resolved or allowlisted; 43 dead rules removed |
| Deferred: stylesheet split | Decision recorded | Not scheduled; reasons below |

Mapping from the earlier draft: old Phase 2 → Phase 1, old Phase 1 → Phase 2,
old Phase 4 → deferred.

## Phase 0 — Decisions & rule alignment

- [x] Resolve the rulebook contradiction: `docs/style-rulebook.md` §9 says
      "No utility-first class soup in markup — use semantic state classes",
      while Phases 2 and 3 substitute utilities (`text-xs text-muted`,
      `text-danger`). Narrow §9 to *state* (no utility soup for `is-*`-style
      state), and permit utilities for typography and color deltas. Decision:
      **utilities for type/color, semantic classes for state and layout
      structure.**
- [x] Add the composition rule to the rulebook now: a component class declares
      only its deltas; shared surface/typography recipes come from primitives or
      utilities.
- [x] `sev-*`: keep as a documented exception. They are dynamic
      (`sev-${severity}` at `frontend/src/adapters/cards/water.js:301`) and
      duplicate `text-danger`/`text-warning`/`text-muted` exactly, but replacing
      them requires editing `water.js`, which is outside this plan's scope.
- [x] Panel primitive (review Q1): **reuse `.synthesized-card`; do not introduce
      a new panel primitive.** The competing surface classes (`step-card`,
      `library-panel`, `signin-panel`, `landing-freeze-card`, `catalog-item-card`,
      `modal-*`, `telemetry`) encode different elevation roles. The four
      panel-shaped duplicate groups (19, 20, 21, 25) are allowlisted in Phase 1.
      Revisit only when a third genuine consumer appears.
- [x] `.font-semibold` (review Q2): **add the utility.** `--font-weight-semibold`
      already exists; the utility set stops at `font-medium`/`font-bold` for no
      stated reason. Phase 2 consumes it for the water verdict line.
- [x] Note the empty `frontend/src/styles/` directory as the deferred split
      target.
- [x] PurgeCSS: remove `purgecss.config.js`, the `npm run purgecss` script, and
      the devDependency. Nothing in `make build`/`check`/`test` invokes them.
      Removing the devDependency is a dependency change and needs explicit
      sign-off; sign-off taken from the request to execute this plan.

Acceptance: the decisions above are recorded in this plan and the rulebook is
amended; no source files change. Config and dependency removal lands as a
separate commit because it touches source files.

## Phase 1 — Guardrails

Land the guards against a **seeded** allowlist so they pass on today's tree. The
seed is the Phase 3 work list; each cleanup step deletes an entry.

- [ ] Seed the allowlist from the baseline: all 36 duplicate declaration groups
      and all 38 unreferenced classes, each with a one-line reason. Include
      `.text-secondary`, which Phase 2 starts using.
- [ ] Add `tests/guards/css-duplication.test.js`: parse `style.css`, normalize
      declaration blocks (split on `;`, trim, collapse whitespace, sort), group
      by normalized text, and fail when a group has more than one consumer
      outside the allowlist. Normalize per selector so the "selector in a shared
      list plus its own rule" pattern is caught — this is the pattern that
      produced the water rules.
- [ ] Add `tests/guards/css-classes.test.js`: collect `.class` tokens from the
      stylesheet, scan `frontend/src/**/*.{html,js}` and `frontend/index.html`
      with word-boundary matching, and fail on unreferenced classes outside the
      allowlist. Safelist `sev-*` (single dynamic construction site:
      `water.js:301`) and future runtime-built names.
- [ ] Allowlist format: one entry per `selector`/`class` with a required reason
      and an optional follow-up phase. Document adding and removing entries; an
      entry without a reason fails review.
- [ ] Enable stylelint `no-duplicate-selectors` as a cheap regression lock only.
      It reports **0 problems** on the current file and detects only identical
      whole selector lists in the same at-rule context; it does not see the 36
      declaration groups or cross-list repetition. Do not rely on it for the
      duplication guard.
- [ ] Rely on the existing glob in `npm test` (`../tests/guards/*.test.js`), so
      the guards run in `make test` and therefore `make verify`. Do not add a
      parallel wiring path in `make check`.

Acceptance:

- Guards pass on the seeded baseline (`make test` green before any cleanup).
- A new exact duplicate outside the allowlist fails `make test`.
- A new unreferenced class outside the safelist fails `make test`.
- The rulebook states the delta-only rule and the narrowed §9.
- The allowlist format and review requirement are documented.

## Phase 2 — Collapse water CSS onto existing primitives

Verified against `frontend/src/partials/step-water.html` at `bf4cee8`. Pure
deletions and live-rule conversions only; the table unification moved to Phase 3
because it is the only item here with a visual regression surface.

Dead, delete outright:

- [ ] `.water-summary` — no markup consumer.
- [ ] `.water-basis`, `.water-destinations`, `.water-ratio-basis` — no markup
      consumer.
- [ ] `.pin-row`, `.pin-row:hover` — no markup consumer.
- [ ] `.pin-row input[type="checkbox"]` — delete **only this selector** from
      the shared `accent-color` block; `.mash-rest-toggle input[type="checkbox"]`,
      `.brew-day-step-toggle input[type="checkbox"]`, and `.extract-slider` stay.

Still in markup, convert rather than delete:

- [ ] `.water-target-line` (html:149) → `text-xs text-secondary font-medium` on
      the element, then delete the rule and its selector from the shared
      `margin: 0` list.
- [ ] `.water-ratio` (html:150) → `text-sm font-semibold text-primary`, using
      the Phase 0 utility, then delete the rule.
- [ ] `.water-not-modelled` (html:264) → `text-xs text-muted`, then delete.

Keep:

- [ ] `.telemetry`, `.telemetry-row` — live in the Details panel.
- [ ] `.sev-*` — dynamic and live (Phase 0 decision).
- [ ] `.water-treated` — the table stays as-is in this phase.

Bookkeeping:

- [ ] Remove the allowlist entries this phase resolves (`.water-summary`,
      `.water-basis`, `.water-destinations`, `.water-ratio-basis`, `.pin-row`
      variants, and `.text-secondary` now that it is used).
- [ ] Hand the water-table duplication (3 identical rules, 2 conflicting) to
      Phase 3.
- [ ] Escalate the orphaned co-selectors to Phase 3: `.metric-cell-unit`
      (after `.water-destinations`/`.water-target-line` leave its group) and
      `.alert p` (after the water list leaves the `margin: 0` group).
- [ ] Record the net line reduction **after** the markup edits, with before and
      after line counts.

Acceptance:

- No CSS rule without a markup/JS consumer in the water slice.
- Water card appearance unchanged: target grid, verdict lines, treatment grid,
  details telemetry.
- Allowlist entries for the removed rules are gone.
- Net line reduction recorded in this plan.

## Phase 3 — Pay down the existing backlog

Group sizes below are at `bf4cee8`; Phase 2 removes three water selectors, so
re-measure before starting.

- [ ] Muted-xs group (7 selectors: `.table-header-meta`, `.recipes-hint`,
      `.landing-create-hint`/`.landing-row-hint`/`.landing-freeze-date`,
      `.footer-step-count`, plus three water rules removed in Phase 2) →
      `text-xs text-muted`. This touches 14 markup sites; scope it as its own
      commit.
- [ ] Danger group (4: `.collection-readout.is-invalid`, `.status-badge-danger`,
      `.text-danger`, `.sev-error`) → keep `.text-danger` as the utility, apply
      it in markup, keep `.sev-error` per Phase 0.
- [ ] Warning group (3: `.status-badge-warning`, `.text-warning`,
      `.sev-warning`) → same treatment.
- [ ] Water table: `.water-treated` root, `thead`, and `tbody tr` are
      byte-identical to `.data-table`, `.data-table thead`,
      `.data-table tbody tr`; they are duplicated, not merely similar. Two rules
      genuinely conflict: `th`/`td` padding is `space-2 space-3` vs
      `.data-table`'s `space-3`, and `.data-table thead th { text-align: center }`
      fights the water table's left-aligned first/last column. Choose
      **`.data-table` plus a `.data-table--dense` modifier** and delete
      `.water-treated`; fall back to keeping `.water-treated` only if the
      modifier changes another table.
- [ ] `tbody tr:last-child { border-bottom: none }` (3: `.data-table`,
      `.landing-table`, `.water-treated`) → collapse onto the same decision;
      keep one rule.
- [ ] Review the remaining ~32 groups; classify each as shared recipe,
      coincidental convergence, or deletion candidate. Roughly 10 are genuine
      recipes (focus rings, button hover, flex-row/flex-column clusters, panel
      headers); the rest are coincidental and stay allowlisted with reasons.
- [ ] Consolidate panel recipes into a small documented set — canvas output card,
      subtle summary strip, inset telemetry — reusing `.synthesized-card`. The
      four panel pairs stay allowlisted per Phase 0.
- [ ] Delete the dead CSS identified by Guard B: 43 fully-dead rules (316 lines)
      plus selector surgery on the three mixed rules (`.text-right` /
      `.align-right`, `.badge-warning` / `.badge-amber`, and the water margin
      list). Do not wire PurgeCSS; its configuration is removed in Phase 0.
- [ ] Remove each resolved entry from the allowlist, update the baseline metrics
      in this plan, and state the final allowlist size.

Acceptance:

- Duplicate declaration groups reduced to the justified allowlist.
- No unreferenced classes outside the safelist/allowlist, as reported by Guard B.
- ~316 lines of dead CSS removed, or the shortfall explained.
- Visual check on the affected cards: water, data tables, modals, landing,
  reduced-motion.

## Deferred — Split the stylesheet

Decision: **defer, and do not schedule without a new trigger.** The split axis is
component type, but the editing axis is per-card work, so the mapping does not
match how the code is touched. The largest block is ~510 lines, the repo is
single-developer with no merge-conflict pressure, and the section headers already
provide navigation. Splitting now would distribute any remaining drift across 13
files without reducing it.

The section map is retained for a future attempt:

| Block | Source lines | Target |
|---|---|---|
| 1. Reset & base | 1–47 | `styles/01-base.css` |
| 2. Buttons & controls | 48–188 | `styles/02-buttons.css` |
| 3. Form controls | 189–369 | `styles/03-forms.css` |
| 4. Cards & containers | 370–403 | `styles/04-cards.css` |
| 5. Alerts | 404–448 | `styles/05-alerts.css` |
| 6. Status badges | 449–495 | `styles/06-badges.css` |
| 7. Modal + 7b. Grain bill editor | 496–882 | `styles/07-modal.css` |
| 8. Data tables | 883–972 | `styles/08-tables.css` |
| 9. App shell + 9b. Recipe landing | 973–1779 | `styles/09-shell.css` |
| 10. Shared component library | 1780–2237 | `styles/10-components.css` |
| 11. Reduced motion | 2238–2256 | `styles/11-motion.css` |
| Style target picker | 2257–2331 | `styles/12-pickers.css` |
| Water chemistry card | 2332–end | `styles/13-water.css` |

If it is revived: move each block whole, preserve order in `index.html` after
`tokens.css`, use `<link>` tags rather than `@import`, keep `tokens.css` as the
only token source, and confirm `scripts/check-build.mjs` (asset existence only)
still passes.

## Review findings

Recorded so the corrections are not re-introduced:

1. Water rules still in markup: `.water-target-line`, `.water-ratio`,
   `.water-not-modelled` at `step-water.html:149,150,264`, with no utility
   classes applied. Deleting them without the markup edit changes rendering.
2. `.font-semibold` does not exist; only `font-medium`/`font-bold`.
3. `.pin-row input[type="checkbox"]` shares a block with three live selectors.
4. stylelint 16.26.1 `no-duplicate-selectors`: 0 problems on this file; it does
   not flag the declaration duplication this plan targets (verified with a
   synthetic case).
5. Guards run under `make test`, not `make check`; there is no CI to fail.
6. PurgeCSS is dead configuration.
7. 38 unreferenced classes, not 35.
8. Exactly one dynamic class construction site exists (`sev-*`), so the
   safelist is small — the PurgeCSS false-positive risk is correspondingly
   smaller than the earlier draft implied.
9. 43 fully-dead rules (316 lines) rather than an unquantified backlog; three
   more rules need selector-level surgery.
10. Only four duplicate groups are panel-shaped; a new panel primitive would be
    a false abstraction (Phase 0 Q1 decision).
11. Phase ordering inverted: guards first gives the cleanup a measurable work
    list and removes the Phase 1/2 dependency footnote.

## Risks

- Forcing deduplication of coincidental identical values creates false
  abstractions. The allowlist is a review tool, not a target; roughly 20 of the
  36 groups should stay allowlisted.
- A seeded allowlist is a large initial diff. It must be reviewed as a work
  list, not waved through.
- Guard friction is permanent: every new component may need an allowlist entry
  or a utility substitution. The repo already accepts comparable friction
  elsewhere (25 guards, tach boundaries).
- There is no automated visual check; the regression gate is human inspection of
  water, tables, modals, landing, and reduced motion.
- Utility substitution makes markup noisier and depends on the Phase 0 rulebook
  amendment landing first.
- Removing "unused" CSS requires checking Alpine expressions and runtime class
  composition, not only static `class=` attributes.
- stylelint's duplicate-selector rule gives false confidence: it is a lock, not
  the guard.
- Deleting the PurgeCSS devDependency is a dependency change and needs sign-off.

## Done means

- Water card has no one-off CSS beyond table/telemetry specifics.
- Duplicate and dead-class guards run in `make test` and fail on new drift.
- Duplicate groups are either resolved or documented in the allowlist, with the
  final allowlist size stated.
- The ~316 lines of dead CSS are removed, or the shortfall is explained.
- The rulebook states the delta-only rule and the narrowed §9.
- All Phase 0 decisions are recorded; the stylesheet split remains explicitly
  deferred with reasons.
- `make verify` passes.
