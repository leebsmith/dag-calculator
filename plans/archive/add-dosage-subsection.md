# Add dosage subsection

Add a Treatment Dosage subsection to the `water-chemistry` report: nonzero mash
and sparge salt/acid/alkaline doses, split by destination, with the selected
hydrate/acid forms and salt distribution.

## Decisions

- Nonzero additions only (matches the water card).
- Split Mash / Sparge blocks, each with its dose-volume context.
- Include the hydrate/acid/distribution basis note.
- Retire the queued standalone salt-dosing section.

## Checklist

- [x] Add `water-output`, `nonzero`, `dose-rows`, and `dose-table` helpers to `backend/app/templates/sections/water-chemistry.typ`
- [x] Add the Treatment Dosage block and split the section into chemistry / dosage / telemetry blocks
- [x] Enrich `backend/scripts/emit_report_bundle_fixture.py` with dose volumes, choice labels, and the 16 addition outputs
- [x] Regenerate `tests/conformance/fixtures/report-bundle.json`
- [x] Add dosage presence and nonzero-row assertions to `tests/backend/test_report_sections.py`
- [x] Extend the fixture ledger test with the flavor-salt total
- [x] Update living docs (`TODO`, `report-renderer`, dosing practice, `typst-notes`)
- [x] Run `make check`
- [x] Run `make test`
- [x] Render `SECTIONS=water-chemistry` from the fixture and inspect
- [x] Move this plan to `plans/archive/` and commit

## Verification

    cd backend && PYTHONPATH=. uv run python scripts/emit_report_bundle_fixture.py
    make report-pages BUNDLE=tests/conformance/fixtures/report-bundle.json SECTIONS=water-chemistry
    make check
    make test
