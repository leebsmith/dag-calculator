# Adding a report section

A section is one module under `backend/app/templates/sections/` plus one line in
the registry literal in `backend/app/templates/report.typ`. Sections land **one
at a time**, each in its own commit, each provably renderable.

> Reference while you work: `report-renderer.md` (template contract, dev loop),
> `typst-notes.md` (verified 0.15.1 idioms and the API a section may use),
> `report-bundle.md` (what the bundle carries), and the generated
> `report-sections.md` (current canonical order).

## 0. Choose the section and its fact

A section renders a fact that is already in the bundle. It never recomputes
domain values and never re-solves. If the fact is a boundary output, the section
reads the output map; if the boundary has not run, the section is **absent**, not
zero.

Decide the canonical position at the same time. Registry order is render order;
inserting a section mid-report is a one-line move, and the generated table makes
the resulting order change part of the diff.

## 1. Write the module

`sections/<id>.typ` exports exactly two functions, both taking no arguments and
both reading the bundle through `lib/bundle.typ`:

| Export | Contract |
|---|---|
| `present()` | `true` only when the section's data exists in the bundle |
| `render()` | the section body, without its heading (the registry supplies the title) |

Rules:

- **Presence keys off output existence, not value.** A boundary output map that
  is absent hides the section; a map that is present with a zero total still
  renders. Writing `value == 0` as a predicate is how a report invents eight
  confident `0 g` rows.
- **No unguarded member access.** Use `req(container, path)` and `opt(container,
  path)` from `lib/format.typ`; a missing key must panic with the dotted path,
  not with a line number.
- **Read display strings from the bundle metadata.** `display(path)` handles the
  unit conversion, precision, and symbol; `option-label(path, raw)` handles
  taxonomies. Do not hardcode a unit or a decimal count.
- **Do not invent Typst API.** If a function is not in `typst-notes.md` or in
  `lib/`, it is unverified; check it against the pinned binary before relying on
  it.

## 2. Add the registry line

In `backend/app/templates/report.typ`, inside the marker block:

```typst
#import "sections/<id>.typ": present-<id>, render-<id>
```

and, in canonical position:

```typst
(id: "<id>", title: "<Title>", present: present-<id>, render: render-<id>),
```

One line per entry, in the fixed shape shown — the parser is strict, and an
unparsable entry fails loudly rather than being skipped. The filename must equal
the id.

## 3. Make sure the fixture has the data

`tests/conformance/fixtures/report-bundle.json` is the committed sample bundle.
If your section reads a block the fixture lacks, enrich
`backend/scripts/emit_report_bundle_fixture.py` in this commit (it is a
hand-authored representative bundle) and regenerate:

```bash
cd backend && PYTHONPATH=. uv run python scripts/emit_report_bundle_fixture.py
```

Do not enrich the fixture speculatively — the first section that needs a block
is the change that justifies it.

## 4. Look at it

```bash
make report-pages BUNDLE=~/Downloads/<batch>-report-bundle.json
```

The fixture bundle works too:
`BUNDLE=tests/conformance/fixtures/report-bundle.json`.

Check the section alone and with the rest: `make report-dev` recompiles on save.

## 5. Re-sync the generated table

```bash
node scripts/emit-report-sections.mjs
```

`make generate` runs it too, and the pre-commit hook stages the result.
`tests/guards/report-sections-sync.test.js` fails if you skip it, and also checks
the registry↔file contract (one entry per file, one file per entry, unique ids,
a declared presence predicate).

## 6. Test it

- **Presence:** a fixture or probe where the section's data is absent must render
  nothing; a present one must render.
- **Isolation:** the section compiles alone (`make report-pages … SECTIONS=<id>`)
  as well as in the full set.
- **Formatting:** if the section introduces a new unit or precision path, extend
  the synthetic cases in `scripts/report-format-vector.mjs` and regenerate.

## Checklist

- [ ] `sections/<id>.typ` with `present()` and `render()`
- [ ] registry line, in canonical position
- [ ] fixture carries the data the section reads (regenerated if touched)
- [ ] renders in the local loop, alone and with the other sections
- [ ] `node scripts/emit-report-sections.mjs` run, table committed
- [ ] `make check` + `make test` green
