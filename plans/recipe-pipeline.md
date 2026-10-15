---
title: Recipe Pipeline — Rendered Recipe Document
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: [recipe-service]
gate: a YAML recipe projects to a populated document model from a frozen valuation; markdown renders; optional PDF; make check/test green
status: proposed
---

# Recipe Pipeline — Rendered Recipe Document

**Goal:** turn a declarative **YAML recipe** into a populated **recipe document**
(a presentation model) from an artifact + a per-batch `valuation`, then render it
to **markdown** (and, optionally, **PDF**).

**Scope:** presentation only. The document carries *formatted strings* (`"12.2 g"`),
not semantic quantities. Rendering is markdown-first; PDF is an optional extra
step. Nothing here computes domain values — the valuation is supplied.

**Non-goal / premise:** no interchange repurposing (no BeerXML/BeerSmith). The
design is deliberately *not* unit-agnostic or semantically typed; if a machine
export is ever wanted, it is a different pipeline.

The YAML language is specced separately in `plans/recipe-yaml-grammar.md`.

---

## 1. Locked decisions

| # | Decision |
|---|---|
| 1 | **Pure projector** (no computing). Python does not re-derive; it consumes a `node-id → value` valuation. |
| 2 | **Runtime-interpreted.** No codegen, no generated pydantic classes, no regen guard. One **hand-written generic document model**; the YAML is parsed at runtime. |
| 3 | **Presentation-only values = strings** (`"12.2 g"`); non-numeric rendered **raw** for v1 (label map later). |
| 4 | **Units single-sourced** in `data/units.json` (symbols + per-unit precision + defaults), shared with the frontend. |
| 5 | **Unit profile** supplied as an **explicit argument** to the projector. |
| 6 | **Recipe identity:** carries `schema_version` + provenance + a content hash. |
| 7 | **Section reuse** (`{ ref, args }`) supported; **conditions** minimal (`eq`/`ne`/`truthy`). |
| 8 | **Prose/headings** via a **Rollup → Section → Subsection** tree (each level carries title/prose). |
| 9 | **Data availability:** backend **ships the data files** (`artifact.json`, `units.json`, `recipe.yaml`) and loads them at startup — no bake. |
| 10 | **Build-time first:** `make render` (CLI, fixture valuation) → markdown → optional PDF. A **service endpoint** is anticipated and follows. |

---

## 2. Architecture

```
   (build-time)  fixture valuation ─┐
   (service)     frozen BatchRecord ─┤
                                     ├─▶ projector ─▶ RecipeDocument ─▶ markdown ─▶ [pdf]
   artifact.json ─┐                  │
   units.json ────┼─ load once ──────┘
   recipe.yaml ───┘
   unit profile (explicit arg) ──────┘
```

**One projector, two entrypoints:**

| | Build-time (now) | Service (anticipated) |
|---|---|---|
| Entry | `make render` → CLI | `GET /recipes/{id}/render` |
| Valuation | fixture file (`data/examples/*.valuation.json`) | frozen `BatchRecord.valuation` (Firestore) |
| Unit profile | explicit arg (default profile) | explicit arg (request body) |
| Output | `dist/*.md` (+ `.pdf`) | markdown / PDF response |

Nothing here is throwaway: the build-time CLI is the harness for the same
projector + renderer the service will expose.

---

## 3. Inputs & output

| Input | Shape | Source |
|---|---|---|
| artifact | `data/artifact.json` | repo (shipped to backend) |
| units | `data/units.json` | repo (shipped) — symbols/precision/defaults |
| recipe schema | `data/recipe.yaml` | authored |
| **valuation** | `node-id → value` (boundary nodes → `{outputs, fingerprint}`) | a **frozen** `BatchRecord.valuation`, or a fixture |
| unit profile | `{ master: {dim→unit}, overrides: {node→unit} }` | explicit argument |

**Output:** a populated `RecipeDocument` (generic model) → markdown.

The valuation is already the freeze payload the frontend produces
(`freezePayload().valuation`) and the backend persists verbatim
(`FreezePayload.valuation: dict[str, Any]`). No new producer is required.

---

## 4. The generic document model (hand-written)

No codegen: a small, fixed pydantic model describes *any* recipe document. Written
by hand in `backend/app/schemas/recipe_document.py`.

```
RecipeDocument { title, subtitle, meta: dict[str,str], prose: [str], sections: [Section], identity }
Section        { id, title, subtitle, prose: [str], blocks: [Value|Table|Group|Prose], subsections: [Section] }
Value          { label, node, value: str|None, unit_label: str|None }
Table          { label, collection, columns: [Column], rows: [[str, …]] }
Column         { label, field }
Group          { label, blocks: [Value|Table|Group|Prose] }
Prose          { text }
identity       { schema_version, provenance: dict, content_hash }
```

- Every leaf `value` is a **string** ("12.2 g") or `None` (conditional/optional).
- The renderer walks this tree generically (headings, paragraphs, key-values,
  tables) — no per-section knowledge needed.
- `title`/`subtitle`/`prose` exist on the document and at every section level
  (the Rollup→Section→Subsection tree, decision #8).

---

## 5. The projector

**Location:** `backend/app/services/recipe_projector.py`. Pure, synchronous, no I/O.

**API (shape):**

```
def project_recipe(recipe_yaml, artifact, units, valuation, unit_profile) -> RecipeDocument
```

**Algorithm:**
1. Parse `recipe.yaml` (validated against the grammar — see §7) into an in-memory
   document tree of raw bindings/labels/prose.
2. For each `Value`/`Table` leaf: resolve its binding against the valuation (§5.1),
   evaluate `when` (§5.3), adapt units + format (§6), set the string.
3. Recurse into `Group`/`Section`/`Subsection`.
4. Attach `identity` (`schema_version` + provenance from the batch + a content
   hash; see §8).
5. Return the populated `RecipeDocument`.

### 5.1 Valuation path resolution (mirror of `engine.resolve`)

The valuation is keyed by **node id**; a binding may be a dotted path. Resolve by
longest-prefix over `artifact.nodes`, then:
- node id (no suffix) → `valuation[nodeId]`;
- `boundary` + suffix → `valuation[nodeId]["outputs"][suffix]`
  (e.g. `solver.batch.cascade.v_strike`);
- `selection`/`collection` + suffix → `valuation[nodeId][suffix...]`.
A missing path with `optional: true` → `None`; otherwise a projection error
(surface, don't silently null).

### 5.2 Value shapes seen downstream

- scalar (root/choice/derived) → number | string | bool.
- selection → the resolved component object, or `null`.
- collection → `rows[]`.
- boundary → `{ "outputs": {…}, "fingerprint": "…" }`.

### 5.3 Conditions

`when: { ref, eq|ne|truthy }` evaluated against the valuation (same resolver).
False → the field is omitted or `None`. Keeps one section reusable across
topologies (e.g. the runoff-ratio field only under `runoff_ratio`).

---

## 6. Units & formatting (decision #3/#4/#5)

A leaf string is built as `value + " " + symbol`, using:
- **factors/defaults** from `data/artifact.json` (dimension→unit factors),
- **symbols + per-unit precision + dimension defaults** from `data/units.json`,
- the **unit profile** (explicit argument), resolved per node by the app's ladder:

```
overrides[node] → master[dimension] → dimension default → base unit
```

Formatting mirrors the frontend (`views/producer.js` `cellDisplay` /
`registry/units.js` `unitDecimals`): convert via the factor, apply the unit's
`decimals` (`toFixed`), then append the symbol. Examples: `"28.0 L"`,
`"1.056 SG"`, `"13.6 °P"`, `"0.714"` (dimensionless, no symbol).

`unit_label` on the `Value` node carries the symbol so the renderer can style it
if desired. This is a presentation transform, not a domain computation.

---

## 7. Validation guard (replaces the regen guard)

`tests/backend/test_recipe_schema.py`:
- parse `data/recipe.yaml` against the grammar model (structural validity);
- assert every binding resolves in `data/artifact.json` (node/path exists);
- assert every referenced unit exists in `data/units.json` (symbol + decimals);
- assert every `when.ref` resolves.
Fails with a `yaml.path` message. This is the same "catch it before render"
property the codegen guard gave, phrased as *validate*, not *regenerate*.

---

## 8. Identity & content hash (decision #6)

`RecipeDocument.identity` carries:
- `schema_version` — the artifact revision the valuation came from;
- `provenance` — the batch's selection provenance (`source_template_id` +
  `source_revision`), for drift awareness;
- `content_hash` — a deterministic hash of the rendered document (reuse the
  `canonicalize` utility in `backend/app/schemas/boundary.py`), giving the PDF a
  stable identity.

---

## 9. Data availability (decision #9)

The projector needs `artifact.json` + `units.json` + `recipe.yaml` **in the
Python process**. Per decision #9 the backend **ships the files** (no bake):

- **Dev:** read from the repo `data/` (a configured path, e.g. `RECIPE_DATA_DIR`).
- **Deploy:** copy `data/artifact.json`, `data/units.json`, `data/recipe.yaml`
  into the backend image; load once at startup and cache on the app state.

This is the one genuinely new runtime dependency the backend gains (today only the
frontend reads `artifact.json`). It is three small files.

---

## 10. Rendering (markdown → PDF)

**Markdown first.** `render_markdown(document) -> str` walks the tree generically:
headings by level, prose paragraphs, key-value lines, and tables.

**PDF (optional extra step).** markdown → PDF is a single `pandoc` call.
- **Template:** the *default* LaTeX template renders headings/tables/prose fine —
  a **custom template is not required**; add one later only for styling.
- **Math:** none — the document holds pre-formatted strings, no equations. No math
  rendering needed (assumption confirmed).
- **Engine choice (defer):** default `pandoc` + TeX (`pdflatex`) is fine for
  build-time. For the service image, consider a lighter HTML/CSS engine
  (`--pdf-engine=weasyprint`) to avoid a TeX distribution. Keep it swappable.

---

## 11. File layout (proposed)

```
data/
  recipe.yaml                     # authored recipe (grammar doc)
  units.json                      # NEW: unit symbols/precision/defaults (shared)
  examples/house-pale.valuation.json
backend/app/schemas/
  recipe_document.py              # hand-written generic document model
  units.py                        # UnitProfile (hand-written)
backend/app/services/
  recipe_projector.py             # YAML + valuation → RecipeDocument
  recipe_render.py                # RecipeDocument → markdown (→ optional PDF)
backend/app/
  recipe_data.py                  # load + cache artifact/units/recipe.yaml
backend/scripts/
  render_recipe.py                # build-time CLI (make render)
tests/backend/
  test_recipe_schema.py           # validation guard
  test_recipe_projector.py        # projection over a fixture valuation
```

`tach.toml`: hand-written models live in `app.schemas` (depends on nothing);
projector/render/data-loader in `app.services` (depends on `schemas`). No new
module edges beyond a possible dedicated `app.recipe`.

**Note on `data/units.json`:** it must also back the frontend. `views/registry/units.js`
becomes a thin adapter importing `data/units.json` (single source for symbols +
per-unit decimals + defaults). A small frontend change, in this plan's scope.

---

## 12. Makefile

```make
render:                          # build-time render (fixture valuation → markdown)
	cd backend && uv run python scripts/render_recipe.py --out ../dist
```

`make test` runs the validation guard + projector tests. `make check`
(ruff/tach) covers the new modules.

---

## 13. Staging

- **R.1 — Grammar + document model.** Finalize `recipe.yaml` shape; hand-write
  `RecipeDocument`; the **validation guard**; `data/units.json` extracted and
  wired into `views/registry/units.js`.
- **R.2 — Projector core.** Valuation path resolver (§5.1) + scalar/collection
  projection over a fixture valuation.
- **R.3 — Nesting + conditions.** Groups/subsections, `when`, `{ref,args}` reuse.
- **R.4 — Units.** `UnitProfile` + formatting parity (symbols/precision/symbol).
- **R.5 — `make render`.** CLI + `render_markdown`; optional PDF step.
- **R.6 — Service endpoint (deferred).** `GET /recipes/{id}/render` reading the
  frozen valuation; unit profile from the request.

---

## 14. Open questions

1. **PDF engine** — `pandoc`+TeX (v1) vs WeasyPrint (lighter service image)? Defer
   until R.5.
2. **Fixture provenance** — how the build-time valuation fixture is produced
   (manual export vs a small helper that calls the freeze payload). Leaning:
   manual export for v1.
3. **`content_hash` scope** — hash the rendered document, or the
   `(valuation, profile, recipe.yaml)` tuple? Leaning: the rendered document.

---

## 15. Out of scope

- Codegen / generated classes / regen guard (rejected — decision #2).
- Any Python re-implementation of the engine (no computing).
- New valuation production (reuse the existing freeze payload).
- Interchange formats (BeerXML/BeerJSON) — explicitly not a goal.
- Editing the artifact (the pipeline only **reads** it).

---

## 16. Risks

- **Two presentation projects.** The frontend (`steps.js`/registry/producer) and
  this projector both map nodes → presentation. Keep this one strictly
  *documentation-shaped*; do not let it become a second UI.
- **`units.json` must stay the single source.** If the frontend symbols/precision
  and `data/units.json` diverge, the document disagrees with the screen. The R.1
  frontend wiring + a parity check mitigate this.
- **Data-file drift on deploy.** The shipped `data/*` copies must track the repo
  (copy at build, not a stale vendored copy).
- **Formatting parity.** The formatter must match the frontend's `fromBase` +
  `toFixed` + symbol exactly, or "the document says X, the app says Y".
