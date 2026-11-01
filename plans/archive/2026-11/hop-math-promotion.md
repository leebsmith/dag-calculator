# Hop-math promotion — spike findings

Status: superseded. The production path is now the sealed backend boundary
`solver.hops` (`backend/app/core/hop_solver.py`), chosen to avoid adding
`exp`/`ln`/quadrature to the artifact grammar. The JavaScript
`views/whirlpool.js` / `views/hops.js` copies remain only as the offline stub.
This document is retained as the spike record; the options and acceptance
criteria below are historical.

## Objective

Artifact-owned calculations:

- Newton cooling `T(t) = T_amb + (T0 − T_amb)·exp(−k·t)`
- Arrhenius relative rate `U_rel(T) = 2.39e11·exp(−9773/T)`
- Effective boiling-equivalent time `t_eff = ∫ U_rel(T(τ)) dτ`
- Tinseth utilization and IBU/mass back-calculation
- Product-form utilization scalars

The hop card should read derived nodes/functions; no duplicate physics in host
code. Reference vectors stay in `docs/whirlpool-hopping-model.md` and
`tests/frontend/whirlpool.test.js`.

## Spike findings

The artifact grammar currently supports `+ - * / neg pow` and comparisons, but
**not `exp` or `ln`**. It also has no numerical integration or root-finding
primitive. `effectiveWhirlpoolMinutes` is adaptive Simpson quadrature to
`1e-10`; it cannot be expressed in the current expression grammar.

Consequences:

- Cooling and Arrhenius rate need an `exp` operator.
- Tinseth time factor needs `exp`.
- Effective minutes need either a built-in deterministic quadrature primitive
  or a host/boundary-supplied value.
- `whirlpoolMassKg` back-calculation adds no new primitive requirement once
  utilization exists.

## Options

1. **Extend the artifact language.** Add `exp`/`ln` and a deterministic
   `quadrature` (or `integral`) primitive to the AST/validation/units layer.
   Bump `schema_version`, re-emit inventory, and add parity fixtures. This is
   the only option that fully meets the objective.
2. **Partial promotion.** Move cooling, utilization, IBU, and mass algebra into
   artifact functions; keep `t_eff` host-side as an input. Lower risk, but the
   objective is only partly met.
3. **Boundary solver.** Add a whirlpool boundary with Python/JS parity. More
   correct for integration, but introduces I/O for a deterministic readout.

Recommendation: option 1, preceded by a small grammar design for
`quadrature` (fixed adaptive implementation, no host callbacks). Until then,
`views/whirlpool.js` and `views/hops.js` remain host-side and are listed in
`docs/adding-a-node.md`.

## Acceptance criteria for completion

- All constants and formulas above are artifact-declared.
- `views/whirlpool.js` contains no physics; only formatting/card wiring.
- `t_eff` and IBU/mass are derived nodes or artifact function calls.
- Reference vectors match the existing `docs/whirlpool-hopping-model.md` values.
- `schema_version`, inventory, unit/dimension checks, and docs are updated.
- Host-side table no longer lists whirlpool/Tinseth.
