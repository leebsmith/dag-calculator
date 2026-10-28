"""HLT water budget.

The HLT holds water, not wort, so this budget never enters the extract mass
balance. It constrains how much liquor the HLT can deliver as sparge water.
See ``domain-equations.md`` §2.6.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.errors import CAPACITY_BY_CONSTRAINT, capacity_error


@dataclass(frozen=True)
class HltWaterBudget:
    """Result of the HLT water budget.

    Attributes:
        v_hlt_debt: Permanently undeliverable HLT volume, in liters
            (``hlt_dead_space_l + hlt_transfer_loss_l``).
        v_hlt_after_strike: HLT volume after drawing the strike water, in
            liters.
        v_hlt_top_up: Liquor added to the HLT before the sparge, in liters.
        v_sparge_deliverable: Sparge volume actually deliverable to the mash
            tun, in liters.
        v_hlt_required: Liquor the HLT must hold before the sparge, in liters
            (``v_sparge_demand + v_hlt_debt``).
        v_hlt_target: The top-up target, in liters — the larger of the coil
            floor and ``v_hlt_required``.
    """

    v_hlt_debt: float
    v_hlt_after_strike: float
    v_hlt_top_up: float
    v_sparge_deliverable: float
    v_hlt_required: float
    v_hlt_target: float


def hlt_top_up_target(
    v_sparge_demand: float,
    hlt_dead_space_l: float,
    hlt_transfer_loss_l: float,
    hlt_coil_floor_l: float,
) -> float:
    """Liquor the HLT must hold before the sparge, in liters.

    ``V_hlt_target = max(hlt_coil_floor_l, V_sparge_demand + V_hlt_debt)``

    See ``domain-equations.md`` §2.6.
    """
    v_hlt_debt = hlt_dead_space_l + hlt_transfer_loss_l
    return max(hlt_coil_floor_l, v_sparge_demand + v_hlt_debt)


def resolve_hlt_water_budget(
    hlt_starting_volume_l: float,
    v_strike_drawn: float,
    v_sparge_demand: float,
    hlt_dead_space_l: float,
    hlt_transfer_loss_l: float,
    hlt_coil_floor_l: float,
    max_hlt_volume_l: float,
) -> HltWaterBudget:
    """Resolve the HLT water budget for a single batch-sparge brew day.

    The HLT must satisfy two conditions before the sparge:

    1. The coil must be covered: ``V_hlt_after_strike >= hlt_coil_floor_l``.
    2. There must be enough deliverable liquor to sparge:
       ``V_hlt_after_strike - V_hlt_debt >= V_sparge_demand``.

    The top-up target is the larger of the two requirements:

    ``V_hlt_required = V_sparge_demand + V_hlt_debt``
    ``V_hlt_target   = max(hlt_coil_floor_l, V_hlt_required)``
    ``V_hlt_top_up   = max(0, V_hlt_target - V_hlt_after_strike)``

    Args:
        hlt_starting_volume_l: Liquor in the HLT at brew-day start, in liters.
        v_strike_drawn: Strike water drawn from the HLT, in liters.
        v_sparge_demand: Sparge volume required by the cascade, in liters.
        hlt_dead_space_l: Liquor trapped below the HLT drain port, in liters.
        hlt_transfer_loss_l: Liquor held in the HLT hose and pump, in liters.
        hlt_coil_floor_l: Minimum volume to submerge the HERMS coil, in liters.
        max_hlt_volume_l: Maximum HLT capacity, in liters.

    Returns:
        A frozen ``HltWaterBudget`` with the derived HLT volumes.

    Raises:
        SolverValidationError: If the top-up target exceeds the HLT's maximum
            capacity (``HLT_TOO_SMALL``).

    See ``domain-equations.md`` §2.6.
    """
    v_hlt_debt = hlt_dead_space_l + hlt_transfer_loss_l
    v_hlt_after_strike = hlt_starting_volume_l - v_strike_drawn

    v_hlt_required = v_sparge_demand + v_hlt_debt
    v_hlt_target = hlt_top_up_target(
        v_sparge_demand, hlt_dead_space_l, hlt_transfer_loss_l, hlt_coil_floor_l
    )

    hlt_limit = CAPACITY_BY_CONSTRAINT["hlt"]
    if v_hlt_target > max_hlt_volume_l:
        raise capacity_error(hlt_limit, v_hlt_target, max_hlt_volume_l)

    v_hlt_top_up = max(0.0, v_hlt_target - v_hlt_after_strike)
    v_sparge_deliverable = v_hlt_after_strike + v_hlt_top_up - v_hlt_debt

    return HltWaterBudget(
        v_hlt_debt=v_hlt_debt,
        v_hlt_after_strike=v_hlt_after_strike,
        v_hlt_top_up=v_hlt_top_up,
        v_sparge_deliverable=v_sparge_deliverable,
        v_hlt_required=v_hlt_required,
        v_hlt_target=v_hlt_target,
    )
