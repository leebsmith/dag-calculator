---
title: Recipe Import — PDF Extract to Mapped Draft
status: draft
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [recipe-critiquers]
blocks: []
gate: make check + make test; no network in tests
hold: prompts and schemas settled — end of J.1, before any app work
---

# Recipe Import — PDF extract to mapped draft

A user uploads a recipe from a magazine (or any PDF), a Gemini Flash structured
call transcribes it, and a user-guided ledger maps every transcribed line onto
the registry. The result is an ordinary draft batch, solved by the ordinary
boundaries, with an immutable import record as its receipt.

**The feature adds no artifact node, no boundary, no schema version bump.** It
reads existing roots and writes an existing payload shape. Everything new is a
seam on either side: an LLM client with no authority, and a mapping UI that
terminates in the payload the engine already accepts.

## 1. Why

A magazine recipe arrives in the calculator's *inverse* vocabulary: authored
masses and a stated target. This app authors proportions and targets, and solves
the mass. Import is therefore not a parser — it is a translator from
"masses they mixed" to "proportions you intend", and the two will not agree,
because efficiency, malt specs, hop utilization and yeast attenuation are ours,
not theirs.

The disagreement is the product. The review shows, per line, what the page said
and what this rig will actually use, and why. Without that table the feature is a
recipe log with extra steps, which the vision refuses.

## 2. Locked decisions

1. **No PDF persists.** Only the `ExtractedRecipe` (pydantic JSON) and the
   mapping ledger are stored. The upload is transient.
2. **The LLM has no authority.** It never names a registry id, never computes,
   never normalises. Its output is a proposal with provenance; the ledger is the
   decision; the payload is the only thing the engine sees.
3. **IBU is required; hop mass is back-derived.** Solved grams may differ from
   the page, and the delta is displayed.
4. **`parts` is authored; `pct` never is.** Shares are produced by the existing
   Hamilton normaliser from the existing row builders, never recomputed here.
5. **Bucket placement is a user decision.** The source's split across the grain
   bill, trace malts, sugars, boil, whirlpool and dry hops is not the
   calculator's split, and the model must not guess it.
6. **Water chemistry is out of scope.** The identity's water report and target
   profile are required; the source's water lines are captured and ignored. The
   water boundary still runs, advisory only.
7. **One recipe per file.** A file that reads as more than one recipe is
   rejected with the detected titles, not silently narrowed.
8. **No commit on a red gate.** An unsolveable map is not an import.
9. **Committed records are immutable and undeletable.** They are the batch's
   audit trail.
10. **Scans are out of scope** — cost and fidelity, not capability.

## 3. Flow

| Step | Surface | Ends when |
|---|---|---|
| 0 Start | landing → New batch → "From a recipe" | identity chosen, file picked |
| 1 Upload | dialog | PDF accepted, extraction call made |
| 2 Transcribe | review table | required scalars present |
| 3 Map | ledger | zero unresolved lines |
| 4 Check | gate | batch + hops clean, no blocking relation |
| 5 Commit | name + confirm | draft exists, record immutable |
| 6 Live | editor | — |

Record status: `extracted → mapping → committed`, with `abandoned` the only
other terminal state. The wizard is a third top-level view alongside landing and
editor, not a modal over the editor.

**Identity** is chosen in the dialog like every other creation path, but stays
editable until commit: after extraction the review raises a rig-fit banner
("wants 24 L at 1.086; your kettle is 30 L, HLT 25 L") with a change-rig action
that keeps the extract. The record carries the candidate identity; the batch
receives it only at commit.

**Two rhythms.** The editor autosolves on every edit. The wizard must not: a
check costs three boundary calls and reviewing a ledger is deliberate. Mappings
update a local delta preview; the gate runs only on an explicit Check.

### UI surfaces

**Shell placement.** A third `x-if` branch in `frontend/index.html` beside the
chooser and the editor, driven by `recipes.view` widened to
`batches | editor | import`, mutually exclusive with the editor and the brew
session. It is **not** a step: `views/steps.js` is the authoring manifest, and it
feeds the rail, the footer's step count, the completion predicate and the report
order — a conditional eighth card would corrupt all four, and the step viewport
only exists after a batch does. Full-screen surfaces in this shell are `x-if`
branches; modals are always-loaded partials with an internal flag. Import is the
former.

**Borrowed identity.** The import view reuses the editor's chrome rather than
inventing a second look: the same rail plus viewport and footer structure
(`step-body`, `step-rail`, `step-viewport`, `app-footer`, the status-dot
vocabulary). Its four stages — Upload, Transcribe, Map, Check — are owned
locally by the import store, not by the step manifest. The footer carries the
stage counter, the mapping counts and the primary action, mirroring the editor's
footer (save state, step position, violation count). Class names retain the
"step" prefix; that naming debt is accepted for v1 and revisited if the two
chrome uses diverge.

**Map** is one scroll with sticky section headers and a counts strip
(`fermentables 6/6 · hops 3/8 · yeast 1/1 · mash 2/4 · not modelled 4`) rather
than a nested rail: the counts are the progress metric, and a single scroll keeps
keyboard traversal in source order, which is the throughput requirement.

**Reused components.** The catalog drawer and table machinery
(`draft-table`, `draft-search-pane`) carry the ledger sections; the row-detail
modal pattern carries single-line inspection and correction; the card framing
and CSS tokens carry the visual language.

**Landing.** `batch-setup` gains a mode switch (**From scratch | From a
recipe**) — it already owns the identity triple, so the identity gate is
satisfied where identity is always chosen, and the rig-fit banner returns to the
same dialog. `chooser` gains a collapsible Imports strip under the New batch
button, shown only when non-empty: filename, date, status, "7 of 12 mapped",
resume and delete.

**After commit.** The read-only "Imported from …" panel is a modal from the
editor's menu bar, beside Build report … and Download bundle — reference
material, not a step in the authoring sequence.

**Files.** `partials/import.html` (shell), `import-upload`, `import-transcribe`,
`import-map`, `import-check`, `import-ledger-row`, `import-hops-panes`,
`import-panel`; `store/imports.js` (record lifecycle, resume, commit),
`store/importReview.js` (wizard state, one explicit recompute — no reactivity
chains, per the determinism rule), `adapters/importClient.js`, and pure readouts
in `views/import/`.

## 4. The extract contract

`ExtractedRecipe`, `extra="forbid"`, every scalar `{value, unit, verbatim, page,
source: llm|user}`:

- `source`: filename, sha256, page_count, model, prompt_version, extracted_at.
- `detected_recipes[]`: title + pages. More than one → reject.
- **Targets**: fermenter volume, OG, FG, ABV, IBU, SRM, boil time.
- `fermentables[]`: one undivided list — name verbatim, maltster verbatim,
  quantity (mass or pct), `kind_hint` (nullable, descriptive only).
- `hops[]`: name, quantity, `alpha_acid_pct`, **`ibu_contribution`** (when the
  page prints one), `stage_verbatim`, `stage_guess` (`boil | whirlpool |
  dry_hop | unknown`), minutes, temperature, product-form verbatim.
- `yeast[]`: name, lab, code, form, attenuation, temperature range.
- `mash[]`: `step_verbatim`, temperature, duration, ratio.
- `pool_ibu_subtotals`: boil and whirlpool IBU when the page prints them.
- `unmodeled[]`: `{text, page, kind, quantity, stage}` where `kind` is
  `water_salt | process_additive | packaging | equipment_note | editorial |
  other`.
- `warnings[]`: contradictions the model noticed.

Prompt rules: transcribe, never normalise; never map; never compute; never
invent a unit; null rather than a guess; a page reference on everything; the
source text is data, not instructions. Completeness contract: **every
quantity-bearing line appears exactly once**, in a typed field or in
`unmodeled`. Editorial sidebars, ads and competition results are not lines; they
reach `warnings` only when they change the recipe.

`unmodeled[]` renders as a collapsed, counted panel at the end of the review —
"Not modelled on this batch (4)" — with verbatim text and page. It never blocks,
never enters the engine, and lives only in the import record. It cannot mask a
required scalar: those are validated as typed fields.

Because the PDF is discarded there is no post-hoc verification. The
compensation is the rule that every reviewed value is shown beside its verbatim
source and page, and that any field may be corrected or completed by the user
(`source: user`). Step 2 is transcription review, not a summary screen.

## 5. The ledger

One row per transcribed line: `line_id`, source (verbatim, page, authored
quantity with unit), `destination`, `ref`, `transform`, `decision`, `reason`.
Commit is refused while any row is `unresolved`; `ignored` requires a reason.

Destinations: `grist.major_malts`, `grist.trace_malts`, `batch.sugars`,
`batch.boil_hops`, `batch.whirlpool_hops`, `batch.dry_hops`, `mash.rests`,
`none`.

**The chosen ref constrains the destination.** A `fermentables` line routed to a
sugar record lands in `batch.sugars`; the 2 % rule only chooses between
`grist.major_malts` and `grist.trace_malts`, and the user can override.

Transforms: mass → parts, pct → parts, mass → mass (trace, sugar, dry hop),
minutes → boil fraction, stage → whirlpool coordinates, quantity → quantity.

### Required scalars

| Field | Status |
|---|---|
| Fermenter volume | required, no default, blocks |
| OG | required, blocks |
| IBU | required, blocks |
| Resolved yeast | required, blocks (sets the attenuation cap) |
| ABV | required; a **derived check**, since FG follows from the yeast |
| Boil time | defaults to 60 min, flagged "assumed", and contradicted by any hop longer than it |
| FG | derived |

Pin: `batch.scale_pin` = `og`, with the fermenter volume pinned. Stated ABV then
becomes a consistency test against the mapped yeast's attenuation — "theirs
gives 6.1 %, yours 5.4 %" — with `batch.attenuation_derate_points` offered and
labelled, never applied.

Efficiency is an explicit choice: leave `batch.conversion_efficiency` at the
rig's nominal, or author the source's figure with a warning. It is the one dial
that reconciles "their 5.2 kg" with "yours 5.6 kg", so it sits beside the grist
delta.

### Trace diversion

Trace rows are mass-based and excluded from the solved grain bill: they re-enter
only as fixed mass through `grist.total_mass`, and as fixed mass to the water
boundary. Routing is therefore physics, not tidiness.

The 2 % rule (recorded per import as `trace_threshold_pct: 2`) **proposes**
diversion. Each diverted row is marked, individually reversible, and visible in
the delta table. One exported constant feeds both this rule and the existing
`pct` under-2 % badge, so hint and routing can never disagree.

### Registry specs only

`yield_fraction`, `fermentability_fraction`, `color_lovibond` and their
provenance come from the chosen registry record, never from the page. A spec
sheet inside the PDF does not override a seed. Consequence: the source's
efficiency is discarded by construction unless explicitly authored.

Unmatched lines get a custom row (`catalog_id: null`, category priors) flagged
"solved with priors", with library authoring as a follow-up outside the wizard.

## 6. Hops

The hardest section, because two decisions are coupled: routing sets each row's
physics (boil at `boil_time_fraction × boil_time_min`; whirlpool through the
cooling timeline from `addition_at_min` and `initial_temp_c`), while
`batch.whirlpool_ibu_fraction` sets the budget split behind
`batch.whirlpool_target_ibu` and `batch.boil_target_ibu`. Neither is implied by
the other, and the page supplies neither.

### Layout

Three panes: boil | candidates | whirlpool, with dry hops and not-modelled as
separate groups below (they are not IBU pools and do not share the fraction).
The centre pane is the unresolved queue, so its emptying is the section's
progress metric. Centre rows carry `←` / `→`; side rows carry return-to-centre.
Keyboard equivalents are a requirement.

Each row is tagged with its source index ("#4 of 8") and each pane sorts by its
own logic (boil descending by minutes; whirlpool by temperature then addition
time). Document order was verified at transcription, and pane order is
presentation only — shares are order-independent.

The LLM's suggested ordering is a hint, never a placement: a faint "suggested:
whirlpool" marker the user may accept. The record distinguishes accepted-hint
from manual routing.

### Hard rules

- Flameout, knockout, 0 min, hop-stand and whirlpool additions belong in the
  whirlpool pool, never in the boil. A zero-minute boil row takes a share of
  boil IBU at zero utilization and demands a nonsensical mass.
- A hop time longer than the boil length contradicts the boil time; it is
  resolved, not clamped.
- Minutes are stored per row as the authored fact; `boil_time_fraction` is
  derived at commit, so a later boil-length correction re-times nothing
  silently.
- A whirlpool row needs `initial_temp_c`; an assumed value is shown as assumed.
- The whirlpool timeline parameters (knockout length, start temperature, cooling
  constant) are existing model inputs, displayed in the hop section because they
  materially set whirlpool utilization, and never authored by the import.

### The fraction

In descending authority:

1. **Printed IBU** — per-addition or a whirlpool subtotal. Exact arithmetic from
   the page, and it validates the routing for free.
2. **Authored estimate**, suggested from the whirlpool rows' alpha-mass share,
   labelled a heuristic (alpha share overstates whirlpool IBU).
3. **Manual**, with the delta table as the feedback loop.

The fraction is always shown with its provenance ("printed subtotal" /
"estimated from alpha share" / "authored").

**Deferred:** fitting the fraction by minimising solved-vs-source mass error. It
is a compensating parameter — it absorbs the magazine's IBU formula mismatch —
and it can mask a mis-routed row. If built later, one server-side call, never a
client loop.

### Hop delta table

Per row: pool, source minutes or temperature, source grams, solved grams, ratio,
allocated IBU — plus boil/whirlpool subtotals. This is where routing and
fraction are judged together; a whirlpool row solving to 5× its printed mass
says the fraction is too high.

## 7. Matching

| Layer | Where | Job |
|---|---|---|
| L0 prior | client, pure | exact hit against this user's earlier accepted mappings; a suggestion, not authority |
| L1 screen | client, pure | normalise, score, union, cap the top ~40 — **rank, never exclude** |
| L2 tie-break | server, batched | "of these, pick ≤5", alias knowledge |
| L3 user | client | full search, custom row |

L1 axes: malt — name, `standard_malt`/`standard_name`, category; sugar — name
and class; hop — name, synonym, alpha proximity; yeast — name, lab code,
attenuation proximity (basis-normalised, unspecified treated as real) and
temperature-range overlap.

L2 is **the model's second chance to map its own extraction onto ours**, and it
is one call per catalog kind (not per line) — so the whole kind is answered in
one place and duplicate source lines resolve consistently. It gets the extracted
lines of that kind (verbatim text, quantity, stage), a compact recipe context
(volume, OG, IBU, the page's own style name if stated), and the L1 candidates
with their attributes (name, standard, category, alpha, attenuation, temperature
range). **It never sees the PDF**: mapping is a text problem, and keeping the
document out of the second call keeps both cost and injection surface down.

It is stateless and seed-free: the client sends the shortlists, the server returns
ids it was sent. Validation: ids ⊆ candidates, ≤5 per line, no duplicates, ≤2 per
standard malt, `reason` from a closed enum. Empty picks is valid — a generic
"Belgian specialty malt" should come back empty rather than confidently wrong.
Output is frozen onto the record, so reopening the wizard neither re-calls nor
reshuffles chips, and acceptance rate per kind and reason is free instrumentation.
If L2 fails the UI degrades to L1 — a supported state, not an error.

The `match` prompt and its schema are **settled at the hold (§13)** with the
extraction assets; only the endpoint, batching and persistence land at J.6.

**Alias authority is deferred.** The import records are the memory: a source
string that matched a previous ledger's verbatim text yields a derived
"mapped as X last time" hint. No new collection, no silent re-mapping.

## 8. The gate

Blocking: no unresolved rows · `solver.batch` clean (no domain code, no boundary
error) · `solver.hops` clean · zero blocking relations, the same predicate freeze
uses. Advisory: `solver.water`, reported with a pointer to the user's own
targets. Identity required.

Runs headless against a candidate engine — `createEngine` plus
`buildBatchRequest` / `buildHopRequest` / `buildWaterRequest` — so no batch needs
to exist and the open editor is untouched. On demand only. Red blocks commit;
findings point back at the ledger rows or targets that would fix them.

## 9. Commit and persistence

One doc per import at `users/{uid}/recipe_imports/{importId}`:

- `status`, `source{filename, sha256, pages, model, prompt_version,
  extracted_at}`
- `identity` (candidate snapshot), `extract`, `ledger`, `suggestions[]`,
  `trace_threshold_pct`
- `pool_ibu_source`, `efficiency_source`
- `batch_id | null`

One-way link import → batch: a batch-side origin field would bump the draft
payload schema for provenance the batch can live without.

Routes under `AllowedUser`, with the per-uid LLM bucket shared with the
critiquers work: create/extract, read, update ledger, delete (non-committed
only), match. Vite proxy and hosting rewrites gain the import prefix; the
Makefile's prod-rewrite check is the guard.

Commit widens `persistence.createWithIdentity` to accept `roots`, `collections`
and `selections` (it currently hardcodes empty), then normal autosave takes over.
A partially-mapped import is never a batch.

The editor keeps a read-only "Imported from …" panel: filename, date, verbatim
source values, delta table. That is the accountability trail outliving the
wizard.

Dedupe: a matching sha256 prompts "already imported on 3 Nov — resume or
re-extract?". Abandoned records are left manual in v1; only non-committed
records are deletable.

## 10. Gemini

- AI Studio key, `GEMINI_API_KEY` in the backend process environment
  (`~/.bashrc` for dev, platform env in prod). One bare environment read,
  matching the existing pattern; no settings object, no dotenv, no new
  dependency beyond declaring `httpx`.
- Model pinned in the manifest: `gemini-3.8-flash` (newest GA Flash at the time of
  writing; thinking budget 0 for extraction, 512 for matching). No id is
  hardcoded in code.
- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`,
  key in `x-goog-api-key` (never in a query string), `responseMimeType:
  application/json` plus a hand-flattened `responseSchema` (no `$defs`, no
  recursion), `temperature: 0` for extraction.
- PDFs inline as `inline_data`, ~258 tokens/page, ~20 MB request cap and
  therefore a practical file cap near 14 MB.
- **Fail closed**: no key → 503 with a named code, mirroring the missing-TYPST
  path. Never log the key; log the upstream status and error code.
- Timeout 30–60 s, 502 on upstream failure, one call per upload, no automatic
  retries, per-uid bucket shared with the critiquers client.
- Billed tier: the free tier permits product-improvement use of prompts, and
  this feature sends other people's documents. Stated in the docs.

## 11. Prompt assets, cache and replay

Prompts are assets, not string literals, and they live where the repo already
keeps shipped, package-relative assets: `backend/app/prompts/`, mirroring
`backend/app/templates/` (which the Typst renderer already resolves relative to
the package). Prose lives in `.md`, shape lives in pydantic, and one adapter
converts the model into a flattened Gemini `responseSchema` — no second
definition of the output shape.

`manifest.json` carries, per prompt id: file, `version`, `model`,
`temperature`, and the **sha256 of the file text**. Three assets are declared:
`extract`, `match` and `gapfill`, each with its own version, model setting and
schema. A fourth is a manifest entry, not a code change. The
Gemini `responseSchema` is **derived** from pydantic by one adapter and committed
as a **schema snapshot per prompt**, so a pydantic change that alters the wire
shape is a reviewable diff at `make test` rather than a surprise at runtime.

Guards then enforce the asset discipline the repo already applies elsewhere:

- every manifest entry's file exists and its hash matches — editing a prompt
  without bumping `version` and re-recording the hash fails `make check`;
- every committed fixture's `prompt_version` exists in the manifest;
- every prompt's derived schema snapshot matches its pydantic model;
- the record's `prompt_version` on refresh describes the prompt actually used.

**Two layers, different jobs.** A cache is a scratchpad; a fixture is a
decision.

- **Cache** — `.local/llm-cache/`, already gitignored, keyed by
  sha256(`prompt_version`, model, request body) → the raw provider JSON. Editing
  a prompt changes the key, so a stale entry can never be replayed by accident.
  The CLI takes `--cache` / `--no-cache` / `--refresh`. This is what stops the
  iterate-by-round-trip loop: the first call per prompt version costs money,
  every call after it is free. `make test` never reads it.
- **Fixtures** — `tests/backend/fixtures/llm/<case>/` holding `response.json`
  (the **raw** provider body, so the parser is tested against real provider
  noise) and `meta.json` (prompt id and version, model, temperature, PDF sha256,
  page count, captured_at, and a human note such as "good: all six hop lines;
  missed the printed IBU subtotal"). Promotion is explicit —
  `--promote <case>` copies a cache entry into that directory — so the committed
  set stays curated instead of accreted.

`--replay <case>` runs the whole pipeline from a fixture with no client and no
key, which is also how the ledger and the mapping view are debugged once
extraction is settled.

The version is not bookkeeping. An extract is only interpretable alongside the
prompt that produced it: "extracted under v3, whose known miss was printed IBU
subtotals" is what makes a year-old import record honest. The manifest plus git
history reconstructs any version exactly, so the record stores the number, not
the text.

## 12. Where the code lives

- Backend: `app/services/gemini.py` (client), `app/services/recipe_import.py`
  (extract + match orchestration), `app/schemas/recipe_import.py` (extract
  models), `app/prompts/` (prose + manifest, shipped like `app/templates/`),
  `app/repositories/recipe_import_repo.py`, routes in `app/main.py`.
  No new `tach.toml` edge — the new files sit inside existing modules.
  Fixtures at `tests/backend/fixtures/llm/`.
- Frontend: `store/imports.js` (record lifecycle via a new `importClient`
  adapter), `store/importReview.js` (wizard state, one explicit recompute, no
  reactivity), `views/import/*` (pure readouts: ledger rows, delta table, pool
  balance), `views/import/matching.js` (pure L0/L1), reusing
  `views/hamilton.js` and the existing catalog→row builders.
- Docs: `docs/import.md` (living contract), an AGENTS source-of-truth entry, a
  TODO line. No artifact change, so `make generate` is not in scope.

## 13. Phases

| Phase | Scope | Gate |
|---|---|---|
| J.1 | **Asset iteration + hold (7 of 9 steps landed):** prompt registry (`extract`, `match`, maybe a repair pass), each with version, model setting, derived schema snapshot and fixtures; manifest + sha256 guard; CLI with `--cache` / `--promote` / `--replay` | fixture suite, prompt-hash and schema-snapshot guards, manual smoke, no network in tests → **HOLD H.1** |
| J.2 | Import records + upload + transcription review with `llm`/`user` provenance | backend pytest + frontend suite |
| J.3 | Ledger: destinations, transforms, L0/L1 matching, parts-only commit path, progress metric | frontend suite + guards |
| J.4 | Gate + delta table (water advisory) | boundary mocks, snapshot of the delta table |
| J.5 | Hops: pools, pan routing, fraction policy, printed-IBU capture | hop routing + fraction tests |
| J.6 | L2 wiring: batched stateless endpoint around the settled `match` asset, frozen suggestions, degradation | backend pytest with mocked httpx |
| J.7 | Commit, editor import panel, dedupe, docs + guards | full gate |

J.1–J.2 are useful alone: a file that will not transcribe cleanly is a
document-class problem, not an app problem, and knowing that before building the
ledger is cheap.

### Hold H.1 — prompts and schemas settled

**The plan pauses after J.1.** No J.2 work starts until the prompt and schema
iteration is reviewed, because the ledger, the review tables and the record
shapes are all downstream of shapes that do not exist yet.

Exit criteria, all mechanical:

- every prompt id in the manifest has a file, a version, a model and temperature
  setting, and a committed schema snapshot — `extract`, `match` **and** `gapfill`,
  since the mapping call and the re-read are settled as assets here even though
  their endpoints land later;
- `extract` has at least three fixtures — a prose magazine page, a tabular
  brewer's-software style page, and an awkward one (no boil time, no whirlpool
  hops, or a multi-recipe page for the reject path) — each with a written
  "known misses" note;
- `match` has fixtures covering picks, empty picks, the diversity rule, and a
  duplicate pair of source lines that must resolve the same way;
- provider JSON → pydantic → the same JSON round-trips without loss;
- `--replay` runs each fixture with no network and no key;
- unmodeled and warning capture is reviewed by eye against the source page,
  because a completeness contract cannot be tested without the document;
- `make check` and `make test` are green with only the fixture suite added.

One decision remains for the hold: the pinned model id and its thinking budgets.
The gap-fill pass is **decided yes** and built as the third asset. It re-reads the
whole document for the scalars the caller names and may only fill what is absent:
a second look must not overwrite a stated value, and must not manufacture an
answer for a gap. Its cost is a full pass, because without a PDF library the page
range is a hint rather than a payload reduction — so it is a deliberate action,
never an automatic retry.

A shape change discovered later is not free: it invalidates fixtures, forces a
version bump, and moves the ledger row shapes. That is the cost the hold exists
to avoid paying twice.

## 14. Risks

- **Ledger throughput.** The user's cost is unresolved lines, not document
  length. Without prior hits, keyboard flow and batch actions, only six-line
  recipes are pleasant. Treat throughput as a requirement.
- **The fraction as a fudge factor.** Fitting it to source weights hides model
  mismatch and mis-routing. Keep it authored, labelled, and never automatic.
- **Two truths by accident.** The delta table will show differences that look
  like errors. Every difference is explained by rig, spec, yeast or utilization,
  and the UI must say which.
- **Prompt and model drift.** Extract fixtures, `prompt_version` on the record,
  and a pinned model id in one place.
- **Cost and abuse.** One extraction per upload, no retries, a tight per-uid
  bucket, a size cap.
- **Silent loss.** A dropped line is invisible. The completeness contract plus
  `unmodeled[]` is the only defence, so it must be reviewed, not collapsed by
  default in testing.
- **Privacy and copyright.** Documents go to Google and are not retained here.
  Billed tier, no user identifiers in the prompt, documented.

## 15. Verification

- Extract schema: required-field, enum and unit rejection tests; golden fixtures
  from real documents; mocks only.
- Prompt assets: manifest hash matches every prompt file; every fixture's
  `prompt_version` exists; `--replay` runs the pipeline with no client and no
  key; the cache is never read by the suite.
- Ledger → payload: no `pct` authored anywhere; every parts-derived collection
  normalised through the existing helper; unresolved blocks commit.
- Routing: 2 % proposal reversible; trace rows carry mass; flameout never
  reaches the boil pool.
- Hops: printed IBU wins over the heuristic; alpha share only labels; a hop
  longer than the boil raises a contradiction.
- Gate: red blocks commit; water is advisory; findings map to rows.
- Records: committed is immutable and undeletable; sha256 dedupe; L2 degradation.
- Key absent → 503.
- `make check`, `make test`.

## 16. Deferred

Fraction fitting (one server-side call if revived) · scanned PDFs (cost and
fidelity; would need page images or the Files API) · alias authority (records
are the memory) · unmodelled lines on the brew checklist (the checklist's steps
are generated) · import retention policy (manual in v1) · hop forward evaluation
(mass → IBU) as a declared boundary mode.

## 17. Execution checklist

J.1 is atomic and ends at the hold. Later phases are refined at the hold, not
before.

### J.1 — prompt and schema iteration (ends at HOLD H.1)

- [x] J.1.1 Declare `httpx` in the backend manifest
- [x] J.1.2 Create `backend/app/prompts/` with `manifest.json`, `extract.md` (now v2) and `match.md` v1
- [x] J.1.3 Extract models in `backend/app/schemas/recipe_import.py` (`extra="forbid"`, closed enums)
- [x] J.1.4 Pydantic → Gemini `responseSchema` adapter + committed schema snapshots
- [x] J.1.5 `backend/app/services/gemini.py`: inline PDF, key header, fail closed, timeout, error mapping, response cache
- [x] J.1.6 CLI `backend/scripts/extract_recipe.py` with `--cache` / `--no-cache` / `--refresh` / `--promote` / `--replay`
- [x] J.1.7 Guards: prompt sha256 vs manifest, schema snapshot vs pydantic, fixture `prompt_version` exists, replay needs no network
- [ ] J.1.8 Capture fixtures from real recipe documents, review `unmodeled` and `warnings` by eye against the page
  - captured: `self-report` (this app's own 5-page report, tabular class)
  - still needed: a prose magazine page, a competition or brew-sheet page, and one
    awkward page (no boil time, no whirlpool, or multi-recipe for the reject path)
- [x] J.1.9a Decide the gap-fill pass — yes: a third asset, whole document, requested scalars only
- [ ] J.1.9b Confirm the pinned model id and thinking budgets
- [ ] **HOLD H.1** — review prompts and schemas before any app work

### J.2 — records, upload, transcription (after H.1)

- [ ] Import record schema + repository (`users/{uid}/recipe_imports`)
- [ ] `POST /imports` (extract), `GET`/`PUT`/`DELETE` with `AllowedUser` and the LLM bucket
- [ ] Import view shell (`view: "import"`), identity from `batch-setup`, rig-fit banner
- [ ] Transcribe stage: verbatim + page per field, `llm`/`user` provenance, `unmodeled` and `warnings` panels
- [ ] Abandon / resume / sha256 dedupe

### J.3 — ledger (fermentables, yeast, mash)

- [ ] Ledger row model, destinations, transforms; `unresolved` blocks commit
- [ ] L0 prior hits + L1 pure screen (rank, never exclude)
- [ ] Rows built through the existing catalog→row builders; `parts` only
- [ ] Trace diversion proposed at 2 % per import, reversible
- [ ] Map stage: sticky sections, counts strip, keyboard traversal

### J.4 — gate and delta table

- [ ] Headless gate: `createEngine` + the three `build*Request` bodies
- [ ] Explicit Check; blocking vs advisory split; findings mapped to rows
- [ ] Delta table: source vs solved per line and per target

### J.5 — hops

- [ ] Three-pane routing with source-index tags; flameout never in the boil
- [ ] Fraction: printed IBU → estimate → manual, provenance always shown
- [ ] `ibu_contribution` and pool subtotals captured and applied
- [ ] Hop delta table; boil-length contradiction check

### J.6 — L2 wiring

- [ ] Batched stateless match endpoint around the settled asset; ids ⊆ candidates
- [ ] Suggestions frozen on the record; degrade to L1 when unavailable

### J.7 — commit and close-out

- [ ] Widen `createWithIdentity` to accept state; commit writes the draft
- [ ] Committed records immutable and undeletable; one-way `batch_id` link
- [ ] Editor "Imported from …" modal
- [ ] `docs/import.md`, AGENTS source-of-truth entry, TODO line
- [ ] `make check`, `make test`
