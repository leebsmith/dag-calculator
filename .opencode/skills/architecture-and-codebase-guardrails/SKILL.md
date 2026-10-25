---
name: Architecture & Codebase Guardrails
description: Use whenever writing or editing Alpine.js templates, x-data factories, bindings, event handlers, card adapters, backend services, persistence, or API routes in this repo. Enforces the A9 determinism invariant, pure-utility formatting (frontend/src/utils.js barrel), the installer KEYS contract, safeHref URL validation, reportError for swallowed exceptions, Admin-SDK-only Firestore persistence, and shared component validation.
---

# Architecture & Codebase Guardrails

## Purpose

This repo has two load-bearing purity contracts that agent sessions must not
break:

- **Frontend** — `frontend/src/utils.js` (a barrel re-exporting `utils/format.js`,
  `utils/model.js`, `utils/strings.js`) is the single source of truth for display
  formatting and pure model helpers. Templates bind it as `fmt.*`; adapters import
  it directly. Never re-derive `toFixed`, `* 100`, `label + ' (' + unit + ')'`,
  percent math, or catalog meta strings inline.
- **Backend** — persistence goes through FastAPI + the Firebase Admin SDK only;
  the browser is an Auth-only Firebase client. Batch writes are atomic, component
  validation is shared, and solver request/input fields are parity-checked.

## When this skill triggers

- Creating or editing any file under `frontend/src/partials/`, `frontend/index.html`,
  or `backend/app/`.
- Adding or changing `x-data`, `x-text`, `x-show`, `x-if`, `x-for`, `x-model`,
  `:class`, `:value`, `:min`, `:max`, `:title`, `@click`, `@change`, `@input`,
  or `x-init`.
- Writing or modifying a card adapter (`frontend/src/adapters/cards/*.js`),
  `draftEditor.js`, `libraryUi.js`, `stepView.js`, `stepAdapter.js`, `main.js`
  store getters, a repository, a service, or a route handler.
- Any task touching display, formatting, labels, units, percentages, gravity,
  counts, dates, clamping, seed provenance, persistence, validation, or auth.

## Core architectural invariants (must not violate)

- **A9 determinism** — wholesale recomputation stays. No read tracking, no
  field-level dirty flags, no stable-identity reuse. `produce()` must stay a pure
  `(artifact, roots, selections, boundaryCache, unitMode) → fields` function
  reproducible from scratch (`tests/guards/determinism.test.js`); the engine has
  no reactivity (`tests/guards/no-reactivity.test.js`, A1). Cards snapshot field
  models and re-`find()` by id, so wholesale identity replacement is load-bearing.
- **Artifact canonicality** — never edit `data/artifact.json` or re-emit
  inventories from agent code. Any artifact change requires
  `node scripts/emit-artifact-inventory.mjs` plus the matching doc update.
- **Pure functions** — no ad-hoc date formatting, regex, string manipulation, or
  numeric math inline. Import and call the designated pure helpers (they carry
  `@note STRICT UTILITY` JSDoc).
- **Client-side auth & persistence** — direct client-side Firestore access is
  forbidden (`firestore.rules` denies all client access; the browser is Auth-only).
  All reads/writes go through FastAPI using the Admin SDK.

## Artifact vs. presentation — the consumer test

Before adding anything to `data/artifact.json`, answer one question: does the
engine compute, enforce, or route on it?

- **Yes** → the artifact (node, constant, taxonomy, dimension, function).
- **No** → `views/registry/*` (label, hint, option labels),
  `views/registry/presentation.js` (display or control override), host adapter
  state, or the catalog/seed the value belongs to.

"It must survive reload" is not sufficient grounds; presentation state can be
derived or stored outside the artifact. The water target selector's
No-targets/Freeform lock is presentation derived from an empty held set — the
domain fact is `water.pinned_ions`.

Counterexample: `batch.sulfate_chloride_target_mode` / `_ratio` (removed) were
user-facing targets no engine consumed.

Corollary: a constant or node with no consumer is either a missing contract (pin
it with a test, cf. `tests/backend/conformance/test_artifact_constants.py`) or
dead weight (delete it). `tests/guards/artifact-consumers.test.js` enforces the
distinction with explicit allowlists.

## Alpine.js state & installer contract

- **No god-object sprawl** — do not split the single reactive Alpine root object;
  a single root is a framework requirement (`x-data="stepCalculator()"`).
- **Explicit installer exports** — every `install*`/`register*` module must export
  a `KEYS` array listing exactly the app members it assigns (including the
  `catalogDraftKeys(prefix, Cap)` expansion for draft cards).
- **Collision safeguards** — `createStepApp` invokes
  `assertNoCollisions(INSTALLERS)` under `import.meta.env.DEV`
  (`adapters/contract.js`); the guard test
  `tests/guards/installer-contract.test.js` compares the exported key sets.
  When you add an app member, add it to that module's `KEYS` too.

## Mandatory enforcement rules

**Forbidden — no exceptions in templates (`*.html`):**

- No arithmetic: `* 100`, `/ 1000`, `+ 1`, `(og - 1) * 1000`.
- No number formatting: `toFixed`, `Math.round`, `Math.min`, `Math.max`,
  `parseFloat`, `parseInt`, `Number(...)`.
- No locale/date APIs: `Intl.*`, `new Date`, `Date.now`, `toLocaleString`.
- No regex literals, `.test()`, `.match()`, `.replace()`, `.startsWith()`.
- No string assembly for display: `label + ' (' + unit + ')'`,
  `display + ' ' + (unit ?? '')`, `'Showing ' + n + ' of ' + m`.
- No predicates: `.some(...)`, `.filter(...)`, `.find(...)`, `.includes(...)`
  inside `x-show`/`x-if`.
- No nested ternaries for formatting (a single guard ternary is tolerated only
  when both branches are already formatted values).
- No state assignment in handlers (`foo = false`, `$store.x.y = z`). Call a named method.
- No helper logic in `x-data`. It stays a thin factory; behavior belongs in an installer.
- No unsafe URLs: external links must pass through `fmt.safeHref(url)` — only
  `http:`/`https:` is allowed.

**Numeric input contract (`type="number"`):**

- Every editable numeric input commits on `@change` (format/clamp on blur).
- If it also solves live via `@input`, the handler must be one of the buffered
  adapters — `editNumberInput`, `editCellInput`, `editDraftCellInput`,
  `editWaterNumber`, `editWaterTargetInput`, or `librarySetField` — and `:value`
  must go through `inputDraft(...)` (or `libraryFieldDisplay`). The raw text lives
  in `inputDrafts` (`frontend/src/adapters/fieldActions.js`); clearing it on blur
  restores the formatted value.
- Never put `toFixed`, `formatWithDecimals`, or `Math.*` in a numeric input tag
  with `@input`; formatting readouts is fine, formatting mid-keystroke is not.
- Guard: `tests/guards/number-input-contract.test.js`.

**Anti-drift guards (extend these instead of adding prose):**

- `tests/guards/boundary-output-consumers.test.js` — every declared boundary
  output is consumed downstream or allow-listed with a reason.
- `tests/guards/no-silent-catch.test.js` — every catch reports via
  `reportError`, writes an error surface, or is allow-listed.
- `tests/guards/schema-version.test.js` — the artifact grammar revision matches
  the validator, inventory, and grammar doc; the payload revision matches the
  backend legacy defaults.
- `tests/guards/unit-roundtrip.test.js` — every unit inverts through its base
  unit (nonlinear pairs within their published agreement).
- `tests/backend/conformance/test_route_auth_coverage.py` — every FastAPI route
  names its auth/rate-limit dependency; public probes are allow-listed.

**Forbidden in JavaScript adapters:**

- Do not re-implement formatting that already exists in the `utils.js` barrel.
  Grep first.
- Do not add `Math.round(v * 1000) / 1000`, `(v * 100).toFixed(1)`,
  `col.decimals != null ? v.toFixed(...)`, or `UNIT_SYMBOLS[d]?.[u] ?? u` elsewhere.
- Do not put engine- or artifact-dependent conversion in the utils barrel
  (`toBase`, `displayValue`, `nonlinearFns`, `UNIT_DIMENSIONS` defaults). Those
  stay in `views/producer` and the adapters.
- No bare `catch {}` — use `reportError(scope, err)` (from
  `frontend/src/observability.js`) so a swallowed engine/view error is logged
  once per signature and counted, without changing the degradation behavior.

**Forbidden in the backend:**

- No direct Firestore from the client; no `sql`/ORM filter chains in route
  handlers — data access lives in repositories.
- Batch writes must be atomic: create-or-update goes through
  `BatchRepository.apply_draft` (read-then-write in a Firestore transaction) and
  freezing through `BatchRepository.freeze`; never re-read-then-write outside a
  transaction.
- Component validation must not duplicate the domain operator table. Use
  `engine/domains.js:checkComponentDomain` (frontend) or `validate_component`
  (backend), both driven by the shared corpus
  `tests/conformance/fixtures/validation-cases.json`.
- Solver request/input mappings are parity-checked by
  `assert_field_parity(BatchSolverRequest, BatchSolverInput)` (and the water
  equivalent) at import time in the service adapters.

**How a template reaches a util:**

- Templates resolve names against the Alpine component scope; bare imports are invisible.
- Correct: `x-text="fmt.formatPercent(row.pct)"` — `fmt` is attached in `stepAdapter.js`.
- Correct: a named getter/method on the card that calls the util.
- Wrong: `x-text="formatPercent(row.pct)"` — fails at runtime and trips A8.

**Nullability:**

- Never dereference a nullable model in `x-show`. Use `x-if`, a provenance getter,
  or `fmt.provenanceFor(...)`. Guard A10 enforces this.

**When a util genuinely does not exist:**

1. Add it to the correct submodule — `utils/format.js` (numeric/unit/date),
   `utils/model.js` (field models/predicates/filters), or `utils/strings.js`
   (leaf string helpers) — with full JSDoc and the `@note STRICT UTILITY` line.
   The barrel re-exports it automatically; consumer import paths never change.
2. Add assertions to `tests/frontend/utils.test.js` (null, empty string, wrong type).
3. Add the task → function row to the index below.
4. Never inline the logic "temporarily" while deciding.

## Quick reference

| Task | Avoid | Use instead |
| :--- | :--- | :--- |
| URL sanitization | Raw string bindings / `:href="x.url"` | `fmt.safeHref(url)` |
| Error catching | Bare `catch {}` | `reportError("scope", err)` |
| Database writes | Client SDK / ad-hoc read-modify-write | Atomic transactions via `BatchRepository` |
| Component validation | Custom domain tables / divergent checks | Shared conformance fixtures + `engine/domains.js` |
| Date / percent / unit formatting | Inline `toFixed` / `* 100` / `+ ' (' + unit + ')'` | `fmt.format*`, `fmt.formatPercent`, `fmt.formatQuantity` |

## Function reference index

Import paths (from the file doing the importing; `utils.js` is a barrel):

| Location | Import |
| --- | --- |
| `frontend/src/adapters/cards/*.js` | `import { fn } from "../../utils.js"` |
| `frontend/src/adapters/*.js` | `import { fn } from "../utils.js"` |
| `frontend/src/store/*.js` | `import { fn } from "../utils.js"` |
| `frontend/src/views/producer/*.js` | `import { fn } from "../../utils.js"` |
| Templates | `fmt.fn(...)` (no import; `fmt` is on the component) |
| Error observability | `import { reportError } from "../observability.js"` |

### Numbers, percent, gravity

| UI task | Function to import and call | Notes |
| --- | --- | --- |
| Any scalar → display string | `formatValue(value)` | Integers verbatim, others trimmed to 3dp, `""` for null/NaN/Infinity |
| Fixed-decimal display | `formatWithDecimals(value, decimals, { dash })` | `decimals = null` trims to 3dp |
| Round a number (not display) | `roundTo(value, decimals)` | Returns `number|null` |
| Numeric coercion of input | `toFiniteOrNull(value)` | Trims strings, rejects booleans/arrays/blank/Infinity |
| Numeric type test | `isFiniteNumber(value)` | `typeof === "number" && Number.isFinite` |
| Fraction 0..1 → `"76.2%"` | `formatPercent(fraction, decimals = 1, { dash })` | Multiplies by 100 |
| Fraction 0..1 → `"76%"` | `formatPercentRounded(fraction, { dash })` | Multiplies by 100 |
| Value already in percent (ABV 5.4) | `formatPercentValue(percent, decimals = 1, { dash })` | Does NOT multiply |
| Fraction → number for `<input :value>` | `toPercentValue(fraction, decimals = 1, { dash })` | No `%` sign |
| Specific gravity readout | `formatGravity(sg, decimals = 3, { dash })` | |
| OG/FG range | `formatGravityRange(low, high, { decimals, separator, dash })` | `"1.040–1.055"` |
| Generic range | `formatRange(low, high, formatter, { separator, dash })` | Degrades to the known side or the dash |

### Units, quantities, labels

| UI task | Function to import and call | Notes |
| --- | --- | --- |
| Value + unit, one string | `formatValueWithUnit(value, unit, { fallbackUnit, dash, tightUnits })` | `%` is tight by default |
| Producer `{ display, unit }` field model | `formatQuantity(field, { fallbackUnit, dash, tightUnits })` | Canonical readout formatter |
| `"Label (unit)"` | `formatFieldLabel(label, symbol)` | |
| Table column header | `formatColumnHeader(column)` | Falls back to `column.id` |
| First usable string | `firstNonEmptyString(...values)` | Trims; stringifies finite numbers |
| Preferred unit id | `preferredUnit(unitMode, dimension, fallback)` | Never hard-code `"EBC"`, `"oz"`, `"degC"` |
| Unit symbol | `unitSymbol(symbols, dimension, unitId, fallback)` | Falls back to the unit id |

### Strings, counts, meta, safety

| UI task | Function to import and call | Notes |
| --- | --- | --- |
| Join meta parts, skipping blanks | `joinNonEmpty(parts, separator = " • ")` | Replaces `(x ? ' • ' + x : '')` |
| Pluralized count | `countLabel(count, singular, plural = null, { dash })` | Explicit plural wins |
| Catalog result counter | `resultCounter({ shown, total, noun, plural, truncated, truncatedHint, dash })` | Whole `Showing X of Y …` sentence |
| Dash for empty text | `displayOrDash(text, dash = "—")` | |
| Short localized date | `formatDate(seconds, { locale, timeZone, dash })` | Epoch seconds |
| External link `href` | `safeHref(url)` | `""` unless `http:`/`https:` |

### Filters, units, math

| UI task | Function to import and call | Notes |
| --- | --- | --- |
| Click-to-clear filter pill | `toggleFilter(current, value)` | Returns `""` or `value` |
| Multi-select filter pill | `toggleInList(list, value)` | Returns a new array; never mutates |
| Cycle a unit button | `cycleUnit(units, current)` | Wraps |
| Bound a value | `clamp(value, min = null, max = null)` | `null` bounds ignored |
| Gravity units | `gravityUnits(sg)` | `(sg - 1) * 1000` |
| BU:GU | `bitternessRatio(ibu, og)` | `null` when GU <= 0 |

### Field models and predicates

| UI task | Function to import and call | Notes |
| --- | --- | --- |
| Index field models by id | `indexFields(fields)` | First id wins |
| Read a field by id | `fieldOr(fieldsById, id, fallback = EMPTY_FIELD)` | Frozen `EMPTY_FIELD`, never throws |
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
| `:value="(row.yield_fraction * 100).toFixed(0)"` | `:value="fmt.toPercentValue(row.yield_fraction, 0)"` |
| `:href="selectedYeast.url"` | `:href="fmt.safeHref(selectedYeast.url)"` |
| `x-text="opt"` in a choice `<option>` | `x-text="fmt.optionLabel(f.optionLabels, opt)"` |
| hardcoded `<option value="…">Raw code</option>` | `optionLabels` on the `views/registry/*` entry, rendered via `fmt.optionLabel` |
| `catch {}` | `catch (err) { reportError("scope", err); ... }` |
| `x-show="field && field.seeded"` | card getter returning `provenanceFor(field)`, then `x-show="f.provenance.showSeed"` |
| `@click="unitsOpen = false"` | `@click="closeUnits()"` |
| `@click="filter = filter === v ? '' : v"` | `@click="setFilter(v)"` calling `toggleFilter` in the adapter |

## Workflow

1. Identify the layer that owns the change (template, card adapter, store getter,
   repository, service, or route) and whether it is a display concern or a data one.
2. For display/derivation, grep the utils barrel: `grep -rn "^export function" frontend/src/utils`.
3. If a function exists, use it; if it nearly fits, extend it with an option.
4. If it does not exist, add it to the right submodule with JSDoc + `@note STRICT
   UTILITY`, add tests, and add the index row above.
5. Wire it: `fmt.*` in templates, a named getter/method on the card, or a
   repository/service method in the backend.
6. Update the module's `KEYS` if you added an app member; run the collision guard.
7. Run `make check` then `make test`; use `make verify` before declaring done.

## Checklist before finishing

```sh
# No inline formatting in templates:
grep -rnE "toFixed|Math\.(round|min|max)|Intl\.|new Date|parseFloat|parseInt" \
  frontend/src/partials frontend/index.html

# No inline label/unit assembly:
grep -rnE "\.display \+ ' '|label \+ \(.*unit|label \+ ' \('" \
  frontend/src/partials frontend/index.html

# No assignments in handlers:
grep -rnE "(@[a-z.:-]+|x-on:[a-z.:-]+)=\"[^\"]*[^=!<>]=( |\")" \
  frontend/src/partials frontend/index.html
```

Review (not a clean-room grep): `grep -rnE "catch \{" frontend/src/adapters frontend/src/store`.
Bare catches are acceptable only for parsing untrusted external data (`JSON.parse`,
`localStorage`) and the boundary frontier's dependency probe; every engine/view
degradation catch (`stepView.safe`, `materializeSelections`, `hops`/`style`
`engine.resolve`) must use `reportError(scope, err)` instead.

Then confirm:

- `tests/guards/alpine-handlers.test.js` (A8): every handler calls a real app method.
- `tests/guards/show-dereference.test.js` (A10): no nullable dereference behind `x-show`.
- `tests/guards/installer-contract.test.js`: installer key sets are declared and collide-free.
- `tests/guards/determinism.test.js` (A9) and `tests/guards/no-reactivity.test.js` (A1) pass.
- `tests/guards/option-labels.test.js`: every choice selector labels its full taxonomy (the set is derived from the step manifest — add the registry `optionLabels`, never edit the guard's list).
- `tests/frontend/utils.test.js` covers any util you added or changed.
- `tests/conformance/validation-parity.test.js` + `tests/backend/conformance/test_validation_parity.py` agree.
- No engine/artifact imports were added to the utils barrel.

## Neighbouring invariants (do not duplicate, do respect)

- `<select :value>` with `x-for` options needs an explicit `:selected` on each option (`tests/guards/select-binding.test.js`).
- Presentation metadata — `label`, `optionLabels`, `hint`, `unit` — lives in `views/registry/*`; templates and cards read it, never hardcode it. Choice selectors and reference pickers both resolve through `fmt.optionLabel`.
- Field models come from `fieldsBySlice` / `fieldsById`; never resolve engine paths in a template.
- Unit conversion is display-only: writes store base units (`tests/guards/display-only-units.test.js`).
- `data/artifact.json` is canonical; artifact changes still require `node scripts/emit-artifact-inventory.mjs` and doc updates.
- Token verification is cached ≤5 min (`TOKEN_CACHE_TTL_SECONDS`); revocation is eventual within that window.
- `/solve/*` routes are per-uid rate-limited (`RateLimitedUser`); it is instance-scoped and best-effort, not a security boundary.
