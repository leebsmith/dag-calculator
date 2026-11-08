# Design-token enforcement audit

Read-only audit of the frontend styling surface for hardcoded values that bypass
the centralized design-token system. `frontend/src/tokens.css` is the source of
truth; the deliverable is a five-column triage manifest. No source file is
modified.

## Scope

- In scope: `frontend/src/style.css`, `frontend/index.html`, and the Alpine
  templates under `frontend/src/partials/`.
- Token file primitives are allowed by definition; only references outside
  `tokens.css` count as bypasses.
- Percentages, viewport units, unitless zeros, border/outline widths, and
  computed runtime geometry (popover anchoring, plot-label positioning) are not
  token candidates and are excluded.
- Literal values used as `var(--token, fallback)` fallbacks are not violations.

## Checklist

- [x] Parse `frontend/src/tokens.css` and record the allowed vocabulary (colors, spacing, typography, radii, dimensions, z-index)
- [x] Scan `frontend/src/style.css` for raw color literals (hex, `rgb()`, `rgba()`, `hsl()`, named colors)
- [x] Scan `frontend/src/style.css` for raw typography values (`font-size`, `line-height`, `letter-spacing`, `font-family`, `font-weight`)
- [x] Scan `frontend/src/style.css` for raw spacing/layout dimensions (`margin`, `padding`, `gap`, `width`, `height`, `border-radius`, grid tracks, breakpoints)
- [x] Scan `frontend/src/style.css` for raw `z-index` integers
- [x] Scan `frontend/index.html` and `frontend/src/partials/*.html` for inline hardcoded styling
- [x] Trace dynamic inline styles (`rowMenuStyle`, `sortMenuStyle`, `label.style`) to their producing code and classify them
- [x] Verify every finding against the current file content and line number
- [x] Emit the triage manifest with File Path, Line Number, Violating Code Snippet, Violation Category, and Suggested Token Replacement

## Result

No raw color literals exist outside `tokens.css`. The partials contain only
percentage column widths and computed positioning (`anchorStyle`, plot labels),
which are excluded as runtime geometry rather than token candidates. All
remaining bypasses are in `style.css`:

| File Path | Line Number | Violating Code Snippet | Violation Category | Suggested Token Replacement |
|---|---|---|---|---|
| `frontend/src/style.css` | 254 | `.unit-badge-customized::after { width: 5px; }` | Spacing & Layout | `var(--space-1)` |
| `frontend/src/style.css` | 255 | `.unit-badge-customized::after { height: 5px; }` | Spacing & Layout | `var(--space-1)` |
| `frontend/src/style.css` | 271 | `.seed-badge { letter-spacing: 0.04em; }` | Typography | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 546 | `.modal-dialog-workspace { height: min(88vh, 960px); }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 904 | `.modal-workspace-main .data-table .form-input { min-width: 5rem; }` | Spacing & Layout | `var(--width-parts-input)` |
| `frontend/src/style.css` | 924 | `.data-table-container-scroll { max-height: 28rem; }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 1119 | `.unit-col { min-width: 13rem; }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 1126 | `.unit-col-title { letter-spacing: 0.05em; }` | Typography | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 1162 | `.library-panel { width: min(56rem, 100%); }` | Spacing & Layout | `var(--container-content-wide)` |
| `frontend/src/style.css` | 1183 | `.library-filter-bar { z-index: 1; }` | Z-Index | `var(--z-sticky)` |
| `frontend/src/style.css` | 1210 | `.library-records { max-height: 16rem; }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 1300 | `.landing-table { min-width: 30rem; }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 1328 | `.landing-col-date { width: 10rem; }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 1335 | `.landing-col-actions { width: 3rem; }` | Spacing & Layout | `var(--space-12)` |
| `frontend/src/style.css` | 1411 | `.landing-menu { min-width: 12rem; }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 1893 | `.synthesized-title { letter-spacing: 0.05em; }` | Typography | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 1901 | `.yeast-filter-grid { grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 1985 | `.target-cards { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 2006 | `.metric-strip { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 2191 | `@container (min-width: 600px) {` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 2212 | `.group-header::after { height: 1px; }` | Spacing & Layout | `var(--space-0-25)` |
| `frontend/src/style.css` | 2220 | `.group-title { letter-spacing: 0.05em; }` | Typography | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 2266 | `.extract-canvas { max-width: 376px; }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 2333 | `.extract-axis { letter-spacing: 0.02em; }` | Typography | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 2339 | `.extract-pin-label { font-weight: 600; }` | Typography | `var(--font-weight-semibold)` |
| `frontend/src/style.css` | 2372 | `.extract-unsolved-msg { font-weight: 600; }` | Typography | `var(--font-weight-semibold)` |
| `frontend/src/style.css` | 2373 | `.extract-unsolved-msg { letter-spacing: 0.04em; }` | Typography | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 2500 | `.import-verification { max-width: 28rem; }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 2547 | `.import-line-source { flex: 1 1 12rem; }` | Spacing & Layout | REQUIRES NEW TOKEN |
| `frontend/src/style.css` | 2617 | `.map-badge { letter-spacing: 0.04em; }` | Typography | REQUIRES NEW TOKEN |
