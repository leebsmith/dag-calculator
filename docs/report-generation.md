# Report Generation

## Relevant `make` commands

Two report targets, both take BUNDLE (required), SECTIONS (optional), and PAPER (optional):

`make report-dev — live PDF`

`make report-dev BUNDLE=tests/conformance/fixtures/report-bundle.json`

```
make report-dev BUNDLE=~/Downloads/house-pale-report-bundle.json \
  SECTIONS=volume-ledger \
  PAPER=letter
```
  
- Copies the bundle to .local/report/report.json
- typst watch → .local/report/report.pdf, rebuilds on every template save
- Refuses to run if typst --version ≠ the pinned 0.15.1
- Compiles with --font-path backend/app/templates/fonts --ignore-system-fonts

`make report-pages — one-shot PNGs`

`make report-pages BUNDLE=tests/conformance/fixtures/report-bundle.json`

`make report-pages BUNDLE=tests/conformance/fixtures/report-bundle.json SECTIONS=volume-ledger`

`make report-pages BUNDLE=… PAPER=a4`

- Writes .local/report/page-{1..n}.png and lists them
- Same font flags; no version check

## Variables


|Variable|Values|Default|
|--------|------|-------|
|BUNDLE|path to a report-bundle.json (fixture or downloaded)|— required|
|SECTIONS|comma-separated ids, e.g. volume-ledger|empty = all registered
|PAPER|auto, a4, letter|auto (US customary units → Letter, else A4)|

`make help` prints the report-dev line and its options. Outputs live in .local/report/ (gitignored).

## Required / Produced Files

## Shape of ReportsBundle

### Top level

```
{
  "bundle_format": 4,                    // literal discriminator
  "artifact":   { … },                   // whole artifact as of freeze
  "catalog":    { … },                   // presentation metadata for every exposed path
  "formatted":  { … },                   // per-path display strings (the only display source)
  "formatted_tables": { … },             // per-row cells for collection tables
  "batch":      { … },                   // identity + freeze header
  "state":      { … },                   // the solved batch
  "conformance": { … } | null,           // style adherence at freeze
  "validation": { … },                   // captured relation/domain outcome
  "telemetry":  { … },                   // per solved boundary
  "content_hash": "sha256:…"             // canonical hash of everything above
}
```

Models are extra="forbid" and frozen: unknown fields are rejected, not ignored.

### Blocks

```
"artifact": {
  "schema_version": 9,
  "hash": "sha256:…",
  "content": { … }                       // free-form; trusted by hash, engine-validated
}

"catalog": {
  "hash": "sha256:…",
  "dimensions": {
    "<dimension>": { "base_unit": "L", "kind": "linear|affine|nonlinear|identity",
                     "units": { "gal": { "factor": 3.785… }, … } }
  },
  "nodes": {
    "<dotted path>": {
      "label": "Strike volume",
      "dimension": "volume" | null,
      "unit": "L",                       // conversion handle
      "symbol": "L",                     // display suffix (required when unit is set)
      "decimals": 1,
      "step": null,
      "options": ["…"] | null,           // taxonomy values
      "option_labels": { "value": "Label" } | null
    }
  }
}

"formatted": {
  "<path>": { "text": "12.4 °P", "number": "12.4", "unit": "°P" }
}

"batch": {
  "id": "frozen-1",
  "name": "House Pale",
  "status": "draft | frozen",
  "frozen_at": 1700000000.0 | null,      // epoch seconds
  "parent_batch_id": "draft-1" | null,
  "identity": {                          // exactly the three component snapshots
    "equipment": { … },
    "water.source": { … },
    "style": { … }
  }
}

"state": {
  "valuation":   { "<node id>": value, "<boundary id>": { "cascade.v_strike": …, … } },
  "roots":       { "<root id>": value },          // authored roots only
  "collections": { "<collection id>": [ { …row }, … ] },
  "selections":  { "<component>": { … } | null },
  "provenance":  { "<component>": { "source_template_id": "…" } }
}

"validation": {
  "relations": [ … ], "domains": [ … ],
  "field_domains": [ … ], "collection_domains": [ … ]
}

"telemetry": {
  "<boundary node id>": {
    "binding": "batch_sparge_solver",
    "fingerprint": "sha256:…",
    "telemetry": [ … ], "warnings": [ … ], "notes": [ … ]
  }
}

```

Invariants the schema enforces

- bundle_format == 3; content_hash must equal the canonical hash of everything else (recomputed by ReportBundle.seal()).
- state.valuation keys must be declared artifact nodes; boundary nodes carry a flattened output map (cascade.v_strike, hlt.v_hlt_debt).
- catalog.dimensions must be declared in the artifact; batch.identity namespaces must be declared.
- Every catalog.nodes[path] must resolve: exact node, longest node prefix + boundary output / selection / collection field, or longest identity namespace + schema field.
- Any catalog entry with unit must also carry symbol.
- formatted keys must name catalog paths, and a unit-bearing path must carry the number/unit split.
- formatted_tables keys must name collection nodes; cells are display strings.
- Collection state keys must be collection nodes with a known item schema; values are lists of objects.
- The catalog must cover the solved state: every valuation entry and every one-level row/output key needs a catalog path.
- Telemetry keys must be boundary nodes with a matching binding, must be solved, and never be orphaned.

Path resolution (for consumers)

|Path form|Lives in|
|---------|--------|
|batch.v_ferm|state.valuation["batch.v_ferm"]|
|solver.batch.cascade.v_strike|state.valuation["solver.batch"]["cascade.v_strike"]|
|mash.rests.0.use_temp_c|valuation array → row field|
|batch.yeast.attenuation_pct|valuation (or state.selections["batch.yeast"])|
|equipment.max_hlt_volume_l|batch.identity.equipment.max_hlt_volume_l|
|style.og_min|batch.identity.style.og_min|


## File Locations and Contents

All report templates live under backend/app/templates/:

```
backend/app/templates/
  report.typ              entry point: spec resolution, chrome, section registry
  theme.typ               page setup (paper, margins, footer), type, headings
  lib/
    bundle.typ            loads report.json from --input bundle
    format.typ            path lookup, identity fallback, unit conversion, display
  sections/               ← one module per section
    volume-ledger.typ     the only section today
  fonts/
    IBMPlexSans[wdth,wght].ttf
    IBMPlexSans-Italic[wdth,wght].ttf
    OFL.txt
    README.md
  TYPST_VERSION           pins 0.15.1
```

There's one file per section in the report:

`sections/<id>.typ`, where the filename equals the section id. Each module exports two zero-argument functions:

|Export|Contract|
|------|--------|
|present-<id>()|true only when the section’s data is in the bundle (you may name it anything, the registry decides)|
|render-<id>()|the section body, without the heading|

Registration is not auto-discovered. A section needs two edits in report.typ:

```
// beside the other imports, ABOVE the registry markers
#import "sections/volume-ledger.typ": present-volume-ledger, render-volume-ledger
```

```
// inside the registry markers, in canonical render order
#let sections = (
  (id: "volume-ledger", title: "Volume Ledger", present: present-volume-ledger, render: render-volume-ledger),
)
```

The title comes from the registry, not the module. scripts/report-sections.mjs + tests/guards/report-sections-sync.test.js enforce one entry per file, one file per entry, filename = id, unique ids, and a declared presence predicate; docs/report-sections.md is generated from that same literal.

There is one shared title/identity chrome in report.typ and page styling in theme.typ — sections only contribute their own body.

## Shadowing the Repo Environment for Development

The shadow needs:
- a real sections/ directory containing symlinks to the real sections plus your new files, and
- a copy of report.typ with the extra import + registry line.

Shadow layout (inside the repo, so it stays within the documented root)

```
.local/report-dev/
  report.typ                    # copy of the real one + dev entries
  theme.typ -> ../../../backend/app/templates/theme.typ
  lib       -> ../../../backend/app/templates/lib
  fonts     -> ../../../backend/app/templates/fonts
  sections/
    volume-ledger.typ -> ../../../../backend/app/templates/sections/volume-ledger.typ
    draft-section.typ           # real dev file
```
    
report.typ in the shadow gets:

```
#import "sections/draft-section.typ": present-draft-section, render-draft-section
#let sections = (
  (id: "volume-ledger", …),
  (id: "draft-section", title: "Draft", present: present-draft-section, render: render-draft-section),
)
```

Compile from the repo root:

```
typst watch --root . \
  --font-path backend/app/templates/fonts --ignore-system-fonts \
  --input bundle=/.local/report/report.json \
  --input sections=draft-section \
  .local/report-dev/report.typ .local/report-dev/dev.pdf
```
