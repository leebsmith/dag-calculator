# ADSCO — Adaptive Dual-Strategy Constrained Optimizer

External design specifications for the water-chemistry solver replacement.

**Status:** locked for the first pass, pending usability testing.

**Provenance:** vendored verbatim from `/junk/new-solver` on 2026-10-22.

These are *design inputs*, not the artifact's living spec. The artifact remains
the source of truth; `docs/dag-artifacts/` stays authoritative for what the
engine actually interprets. Where these specs and the artifact disagree during
integration, the divergence is resolved explicitly in `plans/adsco-contract.md`
and reflected back into `docs/dag-artifacts/` in the same commit.

## Files

| Vendored path | Source file |
| --- | --- |
| `boundary-deltas.md` | `adsco_boundary_deltas_specification.md` |
| `style-selection-and-ion-entry.md` | `style_selection_and_ion_entry_requirements.md` |
| `required-solver-telemetry-messages.md` | `required_solver_telemetry_messages.md` |
| `ion-limits-for-brewing.md` | `ion-limits-for-brewing.md` |
| `reference/adsco_core_water_chemistry_solver.py` | `adsco_core_water_chemistry_solver.py` |

The table above is **frozen provenance**: those files are design inputs and are
not edited. The operative layer is:

| File | Role |
| --- | --- |
| `plans/adsco-contract.md` | reconciled decisions; supersedes the vendored specs where they diverge |
| `ui.md` | reconciled UI model (grid vocabulary, pin modal, picker labels) |

## Notes

- `ui.md` is not vendored: it is the reconciled UI model and is maintained with
  the implementation.
- `reference/adsco_core_water_chemistry_solver.py` is a **non-imported snapshot**.
  It is not the implementation and is not executed by tests. The production core
  will live in `backend/app/core/water.py`.
- The reference solver is a first pass; several capabilities it advertises are
  not fully realized (Mode 2/3 alkalinity, sparse targets, boundary telemetry).
  See `plans/adsco-contract.md` for the reconciled contract.
