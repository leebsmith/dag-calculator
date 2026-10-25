---
title: Report Renderer — Typst-composed, bundle-driven
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [report-bundle]
blocks: []
gate: a frozen batch renders PDF and per-page PNG preview from the bundle alone; sections prune on absence; make check/test green
status: proposed
---

# Report Renderer — Typst-composed, bundle-driven

Status: proposed. Supersedes the markdown/PDF path in `plans/recipe-pipeline.md`
and the YAML grammar in `plans/recipe-yaml-grammar.md`. The bundle contract in
`plans/report-bundle.md` is unchanged; this plan consumes it.

## 1. Goal

A frozen batch renders to a printable PDF and a per-page PNG preview from the
bundle alone, with no second source of truth and no Python presentation model.
Typst owns composition, layout, and typography; Python owns the guard, the
process boundary, and the HTTP surface.

The renderer is a **pure function** of its inputs. Same bundle + same spec +
same Typst version + same fonts ⇒ byte-identical output. That property is what
makes an immutable frozen report meaningful.

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
| 9 | **PDF + PNG.** Print is PDF; preview is one PNG per page at 144 ppi, both from one source file. |
| 10 | **No persistence.** Rendered output is never stored. `ETag` is the render key. |
| 11 | **Pinned environment.** Typst binary on PATH, fonts vendored in-repo, creation timestamp pinned to `frozen_at`, `--root` confined to a temp dir. |
| 12 | **Typst ships in the image.** A Dockerfile replaces Cloud Run buildpacks. |

## 3. Why this supersedes the projector

The earlier design (projector → `RecipeDocument` → markdown → PDF) put content
composition in Python and duplicated the artifact's presentation metadata into a
second model. Under the bundle contract that duplication is unnecessary:
`catalog.nodes` already carries the per-path `label`, `unit`, `decimals`,
`step`, `options`, and `option_labels` a generator needs to format and label
without the frontend.

Two consequences, both accepted:

- **Unit/decimals formatting is implemented twice** — once in the frontend
  (`docs/display-precision.md`) and once in a ~30-line Typst helper driven by
  the bundle's own metadata. §6.4 pins the two together with a parity fixture.
- **Content edits are `.typ` edits.** Section shape, order, prose, and styling
  change without touching Python or redeploying a projector.

A walker over structured JSON was also considered and rejected: interpolating
document strings into Typst markup requires escaping `#`, `*`, `_`, `[`, `]`,
`$`, `@`, and backticks, so arbitrary prose (recipe notes, a value like `2 * 3`)
would eventually break a render. Under the chosen design all strings reach
Typst as data, not syntax.

## 4. Architecture

```
   frozen batch ──▶ report_bundle (immutable fact, content_hash)
                          │
   request spec ────┐     ├──▶ report_render.py ──▶ temp root ──▶ typst compile
   (query params)   │     │                                        ├─ report.pdf
                    └─────┘                                        └─ report-{p}.png
                                                                   └─ typst query (meta)
```

Render key:

```
sha256( bundle.content_hash
      ‖ report_spec (canonical)
      ‖ doc_kind
      ‖ walker_hash ‖ theme_hash ‖ section_hashes
      ‖ typst_version ‖ fontset_hash )
```

The key is the `ETag`; no bytes are stored. A client or any intermediary caches
by it, and a change to the bundle, the spec, the template, or the toolchain
produces a different key by construction.

## 5. Inputs

### 5.1 Bundle

Unchanged from `plans/report-bundle.md`. Two amendments fall out of rendering:

- `catalog.nodes` keys must resolve for boundary output paths (e.g.
  `solver.water.mash_additions.gypsum_kg`). The schema's `_resolves` already
  supports this; R3 must actually populate those entries, not just node paths.
- `content_hash` must be **recomputed and checked**, not merely accepted as a
  string. Landed: `ReportBundle.seal` stamps it and the validator rejects a
  mismatch.

### 5.2 Report spec

Query parameters on the render route:

| Param | Values | Default |
|---|---|---|
| `doc_kind` | `recipe` (reserved for future kinds) | `recipe` |
| `sections` | comma-separated section ids | all |
| `standalone` | derived: true when exactly one section survives | — |

`standalone` is not a parameter: it is inferred from the resolved selection, so
a request cannot ask for chrome that contradicts its own content.

Two distinct predicates, deliberately:

- **requested** — the id is in `sections` (or `sections` is absent ⇒ all).
- **present** — the section's data exists in the bundle (§6.3).

`include = requested ∧ present`. An empty result is a render-time error, not a
blank page (§7.2).

## 6. Typst layout

### 6.1 Files

| Path | Role | Changes when |
|---|---|---|
| `backend/app/templates/report.typ` | entry point + static section registry | a section is added or removed |
| `backend/app/templates/theme.typ` | `#set` / `#show`: page, fonts, rules, spacing, title/outline | styling changes |
| `backend/app/templates/sections/*.typ` | one file per section: `present` predicate + `render` | content changes |
| `backend/app/templates/fonts/*` | vendored font set | never (pinned) |

The split exists for hash hygiene and review: a styling change must not
invalidate a content identity, and a section must be reviewable in isolation.
`theme.typ` is where `#set page(...)`, `#set text(font: ...)`, and
`#show heading: ...` live, so the walker emits semantic structure and the theme
decides appearance — the same separation `docs/style-rulebook.md` enforces for
CSS tokens.

### 6.2 Registry without reflection

Typst cannot look up an import by string at compile time. The registry is a
static literal in `report.typ` mapping section id → `{ title, present, render }`,
built from explicit imports. Adding a section is one import plus one entry; this
is the only place Typst's lack of dynamism costs anything, and it is ~15 lines
of boilerplate.

Canonical order is registry order. `sections=` filters it; it never reorders it.

### 6.3 Presence predicates

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

### 6.4 Formatting

All leaf values are base-unit numbers plus presentation metadata (bundle
decision 2: no pre-formatted strings). One helper converts by the dimension's
unit entry and rounds to `catalog.nodes[path].decimals`, appending the unit
symbol; option-bearing values map through `option_labels`.

The rule itself is trivial; the risk is drift from the frontend. Mitigation: a
committed fixture whose Typst output is diffed against a known
frontend-formatted vector (CSV of path → display string). If either side
changes the rule without the other, the gate fails.

### 6.5 Defensive accessors

The bundle is untyped at the Typst boundary: `null` becomes `none` (a value),
objects lack absent keys, and a discriminated `kind` is a bare string. Therefore:

- One required accessor that panics with the **dotted path** on a missing key,
  so failures name `catalog.nodes["mash.rests.0.temp_c"]` rather than a line in
  a walker.
- One optional accessor returning `none`, used only where an omission is
  legitimately renderable.
- No unguarded member access anywhere in `sections/`.

### 6.6 Metadata out

The document emits `#metadata(...)` under a label with the resolved section ids
and page count. After compiling, `typst query` extracts it as JSON (see §7.2).
This is how the API learns what actually rendered without duplicating predicate
logic in Python.

## 7. Backend

### 7.1 `app/services/report_render.py`

Responsibilities, in order:

1. Resolve the frozen batch; refuse drafts (draft bundles exist only as
   unpersisted previews for authoring — `batch.status: "draft"`).
2. Validate the spec (`doc_kind`, unknown section ids → 422).
3. Create a temp root; write `report.json` (the bundle) and the templates into it.
4. Compile with fixed argv: `--root <temp>`, `--font-path <vendored>`,
   `--creation-timestamp <batch.frozen_at>`, `--format pdf`, then `--format png`
   with a `{p}` pattern at 144 ppi.
5. Run `typst query` for the metadata label.
6. Return the artifacts plus the resolved section ids and page count.

No shell, no user-supplied paths, no user-supplied Typst. The template set is
in-repo and versioned; the bundle enters as data only. `--root` confinement is
what makes that a boundary rather than a convention.

`typst` is **not** a Python dependency: the module shells out to the binary on
PATH (`TYPST_BIN` override). `pyproject.toml` is unchanged.

### 7.2 Route

`GET /batches/{batch_id}/report?doc_kind=recipe&format=pdf|png&sections=…`

- `404` — batch missing, or belongs to another user.
- `409` — batch is a draft (no bundle exists).
- `422` — unknown section id, unknown `doc_kind`, or an empty resolved selection.
- `200` — PDF (`format=pdf`) or a page (PNG) plus `ETag`, `Content-Length`, and
  `X-Report-Sections` / `X-Report-Pages` headers carrying the resolved selection.

Auth reuses the existing dependency. The route is read-only and idempotent.

Empty selection is a hard error rather than a blank document: a page that
silently renders nothing is indistinguishable from a rendering bug, and the
water-solver sections make it an ordinary occurrence on a draft-quality solve.

### 7.3 No persistence

Rendering is ~100–500 ms with pinned fonts. Storing PDF + N PNGs would collide
with Firestore's 1 MiB document limit and the bundle already sitting beside the
batch. The render key is exposed as `ETag`, so caching happens where it belongs:
in the client and any intermediary. This is revisited only if measured latency
justifies it.

### 7.4 Boundaries

`app.services` already depends on `app.artifact`, `app.core`, `app.repositories`,
`app.schemas` — no `tach.toml` edge is added. The canonicalizer used for
`content_hash` is currently private (`_canonicalize` in
`app/schemas/boundary.py`) and is promoted to a public helper rather than
imported by name.

## 8. Bundle work (precursor, in order)

Rendering has no input until these land. `plans/report-bundle.md` stages them;
the amendments below are this plan's.

| Stage | Work | Gate |
|---|---|---|
| R2 ✅ | Freeze-time capture: per-boundary `{binding, fingerprint, telemetry, warnings, notes}` and the four validation states. Bundle-only — `BatchRecord` stays lean. | frontend tests |
| R3 ✅ | Catalog resolution in the browser: dimensions from the artifact, presentation from the existing registries, **including boundary output paths**. | unit tests |
| R4 ✅ | Server-side assembly inside the existing `_freeze` transaction, keyed to the newly created frozen id. Browser ships only the presentation catalog + state; the server supplies the vendored artifact content and hashes, and enforces `content_hash`. | end-to-end freeze test |

R4 deviates from `plans/report-bundle.md` §5.1 on two points, deliberately:

- **Server-side assembly.** `backend/app/artifact.py` already ships the artifact
  at runtime (`app/_vendor`), so the freeze request need not carry ~68 KB of
  artifact content. It also keeps `content_hash` next to the canonicalizer.
- **Write location.** `BatchRepo.freeze()` creates a *new* document
  (`collection.document()`, `parent_batch_id` set), so the bundle must be keyed
  by the new frozen id and written in the same transaction. The two writes are
  atomic or the freeze fails.

## 9. Image and deploy

`make deploy-backend` currently runs `gcloud run deploy --source backend/`,
which uses buildpacks. The renderer requires:

- a pinned `typst` binary (static musl, ~40–60 MB) — a multi-stage Dockerfile,
  minimal runtime base;
- the vendored artifact copy that `deploy-backend` already stages;
- the template tree and fonts;
- `TYPST_BIN` wired to the binary.

Introducing `backend/Dockerfile` switches Cloud Run off buildpacks. That switch
is part of this plan's scope, not a follow-up.

## 10. Tests and gates

- **Section isolation.** Each section compiles alone, plus the full set: N+1
  compiles per fixture. Deliberately not the 2^N combination space.
- **Presence matrix.** One fixture per boundary case: solver absent, solver
  present with zero additions, empty collections, populated collections.
- **Formatting parity.** Typst display strings vs a frontend-formatted vector
  (§6.4).
- **Guard.** The committed bundle fixture validates against
  `ReportBundle`, including recomputed `content_hash`, on every `make test`.
- **Error paths.** Unknown section id, empty selection, draft batch, foreign
  batch.
- **Determinism.** Two compiles of the same input produce identical PDF bytes —
  this is the test that catches an unpinned timestamp or font.
- **Render tests skip loudly when `typst` is absent** (local); CI and the image
  have it. This is an accepted weakening of `make verify`, recorded here rather
  than discovered later.

## 11. Sequencing

| # | Work | Gate |
|---|---|---|
| 1 | R2 freeze capture | frontend tests |
| 2 | R3 catalog resolution | unit tests |
| 3 | R4 server-side bundle + atomic write + fixture | end-to-end freeze test |
| 4 | `sections/*.typ`, `report.typ`, `theme.typ` against the fixture bundle | N+1 compiles |
| 5 | `report_render.py` | error-path tests |
| 6 | Route | route tests, `make check` |
| 7 | Formatting parity fixture | parity test |
| 8 | Dockerfile + fonts + deploy switch | image build, deployed smoke render |
| 9 ✅ | Retirement: deleted `recipe_document.py` + `recipe_render.py` + their test (commit `0f25d41`); the YAML plans stay marked superseded. Remaining: `TODO.md` cleanup as part of the renderer slice. | `make verify` |

Steps 1–3 are the unblock; steps 4–5 can proceed in parallel against the
committed fixture.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Compile error from a mistyped node id | Defensive accessor panic with the dotted path; fixture covers every path |
| Typst version drift changes layout | Version pinned in the image and in the render key |
| Font set drift changes metrics | Fonts vendored, `--font-path` only, parity + determinism tests |
| Formatting forks from the frontend | Parity fixture (§6.4) |
| A section silently renders nothing | Empty-selection is a 422; presence predicates are tested per fixture |
| Local `make verify` no longer hermetic | Accepted; render tests skip loudly without `typst` |
| Long unbroken tokens overflow a cell | Typst does not raise; pathological fixture + visual check |

## 13. Non-goals

- Inventory, shopping lists, or any report whose fact is not a frozen batch.
- Stored render artifacts or a render cache.
- User-authored templates, or template hot-swap.
- Markdown output of any kind.
- Recomputing domain values at render time.

## 14. Open items

1. **Section inventory and prose.** The section list in §6.3 is inferred from
   the artifact's collections and boundaries; the actual report's section set,
   titles, and prose are authoring decisions not yet made.
2. **`standalone` chrome.** §6.1 puts title/outline suppression in the theme;
   the exact one-sheet layout (header block, footer, page numbers) is unsketched.
3. **PNG delivery shape.** One request per page with `X-Report-Pages`, or a
   single response carrying all pages (multipart / zip)? Leans per-page with a
   client-side page stepper.
