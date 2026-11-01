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

- [ ] Add the six `water.mash_adjustment.*` derived nodes to `data/artifact.json`
- [ ] Allowlist the six report-only nodes in `tests/guards/artifact-consumers.test.js`
- [ ] Add strategy and mash-pH-status option labels in `frontend/src/views/registry/water.js`
- [ ] Add `boundary-telemetry(id)` to `backend/app/templates/lib/format.typ`
- [ ] Create `backend/app/templates/sections/water-chemistry.typ`
- [ ] Register `water-chemistry` in `backend/app/templates/report.typ`
- [ ] Enrich `backend/scripts/emit_report_bundle_fixture.py` with the water facts
- [ ] Run `make generate` (inventory, glossary, sections manifest/table, fixture)
- [ ] Add presence/row/telemetry probes to `tests/backend/test_report_sections.py`
- [ ] Add `water-chemistry` to the render suite section list
- [ ] Extend the fixture ledger test with the adjustment identity
- [ ] Update living docs (`typst-notes`, `domain-equations`, dosing practice, `adding-a-node`, `report-renderer`, `TODO`)
- [ ] Run `make check`
- [ ] Run `make test`
- [ ] Render `SECTIONS=water-chemistry` from the fixture and inspect
- [ ] Move this plan to `plans/archive/` and commit

## Verification

    make generate
    make report-pages BUNDLE=tests/conformance/fixtures/report-bundle.json SECTIONS=water-chemistry
    make check
    make test
