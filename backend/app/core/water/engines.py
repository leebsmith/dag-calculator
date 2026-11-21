"""The ADSCO optimization engines: lexicographic LP, least-squares cloner, sparse LP."""

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
    lp_lexicographic_tie_break,
    lp_relaxation_applied,
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


def _reject_below_source(
    source: dict[str, float], target: dict[str, float], ions: Sequence[str]
) -> None:
    """Salts only add ions: an equality below the source cannot be held."""
    short = [ion for ion in ions if target.get(ion, 0.0) < source.get(ion, 0.0) - 1e-9]
    if not short:
        return
    detail = ", ".join(
        f"{ion.upper()} {target.get(ion, 0.0):.1f} ppm against a source of "
        f"{source.get(ion, 0.0):.1f} ppm"
        for ion in short
    )
    raise SolverValidationError(
        "ION_TARGET_BELOW_SOURCE",
        f"Target below source for {detail}. Salts only add ions — raise the target "
        "or unpin it.",
    )


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


_TOL = 1e-6
_DOSE_EPSILON_G_PER_L = 1e-6


def _clean_dose(values: list[float]) -> list[float]:
    """Drop solver residue: below a microgram per litre nothing is a real dose."""
    return [0.0 if value < _DOSE_EPSILON_G_PER_L else value for value in values]


def _calcium_band_rows(
    salts: Sequence[dict[str, float]],
    source_ca: float,
    floor_ppm: float,
    ceiling_ppm: float,
) -> tuple[list[list[float]], list[float], bool]:
    """The floor is a minimum and the ceiling a maximum; salts only add ions."""
    row = [salt.get("ca", 0.0) for salt in salts]
    rows: list[list[float]] = []
    bounds: list[float] = []
    if source_ca < floor_ppm - 1e-9:
        rows.append([-value for value in row])
        bounds.append(-(floor_ppm - source_ca))
    has_ceiling = ceiling_ppm > floor_ppm + 1e-9
    if has_ceiling:
        rows.append(row)
        bounds.append(max(0.0, ceiling_ppm - source_ca))
    return rows, bounds, has_ceiling


def _dose_passes(
    salts: Sequence[dict[str, float]],
    epsom: dict[str, float],
    epsom_index: int,
) -> list[list[float]]:
    """The lexicographic order: prefer gypsum, then low magnesium, then low load."""
    prefer_gypsum = [0.0] * len(salts)
    prefer_gypsum[epsom_index] = 1.0
    prefer_low_magnesium = [0.0] * len(salts)
    prefer_low_magnesium[epsom_index] = epsom.get("mg", 0.0)
    return [prefer_gypsum, prefer_low_magnesium, [sum(s.values()) for s in salts]]


def _resolve_dose(
    passes: list[list[float]],
    a_eq: list[list[float]],
    b_eq: list[float],
    band: tuple[list[list[float]], list[float], bool],
    epsom_index: int,
    events: list[TelemetryEvent] | None,
    relax,
) -> list[float] | None:
    """Solve the passes in order, pinning each optimum before the next runs.

    The calcium band is the only soft guardrail: if it leaves the equalities
    infeasible it is dropped once, reported, and the solve continues. A dropped
    floor is reported by the caller's floor audit, so only a dropped ceiling
    raises the relaxation note here.
    """
    rows, bounds, has_ceiling = band
    reference = _solve_lp(passes[-1], a_eq, b_eq, rows or None, bounds or None)
    ub, bub = list(rows), list(bounds)
    solution: list[float] | None = None
    for weights in passes:
        result = _solve_lp(weights, a_eq, b_eq, ub or None, bub or None)
        if not result.success and ub:
            ub, bub = [], []
            if has_ceiling:
                relax()
            result = _solve_lp(weights, a_eq, b_eq, None, None)
        if not result.success:
            return None
        solution = [max(0.0, value) for value in result.x]
        optimal = float(result.fun)
        ub = ub + [weights, [-value for value in weights]]
        bub = bub + [optimal + _TOL, -(optimal - _TOL)]
    if events is not None and reference.success and solution is not None:
        saved = max(0.0, float(reference.x[epsom_index])) - solution[epsom_index]
        if saved > 1e-9:
            events.append(lp_lexicographic_tie_break(saved))
    if solution is None:
        return None
    return _clean_dose(solution)


def _minimal_salt_vector(
    salts: list[dict[str, float]],
    gyp: dict[str, float],
    cacl2: dict[str, float],
    epsom: dict[str, float],
    nacl: dict[str, float],
    need_so4: float,
    need_cl: float,
    calcium_band: tuple[float, float, float],
    events: list[TelemetryEvent] | None,
    relax,
) -> list[float] | None:
    a_eq = [
        [gyp.get("so4", 0.0), 0.0, epsom.get("so4", 0.0), 0.0],
        [0.0, cacl2.get("cl", 0.0), 0.0, nacl.get("cl", 0.0)],
    ]
    b_eq = [need_so4, need_cl]
    source_ca, floor_ppm, ceiling_ppm = calcium_band
    band = _calcium_band_rows(salts, source_ca, floor_ppm, ceiling_ppm)
    return _resolve_dose(
        _dose_passes(salts, epsom, 2), a_eq, b_eq, band, 2, events, relax
    )


def _solve_linear_minimalist(
    source: dict[str, float],
    target: dict[str, float],
    coeffs: dict[str, dict[str, float]],
    calcium_floor_ppm: float,
    calcium_ceiling_ppm: float,
    unbounded_ca: bool = False,
    events: list[TelemetryEvent] | None = None,
) -> SaltDose:
    """Mode 1: flavour equalities, then the calcium band, then the preferences."""
    gyp, cacl2, epsom, nacl = coeffs["GYPSUM"], coeffs["CACL2"], coeffs["EPSOM"], coeffs["NACL"]
    salts = [gyp, cacl2, epsom, nacl]

    need_so4 = max(0.0, target.get("so4", 0.0) - source.get("so4", 0.0))
    need_cl = max(0.0, target.get("cl", 0.0) - source.get("cl", 0.0))

    _reject_below_source(source, target, ("so4", "cl"))
    flavor = _flavor_dose(need_so4, need_cl, gyp, cacl2)
    if unbounded_ca:
        # Pure unconstrained flavor dosing (Ca floats freely)
        return flavor

    def relax() -> None:
        if events is not None:
            events.append(lp_relaxation_applied())

    source_ca = source.get("ca", 0.0)
    x = _minimal_salt_vector(
        salts,
        gyp,
        cacl2,
        epsom,
        nacl,
        need_so4,
        need_cl,
        (source_ca, calcium_floor_ppm, calcium_ceiling_ppm),
        events,
        relax,
    )
    if x is None:
        raise SolverValidationError(
            "SALT_SOLVE_FAILED", "Salt optimization failed to find a feasible dose."
        )
    final_ca = source_ca + x[0] * gyp.get("ca", 0.0) + x[1] * cacl2.get("ca", 0.0)
    if final_ca < calcium_floor_ppm - 1e-6 and events is not None:
        events.append(calcium_floor_unreachable(final_ca, calcium_floor_ppm))
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

    x_opt = _clean_dose([max(0.0, float(v)) for v in res.x])
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


def _max_reachable_calcium(
    source: dict[str, float],
    target: dict[str, float],
    salts: list[dict[str, float]],
    pinned: list[str],
) -> float | None:
    """The highest finished calcium the other pinned equalities allow.

    Used only to explain an infeasible pin set: an equality on calcium can be
    ordered above what the remaining equalities leave available.
    """
    other = [ion for ion in pinned if ion != "ca"]
    if not other:
        return None
    a_eq = [[salt.get(ion, 0.0) for salt in salts] for ion in other]
    b_eq = [max(0.0, target.get(ion, 0.0) - source.get(ion, 0.0)) for ion in other]
    res = _solve_lp([-salt.get("ca", 0.0) for salt in salts], a_eq, b_eq)
    if not res.success:
        return None
    return source.get("ca", 0.0) - float(res.fun)


def _solve_dynamic_sparse(
    source: dict[str, float],
    target: dict[str, float],
    coeffs: dict[str, dict[str, float]],
    pinned_ions: Sequence[str],
    calcium_floor_ppm: float,
    calcium_ceiling_ppm: float,
    events: list[TelemetryEvent],
    preferred_alkaline_agent: str = "PICKLING_LIME",
) -> SaltDose:
    """Mode 5: Dynamic Sparse Linear Engine for custom user subsets."""
    gyp, cacl2, epsom, nacl = coeffs["GYPSUM"], coeffs["CACL2"], coeffs["EPSOM"], coeffs["NACL"]
    agent = SALT_COEFFS.get(preferred_alkaline_agent, {})
    salts = [gyp, cacl2, epsom, nacl, agent]

    pinned = list(pinned_ions)

    _reject_below_source(source, target, pinned)

    a_eq = []
    b_eq = []
    for ion in pinned:
        deficit = max(0.0, target.get(ion, 0.0) - source.get(ion, 0.0))
        a_eq.append([s.get(ion, 0.0) for s in salts])
        b_eq.append(deficit)

    source_ca = source.get("ca", 0.0)
    if "ca" in pinned:
        band = ([], [], False)
    else:
        band = _calcium_band_rows(salts, source_ca, calcium_floor_ppm, calcium_ceiling_ppm)

    def relax() -> None:
        events.append(sparse_equalities_only())

    x = _resolve_dose(
        _dose_passes(salts, epsom, 2), a_eq, b_eq, band, 2, events, relax
    )
    if x is None:
        count = len(pinned)
        noun = "target" if count == 1 else "targets"
        detail = ""
        if "ca" in pinned:
            max_ca = _max_reachable_calcium(source, target, salts, pinned)
            if max_ca is not None:
                detail = (
                    f" The most this set can reach is {max_ca:.1f} ppm calcium "
                    f"against a pinned {target.get('ca', 0.0):.1f} ppm."
                )
        raise SolverValidationError(
            "SALT_SOLVE_FAILED",
            f"No salt dose can satisfy all {count} pinned {noun}.{detail} "
            "Unpin one ion to leave a degree of freedom, or choose a target preset.",
        )

    return SaltDose(
        gypsum_g_per_l=x[0],
        cacl2_g_per_l=x[1],
        epsom_g_per_l=x[2],
        nacl_g_per_l=x[3],
        alkaline_agent_g_per_l=x[4],
    )
