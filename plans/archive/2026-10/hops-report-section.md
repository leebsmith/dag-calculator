# Hops in the report — one section, four groups, IBU splits

Status: **landed**. W1–W5 are in: the dev watcher, the boundary split, the four
share nodes, the section with its tables and splits, and the hop-bearing golden
bundle.

## Problem

The report has no hops. The bundle carries the solved hop rows and masses, but no
section reads them: a printed recipe lists its grist and its sugars and omits the
one bill the brewer weighs at the kettle.

Two smaller facts block the obvious fix:

1. The bundle's integrity rules key `formatted_tables` to **collection** nodes and
   `formatted_summaries` to a collection or the literal `"overall"`, and a summary
   carries only `color` / `extract_yield`. Hop figures therefore cannot ride in a
   summary; they are plain `formatted` paths, which must resolve to catalog nodes.
2. A split percentage is a ratio of two nodes, so it has no `formatted` path
   unless the artifact declares it. The hot/cool split is worse: the IBU each
   whirlpool charge carries is solved inside the boundary.

A separate, unrelated failure surfaced while reviewing the first: the backend
caches `data/artifact.json` per process and `local-dev` only watches `app/`, so an
artifact edit leaves a running dev server validating new valuations against the
old graph (`BundleIntegrityError: valuation names undeclared nodes`).

## Decisions

- **The split lives in the boundary.** `solver.hops` gains `whirlpool_hot_ibu` and
  `whirlpool_cool_ibu`, summed over the whirlpool rows it already solves by that
  row's `initial_temp_c`. The threshold is a solver module constant, like
  `TINSETH_FACTOR`; the artifact cannot hold it without an expression consuming it.
- **The shares are artifact nodes**, guarded against a zero denominator:
  boil and whirlpool shares of the total target, and hot and cool shares of the
  whirlpool target. They are host-read presentation values, so they join
  `HOST_NODES` in the consumers guard rather than a step manifest.
- **No bundle schema change.** Hop group summary lines print
  `formatted-text(...)` of catalog paths (`batch.boil_target_ibu`,
  `solver.hops.boil_mass_kg`, …), the way Batch Facts prints Modeled Metrics. The
  three hop tables key `formatted_tables` by their collection nodes. The splits
  print their node values. Nothing in Typst does arithmetic.
- **One new section**, `hops`, after `batch-facts`: Boil Hops, Whirlpool Hops
  (with the muted ambient/cooling note), Dry Hops, IBU Splits, Overall Hops.
  Groups follow the card: boil and whirlpool are solved, dry hops are descriptive
  and carry no IBU.
- **The dev watcher watches `data/`**, so an artifact or seed regeneration
  restarts the backend instead of serving a stale cache.
- **The golden bundle carries hops**: 1 oz Magnum in the boil, two whirlpool
  charges straddling the threshold, one dry charge — so the hot/cool split has
  both branches rather than 100 / 0.

## Workstreams

### W1 — the dev loop

`scripts/local-dev.mjs`.

- Add `--reload-dir ../data` to the uvicorn spawn, with a comment naming the
  per-process artifact cache as the reason.

### W2 — the split, above the boundary

`data/artifact.json`, `backend/app/schemas/boundary.py`,
`backend/app/core/hop_solver.py`, `frontend/src/views/registry/hops.js`,
`tests/backend/test_hop_solver.py`, `tests/guards/artifact-consumers.test.js`.

- `HopSolverResponse` and `HopSolverResult` gain the two outputs; `solve_hops`
  sums the whirlpool rows by `initial_temp_c` against the threshold.
- The artifact declares both outputs (`ibu`) and the four share nodes
  (`percentage`), each a guarded division.
- `HOP_NODES` names the outputs; `HOST_NODES` names the shares.
- A solver test with one hot and one cool charge asserts both branches and that
  they add up to the whirlpool target.

### W3 — the hop tables and the section

`frontend/src/views/producer/reportFormat.js`,
`backend/app/templates/report.typ`,
`backend/app/templates/sections/hops.typ` (new),
`backend/app/templates/sections.json`, `docs/report-sections.md`.

- `buildReportTables` gains `batch.boil_hops`, `batch.whirlpool_hops` and
  `batch.dry_hops`, joining the authored rows to the solved boundary rows by
  index (the card's `mergeBoilRows` is the precedent) and formatting each cell
  through the catalog entry for the node or row field it came from.
- `hops.typ` mirrors `batch-facts.typ`: a `hop-table(collection, columns)` helper,
  a heading per group, muted notes, modelled-metrics-style summary lines, and the
  split lines reading the share and IBU nodes.
- `present-hops` is true when any hop table or `solver.hops.total_mass_kg` is
  present, so a batch with no hops renders nothing.

### W4 — the golden bundle

`backend/scripts/emit_report_bundle_fixture.py`.

- Add the three hop collections to `state.collections`, the solved rows and the
  new outputs to the valuation, the hop row fields to the catalog, and the three
  tables plus the scalar `formatted` entries to the payload.
- Regenerate with `make generate`; the bundle hash moves.

### W5 — tests and docs

`tests/backend/test_report_sections.py`, `tests/backend/test_report_render.py`,
`tests/frontend/report-format.test.js`, `docs/hops/whirlpool-hopping-model.md`,
`docs/report-renderer.md`, `TODO.md`.

- The expected section list gains `hops`; a render smoke covers the section alone.
- `report-format` asserts the three tables' columns and the split scalar paths.
- The whirlpool model doc gains the split, its threshold and the four shares; the
  renderer doc's section table is regenerated.

## Verification

`make check`, `make test` (the artifact change makes it a full-suite run), and
`make verify`. Regenerated output: the inventory, the glossary, the source
manifest, the section list and the bundle fixture.
