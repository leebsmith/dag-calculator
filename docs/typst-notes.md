# Typst notes — 0.15.1

Facts verified against the pinned binary while building the report scaffold.
Anything not here and not in the templates is unverified — check before using it.

## Toolchain

- `backend/app/templates/TYPST_VERSION` pins `0.15.1`. `make report-dev` refuses
  to run on a different binary; `test_report_format_parity.py` asserts it.
- Fonts are vendored: **IBM Plex Sans** (variable Roman + Italic) in
  `backend/app/templates/fonts/`, SIL OFL. Every report compile passes
  `--font-path … --ignore-system-fonts`; `theme.typ` names IBM Plex Sans.
- Typst is not a Python dependency: shell out to the binary (`TYPST_BIN`).

## The only API a section may use

From `lib/format.typ`: `req(container, path)`, `opt(container, path)`,
`value(path)`, `node(path)`, `present-value(path)`,
`format-value(number, dimension, unit, decimals, symbol, path: "")`,
`display(path)`, `display-number(path)`, `option-label(path, raw)`.

`value`, `present-value`, and the display helpers resolve a valuation path,
then fall back to `batch.identity` for component fields (`equipment.*`,
`style.*`, `water.source.*`). Boundary outputs are flattened keys inside the
boundary map (`cascade.v_strike`), so a dotted suffix matches the longest key,
not necessarily one segment.

From `lib/bundle.typ`: `bundle`, `batch`, `state`, `catalog`, `is-frozen`.

Anything else a section needs belongs in `lib/` first, not inline.

## Loading the bundle

```typst
#let bundle = json(sys.inputs.at("bundle", default: "/report.json"))
```

- A **leading `/` is root-relative** (against `--root`), never
  filesystem-absolute. A path without it resolves against the importing file,
  which is why `lib/bundle.typ` needs the leading slash.
- `--input key=value` only; every value arrives as a string.
- JSON yields `int`, `float`, `str`, `bool`, `array`, `dictionary`, or `none`.
  There are no optional fields: absence is a missing key.

## Identifiers

Kebab-case is valid: `format-value`, `is-frozen`, `render-key`. Subtraction
needs spaces (`a - b`), so `a-b` is one identifier.

## Dicts, arrays, absence

```typst
d.at("k", default: none)   "k" in d   (:)            // empty dict
arr.at(0)  arr.len()  arr.slice(0, i)  arr.join(".")  arr.contains("x")
arr.map(x => x + 1)  arr.filter(x => x != none)  arr.flatten()
..arr                                                // spread
```

`.at` throws on a missing key unless given `default`; `none` is a value, so
`x != none` and `x == none` are the presence tests.

## Types

`type(x) == dictionary | array | str | int | float | bool`, and `x == none`.
`int` and `float` are distinct: `1` is an int, `1.0` a float.

## Functions, scope, show rules

```typst
#let f(a, b: 1) = { ... }
#let g(body) = { set text(size: 9.5pt); body }
#show: rest => g(rest)
```

`set`/`show` inside a function body apply to that body's scope only. A
show-rule body **must be positional** — passing `body: rest` fails with "the
argument `body` is positional".

## Numbers

```typst
calc.pow(10.0, decimals)          // float base
calc.round(x * scale) / scale
calc.trunc(x)  calc.abs(x)  str(int(x))
```

There is no `toFixed`. Fixed decimals are `str(...)` plus manual zero padding
after splitting on `"."`; a `decimals` of `none` means "no fixed precision"
(integers verbatim, otherwise three decimals, matching the frontend).

## Strings

`split`, `position`, `+` concatenation, `"0" * n` repetition, `len()`, and
`.at(i, default: "")` for a missing split segment.

## Dates

```typst
// epoch seconds -> date
(datetime(day: 1, month: 1, year: 1970) + duration(seconds: int(seconds)))
  .display("[day] [month repr:short] [year]")
```

- `datetime.from-unix(...)` does **not** exist in 0.15.1.
- `datetime(unix: …)` does **not** exist either.
- `datetime.today()` exists and is forbidden here: it breaks determinism.
- `--creation-timestamp` pins PDF metadata only; it does not affect
  `datetime.today()`.

## Metadata out (the test and API seam)

```typst
#metadata(value) <label>
```

```bash
typst eval 'query(<label>)' --in probe.typ --root <dir>
```

`typst query` still works but is deprecated in 0.15 and warns on stderr; the
`eval` form is what the parity test uses and what `report_render.py` should use.

## Page chrome

```typst
set page(
  paper: "a4",   // report.typ resolves a4 | us-letter from the spec + units
  margin: (x: 19mm, top: 18mm, bottom: 21mm),
  footer: context [ ... counter(page).display("1 / 1") ... ],
)
```

`context` is required for anything reading a counter or measuring layout.
Rules: `line(length: 100%, stroke: 0.6pt + rgb("#b9b1a4"))`.

## Outputs

- `--format png` needs `{p}` in the output path. A4 lands at 1191 × 1684,
  US Letter at 1224 × 1584, 8-bit RGBA at the default resolution.
- Format is inferred from the output extension when `--format` is omitted.
- `--root` is a real boundary: anything outside it is rejected, symlinks
  included.

## What will bite you

1. `datetime.from-unix` — does not exist. Use the epoch + duration form.
2. Passing a show-rule body as a named argument.
3. `json("report.json")` resolving next to `lib/` instead of at the root.
4. `str(1.5)` is `"1.5"`, not `"1.50"` — pad explicitly.
5. `calc.pow(10, n)` with an int base; use `10.0`.
6. Assuming a global `bundle`; import `lib/bundle.typ`.
7. Re-deriving unit conversion or precision inside a section — `display(path)`
   owns both, and the parity vector pins it.
8. Formatting a nonlinear unit (SG ↔ °P) by hand; `format-value` panics on
   purpose until a named function is added.

## Determinism checklist

- No `datetime.today()`, no system clock reads.
- Only the vendored IBM Plex Sans set: pass `--font-path` and
  `--ignore-system-fonts`, so a system copy can never stand in. A render test
  asserts the family resolves from the vendored path.
- Do not depend on dictionary iteration order for computed output.
- Same bundle + spec + binary ⇒ byte-identical PDF
  (`test_report_format_parity.py::test_the_bundle_renders_deterministically`).
