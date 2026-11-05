---
title: Recipe language — a hand-authored TOML source
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [recipe-import, mapping-plans]
status: proposed
---

# Recipe language — a hand-authored TOML source

> **Status.** Separate from [`mapping-plans.md`](mapping-plans.md): that plan fixes the
> import flow's states; this one adds a **source a person writes**. No LLM, no document
> reader, no generic interchange format — a file for this app, read deterministically.

## Goal

A brewer can write a recipe as one text file, commit it like code, and open it as a
draft batch in the editor — with the app doing what the app already does: normalising
parts, solving masses from the targets, and reporting drift. The file is a **batch
source**, not a document awaiting interpretation.

## Settled decisions

- **App-only.** The grammar mirrors this app's inputs, not a universal recipe model.
  Where the app has no home for a line, the file has an `unmodeled` list; nothing is
  silently dropped.
- **TOML.* The backend already runs Python 3.12, whose standard library has
  `tomllib`, so the format costs **no dependency**. JSON is the internal canonical
  form (never authored). YAML is rejected: it needs a new dependency on either side and
  its type system has to be legislated away (the `1.050`, `NO`, anchor and merge
  problems).
- **Deterministic parse, no model.** Grammar, completeness and resolvability are
  checked offline with line-numbers. Nothing in this path calls an LLM.
- **A batch source, not an import document.** The loader produces a batch state
  (roots, collections, selections) and creates a draft; it does **not** enter the
  import ledger. The editor's own solve is the first report.
- **Quoted gravities.** Numbers cannot keep a trailing zero, so a gravity is a string
  with a suffix key: `og_sg = "1.052"` or `og_plato = "12.5"`. Exactly one form per
  target.
- **Canonical units.** Litres, kilograms, Celsius, minutes, SG/Plato, IBU, SRM. No
  dual-unit keys; display conversion is the editor's job. This keeps the loader a
  table lookup instead of a conversion engine.
- **`unknown` is explicit.** Omission means "not stated"; a `stated = false` marker is
  available where a distinction matters. Zero is never a stand-in for absence.
- **No derived values.** Realized FG/ABV, solved masses, solved IBU, efficiency and
  `pct` are not expressible; the app owns them.

## What the file may state

The rule is one column per **authored** field, and nothing from the derived side
(grounded in the artifact's own item schemas):

| Section | The file states | The app derives |
|---|---|---|
| major grist | relative **parts** per fermentable | `pct` (Hamilton), mass, extract |
| sugar | **mass** (the app authors mass here) | parts, extract |
| trace malt | **mass** | colour contribution |
| boil / whirlpool hops | **parts** + minutes + alpha + form | boil fraction, mass from the IBU target |
| dry hops | **mass** | nothing — authored, not solved |
| yeast | one record **name** (a strain or a blend) | attenuation, FG, ABV |
| water | source record + target profile | salt prescription |
| identity | style, equipment, water source records | conformance, losses, evaporation |
| batch | volume, the target(s) you care about, **`scale_pin`** | the pin is honoured; the rest are outcomes |
| process | mash rests (seed names) with temp/time, boil time | everything downstream |

Because grist and hop numbers are relative, the file is **scale-free**: the same file
at 19 L or 23 L, at any efficiency, produces the same proportions and different masses.

**Targets**: `og`, `fg`, `abv`, `ibu`, `srm` may all be stated; `scale_pin` is
**required** and names the one the solve honours. A non-pin target is an expectation
and is reported as drift, exactly as the editor already reports it.

**Names, not ids.** Ingredients and identity records are referenced by the name the
Library displays, resolved against the registry with a **hard fail** on zero or
multiple matches, naming the line and the fix (*“create it in the Library”*). Inline
ingredient specs are not accepted: the registry is the one truth for yield, colour,
attenuation and form.

## Profile and grammar rules

- `schema = 1` at the top; unknown keys are errors (closed schema), not warnings.
- Rows are arrays of tables — one `[[fermentable]]`, `[[hop]]`, `[[mash_rest]]`,
  `[[unmodeled]]` block per row; order is the schedule order.
- Duplicate keys are parse errors (`tomllib` rejects them), which is the point.
- No inline tables for rows, no dotted-key tricks: one fact per line, so diffs read
  per addition.
- Every key is unit-suffixed where a unit exists (`volume_l`, `mass_kg`, `temp_c`,
  `minutes`, `alpha_pct`), so a number is never ambiguous.
- Gravity keys carry their basis (`og_sg`, `og_plato`); percentages that are ratios
  are plain relative numbers, labelled as parts by their key (`parts`).
- Optional provenance for a file transcribed by hand from a magazine:
  `page = 42` and `as_written = "..."` per row. Never required.

Sketch of the shape (not the full key list):

    schema = 1
    [batch]
    name = "Saison + Brett"
    style = "Saison"
    equipment = "HERMS 30L"
    water_source = "Ward 2024"
    water_target = "Belgian Saison"
    volume_l = 23
    scale_pin = "og"
    og_sg = "1.052"
    ibu = 30
    boil_time_min = 60
    whirlpool_ibu_fraction = 0.2

    [[fermentable]]
    name = "Pilsner Malt"
    parts = 85
    [[fermentable]]
    name = "Flaked Wheat"
    parts = 10

    [[hop]]
    variety = "Saaz"
    parts = 60
    at_min = 60
    alpha_pct = 3.2
    use = "boil"

    [yeast]
    name = "Blend: Saison + Brett"

    [[mash_rest]]
    rest = "beta_amylase"
    temp_c = 63
    minutes = 40

    [[unmodeled]]
    text = "1 tsp Irish moss, 15 min"

## The loader

One pure pipeline, each stage separately testable:

1. **Parse** with `tomllib`; a syntax error is reported with its line.
2. **Validate** the closed schema, required keys, unit suffixes, quoted gravities,
   `scale_pin`, and the absence of derived keys.
3. **Resolve** every record name against the registry; fail closed and name the line.
4. **Project** to a batch state: parts kept authored, `pct` normalised once, rows
   completed with the same defaults the editor's builders use, identity snapshotted.
5. **Create** the draft and open the editor. No import record is written, no ledger is
   built, no gate is pre-run.

## Acceptance scenarios

1. **A complete file loads** into a draft batch; the editor solves with no blocking
   findings; masses derive from parts, volume, efficiency and the pinned target.
2. **Scale-free**: the same file at 19 L and 23 L keeps every part identical and scales
   the masses proportionally.
3. **An unknown record name** fails the load with the line, the name, and *“create it
   in the Library”*.
4. **An ambiguous name** (two Library records sharing a display name) fails the same
   way, listing both ids.
5. **A derived key** (`realized_abv`, a solved hop mass, `pct`) is rejected as an
   unknown key.
6. **A missing `scale_pin`** is rejected; a non-pin target is accepted and reported as
   drift after the solve.
7. **An unquoted gravity** (`og_sg = 1.052`) is rejected with the fix in the message.
8. **A blend** is expressed by naming a blend record; a file that names two yeasts is
   rejected — the batch ferments with one.
9. **An unmodeled line** is preserved and shown, not dropped.

## Sequence

**Step 1 — grammar and example corpus.** Write the closed key set as a document plus
three example files (minimal, full, deliberately broken). *Exit:* a reviewable grammar
before any parser.

**Step 2 — the loader.** Parse, validate, resolve, project — with the nine scenarios as
tests, all offline. *Exit:* the loader suite green; a broken file always fails with a
line and an action.

**Step 3 — the seam.** “From a recipe file” in the new-batch flow, backend parse, errors
rendered against the file, then a draft batch in the editor. *Exit:* scenario 1 end to
end by hand.

**Step 4 — docs and fixtures.** A section in `docs/import.md` (or its own page) plus the
corpus in `tests/fixtures/recipes/`.

**Step 5 — optional round-trip.** Export an existing batch to the same TOML. Only after
the loader has been in use; it must be byte-stable for diffs.

## Open decisions

1. **Mash rests by seed name** (`beta_amylase`) versus by temperature alone — I recommend
   name + temp/time, since the app's rest model is a fixed set of eight.
2. **Identity records are mandatory** (style, equipment, water source) because a batch
   cannot be created without them — confirm that a file without them should fail rather
   than prompt.
3. Whether the first release accepts a water **target profile name** only, or explicit
   ion targets as well. I recommend name-only; ions are a later dialect.

## Non-goals

- No LLM parsing, no prose reader, no YAML or JSON authoring face.
- No generic interchange: BeerXML import/export stays its own path.
- No inline ingredient specifications (registry truth only).
- No derived values, no unit alternatives, no implicit typing.
- No change to the artifact beyond what `mapping-plans.md` already schedules
  (`blend_of`).

## Verification

    make check          # lint, css, backend, hygiene — includes docs claims
    make test           # the gate: frontend + backend suites
    make quick          # the loop while iterating; never evidence of done

The docs-claims guard resolves every backticked dotted token in this plan; cite new ids
by declaring them in a `claims: proposed` comment, never by asserting them.
