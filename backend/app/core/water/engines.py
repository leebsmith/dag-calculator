"""The ADSCO optimization engines: mass-minimizing LP, least-squares cloner, sparse LP."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from scipy.optimize import linprog, minimize

from app.core.errors import SolverValidationError
from app.core.water.constants import HARD_MAGNESIUM_MAX_PPM, SALT_COEFFS
from app.core.water.salts import SaltDose, _agent_g_per_l
from app.core.water.telemetry import (
    TelemetryEvent,
    calcium_floor_unreachable,
    clone_constraint_relaxed,
    clone_weighted_compromise,
    flavor_target_below_source,
    lp_lexicographic_tie_break,
    lp_relaxation_applied,
    pinned_target_below_source,
    sparse_equalities_only,
)


def _solve_lp(c, a_eq=None, b_eq=None, a_ub=None, b_ub=None):
    """Linear programming wrapper executing HiGHS."""
    return linprog(
        c,
        A_ub=a_ub if a_ub else None,
        b_ub=b_ub if b_ub else None,
        A_eq=a_eq if a_eq else None,
        b_eq=b_eq if b_eq else None,
        bounds=[(0.0, None)] * len(c),
        method="highs",
    )


def _below_source_events(
    source: dict[str, float], target: dict[str, float], events: list[TelemetryEvent] | None
) -> None:
    if events is None:
        return
    for ion in ("so4", "cl"):
        target_ppm = target.get(ion, 0.0)
        source_ppm = source.get(ion, 0.0)
        if target_ppm < source_ppm - 1e-9:
            events.append(flavor_target_below_source(ion, target_ppm, source_ppm))


def _flavor_dose(
    need_so4: float,
    need_cl: float,
    gyp: dict[str, float],
    cacl2: dict[str, float],
) -> SaltDose:
    return SaltDose(
        gypsum_g_per_l=need_so4 / gyp["so4"] if gyp.get("so4") else 0.0,
        cacl2_g_per_l=need_cl / cacl2["cl"] if cacl2.get("cl") else 0.0,
    )


def _projected_ca(
    source_ca: float,
    flavor: SaltDose,
    gyp: dict[str, float],
    cacl2: dict[str, float],
) -> float:
    added = (
        flavor.gypsum_g_per_l * gyp.get("ca", 0.0)
        + flavor.cacl2_g_per_l * cacl2.get("ca", 0.0)
    )
    return source_ca + added


def _floor_shortfall_event(
    source_ca: float,
    flavor: SaltDose,
    gyp: dict[str, float],
    cacl2: dict[str, float],
    calcium_floor_ppm: float,
    events: list[TelemetryEvent] | None,
) -> None:
    projected = _projected_ca(source_ca, flavor, gyp, cacl2)
    if projected < calcium_floor_ppm - 1e-6 and events is not None:
        events.append(calcium_floor_unreachable(projected, calcium_floor_ppm))


def _primary_solution(
    c_primary: list[float],
    a_eq: list[list[float]],
    b_eq: list[float],
    a_ub: list[list[float]],
    b_ub: list[float],
    events: list[TelemetryEvent] | None,
):
    capped = _solve_lp(c_primary, a_eq, b_eq, a_ub, b_ub)
    if capped.success:
        return capped
    if events is not None:
        events.append(lp_relaxation_applied())
    relaxed = _solve_lp(c_primary, a_eq, b_eq, None, None)
    if not relaxed.success:
        raise SolverValidationError(
            "SALT_SOLVE_FAILED", "Salt optimization failed to find a feasible dose."
        )
    return relaxed


def _tie_broken_solution(
    x: list[float],
    opt_primary: float,
    a_eq: list[list[float]],
    b_eq: list[float],
    a_ub: list[list[float]],
    b_ub: list[float],
    c_primary: list[float],
    epsom: dict[str, float],
    nacl: dict[str, float],
    events: list[TelemetryEvent] | None,
) -> list[float]:
    tol = 1e-6
    c_secondary = [0.0, 0.0, epsom.get("mg", 0.0), nacl.get("na", 0.0)]
    secondary_ub = a_ub + [c_primary, [-v for v in c_primary]]
    secondary_bub = b_ub + [opt_primary + tol, -(opt_primary - tol)]
    secondary = _solve_lp(c_secondary, a_eq, b_eq, secondary_ub, secondary_bub)
    if not secondary.success:
        return x
    x = [max(0.0, v) for v in secondary.x]
    opt_secondary = float(secondary.fun)

    c_tertiary = [0.0, 0.0, 1.0, 1.0]
    tertiary = _solve_lp(
        c_tertiary,
        a_eq,
        b_eq,
        secondary_ub + [c_secondary, [-v for v in c_secondary]],
        secondary_bub + [opt_secondary + tol, -(opt_secondary - tol)],
    )
    if tertiary.success:
        x = [max(0.0, v) for v in tertiary.x]
        if events is not None:
            events.append(lp_lexicographic_tie_break())
    return x


def _minimal_salt_vector(
    salts: list[dict[str, float]],
    gyp: dict[str, float],
    cacl2: dict[str, float],
    epsom: dict[str, float],
    nacl: dict[str, float],
    need_so4: float,
    need_cl: float,
    calcium_cap: float,
    events: list[TelemetryEvent] | None,
) -> list[float]:
    a_eq = [
        [gyp.get("so4", 0.0), 0.0, epsom.get("so4", 0.0), 0.0],
        [0.0, cacl2.get("cl", 0.0), 0.0, nacl.get("cl", 0.0)],
    ]
    b_eq = [need_so4, need_cl]
    a_ub = [[gyp.get("ca", 0.0), cacl2.get("ca", 0.0), 0.0, 0.0]]
    b_ub = [calcium_cap]
    c_primary = [sum(s.values()) for s in salts]

    res = _primary_solution(c_primary, a_eq, b_eq, a_ub, b_ub, events)
    x = [max(0.0, val) for val in res.x]
    return _tie_broken_solution(
        x, float(res.fun), a_eq, b_eq, a_ub, b_ub, c_primary, epsom, nacl, events
    )


def _solve_linear_minimalist(
    source: dict[str, float],
    target: dict[str, float],
    coeffs: dict[str, dict[str, float]],
    calcium_floor_ppm: float,
    unbounded_ca: bool = False,
    events: list[TelemetryEvent] | None = None,
) -> SaltDose:
    """Mode 1: Linear Minimalist Engine (Mass minimization via HiGHS)."""
    gyp, cacl2, epsom, nacl = coeffs["GYPSUM"], coeffs["CACL2"], coeffs["EPSOM"], coeffs["NACL"]
    salts = [gyp, cacl2, epsom, nacl]

    need_so4 = max(0.0, target.get("so4", 0.0) - source.get("so4", 0.0))
    need_cl = max(0.0, target.get("cl", 0.0) - source.get("cl", 0.0))

    _below_source_events(source, target, events)
    flavor = _flavor_dose(need_so4, need_cl, gyp, cacl2)
    if unbounded_ca:
        # Pure unconstrained flavor dosing (Ca floats freely)
        return flavor

    source_ca = source.get("ca", 0.0)
    if source_ca < calcium_floor_ppm:
        _floor_shortfall_event(source_ca, flavor, gyp, cacl2, calcium_floor_ppm, events)
        return flavor

    # Hard source: added Ca <= max(0, floor - source)
    x = _minimal_salt_vector(
        salts,
        gyp,
        cacl2,
        epsom,
        nacl,
        need_so4,
        need_cl,
        max(0.0, calcium_floor_ppm - source_ca),
        events,
    )
    return SaltDose(
        gypsum_g_per_l=x[0],
        cacl2_g_per_l=x[1],
        epsom_g_per_l=x[2],
        nacl_g_per_l=x[3],
    )


def _solve_nonlinear_cloner(
    source: dict[str, float],
    target: dict[str, float],
    coeffs: dict[str, dict[str, float]],
    calcium_floor_ppm: float,
    events: list[TelemetryEvent],
    preferred_alkaline_agent: str = "PICKLING_LIME",
) -> SaltDose:
    """Mode 3: Non-Linear Cloner Engine (Weighted Least Squares via SLSQP)."""
    gyp, cacl2, epsom, nacl = coeffs["GYPSUM"], coeffs["CACL2"], coeffs["EPSOM"], coeffs["NACL"]
    agent = SALT_COEFFS.get(preferred_alkaline_agent, {})

    ions = ["ca", "mg", "na", "so4", "cl", "alk"]
    weights = {
        "ca": 2.0,
        "alk": 2.5,
        "so4": 1.5,
        "cl": 1.5,
        "mg": 1.0,
        "na": 0.5,
    }

    target_vec = np.array([target.get(i, source.get(i, 0.0)) for i in ions], dtype=float)
    source_vec = np.array([source.get(i, 0.0) for i in ions], dtype=float)
    w_vec = np.array([weights[i] for i in ions], dtype=float)

    # 6 ions x 5 levers [gyp, cacl2, epsom, nacl, agent]
    A_matrix = np.array([
        [gyp.get("ca", 0.0), cacl2.get("ca", 0.0), 0.0, 0.0, agent.get("ca", 0.0)],
        [0.0, 0.0, epsom.get("mg", 0.0), 0.0, agent.get("mg", 0.0)],
        [0.0, 0.0, 0.0, nacl.get("na", 0.0), agent.get("na", 0.0)],
        [gyp.get("so4", 0.0), 0.0, epsom.get("so4", 0.0), 0.0, agent.get("so4", 0.0)],
        [0.0, cacl2.get("cl", 0.0), 0.0, nacl.get("cl", 0.0), agent.get("cl", 0.0)],
        [0.0, 0.0, 0.0, 0.0, agent.get("alk", 0.0)],
    ], dtype=float)

    def objective(x):
        predicted = source_vec + A_matrix @ x
        errors = (predicted - target_vec) * w_vec
        mass_penalty = 0.05 * np.sum(x)
        return float(np.sum(errors ** 2) + mass_penalty)

    bounds = [(0.0, 5.0) for _ in range(5)]

    constraints = []
    constraints.append({
        "type": "ineq",
        "fun": lambda x: float((source_vec[0] + A_matrix[0] @ x) - calcium_floor_ppm),
    })
    constraints.append({
        "type": "ineq",
        "fun": lambda x: float(HARD_MAGNESIUM_MAX_PPM - (source_vec[1] + A_matrix[1] @ x)),
    })

    x0 = np.array([
        max(0.0, (target.get("so4", 0.0) - source.get("so4", 0.0)) / gyp.get("so4", 500.0)),
        max(0.0, (target.get("cl", 0.0) - source.get("cl", 0.0)) / cacl2.get("cl", 500.0)),
        0.0,
        0.0,
        _agent_g_per_l(source, target, preferred_alkaline_agent),
    ], dtype=float)

    res = minimize(objective, x0, method="SLSQP", bounds=bounds, constraints=constraints)

    if not res.success:
        res = minimize(objective, x0, method="SLSQP", bounds=bounds)
        events.append(clone_constraint_relaxed())

    x_opt = [max(0.0, float(v)) for v in res.x]
    final_ions = source_vec + A_matrix @ np.array(x_opt)

    ca_err = final_ions[0] - target_vec[0]
    alk_err = final_ions[5] - target_vec[5]
    na_err = final_ions[2] - target_vec[2]

    events.append(clone_weighted_compromise(ca_err, alk_err, na_err))

    return SaltDose(
        gypsum_g_per_l=x_opt[0],
        cacl2_g_per_l=x_opt[1],
        epsom_g_per_l=x_opt[2],
        nacl_g_per_l=x_opt[3],
        alkaline_agent_g_per_l=x_opt[4],
    )


def _solve_dynamic_sparse(
    source: dict[str, float],
    target: dict[str, float],
    coeffs: dict[str, dict[str, float]],
    pinned_ions: Sequence[str],
    calcium_floor_ppm: float,
    events: list[TelemetryEvent],
    preferred_alkaline_agent: str = "PICKLING_LIME",
) -> SaltDose:
    """Mode 5: Dynamic Sparse Linear Engine for custom user subsets."""
    gyp, cacl2, epsom, nacl = coeffs["GYPSUM"], coeffs["CACL2"], coeffs["EPSOM"], coeffs["NACL"]
    agent = SALT_COEFFS.get(preferred_alkaline_agent, {})
    salts = [gyp, cacl2, epsom, nacl, agent]

    pinned = list(pinned_ions)

    for ion in pinned:
        if target.get(ion, 0.0) < source.get(ion, 0.0) - 1e-9:
            events.append(
                pinned_target_below_source(ion, target.get(ion, 0.0), source.get(ion, 0.0))
            )

    a_eq = []
    b_eq = []
    for ion in pinned:
        deficit = max(0.0, target.get(ion, 0.0) - source.get(ion, 0.0))
        a_eq.append([s.get(ion, 0.0) for s in salts])
        b_eq.append(deficit)

    c_primary = [sum(s.values()) for s in salts]

    a_ub = None
    b_ub = None
    if "ca" not in pinned and source.get("ca", 0.0) < calcium_floor_ppm:
        ca_gap = calcium_floor_ppm - source.get("ca", 0.0)
        a_ub = [[-gyp.get("ca", 0.0), -cacl2.get("ca", 0.0), 0.0, 0.0, -agent.get("ca", 0.0)]]
        b_ub = [-ca_gap]

    res = _solve_lp(c_primary, a_eq, b_eq, a_ub, b_ub)
    if not res.success:
        events.append(sparse_equalities_only())
        res = _solve_lp(c_primary, a_eq, b_eq, None, None)
        if not res.success:
            count = len(pinned)
            noun = "target" if count == 1 else "targets"
            raise SolverValidationError(
                "SALT_SOLVE_FAILED",
                f"No salt dose can satisfy all {count} pinned {noun}. "
                "Unpin one ion to leave a degree of freedom, or choose a target preset.",
            )

    x = [max(0.0, val) for val in res.x]
    return SaltDose(
        gypsum_g_per_l=x[0],
        cacl2_g_per_l=x[1],
        epsom_g_per_l=x[2],
        nacl_g_per_l=x[3],
        alkaline_agent_g_per_l=x[4],
    )
