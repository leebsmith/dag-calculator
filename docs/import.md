# Import — a document becomes a draft

A user uploads a recipe from a magazine, a competition sheet or a BeerXML file,
reads the transcription, maps it onto this calculator's vocabulary, and commits it
as an ordinary draft batch. The document itself is never stored.

This is the living contract for that path. `plans/recipe-import.md` is the
decision record; the artifact is untouched by any of it.

## 1. Two readers, one payload

| Input | Reader | Notes |
|---|---|---|
| PDF | Gemini Flash, one call | reads the document as rendered pages, so a scan works |
| BeerXML | the standard library's XML parser | deterministic, offline, free, reproducible |

Both produce the same `ExtractionPayload` (plus a `SourceMeta` provenance header),
and everything downstream — ledger, gate, commit — is shared. A reader never
decides what a value *means*; it transcribes, and the provenance header names which reader
produced the record (`llm` or `beerxml`).

The extraction never converts, rounds or derives: masses stay in their printed
units, gravity keeps its printed form (`sg`, `plato` or `points`), temperatures
keep their scale. Conversion is the mapping layer's job, once, where it can be
reviewed.

## 2. The extraction payload

- `document_type`: `recipe`, `spec_sheet`, `article` or `unknown`.
- `quantity_form`: `mass`, `percent`, `prose`, `none` or `unknown`.
- `targets`: growths the page states, each with its phrase and page.
- `fermentables`, `hops`, `yeasts`, `mashes`: typed rows, verbatim plus page.
- `unmodeled`: every quantity-bearing line with no home in the model.
- `warnings`: contradictions and ambiguities the reader noticed.

The two labels narrate; they never decide. Missing batch volume is a completable
defaults gap, not a failure — a recipe stays a recipe when it is unquantified.

## 3. The ledger

One row per transcribed line, carrying `destination`, `ref`, `transform` and
`decision` (`mapped` / `ignored` with a reason / `unresolved`). Commit is refused
while any row is unresolved.

Proposals are arithmetic, not taste:

- a fermentable is a **trace malt** when its share of the bill is under 2 %
  (recorded per import), because trace rows are mass and are never scaled;
- hop stage decides the pool, and a hop can be moved between pools without losing
  the variety chosen for it;
- a mash step takes the rest whose temperature band contains it — narrowest band
  first — proposed and marked as a proposal until touched.

A pool is a destination, not a decision: every hop row still needs its variety
picked, dry hops included, so each pane carries the same chips and library search
as a row in the flat list. A hop switched off the model stays visible in its own
"not modelled" group with the reason, and can be undone.

Ignoring is never a deletion. An ignored line stays visible with its reason and a
way back: putting it back re-derives the destination the page's own evidence
supports (a print stage routes a hop, a share proposes a trace malt) and returns the
row unresolved until a registry entry is chosen. Where a section offers only one
destination — yeast, mash rests — the row shows that destination as a label instead
of a one-option menu.

A record deleted from the Library after it was picked leaves no silent hole. The
line reads as undecided again and says so on the row, the projection drops it, and
a stale id never reaches a boundary. The row's own search — or, on a yeast line, its
blend form — replaces it in place; a correction is a new record, as everywhere else
in the Library. Rows carry the name they were picked by, so a deleted record still
reads as a name rather than an id.

Every row states its own problem; there is no second listing of the same lines
above the sections. The header counts what is left, the row says what it needs, and
the Check screen repeats only what a solver found.

One limit belongs to the model rather than the page: a batch carries a single yeast
selection (`batch.yeast`). The yeasts section is therefore a **slot**, not a list of
decisions: it shows which strain ferments the batch, and every other strain the page
named sits under it marked `not in this batch — the batch ferments with <strain>`.
Picking a different one is `Ferment with this`; the note on the dropped strain is
how the immutable record keeps the blend legible instead of silently dropping it.

A blend that must drive the numbers is one Library yeast record, and the row can
create it in place: a name and the attenuation the pair finishes at, saved through
the same store the Library uses, then made the batch's strain in the same press.
Nothing about a blend is a special kind of yeast.

A blend that must *drive the numbers* is a Library yeast record, not a second
selection: one record named for the blend, carrying the attenuation the user
states it finishes at. That is the same inversion as efficiency — the tool derives
what the model can derive and refuses to invent a number it cannot. The record's
name is the blend's identity in the batch and in the report; no field is added for
it, and the artifact gains no text dimension it does not have. Either strain's line
can carry that record: pick it on the kept line, or put the other line back and pick
it there, and the strain that is dropped records the record's name in its reason.

The collection form — more than one yeast row, with pitch-share parts and a derived
blended attenuation — is deferred: a weighted mean is not co-pitch physics, and a
sequential pitch makes attenuation time-dependent, so it would present an authored
guess as a derived value. The revisit trigger is written down in `TODO.md`.

`parts` is the authored column; `pct` is normalised once per collection by the
existing Hamilton rule. A mapped row's catalog fields come from the registry, never
from the page.

## 4. The whirlpool split

A source rarely says how much bitterness the whirlpool carries, and a zero is not
neutral: it would put the whole budget in the boil while whirlpool charges solve a
zero mass.

1. Printed per-addition IBUs, when present, give the split exactly.
2. Otherwise the whirlpool rows' alpha-mass share is offered as an estimate.
3. Otherwise the user authors it. The chosen value and its provenance
   (`printed`, `estimated`, `authored`) are stored on the record.

A missing split blocks the check (`POOL_SPLIT_REQUIRED`).

## 5. Mapping aids

L0 uses the user's own accepted mappings from earlier imports; L1 is a pure string
screen over the live seeds and library records; L2 is one batched model call per
catalog kind, choosing from candidates the client supplied. The screening reads the
app's own reference cache — seeds merged with the user's Library records — so a
record authored a moment ago (the blend yeast the finding creates, a house malt) is
a candidate straight away, and the gate resolves the same set the commit will load. L2 output is frozen on
the record so reopening the mapping neither re-calls nor reshuffles, and the local
screen is the fallback when the call fails. Nothing preselects.

The three stages are a sequence and say so — step 1 transcribe, step 2 map, step 3
check and create — because "check" is otherwise read as a verb that might repeat
rather than the last step before a batch exists.

Saving the map is its forward action: with every line decided the same press opens
the check, and an incomplete map saves and stays, with the footer counting what is
left. Reopening a record whose status is mapping lands on the map rather than at the
transcription it already passed. Landing on the check does not run it — the gate is
still an explicit press, because it costs solver calls.

## 6. The gate

An explicit press, because it costs solver calls. The projected candidate is solved
by the same boundary runner the editor uses, so a gate result and a live result
cannot disagree.

- **Blocking**: a failed batch or hop boundary, a violated blocking relation, any
  unresolved line (a line pointing at a deleted record is one), and the hop-routing
  findings above.
- **Advisory**: the water boundary. It runs against the user's own target profile,
  and is skipped (with a finding saying so) when no profile is chosen.

The Map stage names every undecided line under its count and marks each of those
rows, so the notice and the lines it refers to cannot drift apart.

The delta table compares what the page stated with what this rig solves, per target
and per line: solved grist mass, solved hop mass per pool, and the ratio between
them. Where a mass is authored rather than solved (dry hops), the table says so.

The projection pins `batch.scale_pin` to `og` and `batch.v_ferm` to the page's
volume, so the *grist* is what moves to meet the source: pinned to ABV instead, the
solver would scale the bill toward a strength the mapped yeast cannot reach and the
table would compare two different beers. FG and ABV are therefore outcomes, not
targets — they follow the strain's attenuation, which is the consistency test the
target row reports.

Every cell is printed at its dimension's precision in the page's own unit (SG to
three places, ABV to one, gallons as gallons), so a gravity difference reads as
`+0.022 SG` rather than a solver's full float. A unit this rig cannot convert leaves
the solved value in base units and withholds the difference instead of subtracting
across units.

## 7. Commit and the record

Commit projects the ledger into roots, collections and selections through the
editor's own row builders, creates the draft, and marks the record `committed` with
its `batch_id`. Identity-derived roots are seeded by the session, not by the
projection, so that rule has one implementation.

A committed record is immutable and undeletable: it is the batch's audit trail. A
document that cannot become a batch is retained as `failed` with its reason, so the
same file is never paid for twice; the duplicate check reports that state instead of
offering a dead-end resume.

Records live at `users/{uid}/recipe_imports` and hold the extraction, the ledger,
the frozen suggestions, the split decision and the failure reason — never the
document.

## 8. Out of scope

- **Basis-aware quantities.** A brewhouse sheet stating `kg/10 hL` is transcribed
  with its basis visible but not converted: those lines go to `unmodeled` and the
  review says so. Revisit when per-volume documents are common, or when the blocked
  rows are the grist rather than trace, sugar and dry-hop masses.
- **Scanned documents** are read as images by the model but get no text-layer
  check, so nothing verifies their numbers mechanically.
- **Water treatment** is the user's own: the source's salts and acid are captured
  as unmodelled lines and never mapped.
