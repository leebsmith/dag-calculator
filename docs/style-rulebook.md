# CSS Style Rulebook

Portable, framework-agnostic authoring rules for the structural stylesheet and
its supporting token layer. These rules are deliberately free of any specific
framework, build tool, file name, or concrete token value; they describe *what*
well-structured CSS looks like and *why*, so they can be applied to any
codebase.

## 1. Purpose & Scope

This rulebook governs two kinds of CSS:

1. **The token layer** — a single source where raw values (colors, spacing
   units, font sizes, radii, transitions) are declared as custom properties.
2. **The structural stylesheet** — the rules that turn those tokens into
   components and layouts.

The core principle: **raw values live only in the token layer; every other
rule references a token.** This makes theming, dark mode, and a rebrand a
one-place change rather than a sweep of the entire stylesheet.

---

## 2. Token Architecture

Tokens are stratified into three tiers with strictly one-way references.

### 2.1 The Three Tiers

| Tier | Holds | References |
| :--- | :--- | :--- |
| **Primitive** | Raw, context-free values (hex codes, spacing units, radii, type steps). | Nothing. |
| **Semantic** | Role-based values (`surface`, `text`, `border`, `action`, `status`) that describe *what the value is for*. | Primitive tokens only. |
| **Component** | Values scoped to a specific component (optional, use sparingly). | Semantic tokens only. |

### 2.2 Naming Rules

- **Kebab-case**, all lowercase, hyphen-separated.
- **Name by purpose, not appearance.** A button background is
  `--action-primary`, never `--blue-500`. Rebranding must not require renaming
  tokens.
- **Namespace prefixes.** Group tokens by category so the taxonomy is
  self-documenting (e.g. a `color-` prefix for primitives, a role prefix for
  semantics). Keep the prefix set small and stable.
- **One value per token.** No compound or overloaded tokens.

### 2.3 Theming & Dark Mode

- Dark mode is achieved by **re-theming the semantic tier only**, via a
  `prefers-color-scheme` override. Primitives stay fixed.
- In dark mode, depth is communicated by **lightness, not shadow** — surfaces
  grow lighter the closer they are to the user.
- Avoid **pure black and pure white**; prefer soft dark grays for backgrounds
  and high-opacity light grays for text.
- **Desaturate** saturated accent colors in dark mode to avoid vibration and
  halation.

---

## 3. Structural Stylesheet Rules

The structural stylesheet consumes tokens; it never defines them.

### 3.1 Selectors

- Author **class selectors only** (BEM or hyphenated). Never style bare HTML
  elements outside a minimal reset block.
- Scope class names tightly to their component domain to prevent namespace
  pollution and specificity escalation.

### 3.2 Values

- **Reference a token for every value.** No hardcoded colors, spacing, font
  sizes, radii, or shadows in component rules.
- **No hex colors** in the structural stylesheet.
- **No `!important`** — it breaks the cascade and defeats the token hierarchy.
- **No `transition: all`** — name the specific properties being animated.

### 3.3 Separation of Concerns

- Presentation state belongs in **semantic state classes** (`.is-active`,
  `.is-locked`, `.is-error`), not in a pile of utility strings applied at
  runtime.
- Utilities are permitted for **typography, color, and spacing deltas**
  (`text-xs`, `text-muted`, `font-semibold`). Utilities are not a substitute
  for state classes or for layout structure.
- Never use **inline styles** in markup. All visual declarations — including
  display toggles — live in classes.

### 3.4 Composition

- A component class declares **only its deltas**. Shared surface, typography,
  and control recipes come from primitives or utilities.
- If two components share a declaration block, either extract the shared recipe
  or record why the convergence is coincidental.
- Dynamic state names built at runtime (for example a severity prefix) must be
  declared in the drift-guard safelist rather than duplicated as static
  classes.

---

## 4. Naming Conventions

- Lowercase, hyphen-separated class names.
- Follow BEM: `.block`, `.block__element`, `.block--modifier`.
- State variants use a verb-led prefix (`.is-`, `.has-`) to signal
  mutability; static variants use the modifier form (`--`).
- Choose names that describe **role**, not visual treatment.

---

## 5. Color & Theming

- **60-30-10 distribution:** ~60% dominant background, ~30% secondary surface,
  ~10% high-visibility accent.
- **WCAG AA is non-negotiable:** text maintains at least **4.5:1** contrast
  against its background; non-text boundaries (input borders, sort icons) at
  least **3:1**.
- Never rely on **color alone** to convey meaning; pair color with an icon,
  label, or other indicator.

---

## 6. Typography

- Use a **modular scale** (a consistent ratio between adjacent sizes) rather
  than arbitrary pixel choices.
- Establish hierarchy through **weight and color before size**; secondary text
  often stays the same size and drops weight/contrast instead.
- Use **fluid sizing** (`clamp()`) so type scales smoothly with the container
  or viewport instead of snapping at breakpoints.
- Apply `font-variant-numeric: tabular-nums` to any numeric column or
  live-updating value to prevent layout jitter.

---

## 7. Layout & Responsiveness

- Prefer **container queries** (`container-type` / `@container`) for
  component-level responsiveness, so a component adapts to its own placement,
  not the window.
- Restrict **media queries** to macro-level page layout only.
- For wide data tables, wrap in an `overflow-x: auto` container and keep the
  primary identifier column **sticky** (`position: sticky; left: 0`).

---

## 8. Accessibility

- Honor **`prefers-reduced-motion`** — disable or shorten non-essential
  animation.
- Use **token-driven focus rings** that are always visible and meet contrast
  requirements; never remove focus outlines without a replacement.
- Maintain generous **hit targets** (≈44px for primary controls, no smaller
  than ≈24px for dense or inline controls).

### Control states

State is expressed once per control and mirrored in ARIA:

| Meaning | Class | ARIA |
| :--- | :--- | :--- |
| A control is on (filter, toggle, applied action) | `is-active` | `aria-pressed="true"` |
| A record is the chosen one in a list | `is-selected` | visual only in a plain table; the action's `aria-pressed` carries it |
| A disclosure is open | — | `aria-expanded` (+ `aria-controls`) |
| One of a radio set | — | `aria-checked` |
| Content validity | `is-invalid`, `is-trace` | the control's own validity attributes |

- The control that causes a state carries it. A chosen row and the action that
  chose it may both be marked: the row answers "which record", the action
  answers "did this apply".
- A popover of ordinary buttons is a **disclosure** (`aria-expanded` +
  `aria-controls`). Do not claim `role="menu"`/`menuitem` without arrow-key
  navigation; the guard rejects those roles.
- `is-active` is guarded: any markup toggle using it must also bind
  `aria-pressed` (see `tests/guards/control-states.test.js`).
- State classes must exist in the stylesheet; no colour-only state indication.

---

## 9. Quick-Reference Prohibitions

- No hardcoded values in component styles — reference a token.
- No hex colors in the structural stylesheet.
- No `!important`.
- No `transition: all`.
- No inline styles in markup.
- No bare-element styling outside the reset block.
- No utility-first class soup for **state or layout structure** — use semantic
  state classes. Typography, color, and spacing deltas may use utilities.
- No pure black/white surfaces.
- No color-only state indication.

---

## 10. Drift Guards

Duplicate declaration blocks and unreferenced classes are guarded in
`make test`. The allowlist lives beside those guards and uses one entry per
duplicate declaration group or unreferenced class:

- Every entry needs a **reason**; an entry without one fails the guard.
- A planned cleanup entry carries a **phase** naming the commit that removes it.
- The entry is deleted in the same commit that resolves it. Stale entries fail
  the guard, so the allowlist stays a work list rather than an archive.
- Runtime-built class names use an explicit **safelist prefix**; they are not
  allowlisted one class at a time.
