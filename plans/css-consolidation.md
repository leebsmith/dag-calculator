# CSS Consolidation & Drift Guardrails

Status: proposed
Scope: frontend stylesheet only
Out of scope: water card behaviour, artifact/data changes, backend

## Goal

Reduce one-off CSS and prevent structural drift without changing the rendered UI.
Raw values are already token-guarded by stylelint; the gap is duplicated
component recipes, dead selectors, and the single 2,500-line stylesheet.

## Baseline

Measured before the water card restructure:

- `frontend/src/style.css`: 2,482 lines, 334 rule blocks, 260 distinct classes.
- 36 groups of byte-identical declarations, covering 92 selectors.
- 35 styled classes with no static reference (some dynamic or legacy).
- Water markup now lives in `frontend/src/partials/step-water.html`; the old
  `.water-summary`, `.water-basis`, `.water-ratio`, etc. may now be dead.

## Tracking

| Phase | Status | Acceptance gate |
|---|---|---|
| 1. Water CSS collapse | Not started | Water card renders identically; dead water rules removed; `make check` passes |
| 2. Guardrails | Not started | New duplicate/dead-class checks run in `make check`; rulebook updated |
| 3. Backlog paydown | Not started | Agreed duplicate groups and dead CSS removed; no visual regressions |
| 4. Stylesheet split | Not started | Split by section with unchanged cascade; `make verify` passes |

Do not start Phase 4 before Phases 1–3 are complete.

## Phase 1 — Collapse water CSS onto existing primitives

- [ ] Inventory every `.water-*` rule against `step-water.html`.
- [ ] Delete `.water-summary`; the markup no longer exists.
- [ ] Delete `.water-basis`, `.water-destinations`, `.water-ratio`,
      `.water-ratio-basis`, `.water-target-line`, `.water-not-modelled` where
      equivalent `text-*` / `font-*` utilities are used in markup.
- [ ] Keep `.water-treated` and its table rules; consolidate any shared table
      rules with existing data-table styles only when identical.
- [ ] Delete `.pin-row` and `[type="checkbox"]` rules if no remaining references.
- [ ] Check `.sev-*`, `.telemetry`, `.telemetry-row`; keep them (dynamic and
      still used by Details).
- [ ] Replace remaining water-only wrappers with `.synthesized-card`,
      `.step-section-header`, `.step-section-title`, `.step-grid-2col` where the
      markup already uses them.
- [ ] Run `make check` and visually verify the water step.

Acceptance:

- No CSS rule without a markup/JS consumer in the water slice.
- Water card appearance unchanged.
- Net line reduction recorded in this plan.

## Phase 2 — Guardrails

- [ ] Add a composition rule to `docs/style-rulebook.md`:
      a component class declares only its deltas; shared surface/typography
      recipes come from primitives or utilities.
- [ ] Add `tests/guards/css-duplication.test.js` (or an equivalent script):
      normalize declaration blocks, flag exact duplicates, allowlist justified
      cases. Initial allowlist may cover coincidental convergence.
- [ ] Add an unreferenced-class check with a safelist for dynamic names
      (`sev-*`, `is-*`, runtime-built class names).
- [ ] Audit the 20 duplicate selectors before enabling stylelint
      `no-duplicate-selectors`; keep media/keyframe exceptions explicit.
- [ ] Document how to add/remove allowlist entries; require a reason.
- [ ] Wire both checks into `make check`.

Acceptance:

- A new exact duplicate outside the allowlist fails CI.
- A new unreferenced class outside the safelist fails CI.
- The rulebook states the delta-only rule.

## Phase 3 — Pay down the existing backlog

- [ ] Replace the muted-xs group of 7 selectors with `text-xs text-muted`.
- [ ] Replace the danger group of 4 with `text-danger` or the shared severity
      class.
- [ ] Replace the warning group of 3 with `text-warning`.
- [ ] Replace the three table `tbody tr:last-child` rules with a shared rule or
      utility class.
- [ ] Review the remaining duplicate groups; classify each as:
      shared recipe, coincidental convergence, or candidate for deletion.
- [ ] Consolidate panel recipes into a small documented set:
      canvas output card, subtle summary strip, inset telemetry.
- [ ] Run PurgeCSS/static scan; delete confirmed dead selectors.
- [ ] Update the baseline metrics in this plan.

Acceptance:

- Duplicate declaration groups reduced to the justified allowlist.
- No dead selectors in the scanned set.
- Visual regression checks on affected cards.

## Phase 4 — Split the stylesheet

- [ ] Split `frontend/src/style.css` by its existing numbered sections, e.g.
      `styles/01-base.css`, `styles/02-controls.css`, `styles/03-cards.css`, etc.
- [ ] Preserve import/link order exactly; cascade is part of the contract.
- [ ] Keep `tokens.css` as the only token source.
- [ ] Update `index.html` or `main.js` imports.
- [ ] Verify the production build and `make verify`.

Acceptance:

- No selector moves across sections in a way that changes cascade order.
- Build output is equivalent apart from file boundaries.
- The file-size/navigation problem is addressed without changing rendering.

## Risks

- Forcing deduplication of coincidental identical values creates false
  abstractions. The allowlist is a review tool, not a target.
- PurgeCSS can false-positive on dynamically constructed class names; safelist
  them explicitly.
- Splitting before deduplication just distributes the drift across more files.
- Removing “unused” CSS requires checking Alpine expressions and runtime class
  composition, not only static `class=` attributes.

## Open questions

1. Whether to introduce a shared panel primitive or reuse
   `.synthesized-card`/existing section headers.
2. Whether the duplicate guard belongs in `node --test` or a standalone script.
3. Whether the stylesheet split should use `<link>` tags or Vite CSS imports.

## Done means

- Water card has no one-off CSS beyond table/telemetry specifics.
- Duplicate and dead-class guards run in `make check`.
- Backlog duplicate groups are either removed or documented in the allowlist.
- `style.css` is split or has a recorded decision to defer the split.
- `make verify` passes.
