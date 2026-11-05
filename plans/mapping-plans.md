---
title: Mapping — the import flow, rebuilt from its states
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [recipe-import]
status: shipped (A–B)
---

# Mapping — the import flow, rebuilt from its states

> **Status (2026-11-05).** Phases A and B are implemented: the vendored fixture and
> dev-loop reload (`8352796`), the Library blend face (`f46ff6a`), the carrier as
> the only yeast decision (`cf4e524`), the state model and readouts (`237d9a3`), and
> the template guard plus the seven acceptance flows (`c156d1f`). What remains is
> manual verification against the vendored PDF and a real blend record; C1–C2 are
> separate plans and out of scope.
>
> **Supersedes the *interaction* half of
> [`recipe-import.md`](recipe-import.md). Everything below the UI — the extraction
> payload, the ledger's row fields, the projection, the gate, the commit, the
> immutable import record, the Library's sealed records — shipped and is not
> re-opened. What is reset here is the thing that generated six rounds of
> report-driven fixes: how the states are modelled, and how every screen reads them.
>
> **The artifact gains one optional field** (the blend's composition, authored in the
> Library). Nothing else about the engine changes: a batch still carries one yeast
> selection and one authored attenuation.

## Goal

A person importing a recipe can answer three questions from the screen, in one
place, without reading prose: *what does this line still need?*, *what does this
section still need?*, *is the result on screen still true?* — and every screen
answers with the same derivation.

## What went wrong (why six iterations)

1. **The state model was never written.** The feature was built bottom-up (ledger →
   gate → delta → screens), so its states were discovered by bug report: mapped,
   ignored, unresolved, blended, dangling, open-section, blend-record-deleted,
   component-record-deleted. Each surface then hand-rolled its own condition over
   those states — header counts, section hints, row badges, findings list, footer —
   and they disagreed because the same question was computed five times.
2. **Truth is unevenly stored.** The IBU split and the yeast outcome are stored;
   "is this row decided", "is it dangling" are inferred. Every surface that infers
   invents a slightly different rule.
3. **The gate result had no lifecycle.** It was stored with no tie to the decisions it
   solved, so a solved screen could stand on a mapping that had moved (the
   `POOL_SPLIT_REQUIRED` report) or vanish without explanation.
4. **No end-to-end acceptance.** Tests were unit-shaped — readouts, regexes over
   partials. Nothing executed the flows a person walks, so the first execution of a
   flow was a bug report.
5. **The dev loop lied.** Partials are inlined at HTML transform time; a newly added
   partial needs a server restart, so "still broken" sometimes meant "stale page".
   Two cycles were spent on that ambiguity.

The rule this plan adopts: **a new state, a new message or a new control requires an
acceptance scenario first.** No more report-driven patches.

## The state model

### Row state — one per ledger line, derived once

| State | Meaning | Blocks? | Offered |
|---|---|---|---|
| `open` | destination or registry pick missing, not left out | **yes** | pick / search, leave out |
| `picked` | destination and a record that resolves | no | change pick, leave out |
| `left-out` | deliberately excluded, with a reason | no | add back |
| `proposed` | mash rest proposed, not touched | no | change rest |
| `broken` | a pick that no longer resolves | **yes** | pick another, or create it in the Library |

`dangling` stops being a check scattered through the UI: it *is* `broken`. There is no
`component` state and no blend branch anywhere in the mapping phase — a blend is an
ordinary pick (see *One kind, two faces*).

### Section state — `open` or `decided`, with an issues list

- **yeasts** open when more than one yeast line is picked and no **carrier** is
  chosen — the one yeast the batch ferments with.
- **hops** open when a whirlpool charge is picked and no IBU split is authored.
- An issue is `{ section, message, route }`; `route` names the control that resolves
  it, so the message and the fix cannot drift apart.

The carrier is a section decision, not a row state: picking a second yeast line does
not demote the first, and no row is auto-ignored. The section states the choice once,
in one picker, and the rows stay uniform with every other section.

### Record and gate state

`unchecked` · `checking` · `fresh-ok` · `fresh-blocked` · `stale`.

The record carries a **revision**, incremented by any decision (a row change, the
split, the water profile, the carrier). The gate stores the revision it solved. **A
later decision makes the result `stale`, not absent**: the check screen says the
mapping changed since it was solved and offers the press again. Discarding the result,
as the current code does, loses the evidence of *what* changed.

The only record-level yeast decision is `yeast_outcome` — *this batch ferments with
line X* (`single`) or *with this Library blend* (`blend`, a record, since a blend is
not one of the recipe's lines) — written with the choice and reconciled against the
rows on open.

## One kind, two faces

Vocabulary, as the code already uses it: a **record** belongs to a **kind** (Malt,
Yeast, Hop, Style, Equipment…); the kinds form the **catalogue**; bundled read-only
copies are **seeds**; the copy a batch takes is a **snapshot**.

A blend is a **yeast record** — same kind, same schema — with a second face:

- an optional `blend_of` on the yeast schema: the strain names it is composed of
  (names, not record ids, so a deleted strain can never break a blend);
- authored and deleted **only in the Library's CRUD**, like any other record: it
  must pre-exist before an import can pick it;
- **the import never writes the Library.** Its yeast lines pick any yeast record —
  strain or blend — exactly like a malt line picks a malt;
- the Library groups the yeast tab into *Strains* and *Blends* by that field; there is
  no second catalog kind and no second references map.

`blend_of` is the plan's only artifact change: additive, optional, and it needs the
usual re-emit (inventory, glossary if touched, docs) in the same commit. It lands in
**A2**, before any import surface is touched.

### What A3 deletes from the mapping phase

The blend panel and its fields, the duplicate-name warning, `Change`/`Unblend`, the
`createYeast` write path and its main.js wiring, the `blend` outcome mode, the
component row state, the component readouts, the "strain outside the blend" guard, and
the panel/component blocks in the map partial. Five of the old scenarios go with them.

## Acceptance scenarios (written before the surfaces)

A conformance suite drives the store, the projection and a stub gate through the flows
that keep breaking. A later report must fail one of these, not start a new iteration.

1. **One strain named and picked** → decided; the batch ferments with it; no blend or
   carrier control.
2. **Two strains picked, no carrier** → the yeasts section is open; choosing the
   carrier closes it; the other row reads *picked*, noted as not the batch's yeast.
3. **A blend record picked on a line** → behaves like any yeast pick: it can be the
   carrier, the projection uses its authored attenuation, nothing special appears.
4. **A pick's record deleted** (strain or blend) → that row is `broken`, one message,
   one action; the gate refuses.
5. **Whirlpool picked, no split** → the hops section is open; authoring the split
   closes it; the next check is fresh.
6. **Any decision after a check** → `stale`, not the previous findings.
7. **Commit** → no editing surface; the record is read-only; the batch carries one
   selection and the editor's *Imported from* names it.

Each scenario asserts the state readouts, not internals, plus the projection it
produces.

## Surface contract

- **Map** — one line per section with its state and issue; one line per row with its
  state, its single message and exactly the actions that state allows. No second
  listing of the same rows above the sections.
- **Check** — one status line (`unchecked` / `stale` / `fresh-ok` / `fresh-blocked`),
  solver findings only when fresh, plus the section issues. The press is explicit; the
  result is never inferred.
- **Editor** — *Imported from*: the imported recipe's name, the yeast outcome sentence,
  the comparison captured at commit. Read-only.
- **Vocabulary** (one word per action, everywhere): *Pick*, *Leave out* / *Add back*,
  *This batch ferments with …* (the carrier picker). The mapping phase never says
  “blend”; that word belongs to the Library.

## A vendored recipe for UI work

The two-strain prose recipe is the best exercise the mapping screens have, and it must
not live in app data — import records are deletable, batches trashable, Library records
removable. The durable copy is in git; the record is disposable.

    tests/fixtures/recipes/blend-saison/
      blend-saison.pdf     # committed, rendered once from the source below
      source.typ           # the prose source it was rendered from

No loader, no query parameter, no seed, no dev route: a developer imports the PDF
through the ordinary upload and refines the UI. Deleted the record? Import the file
again.

Two limits worth stating: the PDF path is the LLM, so it is the fixture for *eyes*, not
for assertions — the conformance suite keeps a captured payload as the same recipe's
deterministic twin; and BeerXML cannot carry a whirlpool stage, so it would not
reproduce this recipe's split. Never place the fixture in `data/seeds/` (generated
reference data) or `frontend/public/` (it would ship).

## Not in this plan

- **The text-file reader for prose recipes** (file only, LLM) is a separate future
  plan; it is a reader on the import seam, not a change to mapping.
- **The TOML recipe language** is its own plan: [`recipe-language.md`](recipe-language.md).
  It is a batch source, never an import document.

Neither is a dependency of anything below.

## Sequence

Two phases. Phase A restores a correct blend path and removes the broken one; Phase B
is the systemic fix. The order matters more than the size of any step.

**A1 — the dev loop, then freeze.** No feature work, no wording patches, no new
controls while A2–B3 are in flight. Fix the loop first: make partial edits reload in
dev (watch the partials directory, or a `make restart` verified by a build marker), so
a stale page cannot masquerade as a bug again. Commit the vendored
`blend-saison.pdf` + `source.typ` as the eyeballing fixture. *Exit:* a partial edit is
visible on reload without a restart, and the fixture imports.

**A2 — the Library blend face.** Add `blend_of` to the yeast schema, surface it in the
generated Library form, group the yeast tab into *Strains* and *Blends*, re-emit the
inventory. *Exit:* a blend created in the Library can be picked on an import yeast line,
carried, and committed. **This is the prerequisite for A3**: without it, deleting the
import's blend creation would leave no way to make a blend.

**A3 — the yeast section rework (deletion + one picker).** Delete the import blend
machinery — `saveBlend`, `createYeast` and its main.js wiring, the panel, the component
state, the blend outcome mode — and replace the per-row carrier button with the
section's carrier picker; `yeast_outcome` becomes single-only. *Exit:* two strains
picked → the section asks which one ferments; a blend record can be the carrier;
nothing in the mapping phase says “blend”.

**B1 — the state model.** Write `rowState`, `sectionState`, `gateState` and the
revision counter as pure functions, with the tables above as their specification.
The state space is final now, because A3 removed the blend states. *Exit:* unit tests
for each state and the stale transition.

**B2 — the scenarios.** The seven flows above, written beside the readouts, failing
wherever the old surfaces still disagree. *Exit:* a run that lists exactly the known
failures.

**B3 — the surfaces.** Rewrite the map, check and editor surfaces to read the three
readouts only; add the template guard that forbids composing those conditions in
markup. *Exit:* scenarios 1–7 green, guard green.

**B4 — retire the scaffolding, then the record.** Delete what the readouts replaced
(`isDangling`, the blend readouts, the findings-strip remnants), then fold the carrier
outcome and the gate revision into the import record's documented contract
(`docs/import.md` §3 and §6) and re-emit the docs.

Why this order:

- the model must describe the target system, so the feature that will not survive is
  deleted **before** the model is written (`component` is exactly the state that
  generated the confusion);
- the Library blend face unblocks that deletion, and is also the fastest route back to
  a working blend for the person importing;
- the dev-loop fix comes first, or verification of everything after it is unreliable.

## Decisions

Settled 2026-11-05:

- one kind, two faces; `blend_of` holds **names**;
- blends are authored **only** in the Library; the import never writes the Library;
- the carrier is a **section** decision (one picker), not a row action;
- `yeast_outcome` is **single** only;
- staleness keeps the last result and marks it `stale` (it is not discarded);
- a blend must pre-exist an import; the record is deletable, the fixture is not;
- sequence: A1 → A2 → A3 → B1 → B2 → B3 → B4, because the Library blend face is the
  prerequisite for removing the import's blend path, and the state model describes the
  target system rather than the transitional one.

The five row states are the model; a review of them is B1's first task, not an open
question about whether to have one.

## Non-goals

- No yeast collection and no derived blended attenuation: the engine keeps one
  selection with one authored number.
- No new Library kind; blends are yeast records.
- No solver work: the gate and solver contracts are untouched.
- No blend UI in the mapping phase, and no per-screen vocabulary.
- No text reader and no TOML language here: both are separate plans and neither
  is a dependency of this work.

## Appendix — current code this replaces

Deletion order follows the sequence: A3 removes the blend write path and the component
state; B4 removes what the readouts supersede.

- `frontend/src/store/importBlend.js` — the blend form, save, unblend, `blendAll`:
  deleted in A3; the carrier picker takes its place.
- `frontend/src/store/importYeastRows.js` — blend readouts and the blend branches of
  `sectionIssues`: reduced to the carrier outcome; the rest moves into `rowState` /
  `sectionState`.
- `frontend/src/store/importRows.js` — `isDangling` / `rowIssue` collapse into
  `rowState`.
- `frontend/src/partials/import-map.html` — the blend block, component notes and the
  row-level blend/carrier buttons: removed.
- `frontend/src/main.js` — the `createYeast` injection: removed.
- `frontend/src/store/importReview.js` — `yeast_outcome` on save stays; the blend
  fields go.
- Kept: the shared delta partial, the `batch.scale_pin` pin, the *Imported from*
  panel, the captured delta at commit.

## Verification

    make check          # lint, css, backend, hygiene — includes docs claims
    make test           # the gate: frontend + backend suites
    make quick          # the loop while iterating; never evidence of done

The docs-claims guard resolves every backticked dotted token in this plan; cite new ids
by declaring them in a `claims: proposed` comment, never by asserting them.
