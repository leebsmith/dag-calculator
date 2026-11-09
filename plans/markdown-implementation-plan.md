---
title: Markdown prose — backend Typst AST, frontend subset validation
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [report-renderer, report-bundle]
blocks: []
gate: markdown in hopping strategy, process notes, and brew-day checklist notes renders as styled prose in recipe and session PDFs; the frontend validator flags unsupported constructs without a backend call; make check and make test green
status: proposed
---

# Markdown prose — backend Typst AST, frontend subset validation

Status: proposed. Freeform text becomes markdown at three authoring surfaces. The
backend converts markdown to a small normalized AST at report time and Typst
renders that AST with content constructors. The frontend keeps `markdown-it` as
an advisory supported-subset validator, not a renderer.

<!-- claims: proposed prose.unsupported.table prose.unsupported.image prose.unsupported.html prose.unsafe.link prose.too_long prose.too_deep prose.too_many_nodes prose.check_failed -->

## Execution checklist

- [ ] Add `markdown-it-py` as a backend runtime dependency.
- [ ] Implement the backend markdown parser, AST normalizer, limits, safe-link rule, and report/session enrichers in `backend/app/services/prose.py`.
- [ ] Add the recursive Typst prose renderer in `backend/app/templates/lib/prose.typ`, with a text fallback and same-font `raw` code.
- [ ] Wire `hops.typ`, `process.typ`, `checklist.typ`, and `brew_session.typ` through the prose helpers.
- [ ] Enrich report and session payloads in `backend/app/services/report_render.py` and add the prose digest to the render key.
- [ ] Add the local report-bundle enrichment CLI and wire it into `make report-dev` and `make report-pages`.
- [ ] Change the hopping-strategy producer to emit one raw-markdown row.
- [ ] Add `markdown-it` to the frontend and implement the memoized subset validator in `frontend/src/markdown/validate.js`.
- [ ] Add the prose-validation installer, register it, and wire it into `stepAdapter.js`.
- [ ] Show advisory validation lines for hopping strategy, process notes, recipe checklist notes, and live session notes/skip reasons.
- [ ] Make process notes use a multiline textarea in the collection table.
- [ ] Add backend prose and render tests, and update the report-bundle fixture and existing hop-strategy tests.
- [ ] Add frontend validator tests and shared prose conformance fixtures.
- [ ] Add `docs/prose.md` and update `docs/report-renderer.md`, `docs/typst-notes.md`, and `docs/report-bundle.md`.
- [ ] Run lint, boundary checks, the full `make test` gate, and `make build`; fix failures.
- [ ] Move the plan to `plans/archive/2026-11/` and commit the completed work.

## 1. Goal

Freeform brewing prose — the hopping strategy, process notes, and brew-day
checklist notes — should support the useful part of markdown: paragraphs,
emphasis, strong text, strikethrough, links, lists, blockquotes, rules, hard
breaks, and code. The PDF must print the result with the existing report
typography, and the editor must warn about constructs the PDF will not support
without making a backend call.

The report remains a pure derived view: raw markdown is the stored fact, the
bundle carries it, and Typst owns composition. No markdown is ever emitted as a
report format, and no generated Typst source reaches the compiler.

## 2. Locked decisions

| # | Decision |
|---|---|
| 1 | **Backend conversion.** Markdown becomes the AST in `backend/app/services/prose.py` at report/session render time. |
| 2 | **AST, not Typst source.** The renderer walks typed nodes and calls Typst content constructors. No string interpolation into markup and no `eval`. |
| 3 | **Raw markdown is stored.** The bundle and session documents keep the authored text. No parsed AST is persisted in this phase. |
| 4 | **Three surfaces.** Hopping strategy, process notes, and recipe/live brew-day checklist notes. Catalog notes and other freeform fields are out of scope. |
| 5 | **PDF only.** There is no editor preview and no `x-html` prose surface. |
| 6 | **Frontend validation is advisory.** `markdown-it` token inspection flags unsupported constructs, unsafe links, and cap violations. It never blocks save or freeze. |
| 7 | **Backend is authoritative.** The backend still parses, validates, and degrades. A frontend miss cannot create a broken report. |
| 8 | **Prose subset.** Paragraphs, emphasis, strong, strikethrough, links, ordered/unordered lists, blockquotes, horizontal rules, hard breaks, inline code, and fenced code. Headings map to bold paragraphs. |
| 9 | **Degrade, never fail.** Images print as alt text, raw HTML prints as text, tables print as ordinary paragraphs, unsafe links print as labels. |
| 10 | **Same-font code.** Code uses Typst `raw` with a show rule that keeps the report's IBM Plex Sans face and a subtle fill. No new font asset. |
| 11 | **Memoized validation.** The frontend caches issue results by source text and subset version. It does not cache rendered HTML. |
| 12 | **Render-key honesty.** The report key gains the parser version and a hash of the prose renderer source, so a parser or renderer upgrade revalidates like a template edit. |

## 3. Scope

| Surface | Stored value | Report path |
|---|---|---|
| Hopping strategy | batch record textarea | `report.hop_strategy`, one raw-markdown row |
| Process notes | `batch.process_notes.text` rows | `batch.process_notes` formatted table |
| Recipe checklist note | `batch.brew_checklist.note` | checklist formatted table |
| Live checklist note | session step `note` | `brew_session.typ` |
| Live skip reason | session step `skip_reason` | `brew_session.typ` |

Out of scope for this plan:

- Editor preview, side-by-side rendering, or HTML prose output.
- Catalog, ingredient, equipment, and water-target notes.
- Session overall notes and observation notes (a later expansion once the seam
  is proven).
- Markdown tables, images, raw HTML, footnotes, and definition lists in the
  rendered PDF.
- Freeze-time AST storage. This is the compatibility fallback if byte-identical
  frozen renders across parser upgrades become a requirement.

## 4. Data flow

```
field textarea ──▶ raw markdown stored
                         │
                         ├──▶ report bundle (raw cells)
                         │        │
                         │        └──▶ report_render.enrich_report()
                         │                 │
                         │                 └──▶ lib/prose.typ ──▶ PDF
                         │
                         └──▶ session document
                                  │
                                  └──▶ render_session.enrich_session()
                                           │
                                           └──▶ brew_session.typ ──▶ PDF

frontend validator: field text ──▶ markdown-it tokens ──▶ cached issues
                                                              │
                                                              └──▶ inline warning
```

The frontend validator and the backend renderer are deliberately separate
consumers of the same raw text. The frontend check is a convenience; the
backend parse is the contract.

## 5. AST contract

Create `docs/prose.md` as the living contract. The normalized shape is:

| Node | Children / fields |
|---|---|
| `doc` | block children |
| `paragraph` | inline children |
| `heading` | level 1–3, inline children |
| `list` | ordered flag, start, item block lists |
| `quote` | block children |
| `code` | text, block flag, language |
| `hr` | none |
| inline `text` | value |
| inline `strong` | inline children |
| inline `emph` | inline children |
| inline `strike` | inline children |
| inline `code` | value |
| inline `link` | safe href, title, inline children |
| inline `break` | hard break |

Normalization rules:

- Headings render as bold paragraphs at theme heading sizes. They never enter
  the document outline or force a page break.
- Soft breaks become spaces; hard breaks become `linebreak()`.
- Lists may nest; ordered lists preserve their start number.
- Unknown nodes render their text children when possible; otherwise they are
  dropped silently. A parser upgrade cannot crash a report.
- Images contribute alt text only. Raw HTML contributes text only. Table tokens
  become ordinary paragraphs because tables are not enabled in the render parser.

Initial limits, tuned after fixtures:

| Limit | Initial value |
|---|---|
| Source length | 20,000 Unicode code points per field |
| AST nodes | 2,000 |
| Nesting depth | 32 |

When a limit is exceeded, the renderer falls back to one plain-text paragraph
and logs the degradation. The frontend validator reports the same condition
before the user gets there.

## 6. Backend implementation

### 6.1 Parser and enrichers

`backend/app/services/prose.py`:

- Construct one `MarkdownIt` in `commonmark` mode with `html` disabled and
  `strikethrough` enabled. Do not enable tables, linkify, or typographer.
- Walk `SyntaxTreeNode` recursively into the normalized AST.
- Validate link destinations with the same `http`/`https` rule as `safeHref`.
- Expose `PROSE_AST_VERSION` and the limits as module constants.
- `enrich_report(payload)` injects a `blocks` member into the known prose cells.
- `enrich_session(session)` injects adjacent prose blocks for live checklist
  notes and skip reasons.
- `enrich_bundle(bundle)` is the checked constructor used by the service and the
  local-loop CLI, so there is one enrichment path.

### 6.2 Typst renderer

`backend/app/templates/lib/prose.typ`:

- `render-prose(ast)` is the single recursive walk.
- `prose-cell(cell)` renders `blocks` when present and otherwise returns the
  existing `text`, which keeps old bundles and unenriched local bundles
  compiling.
- `prose-value(value, blocks)` does the same for session scalars.
- Inline code and fenced blocks use `raw`; a show rule distinguishes inline from
  block with the element's block flag and keeps the IBM Plex Sans face.
- Links use `link(dest, body)` only for validated destinations.
- Headings use the theme's heading sizes through `text(weight: "bold")`, not
  `heading(...)`.

### 6.3 Section wiring

| File | Change |
|---|---|
| `backend/app/templates/sections/hops.typ` | strategy rows render through `prose-cell` |
| `backend/app/templates/sections/process.typ` | note cells render through `prose-cell` |
| `backend/app/templates/sections/checklist.typ` | note cells render through `prose-cell` |
| `backend/app/templates/brew_session.typ` | step notes and skip reasons render through `prose-value` |

`report_render.py` calls the enricher after `bundle.model_dump()` and before it
writes the temporary `report.json`. `render_session` does the same for the
session document.

`_render_key` gains a prose digest built from `PROSE_AST_VERSION`, the installed
`markdown-it-py` version, and a hash of `prose.py`. A prose change therefore
changes the frozen `ETag` the same way a template edit does.

### 6.4 Local loop

`make report-dev` and `make report-pages` currently copy the downloaded bundle
straight into `.local/report/report.json`. Add one backend CLI step that runs the
same `enrich_bundle` before `typst watch`. The downloaded bundle stays the raw
fact; the enriched copy is disposable local state.

This changes the report-renderer wording that promises “no staging step.” The
replacement is precise: one enrichment step, the same one the service uses; no
second presentation model.

### 6.5 Dependency

Add `markdown-it-py` to `backend/pyproject.toml` as a runtime dependency. It is
already present in `backend/uv.lock` as a transitive development dependency, so
the version does not move in this change, but the project dependency list does.

## 7. Frontend validator

### 7.1 Dependency and loading

Add `markdown-it` to `frontend/package.json` as a runtime dependency. Load it
eagerly for this phase; measure the production bundle delta with `make build`.
If the delta is unacceptable, a later change can switch to a dynamic import
without changing the validator contract.

### 7.2 Module

`frontend/src/markdown/validate.js` exports a `createProseValidator` factory.
It owns:

- a detection-only parser with tables, images, and raw HTML visible in the token
  stream;
- permissive link parsing so unsafe destinations become tokens the validator
  can inspect (the parser is never rendered);
- a bounded LRU keyed by source text plus `PROSE_SUBSET_VERSION`;
- a frozen result `{ ok, issues }` where each issue has a stable code, a short
  message, and an optional line number.

Validation checks:

| Code | Trigger | Advisory message |
|---|---|---|
| `prose.unsupported.table` | table tokens | “Tables print as plain text in the PDF.” |
| `prose.unsupported.image` | image tokens | “Images print as alt text in the PDF.” |
| `prose.unsupported.html` | HTML block/inline tokens | “HTML prints as text in the PDF.” |
| `prose.unsafe.link` | destination fails the `http`/`https` rule | “Only http and https links remain clickable.” |
| `prose.too_long` | over the code-point cap | “This note is longer than the report supports.” |
| `prose.too_deep` | over the nesting cap | “This note is nested more deeply than the report supports.” |
| `prose.too_many_nodes` | over the node cap | “This note has too many elements for the report.” |
| `prose.check_failed` | the local check threw | “The markdown check could not run.” |

Use `Array.from(source).length` so the frontend cap matches Python's `len`.
Block-token line maps provide the line number; inline issues inherit the
enclosing block's line.

### 7.3 Installer and UI

`frontend/src/adapters/proseValidation.js` exports `proseIssues`,
`proseHasIssues`, and a `KEYS` array. Register it in
`frontend/src/adapters/installers.js` and wire it in
`frontend/src/adapters/stepAdapter.js`.

Templates call the named methods only; no parsing, predicates, or HTML binding
inline. Issues appear as a short warning line under the relevant control:

- hopping strategy textarea
- each process-note textarea
- recipe checklist note textarea
- live checklist note textarea
- live skip-reason input

Show nothing when there are no issues. Never block save or freeze from this
check. The editor hint can say “Markdown supported” once; the issue line speaks
only when something will degrade.

### 7.4 Multiline process notes

The process-note collection currently uses a single-line `<input>` for its `text`
column. Markdown needs a textarea.

- Mark the collection entry as prose/multiline in `frontend/src/views/steps.js`
  and propagate the flag through `frontend/src/views/producer/projection.js`.
- Render a textarea in the collection-table branch of
  `frontend/src/partials/step-card.html`.
- Commit on change; no live engine write on every keystroke is required.
- Add the same issue line used by the other prose fields.

### 7.5 No renderer

No render call, no `x-html`, no preview container, and no HTML returned from the
validator. The only frontend output is a list of issue records. This keeps the
new surface free of HTML injection risk and keeps the backend as the sole place
where markdown becomes layout.

## 8. Producer and bundle change

`frontend/src/views/producer/reportFormat.js` currently splits the hopping
strategy on blank lines and collapses whitespace into one row per paragraph.
That destroys lists and headings. Change it to emit **one row carrying the raw
markdown source**.

No bundle field is added and no format bump is required: `formatted_tables` is
still a list of display cells. Old bundles with several paragraph rows still
render; each row is parsed as its own markdown document. New bundles carry one
row and render as one document.

Update:

- `docs/report-bundle.md` — named report table description.
- `tests/frontend/report-format.test.js` and `tests/frontend/report-builders.test.js`.
- The report bundle fixture emitter and `tests/conformance/fixtures/report-bundle.json`.
- `tests/backend/test_report_bundle.py` and `tests/backend/test_report_sections.py`.

No artifact change and no `make generate` run.

## 9. Determinism, safety, and performance

- **Determinism.** The parser is pure and pinned. The render key includes the
  parser version and prose renderer hash. A toolchain upgrade may change a frozen
  render, which report-renderer decision #15 already permits; the footer still
  attributes the bundle and toolchain. If strict byte-identical frozen renders
  across upgrades become necessary, persist the AST in the bundle as a follow-on.
- **No external content.** Images never fetch; they contribute alt text. Links
  are the only external destination and are validated.
- **No Typst source injection.** The AST is data; all strings reach Typst as
  text. No `eval`, no generated markup.
- **Bounded work.** Source, node, and depth caps keep parsing and rendering
  linear. The frontend skips parsing once the source cap is exceeded.
- **Performance.** The backend parses once per render; no cache is needed. The
  frontend caches validation results, not HTML, with a bounded LRU. The eager
  `markdown-it` import is measured in `make build`.

## 10. Tests

| Suite | Coverage |
|---|---|
| `tests/backend/test_prose.py` | every AST node, unsafe links, raw HTML as text, images as alt text, tables as paragraphs, caps, fallback, determinism |
| `tests/backend/test_report_render.py` | prose in process notes, hop strategy, and checklist notes prints styled text, not literal markers |
| `tests/backend/test_brew_session_report.py` | live step notes and skip reasons render |
| `tests/backend/test_report_sections.py` | raw hop strategy presence/absence and `blocks`-absent fallback |
| `tests/frontend/prose-validation.test.js` | every issue code, unsafe links, raw HTML, images, tables, caps, code-point counting, empty/non-string input, memoized identity, cache bounds |
| `tests/guards/installer-contract.test.js` | the new installer `KEYS` are declared and collision-free |
| `tests/conformance/fixtures/prose-constructs.json` | shared cases; the JS test asserts issue codes, the Python test asserts the same constructs degrade as specified |

Add a report render case that asserts `**bold**` does not appear literally in
the extracted PDF text while the bold content does.

## 11. Documentation

| File | Change |
|---|---|
| `docs/prose.md` | new living contract: supported subset, degradation rules, caps, advisory validation, memoization, issue codes |
| `docs/report-renderer.md` | enrichment step, local-loop preprocessor, prose digest in the render key |
| `docs/typst-notes.md` | strings as data; same-font `raw`; AST rendering idioms |
| `docs/report-bundle.md` | hopping strategy is one raw-markdown row |
| `docs/style-rulebook.md` | only if a new warning style is needed; no prose preview styles |

## 12. Delivery sequence

1. **Backend seam.** `prose.py`, `lib/prose.typ`, AST tests, degenerate-input
   tests.
2. **Hopping strategy.** Raw producer row, enrichment, local-loop preprocessor,
   report tests, docs for the bundle shape.
3. **Process notes.** Multiline editor, PDF rendering, tests.
4. **Checklist and session notes.** Recipe checklist note, live step note, live
   skip reason, session tests.
5. **Frontend validator.** `markdown-it`, cached issues, installer, issue lines,
   conformance fixtures, bundle-size check.
6. **Gate.** `make check`, `make test`, `make verify`.

Each step is independently reviewable. Steps 1–2 prove the AST and Typst seam
before the collection and session shapes are touched.

## 13. Risks

| Risk | Mitigation |
|---|---|
| JS and Python parsers disagree on an edge case | Advisory wording; backend is authoritative; shared `prose-constructs.json` fixtures |
| `markdown-it` grows the frontend bundle | Measure `make build`; dynamic import is a later, contract-preserving change |
| A parser upgrade changes a frozen render | Render key includes parser version and prose hash; report-renderer decision #15 permits it |
| Warning noise under every note | Show only when issues exist; keep messages short and specific |
| Same-font code loses alignment | Inline code is a shaded span; fenced blocks preserve newlines but not monospace alignment. Add IBM Plex Mono later only if alignment proves necessary |
| Downloaded bundle and service diverge | Both use the same `enrich_bundle`; the local-loop CLI is the only path |
| Pathological input stalls a render | Source, node, and depth caps with plain-text fallback |

## 14. Open items

- Tune the three caps after the shared fixture corpus lands.
- Finalize the advisory copy after the first visual pass.
- Decide whether session overall notes and observation notes join the second
  phase.
- Revisit freeze-time AST only if byte-identical frozen renders across parser
  upgrades become a product requirement.
