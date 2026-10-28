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

The generator does no numeric work. Every scalar the bundle exposes arrives in
`formatted[path]`:

```jsonc
{ "text": "12.4 °P", "number": "12.4", "unit": "°P" }
```

- `text` is what a section prints; `number`/`unit` split the figure for tables
  that align them in separate columns.
- Collection tables (the grist and sugar lists) read `formatted_tables[collection]`:
  one cell map per row, with derived columns (amounts, PPG, `own_pct`, `grist_pct`,
  `extract`, `extract_pct`) computed by the producer. Grist is major + trace; sugar
  is measured against it, so the three tables' shares do not partition to 100. The
  extract columns feed the fourth table, read by concatenating the malt and sugar
  rows; trace malts carry no extract.
- Weighted readouts read `formatted_summaries[collection]` (`color`,
  `extract_yield`), plus the `overall` aggregate across tables; the producer
  does the weighting, and trace malts contribute no extract to the overall.
- A readout delta a section prints (attenuation above the malt cap) is an
  **artifact node**, not producer formatting or Typst arithmetic: the node is
  null when the delta does not apply, so the row disappears like any other
  absent value.
- `lib/format.typ` exposes `formatted(path)`, `formatted-text(path)`,
  `formatted-number(path)`, `formatted-unit(path)`, and
  `present-formatted(path)`. There is no conversion, rounding, or symbol choice
  in Typst.
- The **producer** (the browser freeze payload) computes the strings with the
  same formatter the UI uses, at the unit preference in force at freeze
  (per-field override → registry pin → per-dimension choice → default). Nonlinear
  units (SG ↔ °P) are handled there.
- `catalog` keeps the structural metadata — labels, dimension ids, unit ids,
  options — for labelling, option mapping, and the paper rule.

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

## Rendering service

`app/services/report_render.py` copies the template tree into a temp root, writes
the bundle beside it, and shells out to the pinned Typst binary. The bundle is
data, the templates are code: no user-supplied path or Typst source reaches the
compiler, and `--root` confinement is what makes that a boundary. The binary is
resolved on first use (`TYPST_BIN`, else `typst` on `PATH`) and its version must
match `templates/TYPST_VERSION`, otherwise the route answers `503`.

| Route | Serves |
|---|---|
| `GET /batches/{id}/report` | the stored bundle of a frozen batch |
| `POST /batches/{id}/report` | a draft's posted `{ "bundle": … }`, persisting nothing |

Both accept `doc_kind`, `sections`, `paper`, `format=pdf|png` and `page` (the PNG
page to export). `pdf` is the default; a PNG response is one page, selected by
`page`.

- `200` — the artifact, with `ETag`, `Content-Length`, `X-Report-Sections` and
  `X-Report-Pages`.
- `404` — missing batch, or another user's.
- `409` — a draft on `GET`, a frozen batch on `POST`, or a frozen batch that
  predates bundles.
- `422` — unknown section id, unknown `doc_kind`/`paper`/`format`, a page beyond
  the document, or a selection that resolves to nothing (a blank page is
  indistinguishable from a rendering bug, so it is refused).
- `503` — Typst missing or not the pinned version; `500` — a template failure.

The `ETag` hashes the bundle's `content_hash`, the template tree and the spec, so a
template edit or a different unit preference revalidates. Only frozen renders carry
one: a preview embeds its compile time, so the same tag would not mean the same
bytes. Nothing is persisted — the bundle is the fact and the render is derived.

Canonical order is registry order; `sections=` cannot reorder it. The generated
[`report-sections.md`](report-sections.md) lists the order, the presence
predicate, and the source file for every section.

Keep-together is applied at the **reading unit**, not the section: a heading never
separates from the table or paragraph it introduces, and a table never splits
mid-row. Short sections wrap their whole body; a long section (Batch Facts) wraps
each subsection, so it can break between subsections and fill the page instead of
pushing a blank one. A unit taller than a page would overflow rather than break,
which is the signal to split it.

## Chrome and ancestry

The chrome is the batch name, one meta line — `Brew report · Frozen <date> · Batch
<short id>` — and a rule. **Identity is not repeated here**: Batch Basics carries
equipment, water source and style, so the chrome only supplies them when the
selection excludes Batch Facts. Every report therefore prints identity exactly
once, and a standalone sheet (which suppresses the chrome) keeps it.

The short batch id is the first eight characters plus an ellipsis. The full id, the
content hash, the render key and the resolved section ids are emitted as
`#metadata(<report-meta>)`, so a service or script can read what the page truncates.

The footer prints the batch name and eight hex characters of the render key (the
content hash until the service lands). Eight characters identify the bundle **and**
the template/toolchain that printed it, so a printed sheet is traceable with no
registry — and a reprint after a template edit shows a different token, which is
the divergence the product accepts.

## Status

Landed: the template tree, the registry contract and its guards, the pinned
version, the local loop, the bundle-carried display strings (`formatted`,
`formatted_tables`, `formatted_summaries`) that make the generator a string
compositor, and the sections — **Brewhouse** (`sections/brewhouse.typ`),
**Batch Facts**, **Yeast**, the **Volume Ledger** and the **Liquor Ledger**. Not
yet landed: the remaining section modules (authored one at a time — see
[`adding-a-section.md`](adding-a-section.md)), the FastAPI routes,
`report_render.py`, and the image that ships the binary.
