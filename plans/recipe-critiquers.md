---
title: Recipe Critiquers — Prose-Only LLM Assessors
status: proposed
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make check + make test; no network in tests
---

# Recipe critiquers — prose-only LLM assessors

First two of several planned assistants. They judge an already-solved, complete
recipe against two empirical reference documents, in prose, on demand. They never
feed the model, never write state, and never alter a solved value.

## 1. Why

Two background documents capture brewing relationships the deterministic model
deliberately does not encode:

- [`../docs/mashing/reference/mash-regimes-fermentability-styles-and-yeasts.md`](../docs/mashing/reference/mash-regimes-fermentability-styles-and-yeasts.md)
  — mash regime → sugar spectrum → yeast archetype → style fit.
- [`../docs/hops/reference/chemical-mechanical-and-sensory-impacts-of-whirlpool-hopping.md`](../docs/hops/reference/chemical-mechanical-and-sensory-impacts-of-whirlpool-hopping.md)
  — whirlpool temperature regimes → oil and alpha-acid chemistry → sensory impact.

The solver's attenuation model treats a malt's fermentability `F` as a
Congress-mash limit and does not take the mash schedule as an input; the hop
boundary is sealed. The critiquers are a **second lens**: empirical guidance from
those documents, separate from the solved values, that the UI labels as such.

## 2. Decisions (locked)

- **Provider**: Google Gemini **Flash**, structured outputs (JSON schema).
- **Transport**: `httpx`, declared directly in `backend/pyproject.toml` (already
  resolved in `backend/uv.lock` as a Firebase transitive). No `google-genai` SDK.
- **Placement**: available while **editing**, not a frozen-batch row action.
- **Calls**: one call per assistant; independent results, loading and error state.
  No combined “critique everything” action.
- **Gate**: each assistant declares the steps it covers; it enables only when
  those steps are complete.
- **Memo**: browser-local for v1 (`localStorage`), keyed by the sealed bundle
  `content_hash` + assistant + prompt version + doc hash + model id. A server-side
  memo may replace it later behind the same response shape.
- **Prompt examples**: authored jointly by interview; the reference documents
  supply the rubric and vocabulary, not example→critique pairs.
- **Mash schedule**: unchanged. No mash→fermentability modifier is introduced.
- **Docs**: both reference documents carry a background header and are not the
  contract.

## 3. Reference documents (P0 — landed with this plan)

- `docs/mashing/reference/mash-regimes-fermentability-styles-and-yeasts.md`
- `docs/hops/reference/chemical-mechanical-and-sensory-impacts-of-whirlpool-hopping.md`
- `docs/mashing/README.md` indexes the mash prose; `docs/hops/README.md` indexes
  the whirlpool transcript.
- Both headers say `Gemini chat — retrieved 2026-10-30`, quote the query, and
  say “Imported verbatim; background — not the contract.”
- Both remain subject to `tests/guards/docs-claims.test.js` (background is not
  frozen, only non-contract).

## 4. The completion flag (P1)

One derived, reusable flag; the prerequisite for every assistant.

Per step (from `frontend/src/views/steps.js` slices):

- **Identity** (`equipment`, `style`, `water`): identity present.
- **Selection** (`yeast`): selection resolved, no error.
- **Collections/schedules** (`fermentables`, `late-additions`, `hops`, `mash`,
  `dry-hops`): no blocking finding and no domain violation attributed to the
  slice. Empty is allowed where it is legitimate (single-infusion mash, no hops).
- **Excluded**: `brew-day` (the checklist is optional).

Result: `stepComplete[slice]` and `allStepsComplete` (every visible, non-excluded
step). Each assistant declares `requires: ["mash","yeast","style"]` or
`["hops","water"]`, so only its own buttons gate.

Open: whether “complete” also requires **visited** (navigation) or only the
recipe predicate. Recommendation: recipe predicate only; visited is a separate
UX signal.

## 5. Assistant contract (P2)

Registry, one entry per assistant (data, guard-tested):

```js
{
  id: "mash-yeast-style",
  title: "Mash, yeast & style",
  doc: "docs/mashing/reference/…md",
  requires: ["mash", "yeast", "style"],
  dossier: ["identity", "grist", "mash", "yeast", "sugars", "water", "solved", "conformance", "findings"],
  promptVersion: 1,
  schema: "CritiqueProse",
}
```

Endpoint: `POST /batches/{batch_id}/assistants/{assistant_id}`.

- Frozen batch → the server reads the stored report bundle.
- Draft → the body carries the preview bundle (same pattern as
  `POST /batches/{id}/report`).
- Response: the prose fields + `content_hash`, `model`, `prompt_version`,
  `doc_hash`.
- Never mutates the batch, never returns values the UI can apply.

Dossier (pure, deterministic, snapshot-tested): identity, grist rows with
per-malt fermentability, authored mash rests, yeast (attenuation, flocculation,
STA1 tri-state, temperature range), sugars, hop schedule, water ions, solved
OG/FG/ABV/AA/IBU/SRM, conformance/SAI, findings. Numbers come only from the
bundle; the dossier is the only numeric source for the prompt.

Guardrails:

- Prose-only response schema; no ids, no actions, no writable values.
- Post-validation: every numeric token in the prose must appear in the dossier
  or the reference document.
- Recipe and catalog text is data, never instructions.
- Separate per-uid rate bucket for LLM calls (tighter than the general 60-burst
  bucket); 429 mapping. 30–60 s timeout; 502 on upstream failure.
- `GEMINI_API_KEY` server-side only; no user identifiers in the dossier or prompt.
- The UI labels the output “empirical guidance — does not change solved values”.

## 6. Memoization (P3)

Key: `sha256(assistant, model, prompt_version, doc_hash, bundle.content_hash)`.

- v1: `localStorage`, one JSON entry per key, capped (e.g. 20 entries / 100 KB),
  cleared on sign-out, keyed per user where the UI can see the uid.
- Frozen batches always hit; drafts re-key on every edit, so an old entry is
  never shown for changed values.
- A server-side Firestore cache is a later swap behind the same response shape;
  it must key identically and remain a cache, never a second truth.

## 7. Prompt packs and examples (P4)

Per assistant, a versioned pack:

1. System instruction (role, scope, output shape, prohibitions).
2. A distilled **rubric** extracted from the reference document (principles and
   vocabulary), with the document hash recorded.
3. One or two few-shot examples (dossier excerpt → critique), authored by
   interview and frozen as fixtures.

Interview protocol (mash/yeast/style first):

1. Pick two recipes — one conforming, one deliberately mismatched.
2. Agree the shape and voice (e.g. three short paragraphs: *what the levers say
   → where this recipe sits → what to change*; second person; no scores).
3. Agree whether the critique names rules (“inverse compensation”, “directional
   stacking”, “maltotriose-negative”) or applies them silently.
4. Draft → user correction → freeze as a fixture; re-run against the schema.

Open questions for the interview:

- Which two recipes for the first pack?
- Desired paragraph or bullet shape and tone?
- Jargon on or off?
- Exact Flash model id (`gemini-2.5-flash` or current equivalent).
- Rate-limit and timeout numbers.

## 8. Phases

| Phase | Scope | Gate |
|---|---|---|
| P0 | doc moves, headers, READMEs, AGENTS/TODO links — landed with this plan | `make check`, `make test` |
| P1 | completion flag (`stepComplete` / `allStepsComplete`), nav/footer surface, tests | frontend suite, guards |
| P2 | assistant registry + dossier builder + `httpx` Gemini client + endpoint (mash/yeast/style) + mocked tests | backend pytest, no network |
| P3 | edit-time panel, independent Run/Re-run per assistant, browser memo, completion gating | frontend suite |
| P4 | hop/whirlpool assistant on the same registry | as P2/P3 |
| P5 | interview-authored prompt packs and examples; numeric-token guard; `docs/critiquers.md` | full gate |

Each phase lands its own commit; `docs/critiquers.md` is the living contract
(registry, dossier, versions, memo key, guardrails, privacy).

## 9. Risks

- **Two truths**: the critique may disagree with the solver. Mitigation: label
  the lens, never feed it back, never let it write values, and keep the numeric
  guard anchored to the dossier and the document.
- **Document drift**: background documents change and prompt caches go stale.
  Mitigation: document hash in the memo key and prompt version; a guard that the
  registry path exists.
- **Cost and latency**: Flash only, dossier not bundle, per-user rate bucket.
- **Privacy**: recipe payloads go to Google; document it and strip identifiers.
- **Nondeterminism**: prose is not reproducible; do not store it in reports, the
  batch record, or any derived-value path.
- **Scope creep**: the critiquer must not become a solver advisor that mutates
  state (vision §5.4: no optimisation of authored choices).

## 10. Verification

- `docs/mashing/README.md` exists and the moved documents carry the header.
- Registry guard: every assistant has a document, prompt pack, schema, dossier
  sections, required steps, and a mocked endpoint test.
- Dossier snapshot from the committed report-bundle fixture.
- Schema validation and numeric-token guard unit tests.
- Cache: hit, miss and invalidation; no cross-user reads.
- Completion flag: each step case, brew-day excluded, no pending/error path.
- `make check`, `make test`; no network in tests.
