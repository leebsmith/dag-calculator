"""Salt-dosing orchestrator: resolve the caller's strategy to one per-litre dose."""

from __future__ import annotations

from collections.abc import Sequence

from app.core.errors import SolverValidationError
from app.core.water.constants import DEFAULT_CALCIUM_CEILING_PPM
from app.core.water.engines import (
    _solve_dynamic_sparse,
    _solve_linear_minimalist,
    _solve_nonlinear_cloner,
)
from app.core.water.router import resolve_strategy
from app.core.water.salts import SaltDose, _agent_g_per_l, _salt_ion_coeffs
from app.core.water.telemetry import (
    TelemetryEvent,
    derive_findings,
    router_mode_1_linear_flavor,
    router_mode_2_hybrid_buffer,
    router_mode_3_nonlinear_clone,
    router_mode_4_baseline_only,
    router_mode_5_custom_sparse,
)


def solve_salt_dose(
    strategy: str,
    source: dict[str, float],
    target: dict[str, float],
    gypsum_form: str,
    cacl2_form: str,
    calcium_floor_ppm: float,
    calcium_ceiling_ppm: float = DEFAULT_CALCIUM_CEILING_PPM,
    custom_pinned_ions: Sequence[str] = (),
    preferred_alkaline_agent: str = "PICKLING_LIME",
    events: list[TelemetryEvent] | None = None,
) -> tuple[SaltDose, list[str], str]:
    """Resolve salt additions using the appropriate ADSCO engine.

    Returns the dose, this call's note findings (projected from the events it
    emitted), and the canonical strategy.
    """
    evs = events if events is not None else []
    start = len(evs)
    coeffs = _salt_ion_coeffs(gypsum_form, cacl2_form)

    canonical = resolve_strategy(strategy)

    if canonical == "CUSTOM" and not custom_pinned_ions:
        raise SolverValidationError(
            "PINNED_IONS_REQUIRED",
            "Custom mode requires at least one pinned ion; pin one to four ions or choose another mode.",
        )

    if canonical == "BASELINE":
        evs.append(router_mode_4_baseline_only())
        return SaltDose(), derive_findings(evs[start:])[1], canonical

    if canonical in ("CALCIUM_FLOOR", "FLAVOR"):
        evs.append(router_mode_1_linear_flavor())
        dose = _solve_linear_minimalist(
            source,
            target,
            coeffs,
            calcium_floor_ppm,
            calcium_ceiling_ppm,
            unbounded_ca=(canonical == "FLAVOR"),
            events=evs,
        )
        return dose, derive_findings(evs[start:])[1], canonical

    if canonical == "HYBRID":
        evs.append(router_mode_2_hybrid_buffer(preferred_alkaline_agent))
        dose = _solve_linear_minimalist(
            source,
            target,
            coeffs,
            calcium_floor_ppm,
            calcium_ceiling_ppm,
            unbounded_ca=False,
            events=evs,
        )
        dose = SaltDose(
            gypsum_g_per_l=dose.gypsum_g_per_l,
            cacl2_g_per_l=dose.cacl2_g_per_l,
            epsom_g_per_l=dose.epsom_g_per_l,
            nacl_g_per_l=dose.nacl_g_per_l,
            alkaline_agent_g_per_l=_agent_g_per_l(source, target, preferred_alkaline_agent),
        )
        return dose, derive_findings(evs[start:])[1], canonical

    if canonical == "OPTIMIZE":
        evs.append(router_mode_3_nonlinear_clone())
        dose = _solve_nonlinear_cloner(
            source, target, coeffs, calcium_floor_ppm, evs, preferred_alkaline_agent
        )
        return dose, derive_findings(evs[start:])[1], canonical

    # CUSTOM
    evs.append(router_mode_5_custom_sparse(custom_pinned_ions))
    dose = _solve_dynamic_sparse(
        source,
        target,
        coeffs,
        custom_pinned_ions,
        calcium_floor_ppm,
        calcium_ceiling_ppm,
        evs,
        preferred_alkaline_agent,
    )
    return dose, derive_findings(evs[start:])[1], canonical
