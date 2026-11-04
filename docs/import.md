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
catalog kind, choosing from candidates the client supplied. L2 output is frozen on
the record so reopening the mapping neither re-calls nor reshuffles, and the local
screen is the fallback when the call fails. Nothing preselects.

## 6. The gate

An explicit press, because it costs solver calls. The projected candidate is solved
by the same boundary runner the editor uses, so a gate result and a live result
cannot disagree.

- **Blocking**: a failed batch or hop boundary, a violated blocking relation, any
  unresolved line, and the hop-routing findings above.
- **Advisory**: the water boundary. It runs against the user's own target profile,
  and is skipped (with a finding saying so) when no profile is chosen.

The Map stage names every undecided line under its count and marks each of those
rows, so the notice and the lines it refers to cannot drift apart.

The delta table compares what the page stated with what this rig solves, per target
and per line: solved grist mass, solved hop mass per pool, and the ratio between
them. Where a mass is authored rather than solved (dry hops), the table says so.

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
