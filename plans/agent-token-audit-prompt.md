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

- [ ] Parse `frontend/src/tokens.css` and record the allowed vocabulary (colors, spacing, typography, radii, dimensions, z-index)
- [ ] Scan `frontend/src/style.css` for raw color literals (hex, `rgb()`, `rgba()`, `hsl()`, named colors)
- [ ] Scan `frontend/src/style.css` for raw typography values (`font-size`, `line-height`, `letter-spacing`, `font-family`, `font-weight`)
- [ ] Scan `frontend/src/style.css` for raw spacing/layout dimensions (`margin`, `padding`, `gap`, `width`, `height`, `border-radius`, grid tracks, breakpoints)
- [ ] Scan `frontend/src/style.css` for raw `z-index` integers
- [ ] Scan `frontend/index.html` and `frontend/src/partials/*.html` for inline hardcoded styling
- [ ] Trace dynamic inline styles (`rowMenuStyle`, `sortMenuStyle`, `label.style`) to their producing code and classify them
- [ ] Verify every finding against the current file content and line number
- [ ] Emit the triage manifest with File Path, Line Number, Violating Code Snippet, Violation Category, and Suggested Token Replacement

## Result

The manifest is emitted in the audit response and recorded here on completion.
