# Markdown prose

Free-text brewing fields accept markdown. The stored value is always the raw
source; markdown becomes layout only at report time. Four recipe surfaces and
one session surface are in scope: the hopping strategy, the discussion, the
fermentation strategy, process notes, and brew-day checklist notes.

<!-- claims: proposed prose.unsupported.image prose.unsupported.html prose.unsafe.link prose.math.unclosed prose.too_long prose.too_deep prose.too_many_nodes prose.too_many_table_columns prose.too_many_table_rows prose.malformed.table prose.check_failed -->

## Supported subset

| Construct | Syntax | PDF result |
|---|---|---|
| Paragraph | blank line between blocks | Typst paragraph |
| Emphasis | `*text*` | italic |
| Strong | `**text**` | bold |
| Strikethrough | `~~text~~` | strike |
| Inline code | `` `code` `` | shaded, same font |
| Fenced code | triple backticks | shaded block, same font |
| Link | `[label](https://…)` | clickable http/https link |
| Ordered list | `1. item` | numbering, start preserved |
| Unordered list | `- item` | bullet list |
| Blockquote | `> text` | quote block |
| Horizontal rule | `---` | rule |
| Hard break | two trailing spaces or backslash | line break |
| Heading | `#`, `##`, `###` | bold paragraph at heading scale |
| Table | GFM pipe table with a `\|---\|---\|` delimiter row | Typst table with column alignment and a full cell grid |
| Math | `$...$` with the LaTeX subset below | inline Typst equation |

A table needs its own lines and a blank line before the block:

```markdown
| Header 1 | Header 2 |
| -------- | -------- |
| One thing | Another thing |
```

Table cells accept inline markdown only: emphasis, strong, code, and links. A
cell cannot contain paragraphs, lists, or another table.

## Math

A `$...$` span renders inline when it is LaTeX the renderer knows. The subset is
chemistry-leaning:

| LaTeX | Result |
|---|---|
| `\text{...}`, `\mathrm{...}` | upright text |
| bare letters and digits | one upright run (`$NaCl$` is a salt, not four variables) |
| `_` and `^` | subscript and superscript, with or without braces |
| `{...}` | grouping, so `{a+b}_2` binds as one base |
| `+ - = / < >` | spaced operators |
| `\pm \times \cdot \to \le \ge \ne \approx` | the operator species |
| `\alpha` … `\omega`, `\Gamma` … `\Omega` | Greek |
| `\degree`, `\circ` | the degree sign |
| `\ `, `\,`, `\quad` | a space |

Anything else in the span — `\frac`, `\sqrt`, `\ce`, matrices — makes the whole
span print as its literal source. A `$` is only math when the span is on one
line, has no space after the opening `$` or before the closing `$`, and is not
part of `$$`. That is what keeps `costs $5 and $10` as text.

There is no display math: `$$...$$` prints literally. A note is not the place
for a centred block equation, and prose also renders inside table cells.

Math is set in Typst's New Computer Modern Math, which is embedded in the
compiler; the body face stays IBM Plex Sans. The contrast is deliberate — Plex
has no maths face, and `--ignore-system-fonts` makes a missing glyph a visible
box rather than a silent substitution.

Prose tables use a full cell grid in the report's rule colour. That styling
lives in `lib/prose.typ`; the report's data tables stay borderless through the
theme's `stroke: none`.

Headings intentionally do not become Typst `heading` elements. A note must not
alter the report outline, force a page break, or compete with a section title.

## Degradation

Markdown is permissive; a render must never fail because of prose. Unsupported
constructs print as text:

| Construct | Result |
|---|---|
| Image | alt text |
| Raw HTML | the literal text |
| Malformed table | ordinary paragraphs, with an editor warning |
| Unsafe link (`javascript:`, `data:`, `mailto:`, relative) | the label, without an anchor |
| Unsupported or over-budget math | the literal `$...$` source |
| Unknown node | its text children, or nothing |

## Backend conversion

`backend/app/services/prose.py` parses with `markdown-it-py` in CommonMark mode,
with HTML disabled, strikethrough and GFM tables enabled. It normalizes the
syntax tree into a small AST and injects it into the report or session payload:

- `report.hop_strategy` is one raw-markdown row; its `text` cell gains `blocks`.
- `report.discussion` and `report.fermentation_strategy` are one raw-markdown
  row each; their `text` cells gain `blocks`.
- Each `batch.process_notes.text` cell gains `blocks`.
- Each `batch.brew_checklist.note` cell gains `blocks`.
- Live session step notes, skip reasons, and overall notes gain adjacent prose
  blocks.

A math span becomes one `math` node. `backend/app/services/latex_math.py` parses
the span into its children; the LaTeX stays the stored fact and is never
rewritten.

`backend/app/templates/lib/prose.typ` renders the AST with Typst content
constructors. Strings stay strings: no generated Typst source and no `eval`.
Math children are assembled with the `math` module's content constructors, so a
span is data all the way to the equation.
`prose-cell` and `prose-value` fall back to the existing text when `blocks` is
absent, so older bundles and unenriched local bundles still compile.

## Limits

| Limit | Value |
|---|---|
| Source length | 20,000 Unicode code points per field |
| AST nodes | 2,000 |
| Nesting depth | 32 |
| Table columns | 6 |
| Table rows | 50 |
| Math span | 500 code points, 200 nodes, 8 nesting levels |

A table over the column or row cap falls back with the rest of the note to one
plain-text paragraph. That preserves the authored text instead of silently
dropping columns or rows.

A source that exceeds a limit falls back to one plain-text paragraph and logs a
warning. The fallback is deliberate: a long note must not make a report
unrenderable. A single math span over its cap is narrower: only that span prints
as its literal source.

## Determinism

The report key includes the `markdown-it-py` version and a hash of every prose
module, `prose.py` and `latex_math.py` included. A parser or renderer upgrade
therefore revalidates a frozen `ETag`, the same way a template edit does. The
report footer still names the bundle and toolchain. If byte-identical frozen
renders across parser upgrades become a requirement, the follow-on is to persist
the parsed AST in the bundle.

## Frontend validation

The editor keeps `markdown-it` as an advisory validator, not a renderer. It
parses a detection-only token stream and reports constructs that will degrade or
exceed a limit:

| Code | Meaning |
|---|---|
| `prose.unsupported.image` | image will print as alt text |
| `prose.unsupported.html` | HTML will print as text |
| `prose.unsafe.link` | link will lose its anchor |
| `prose.math.unclosed` | a `$` with no partner prints literally |
| `prose.too_long` | source exceeds the code-point cap |
| `prose.too_deep` | nesting exceeds the depth cap |
| `prose.too_many_nodes` | token count exceeds the node cap |
| `prose.too_many_table_columns` | table exceeds the column cap |
| `prose.too_many_table_rows` | table exceeds the row cap |
| `prose.malformed.table` | pipe text looks like a table but did not parse |
| `prose.check_failed` | the local check threw |

The validator never returns HTML and never calls the markdown renderer. It
returns a frozen issue list, cached by source text with a bounded LRU. Templates
show the messages under the field and never block saving or freezing. The
backend remains authoritative: a missed frontend warning cannot create a broken
report.

Math parity stops at the delimiters. The validator mirrors the renderer's `$`
rule, so a supported span and a currency amount are both quiet, and only a `$`
that cannot pair is reported. Command-level parity would mean a second copy of
the LaTeX table in JavaScript, so an unsupported command degrades without a
warning, the way an image does.

## Tests

`tests/backend/test_prose.py` covers normalization, degradation, caps, and the
enrichers. `tests/backend/test_latex_math.py` covers the math subset.
`tests/frontend/prose-validation.test.js` covers the issue codes and
memoization. `tests/conformance/fixtures/prose-constructs.json` is the shared
corpus both sides read.
