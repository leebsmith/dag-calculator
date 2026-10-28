---
title: Report Renderer — Typst-composed, bundle-driven
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [report-bundle]
blocks: []
gate: a downloaded bundle renders to a printable PDF and per-page PNGs from the scaffold alone; a section added later renders and is drift-guarded; make check/test green
status: active (five sections and the render service landed; sections continue)
---

# Report Renderer — Typst-composed, bundle-driven

Status: active. Supersedes the markdown/PDF path in `plans/recipe-pipeline.md`
and the YAML grammar in `plans/recipe-yaml-grammar.md`. The bundle contract in
`plans/report-bundle.md` is unchanged; this plan consumes it.

## 1. Goal

A bundle renders to a printable PDF and a per-page PNG preview from the bundle
alone, with no second source of truth and no Python presentation model. Typst
owns composition, layout, and typography; Python owns the guard, the process
boundary, and the HTTP surface.

The renderer is a **pure function** of its inputs: same bundle + same spec +
same Typst version + same fonts ⇒ same output. That property is what makes a
rendered report meaningful as a view of a frozen fact.

A report is **never a stored artifact**. It is generated before freeze as a
preview and after freeze from the immutable bundle. Freezing stores the bundle
(the fact); the report is derived, regenerable, and allowed to differ later if a
template improves.

## 2. Locked decisions

| # | Decision |
|---|---|
| 1 | **Typst composes.** No Python projector, no `RecipeDocument`, no `recipe.yaml`. Typst reads the bundle and emits the document. |
| 2 | **Two inputs.** An immutable `report_bundle` (a fact about the batch) and a per-request `report_spec` (a view). Section selection never enters the bundle. |
| 3 | **Inclusion is `requested ∧ present`.** The spec asks; the bundle answers. The full report requests everything and lets absence prune. |
| 4 | **Presence keys off output existence, not value.** A solver-derived section hides when its boundary produced no output; it must never render plausible zeros. |
| 5 | **Canonical order.** Included sections render in registry order. The spec selects a subset; it cannot reorder. |
| 6 | **`doc_kind` is reserved.** v1 ships `recipe` only. Inventory and shopping are different facts and out of scope. |
| 7 | **Spec travels in the URL.** No stored presets. |
| 8 | **Standalone sheets.** A single-section request suppresses document title and outline. |
| 9 | **PDF + PNG.** Print is PDF; preview is one PNG per page, both from one source file. |
| 10 | **No persistence.** Nothing rendered is stored — not bytes, not a render key. The render key is an `ETag`; ancestry is printed in the document footer. |
| 11 | **Pinned environment.** Typst binary version pinned in-repo (`backend/app/templates/TYPST_VERSION`), creation timestamp pinned to `frozen_at`, `--root` confined to a temp dir. Fonts use the binary's embedded set until a face is actually needed. |
| 12 | **Typst ships in the image.** A Dockerfile replaces Cloud Run buildpacks. |
| 13 | **Drafts render.** A preview is a first-class request, not a developer privilege: a draft renders at any time before freeze, from a bundle the client already holds. |
| 14 | **One input type.** The renderer takes a bundle. `GET` resolves the stored bundle for a frozen batch; `POST` accepts a bundle in the body for a draft. The renderer never asks whether the bundle is a fact. |
| 16 | **The bundle carries the display strings.** `formatted[path]` is the only display source (`text`, `number`, `unit`); the generator never converts or rounds. `catalog` keeps labels, dimensions, options, and unit ids for structure and the paper rule. |
| 15 | **Divergence is expected.** A report generated earlier and a report generated later from the same frozen bundle may differ when the template or toolchain changes. The footer names the bundle and toolchain so the divergence is attributable, not tracked. |

## 3. Why this supersedes the projector

The earlier design (projector → `RecipeDocument` → markdown → PDF) put content
composition in Python and duplicated the artifact's presentation metadata into a
second model. Under the bundle contract that duplication is unnecessary, and
formatting belongs to the freeze side: `catalog.nodes` carries the per-path
label/metadata and `formatted` carries the strings a generator prints.

Two consequences, both accepted:

- **Formatting is implemented once.** The browser freeze payload runs the same
  formatter as the UI (including nonlinear units and the user's unit mode) and
  stores `formatted`; the generator is a string compositor with no conversion or
  rounding code.
- **Content edits are `.typ` edits.** Section shape, order, prose, and styling
  change without touching Python or redeploying a projector.

A walker over structured JSON was also considered and rejected: interpolating
document strings into Typst markup requires escaping `#`, `*`, `_`, `[`, `]`,
`$`, `@`, and backticks, so arbitrary prose (recipe notes, a value like
`2 * 3`) would eventually break a render. Under the chosen design all strings
reach Typst as data, not syntax.

## 4. Architecture

```
   frozen batch ──▶ report_bundle (immutable fact, content_hash)
                          │
   request spec ────┐     ├──▶ report_render.py ──▶ temp root ──▶ typst compile
   (query params)   │     │                                        ├─ report.pdf
                     └─────┘                                        └─ report-{p}.png
                                                                    └─ typst query (meta)
```

Transports:

| Batch | Route | Shape |
|---|---|---|
| Frozen | `GET /batches/{id}/report?format=pdf\|png&page=n` | PDF, or one PNG per request; `ETag` is the render key |
| Draft | `POST /batches/{id}/report` (bundle in body) | all pages in one response; no `ETag` reproducibility claim |

Per-page delivery is only sound where a page request is cheap and idempotent,
i.e. against a stored bundle. A draft page request would re-upload ~80–100 KB
and recompile, and an in-process cache is not viable on Cloud Run's multiple
instances. Hence: frozen pages individually, draft pages batched.

Render key:

```
sha256( bundle.content_hash
      ‖ report_spec (canonical)
      ‖ doc_kind
      ‖ walker_hash ‖ theme_hash ‖ section_hashes
      ‖ typst_version ‖ fontset_hash )
```

`fontset_hash` covers the vendored `backend/app/templates/fonts/*` set;
`theme_hash` covers `theme.typ`, including the paper choice wired through it.

The key is the `ETag` for frozen batches and the footer's ancestry token. No
bytes are stored. A change to the bundle, the spec, the template, or the
toolchain produces a different key by construction.

## 5. Inputs

### 5.1 Bundle

Unchanged from `plans/report-bundle.md`. Two amendments fall out of rendering:

- `catalog.nodes` keys must resolve for boundary output paths (e.g.
  `solver.water.mash_additions.gypsum_kg`). The schema's `_resolves` already
  supports this; R3 populates those entries.
- `content_hash` must be **recomputed and checked**, not merely accepted as a
  string. Landed: `ReportBundle.seal` stamps it and the validator rejects a
  mismatch.

**Amended — `catalog.nodes[path].symbol`.** `unit` is a conversion handle, so a
registry that pins a bare symbol (`"%"` for ABV) had nowhere to live and a
generator could only print the id (`5.6 pct`). Symbols are presentation metadata
about a value, exactly what the catalog block exists for, so the field is added
there, required wherever `unit` is set, and `bundle_format` bumps to `2` with the
fixture regenerated in the same commit. Bundles written under format 1 are
refused rather than read optimistically.

**Amended — `formatted` (format 3).** The generator must be numerically dumb:
no unit conversion, rounding, or symbol choice in Typst. The browser freeze
payload now computes `formatted[path] = { text, number, unit }` with the same
formatter the UI uses at the unit preference in force, and `bundle_format` bumps
to `3`. Format 4 adds `formatted_tables` — per-row cells for collection tables
(major/trace grist, sugars), with derived amounts, PPG, and bill shares computed
by the producer. Format 5 adds `formatted_summaries`: the mass-weighted colour
and extract yield per table plus an `overall` aggregate, weighed producer-side.
Format 6 splits the percentage columns into `own_pct` (within a table) and
`grist_pct` (share of major + trace), so sugar is measured against the grist
rather than inside the fermentable total. Format 7 adds `extract` and
`extract_pct` to the malt and sugar rows for the extract-contribution table. Bundles written under an older format are refused rather than rendered
without display strings.

### 5.2 Report spec

Query parameters on the render route:

| Param | Values | Default |
|---|---|---|
| `doc_kind` | `recipe` (reserved for future kinds) | `recipe` |
| `sections` | comma-separated section ids | all |
| `paper` | `a4`, `letter`, `auto` | `auto` (resolved from display units) |
| `standalone` | derived: true when exactly one section survives | — |

`standalone` is not a parameter: it is inferred from the resolved selection, so
a request cannot ask for chrome that contradicts its own content.

Two distinct predicates, deliberately:

- **requested** — the id is in `sections` (or `sections` is absent ⇒ all).
- **present** — the section's data exists in the bundle (§6.3).

`include = requested ∧ present`. An empty result is a render-time error, not a
blank page (§7.2), and on a draft it is an ordinary occurrence that the UI must
surface as "nothing solved yet" rather than a failure.

## 6. Typst tree

### 6.1 Files

| Path | Role | Changes when |
|---|---|---|
| `backend/app/templates/report.typ` | entry point, document chrome, static section registry | a section is added or removed |
| `backend/app/templates/theme.typ` | `#set` / `#show`: page, fonts, rules, spacing, title/outline | styling changes |
| `backend/app/templates/lib/bundle.typ` | loads `report.json` from `sys.inputs`, exports `bundle`/`state`/`catalog` | the input contract changes |
| `backend/app/templates/lib/format.typ` | defensive accessors, unit conversion, display strings | the formatting rule changes |
| `backend/app/templates/sections/*.typ` | one file per section: `present` predicate + `render` | content changes |
| `backend/app/templates/TYPST_VERSION` | pinned binary version | never, except a deliberate bump |
| `backend/app/templates/fonts/*` | vendored IBM Plex Sans (variable Roman + Italic) + OFL | a deliberate typeface change |

The split exists for hash hygiene and review: a styling change must not
invalidate a content identity, and a section must be reviewable in isolation.
`theme.typ` is where `#set page(...)`, `#set text(font: ...)`, and
`#show heading: ...` live, so the renderer emits semantic structure and the
theme decides appearance — the same separation `docs/style-rulebook.md`
enforces for CSS tokens.

### 6.2 Input contract

`lib/bundle.typ` loads the bundle once:

```
#let bundle = json(sys.inputs.at("bundle", default: "report.json"))
```

The input is a **path**, not content, so the service and the local loop use the
same mechanism:

- service: temp root, `--root <temp> --input bundle=report.json`
- local: `--root .` `--input bundle=.local/report/report.json`

`sys.inputs` for the path is what keeps the local loop Python-free; the
alternative (staging a copy of the template tree per run) reintroduces a build
step into the edit cycle.

### 6.3 Registry without reflection

Typst cannot look up an import by string at compile time. The registry is a
static literal in `report.typ` mapping section id → `{ title, present, render }`,
built from explicit imports. Adding a section is one import plus one entry; this
is the only place Typst's lack of dynamism costs anything, and it is ~15 lines
of boilerplate.

Canonical order is registry order. `sections=` filters it; it never reorders it.
The registry is delimited by marker comments and each entry is one line in a
fixed shape, because `scripts/report-sections.mjs` parses it to generate
`docs/report-sections.md` and to guard the section contract (§10). An
unparsable entry is a hard error, never a silently skipped one.

### 6.4 Presence predicates

Grounded in the current artifact:

| Section | Predicate |
|---|---|
| Whirlpool hops | `state.collections["batch.whirlpool_hops"]` has rows |
| Boil hops | `batch.boil_hops` has rows |
| Dry hops | `batch.dry_hops` has rows |
| Sugars | `batch.sugars` has rows |
| Major / trace malts | `grist.major_malts` / `grist.trace_malts` have rows |
| Mash rests | `mash.rests` has rows |
| Pinned ions | `water.pinned_ions` has rows |
| Brew-day checklist | `batch.brew_day_steps` has rows |
| Salt dosing | `solver.water` output present **and** `total_added_salt_mass_g > 0` |
| Water chemistry | `solver.water` output present |
| Style conformance | `conformance` is not `null` |

Rule, stated once and applied everywhere: **absence hides a section.** The salt
case is the dangerous one — `mash_additions.*` and `sparge_additions.*` live
inside the water boundary's output map, so a draft with no solver run has no map
at all. A predicate written as `value == 0` would render eight confident `0 g`
rows. Predicates test output existence first, magnitude second.

Presentational inputs (`water.salt_distribution`, `water.acid_medium`,
`water.gypsum_form`, `water.cacl2_form`) are choices that *describe* the salt
table; they are read for display, never used as presence.

**Landed:** Brewhouse, Batch Facts (identity, modeled metrics, and the four
fermentable tables), Yeast, Volume Ledger, Liquor Ledger — `docs/report-sections.md`
is the generated list. Sugars and the major/trace grists are tables inside Batch
Facts, not standalone sections; the predicates above remain the record for the rest.

**Remaining, in queue order:** hop sections (after the schedule-derived IBU split),
mash rests, the water trio (pinned ions → salt dosing → chemistry), style
conformance. The brew-day checklist is last, pending the carry-forward design; the
Boil section follows the hop sections.

This table is a **candidate inventory**, not a commitment: the section set,
titles, and prose are authoring decisions made one section at a time (§11).

### 6.5 Formatting

Formatting is a **freeze-time** concern. The browser computes `formatted[path]`
with the same formatter the UI uses (unit preference per field/dimension,
linear/affine/nonlinear conversion, decimals, symbol) and freezes it. The report
reads `formatted-text`, `formatted-number`, and `formatted-unit`; it does no
conversion or rounding.

- Nonlinear units (SG ↔ °P) are handled by the producer's engine functions, not
  by a Typst helper.
- `catalog.nodes[path].option_labels` still maps taxonomy values for labels.
- Collection tables read `formatted_tables[collection]`; the producer owns the
  derived columns (solved mass × bill share, PPG from yield, the within-table and
  grist shares). Grist is major + trace; sugar sits outside its 100.
- Weighted readouts read `formatted_summaries`; colour weighs every fermentable,
  the overall extract yield only the grain bill and sugars (trace is
  colour-only).
- The display strings are covered by `content_hash`, so a frozen report is a
  stable view of the freeze-time presentation; changing unit preferences later
  does not rewrite it.
- There is no Typst formatting vector: the frontend formatter is the single
  implementation, exercised by its own producer tests.

### 6.6 Defensive accessors

The bundle is untyped at the Typst boundary: `null` becomes `none` (a value),
objects lack absent keys, and a discriminated `kind` is a bare string. Therefore:

- One required accessor that panics with the **dotted path** on a missing key,
  so failures name `catalog.nodes["mash.rests.0.temp_c"]` rather than a line in
  a walker.
- One optional accessor returning `none`, used only where an omission is
  legitimately renderable.
- The document emits `#metadata(<report-meta>)` with the full batch id, content
  hash, render key and resolved section ids; the printed chrome truncates the id.
- No unguarded member access anywhere in `sections/`.

### 6.7 Metadata out

The document emits `#metadata(...)` under a label with the resolved section ids
and page count. After compiling, `typst query` extracts it as JSON. This is how
the API learns what actually rendered without duplicating predicate logic in
Python. The same mechanism backs the render probe (§10).

### 6.8 Ancestry footer

Every document prints, in the footer: `batch.id`, `frozen_at`, and the render
key (or, before the renderer exists, the `content_hash`) truncated to eight hex
characters. Eight characters identify the bundle *and* the template/toolchain
that printed it, so a printed sheet is traceable with no registry and no version
history. A reprint after a template edit shows a different token, which is the
"divergence noted, not tracked" property.

## 7. Backend

### 7.1 `app/services/report_render.py`

Responsibilities, in order:

1. Take a validated `ReportBundle` plus the spec. It does **not** judge whether
   the bundle is a fact; the route decides where it came from.
2. Validate the spec (`doc_kind`, unknown section ids → 422).
3. Create a temp root; copy the template tree in; write `report.json`.
4. Compile with fixed argv: `--root <temp>`, `--font-path <vendored>` (when
   fonts are vendored), `--creation-timestamp <frozen_at>` when present,
   `--format pdf`, or `--format png` with a `{p}` pattern.
5. Run `typst query` for the metadata label.
6. Return the artifacts plus the resolved section ids and page count.

No shell, no user-supplied paths, no user-supplied Typst. The template set is
in-repo and versioned; the bundle enters as data only. `--root` confinement is
what makes that a boundary rather than a convention. `--creation-timestamp` is
omitted for drafts — a preview makes no reproducibility claim.

`typst` is **not** a Python dependency: the module shells out to the binary on
PATH (`TYPST_BIN` override). `pyproject.toml` is unchanged. The binary's
`--version` is checked on first use against
`backend/app/templates/TYPST_VERSION`; a missing or mismatched binary answers
`503` rather than producing a differently-typeset document.

### 7.2 Routes

`GET /batches/{batch_id}/report?doc_kind=recipe&format=pdf|png&sections=…&paper=…&page=n`

- `404` — batch missing, or belongs to another user.
- `409` — batch is a draft (use `POST`), or a frozen batch predates bundles.
- `422` — unknown section id, unknown `doc_kind`/`paper`/`format`, a page beyond
  the document, or a selection that resolves to nothing.
- `503` — Typst missing or not the pinned version; `500` — a template failure.
- `200` — the artifact, plus `Content-Length` and `X-Report-Sections` /
  `X-Report-Pages`; a frozen render also carries `ETag`.

`POST /batches/{batch_id}/report` takes `{ bundle }` (the document
`POST /report-bundle` produces) and renders one artifact from it. It requires a
**draft** batch and a draft-shaped bundle, and `409`s a frozen batch (the stored
bundle is authoritative). A preview carries no `ETag`: its PDF embeds the compile
time, so the same tag would not mean the same bytes.

Unknown section ids are rejected by the template's registry — one source of truth
— and mapped from its `report spec:` panic to `422`. Both routes are read-only and
idempotent.

`GET /report/sections` serves the manifest generated from that same registry
(`backend/app/templates/sections.json`, freshness-guarded by the sections-sync
test). The app's **Build report…** picker builds a subset from it and passes
`sections` to either render route; a subset is named `<batch>-<n>-sections.pdf`.

Empty selection is a hard error rather than a blank document: a page that
silently renders nothing is indistinguishable from a rendering bug, and the
water-solver sections make it an ordinary occurrence on a draft-quality solve.
The UI treats `422` as "nothing to report yet", not as a failure.

### 7.3 No persistence

Rendering is ~100–500 ms with pinned fonts. Storing the output would collide
with Firestore's 1 MiB document limit (a dense A4 page at 144 ppi is 300–900 KB
as PNG), duplicate the bundle, and invent a version history the product does not
want. A Typst text PDF for a recipe is tens to a few hundred KB; even so, it is
derived, and the bundle is the fact.

The render key is exposed as `ETag`, so caching happens in the client and any
intermediary. Revisit only if measured latency justifies it.

### 7.4 Boundaries

`app.services` already depends on `app.artifact`, `app.core`, `app.repositories`,
`app.schemas` — no `tach.toml` edge is added. The canonicalizer used for
`content_hash` is currently private (`_canonicalize` in
`app/schemas/boundary.py`) and is promoted to a public helper rather than
imported by name.

## 8. Bundle work (precursor)

Rendering has no input until these landed; they have. `plans/report-bundle.md`
stages them.

| Stage | Work | Gate |
|---|---|---|
| R2 ✅ | Freeze-time capture: per-boundary `{binding, fingerprint, telemetry, warnings, notes}` and the four validation states. Bundle-only — `BatchRecord` stays lean. | frontend tests |
| R3 ✅ | Catalog resolution in the browser: dimensions from the artifact, presentation from the existing registries, **including boundary output paths**. | unit tests |
| R4 ✅ | Server-side assembly inside the existing `_freeze` transaction, keyed to the newly created frozen id. Browser ships only the presentation catalog + state; the server supplies the vendored artifact content and hashes, and enforces `content_hash`. | end-to-end freeze test |
| R5 ✅ | Committed fixture + freshness test. | `make verify` |
| R6 ✅ | `docs/report-bundle.md` + generated glossary + `scripts/describe-report-bundle.mjs`. | `make verify` |

## 9. Image and deploy

`make deploy-backend` currently runs `gcloud run deploy --source backend/`,
which uses buildpacks. The renderer requires:

- a pinned `typst` binary (static musl, ~40–60 MB) — a multi-stage Dockerfile,
  minimal runtime base;
- the vendored artifact copy that `deploy-backend` already stages;
- the template tree;
- `TYPST_BIN` wired to the binary.

Introducing `backend/Dockerfile` switches Cloud Run off buildpacks. That switch
is part of this plan's scope, not a follow-up.

## 10. Tests and gates

- **Scaffold renders alone.** The committed fixture compiles with an empty
  section registry: chrome, identity header, and footer — no sections. This is
  what makes commit 0 reviewable and the dev loop useful on day one.
- **Section isolation.** Each section compiles alone, plus the full set: N+1
  compiles per fixture. Deliberately not the 2^N combination space.
- **Presence matrix.** One fixture per boundary case: solver absent, solver
  present with zero additions, empty collections, populated collections. Every
  registered section appears with both a present and an absent case; the check
  is vacuous while the registry is empty and non-vacuous the moment it is not.
- **Producer formatting.** The frontend formatter is the single implementation;
  its tests cover units, nonlinear gravity, and per-field/dimension overrides.
  There is no Typst formatting vector.
- **Registry contract.** `scripts/report-sections.mjs` parses the registry
  literal and `sections/`; the guard asserts one entry per file and one file per
  entry, filename equal to id, no duplicate ids, and a declared presence
  predicate. `docs/report-sections.md` is generated from the same parse and
  freshness-guarded, so canonical order is visible in every diff instead of
  being an accident of authoring order.
- **Unit symbols.** The bundle validator rejects any node with a `unit` but no
  `symbol`, so a generator cannot fall back to printing the unit id.
- **Guard.** The committed bundle fixture validates against `ReportBundle`,
  including recomputed `content_hash`, on every `make test`.
- **Error paths.** Unknown section id, empty selection, draft `GET`, frozen
  `POST`, foreign batch.
- **Determinism.** Two compiles of the same input produce identical PDF bytes —
  the test that catches an unpinned timestamp or font.
- **Render tests skip loudly when `typst` is absent** (local); CI and the image
  have it. This is an accepted weakening of `make verify`, recorded here rather
  than discovered later.

## 11. Sequencing

| # | Work | Gate |
|---|---|---|
| 0 ✅ | Scaffold: `TYPST_VERSION`, `lib/bundle.typ`, `lib/format.typ`, `theme.typ`, `report.typ` with an empty registry and spec filtering, ancestry footer, `make report-dev`/`report-pages`, docs, the registry generator + guards, and `catalog.nodes.symbol` (`bundle_format` 2). | `make verify`; fixture compiles chrome-only |
| 0b ✅ | Formatting moves into the bundle: `formatted[path]` with `{ text, number, unit }`, produced by the browser formatter with the user's unit mode; Typst becomes a string compositor (`bundle_format` 3). | producer tests, render/section tests |
| 1 ✅ | First sections: **batch-facts** (identity names + realized OG/FG/AA/ABV/IBU/colour) and **volume-ledger** (accounting table from strike to fermenter), with fixture enrichment. | standalone + full compiles, presence matrix |
| 2 | `report_render.py` — bundle in, artifacts out, spec validation, `typst query` | error-path tests |
| 3 | `GET` route (frozen) + `ETag` | route tests, `make check` |
| 4 | `POST` route (draft bundle) + browser preview | route tests |
| 5 | Dockerfile + deploy switch | image build, deployed smoke render |
| 6 | Retirement: `TODO.md` cleanup as part of the renderer slice | `make verify` |

Sections repeat step 1 indefinitely; each is one commit. Steps 1–2 are
independent of 3–5, so section authoring and the service can proceed in
parallel.

**Scaffold first, and deliberately section-agnostic.** The first section is not
chosen yet, and nothing in step 0 depends on it. The scaffold's renderable
output is the document chrome, which is what every section inherits; iterating
on it against a real downloaded bundle is also the cheapest way to decide what
the first section should be.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Compile error from a mistyped node id | Defensive accessor panic with the dotted path; fixture covers every path |
| Typst version drift changes layout | Version pinned in `TYPST_VERSION`, checked by `make report-dev` and at service startup, embedded in the render key |
| Font set drift changes metrics | IBM Plex Sans vendored under `templates/fonts/`, compiled with `--font-path` + `--ignore-system-fonts`; a missing face fails the render tests |
| Formatting forks from the frontend | One formatter at freeze; sections print `formatted` strings |
| A section silently renders nothing | Empty-selection is a 422; presence predicates are tested per fixture |
| Registry order becomes accidental | Generated `docs/report-sections.md` makes every order change a reviewed diff |
| Local `make verify` no longer hermetic | Accepted; render tests skip loudly without `typst` |
| Long unbroken tokens overflow a cell | Typst does not raise; pathological fixture + visual check |

## 13. Non-goals

- Inventory, shopping lists, or any report whose fact is not a batch bundle.
- Stored render artifacts, a render cache, or a report version history.
- User-authored templates, or template hot-swap.
- Markdown output of any kind.
- Recomputing domain values at render time.
- Defining the report's section set up front (authoring decision, made per
  section).

## 14. Open items

1. **Section inventory and prose.** §6.4 is a candidate list inferred from the
   artifact's collections and boundaries. The actual set, titles, and prose are
   authoring decisions made one section at a time.
2. **`standalone` chrome.** §6.1 puts title/outline suppression in the theme;
   the exact one-sheet layout (header block, footer, page numbers) is unsketched
   and only becomes a requirement when a single-section sheet is requested.
3. **Nonlinear readouts.** SG ↔ °P needs a named function in `lib/format.typ`;
   deferred until a section formats a gravity in Plato.
