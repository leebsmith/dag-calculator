"""Physical constants and the late-addition extract rule.

Metric standards; the provenance of each value is in its own note.
"""

from __future__ import annotations

import math

from app.core.errors import SolverValidationError

GAMMA_METRIC: float = 385.641
"""Gravity-points conversion constant in GU·L/kg.

Equals the frontend ``SUCROSE_YIELD_LDK``; both derive from sucrose
``46.21`` ppg scaled by the gal→L / lb→kg conversion
(``46.21 × 3.785411784 / 0.45359237 ≈ 385.641``).
"""

V_BAR_METRIC: float = 0.625
"""Apparent specific volume of dissolved extract in L/kg."""

K_ABS_TRUE_METRIC: float = 1.043176
"""True husk absorption coefficient in L/kg (Palmer baseline, 0.125 gal/lb).

The per-rig ``equipment.grain_absorption_factor_l_per_kg`` is authoritative;
this constant is the fallback when no rig value is supplied.
"""

GRAIN_DISPLACEMENT_METRIC: float = 0.667632
"""Grain displacement in L/kg (Palmer, 0.32 qt/lb).

Used only for capacity diagnostics; it never enters the extract mass balance.
"""

RHO_WATER_METRIC: float = 1.00
"""Density of water at strike temperature in kg/L."""

F_SHRINK_DEFAULT: float = 0.04
"""Thermal contraction coefficient (dimensionless)."""

ETHANOL_DENSITY_METRIC: float = 0.7907
"""Density of ethanol relative to water at 20 °C (matches ``ethanol_density``)."""

SUGAR_FERMENTABILITY: float = 1.0
"""Fermentable share of late-addition (sugar) extract.

Late additions reach the kettle as dissolved sugar; the artifact's sugar prior
is 1.000. Held as a parameter so a future per-row sugar F can be threaded.
"""


def sugar_extract_for(
    sugar_extract_share: float,
    extract_total_kg: float,
    dose_kg: float,
) -> float:
    """Resolve the late-addition extract mass for a candidate batch.

    ``0`` is the dose sentinel: the caller's ``s_late_add`` is authoritative.
    A positive share is the sugar's fraction of total post-boil extract, so the
    mass moves with the candidate gravity and the solver has no host iteration.

    Raises:
        SolverValidationError: If the share is non-finite, negative, or ``>= 1``
            (a malt-free wort has no capacity constraint to solve against).
    """
    if sugar_extract_share == 0.0:
        return dose_kg
    if (
        not math.isfinite(sugar_extract_share)
        or sugar_extract_share < 0.0
        or sugar_extract_share >= 1.0
    ):
        raise SolverValidationError(
            "INVALID_SUGAR_SHARE",
            (
                "Sugar extract share must be in [0, 1); got "
                f"{sugar_extract_share}."
            ),
        )
    return sugar_extract_share * extract_total_kg
