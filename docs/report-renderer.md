# Report renderer

A report is a **derived view** of one bundle. Typst owns composition, layout,
and typography; Python owns the guard, the process boundary, and the HTTP
surface. The design record is
[`plans/report-renderer.md`](../plans/report-renderer.md); the input contract is
[`report-bundle.md`](report-bundle.md).

Two rules that explain most of the shape:

- **Nothing is stored.** The bundle beside a frozen batch is the fact. A report
  is generated on request, before or after freeze, and is never persisted — no
  bytes, no render cache, no version history. The render key is the `ETag` and
  the footer's ancestry token.
- **One input type.** The renderer takes a bundle and nothing else. A frozen
  batch's stored bundle and a draft's preview bundle travel by different routes
  but arrive at the same function.

## Templates

| Path | Role |
|---|---|
| `backend/app/templates/report.typ` | entry point: spec resolution, chrome, registry literal |
| `backend/app/templates/theme.typ` | page setup, type, headings, footer |
| `backend/app/templates/lib/bundle.typ` | loads the bundle from `sys.inputs` |
| `backend/app/templates/lib/format.typ` | dotted-path accessors, unit conversion, display strings |
| `backend/app/templates/sections/*.typ` | one module per section: `present()` + `render()` |
| `backend/app/templates/fonts/*` | vendored IBM Plex Sans (variable Roman + Italic) + OFL |
| `backend/app/templates/TYPST_VERSION` | the pinned `typst` version |

The split is for review and for the render key: a styling change must not
invalidate a content identity, and a section must be reviewable alone.

Language-level facts — which functions exist in 0.15.1, how paths resolve, how
numbers and dates are formatted — are collected in
[`typst-notes.md`](typst-notes.md). Treat it as the authority over memory: the
version is pinned, so a note that is wrong is a bug.

## Local loop

Download a bundle (editor toolbar → **Download bundle**, or a batch row menu),
then iterate without Python:

```bash
make report-dev BUNDLE=~/Downloads/house-pale-report-bundle.json
# → typst watch → .local/report/report.pdf

make report-pages BUNDLE=~/Downloads/house-pale-report-bundle.json
# → one PNG per page in .local/report/page-{p}.png

# A single section, i.e. the standalone sheet:
make report-pages BUNDLE=… SECTIONS=water-chemistry

# US Letter instead of the unit-derived default:
make report-pages BUNDLE=… PAPER=letter
```

`.local/` is gitignored and disposable. `make report-dev` refuses to run when
the installed `typst` does not match `TYPST_VERSION`: a version mismatch moves
line breaks, which reads as a template bug and is not one. Both targets compile
with `--font-path backend/app/templates/fonts --ignore-system-fonts`, so the
local loop uses the vendored face and never a system substitute; the render
tests assert the family resolves from that path.

The bundle reaches Typst as a **path input** (`--input bundle=/…`), resolved
against `--root`. The service passes `/report.json` from its temp root; the
local targets pass `/.local/report/report.json` with the repo as root. One
mechanism, no staging step in the edit cycle.

## Formatting

`catalog.nodes[path]` carries everything a readout needs: `label`, `dimension`,
`unit` (conversion handle), `symbol` (display suffix), `decimals`, and
`option_labels` for taxonomies. `lib/format.typ:display(path)` converts from the
base unit, rounds to `decimals`, and appends the symbol — matching
[`display-precision.md`](display-precision.md).

Two limits, both deliberate:

- **Nonlinear units** (SG ↔ °P) need a function the bundle cannot carry, so the
  helper panics naming the path instead of printing a base value. The first
  section that needs one adds a named function to `lib/format.typ`.
- **Null precision** falls back to the frontend's `formatValue`: integers
  verbatim, everything else trimmed to three decimals.

`tests/conformance/fixtures/report-format-vector.json` is generated from the
frontend's own formatter and compared against Typst output by
`tests/backend/test_report_format_parity.py`. Both skip loudly without `typst`;
CI and the image always have it.

## Spec

| Input | Values | Default |
|---|---|---|
| `sections` | comma-separated section ids | all |
| `doc_kind` | `recipe` | `recipe` |
| `paper` | `a4`, `letter`, `auto` | `auto` |

`paper=auto` follows the bundle’s display units: two of the three markers —
`batch.v_ferm` volume in `gal`/`qt`, `solver.batch.m_grist` mass in `lb`/`oz`,
`mash.strike_water_temp_c` in `degF` — select US Letter; otherwise A4. An
explicit `a4`/`letter` overrides the inference. The resolved paper is part of
the canonical spec, so it changes the render key.

`include = requested ∧ present`: the spec asks, the bundle answers. A requested
section whose data is absent does not render — it is not rendered as zeros. One
surviving section makes a standalone sheet, which suppresses the document chrome.

Canonical order is registry order; `sections=` cannot reorder it. The generated
[`report-sections.md`](report-sections.md) lists the order, the presence
predicate, and the source file for every section.

## Ancestry

The footer prints the batch id, the freeze date, and eight hex characters of the
render key (the content hash until the service lands). Eight characters identify
the bundle **and** the template/toolchain that printed it, so a printed sheet is
traceable with no registry — and a reprint after a template edit shows a
different token, which is the divergence the product accepts.

## Status

Landed: the template tree, the registry contract and its guards, the formatting
vector, the pinned version, the local loop, and the first section — the
**Volume Ledger** (`sections/volume-ledger.typ`), with identity-path resolution
and `display-number` added to `lib/format.typ`. Not yet landed: the remaining
section modules (authored one at a time — see
[`adding-a-section.md`](adding-a-section.md)), the FastAPI routes,
`report_render.py`, and the image that ships the binary.
