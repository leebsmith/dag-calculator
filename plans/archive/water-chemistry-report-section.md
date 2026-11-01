# Water chemistry report section

Add a `water-chemistry` report section that prints the source report, the selected
target profile plus resolved solver strategy, an ion table (source / objective /
net adjustment / treated-mash final), the predicted mash pH, and the water
solver's telemetry.

## Decisions

- Final Water = `solver.water.post_dose_mash_ions.*` (treated mash).
- Adjustment = final − source, frozen as six `water.mash_adjustment.*` derived
  artifact nodes.
- Telemetry = every `solver.water` event, ordered ERROR → WARNING → NOTE → INFO.
- Section order: after `liquor-ledger`, before `limits`.

## Checklist

- [x] Add the six `water.mash_adjustment.*` derived nodes to `data/artifact.json`
- [x] Allowlist the six report-only nodes in `tests/guards/artifact-consumers.test.js`
- [x] Add strategy and mash-pH-status option labels in `frontend/src/views/registry/water.js`
- [x] Add `boundary-telemetry(id)` to `backend/app/templates/lib/format.typ`
- [x] Create `backend/app/templates/sections/water-chemistry.typ`
- [x] Register `water-chemistry` in `backend/app/templates/report.typ`
- [x] Enrich `backend/scripts/emit_report_bundle_fixture.py` with the water facts
- [x] Run `make generate` (inventory, glossary, sections manifest/table, fixture)
- [x] Add presence/row/telemetry probes to `tests/backend/test_report_sections.py`
- [x] Add `water-chemistry` to the render suite section list
- [x] Extend the fixture ledger test with the adjustment identity
- [x] Update living docs (`typst-notes`, `domain-equations`, dosing practice, `adding-a-node`, `report-renderer`, `TODO`)
- [x] Run `make check`
- [x] Run `make test`
- [x] Render `SECTIONS=water-chemistry` from the fixture and inspect
- [x] Move this plan to `plans/archive/` and commit

## Verification

    make generate
    make report-pages BUNDLE=tests/conformance/fixtures/report-bundle.json SECTIONS=water-chemistry
    make check
    make test
