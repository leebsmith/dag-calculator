---
name: Alpine Utils Enforcement
description: Use whenever writing or editing Alpine.js templates, x-data factories, x-text/x-show/:value bindings, event handlers, or card adapters in this repo. Enforces that all number formatting, percent/gravity conversion, unit labels, pluralization, catalog meta strings, field lookup, and seed-provenance logic go through frontend/src/utils.js instead of inline expressions.
---

# Alpine Utils Enforcement

## Purpose

`frontend/src/utils.js` is the single source of truth for display formatting and
pure model helpers. Templates bind to it as `fmt.*`; adapters import it directly.
This skill exists so agent sessions stop re-deriving `toFixed`, `* 100`,
`label + ' (' + unit + ')'`, and catalog meta strings inline, which is how the
formatting drift in `step-style.html`, the four catalog modals, and the card
adapters accumulated.

**Module contract:** pure and deterministic, no DOM, no engine, no artifact, no
module-level mutable state. Every export carries
`@note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.`

## When this skill triggers

Load and apply this skill when any of these are true:

- Creating or editing any file under `frontend/src/partials/` or `frontend/index.html`.
- Adding or changing `x-data`, `x-text`, `x-show`, `x-if`, `x-for`, `x-model`, `:class`, `:value`, `:min`, `:max`, `:title`, `@click`, `@change`, `@input`, or `x-init`.
- Writing or modifying a card adapter (`frontend/src/adapters/cards/*.js`), `draftEditor.js`, `libraryUi.js`, `stepView.js`, `stepAdapter.js`, or `main.js` store getters.
- Any task whose wording involves display, formatting, labels, units, percentages, gravity, counts, ranges, pluralization, dates, clamping, or seed provenance.

## Mandatory enforcement rules

**Forbidden — no exceptions in templates (`*.html`):**

- No arithmetic. `* 100`, `/ 1000`, `+ 1`, `(og - 1) * 1000` are all violations.
- No number formatting: `toFixed`, `Math.round`, `Math.min`, `Math.max`, `parseFloat`, `parseInt`, `Number(...)`.
- No locale/date APIs: `Intl.*`, `new Date`, `Date.now`, `toLocaleString`.
- No regex literals, `.test()`, `.match()`, `.replace()`, `.startsWith()`.
- No string assembly for display: `label + ' (' + unit + ')'`, `display + ' ' + (unit ?? '')`, `'Showing ' + n + ' of ' + m`.
- No predicates: `.some(...)`, `.filter(...)`, `.find(...)`, `.includes(...)` inside `x-show`/`x-if`.
- No nested ternaries for formatting. A single guard ternary (`x ? a : b`) is tolerated only when both branches are already formatted values.
- No state assignment in handlers (`foo = false`, `$store.x.y = z`). Call a named method.
- No helper logic in `x-data`. It stays a thin factory (`x-data="stepCalculator()"`); behavior belongs in an adapter/installer.

**Forbidden in JavaScript adapters:**

- Do not re-implement formatting that already exists in `utils.js`. Grep before writing.
- Do not add `Math.round(v * 1000) / 1000`, `(v * 100).toFixed(1)`, `col.decimals != null ? v.toFixed(...)`, or `UNIT_SYMBOLS[d]?.[u] ?? u` anywhere else.
- Do not put engine- or artifact-dependent conversion in `utils.js` (`toBase`, `displayValue`, `nonlinearFns`, `UNIT_DIMENSIONS` defaults). Those stay in `views/producer` and the adapters. Pass resolved values in.

**How a template reaches a util:**

- Templates resolve names against the Alpine component scope. Bare imports are invisible.
- Correct: `x-text="fmt.formatPercent(row.pct)"` — `fmt` is attached in `stepAdapter.js` and is reactive-safe.
- Correct: a named getter/method on the card that calls the util, e.g. `x-text="maltDraftTotals"` or `x-text="styleTargetNearest()"`.
- Wrong: `x-text="formatPercent(row.pct)"` — this both fails at runtime and trips the A8 guard unless a matching app method exists.

**Nullability:**

- Never dereference a nullable model in `x-show` (`x-show="srmTargetField.seeded"`). Use an `x-if`, a provenance getter, or `fmt.provenanceFor(...)`. Guard A10 enforces this.
- Use `x-if` for null-until-ready subtrees; `x-show` still evaluates its subtree.

**When a util genuinely does not exist:**

1. Add it to `frontend/src/utils.js` with full JSDoc, typed params/returns, and the `@note STRICT UTILITY` line.
2. Add assertions to `tests/frontend/utils.test.js` covering null, empty string, and wrong-type inputs.
3. Add the task → function row to the index below.
4. Never inline the logic "temporarily" while deciding.

## Function reference index

Import paths (from the file doing the importing):

| Location | Import |
| --- | --- |
| `frontend/src/adapters/cards/*.js` | `import { fn } from "../../utils.js"` |
| `frontend/src/adapters/*.js` | `import { fn } from "../utils.js"` |
| `frontend/src/store/*.js` | `import { fn } from "../utils.js"` |
| `frontend/src/views/producer/*.js` | `import { fn } from "../../utils.js"` |
| Templates | `fmt.fn(...)` (no import; `fmt` is on the component) |

### Numbers, percent, gravity

| UI task | Function to import and call | Notes |
| --- | --- | --- |
| Any scalar → display string | `formatValue(value)` | Integers verbatim, others trimmed to 3dp, `""` for null/NaN/Infinity |
| Fixed-decimal display | `formatWithDecimals(value, decimals, { dash })` | `decimals = null` trims to 3dp; replaces the `decimals != null ? toFixed : round` pattern |
| Round a number (not display) | `roundTo(value, decimals)` | Returns `number|null` |
| Numeric coercion of input | `toFiniteOrNull(value)` | Trims strings, rejects booleans/arrays/blank/Infinity |
| Numeric type test | `isFiniteNumber(value)` | `typeof === "number" && Number.isFinite` |
| Fraction 0..1 → `"76.2%"` | `formatPercent(fraction, decimals = 1, { dash })` | Multiplies by 100 |
| Fraction 0..1 → `"76%"` | `formatPercentRounded(fraction, { dash })` | Multiplies by 100 |
| Value already in percent (ABV 5.4) | `formatPercentValue(percent, decimals = 1, { dash })` | Does NOT multiply — do not pass a fraction |
| Fraction → number for `<input :value>` | `toPercentValue(fraction, decimals = 1, { dash })` | No `%` sign; inverse of the `scale = 0.01` write path |
| Specific gravity readout | `formatGravity(sg, decimals = 3, { dash })` | |
| OG/FG range | `formatGravityRange(low, high, { decimals, separator, dash })` | `"1.040–1.055"` |
| Generic range | `formatRange(low, high, formatter, { separator, dash })` | Degrades to the known side or the dash |

### Units, quantities, labels

| UI task | Function to import and call | Notes |
| --- | --- | --- |
| Value + unit, one string | `formatValueWithUnit(value, unit, { fallbackUnit, dash, tightUnits })` | `%` is tight by default (`80%`), other symbols get a space |
| Producer `{ display, unit }` field model | `formatQuantity(field, { fallbackUnit, dash, tightUnits })` | The canonical readout formatter; returns `—` for a missing model |
| `"Label (unit)"` | `formatFieldLabel(label, symbol)` | |
| Table column header | `formatColumnHeader(column)` | Falls back to `column.id` |
| First usable string | `firstNonEmptyString(...values)` | Trims; stringifies finite numbers; `""` when none |
| Preferred unit id | `preferredUnit(unitMode, dimension, fallback)` | Never hard-code `"EBC"`, `"oz"`, `"degC"` |
| Unit symbol | `unitSymbol(symbols, dimension, unitId, fallback)` | Falls back to the unit id, then the fallback |

### Strings, counts, meta

| UI task | Function to import and call | Notes |
| --- | --- | --- |
| Join meta parts, skipping blanks | `joinNonEmpty(parts, separator = " • ")` | Replaces `(x ? ' • ' + x : '')` chains |
| Pluralized count | `countLabel(count, singular, plural = null, { dash })` | Explicit plural wins over `+ "s"` |
| Catalog result counter | `resultCounter({ shown, total, noun, plural, truncated, truncatedHint, dash })` | Builds the whole `Showing X of Y …` sentence |
| Dash for empty text | `displayOrDash(text, dash = "—")` | |
| Short localized date | `formatDate(seconds, { locale, timeZone, dash })` | Epoch seconds, not milliseconds |

### Filters, units, math

| UI task | Function to import and call | Notes |
| --- | --- | --- |
| Click-to-clear filter pill | `toggleFilter(current, value)` | Returns `""` or `value` |
| Multi-select filter pill | `toggleInList(list, value)` | Returns a new array; never mutates |
| Cycle a unit button | `cycleUnit(units, current)` | Wraps; unknown current starts at index 0 |
| Bound a value | `clamp(value, min = null, max = null)` | `null` bounds ignored; `null` for non-numeric |
| Gravity units | `gravityUnits(sg)` | `(sg - 1) * 1000` |
| BU:GU | `bitternessRatio(ibu, og)` | `null` when GU <= 0 |

### Field models and predicates

| UI task | Function to import and call | Notes |
| --- | --- | --- |
| Index field models by id | `indexFields(fields)` | First id wins; used by `stepView.compute` → `app.fieldsById` |
| Read a field by id | `fieldOr(fieldsById, id, fallback = EMPTY_FIELD)` | Returns the frozen `EMPTY_FIELD`, never throws |
| Numeric `[low, high]` bounds | `boundsOf(fields, minId, maxId)` | `null` unless strictly ordered |
| Seed badge / reset affordance | `provenanceFor(field, { sourceLabel, resetSymbol })` | `{ showSeed, showReset, seedTitle, resetTitle, resetSymbol }` |
| Readout-table cell variant | `cellKind(cell)` | `"text" \| "number" \| "empty"` |
| Any invalid collection cell | `hasInvalidCells(rowValidations)` | `holds === false` |
| Any missing number in a collection | `hasMissingNumber(rows, key)` | Replaces `rows.some((r) => r[key] == null)` |
| `std:` representative entry | `isRepresentative(itemOrId)` | Accepts an item or a bare id |

## Forbidden → required rewrite

| Never write | Write instead |
| --- | --- |
| `x-text="(row.pct * 100).toFixed(1) + '%'"` | `x-text="fmt.formatPercent(row.pct)"` |
| `x-text="styleTargetInfo ? styleTargetInfo.og.toFixed(3) : ''"` | `x-text="fmt.formatGravity(styleTargetInfo?.og)"` |
| `x-text="f.display + ' ' + (f.unit ?? '')"` | `x-text="fmt.formatQuantity(f)"` |
| `x-text="c.label + (c.unit ? ' (' + c.unit + ')' : '')"` | `x-text="fmt.formatColumnHeader(c)"` |
| `x-text="'Yield ' + Math.round(y * 100) + '%'"` | `x-text="fmt.formatPercentRounded(y)"` |
| `:value="(row.yield_fraction * 100).toFixed(0)"` | `:value="fmt.toPercentValue(row.yield_fraction, 0)"` |
| `x-text="'Showing ' + n + ' of ' + m + ' hops'"` | `x-text="fmt.resultCounter({ shown: n, total: m, noun: 'hop' })"` |
| `x-text="item.category + ' • ' + item.color + ' °L'"` | `x-text="fmt.joinNonEmpty([item.category, fmt.formatValueWithUnit(item.color, '°L', { dash: '' })])"` |
| `x-show="field && field.seeded"` | card getter returning `provenanceFor(field)`, then `x-show="f.provenance.showSeed"` |
| `@click="unitsOpen = false"` | `@click="closeUnits()"` |
| `@click="filter = filter === v ? '' : v"` | `@click="setFilter(v)"` calling `toggleFilter` inside the adapter |

## Workflow

1. Identify the requested display/derivation output and the layer that owns it (template, card adapter, or store getter).
2. Search the module first: `grep -n "^export function" frontend/src/utils.js`.
3. If a function exists, use it. If it nearly fits, extend it with an option rather than adding a sibling.
4. If it does not exist, implement it in `utils.js` with JSDoc + the `@note STRICT UTILITY` line, add tests, add the index row here.
5. Wire it: `fmt.*` in templates, or a named getter/method on the card for multi-part strings.
6. Run the gates: `make check` then `make test`. Use `make verify` before declaring done.

## Checklist before finishing

```sh
# Must return nothing (no inline formatting in templates):
grep -rnE "toFixed|Math\.(round|min|max)|Intl\.|new Date|parseFloat|parseInt" \
  frontend/src/partials frontend/index.html

# Must return nothing (no inline label/unit assembly):
grep -rnE "\.display \+ ' '|label \+ \(.*unit|label \+ ' \('" \
  frontend/src/partials frontend/index.html

# Must return nothing (no assignments in handlers):
grep -rnE "(@[a-z.:-]+|x-on:[a-z.:-]+)=\"[^\"]*[^=!<>]=( |\")" \
  frontend/src/partials frontend/index.html
```

Then confirm:

- `tests/guards/alpine-handlers.test.js` (A8) passes: every handler calls a real app method.
- `tests/guards/show-dereference.test.js` (A10) passes: no nullable dereference behind `x-show`.
- `tests/frontend/utils.test.js` covers any util you added or changed.
- No engine/artifact imports were added to `utils.js`.

## Neighbouring invariants (do not duplicate, do respect)

- `<select :value>` with `x-for` options needs an explicit `:selected` on each option (`tests/guards/select-binding.test.js`).
- Field models come from `fieldsBySlice` / `fieldsById`; never resolve engine paths in a template.
- Unit conversion is display-only: writes store base units (`tests/guards/display-only-units.test.js`).
- `data/artifact.json` is canonical. This skill governs presentation only; artifact changes still require `node scripts/emit-artifact-inventory.mjs` and doc updates.
