"""Capacity measurement and bracket diagnosis.

Measures every declared capacity limit at one candidate batch and names the
limit that makes a grist-mass bracket infeasible. The limit table itself lives
in ``app.core.errors``; this module only measures against it.
"""

from __future__ import annotations

import math

from app.core.batch.cascade import StageCascade, resolve_stage_cascade
from app.core.batch.constants import GRAIN_DISPLACEMENT_METRIC
from app.core.batch.grist import grist_mass_bracket, strike_ceiling_mass
from app.core.batch.hlt import hlt_top_up_target
from app.core.batch.inputs import BatchSolverInput
from app.core.batch.volumetric import VolumetricReversal
from app.core.errors import (
    CapacityLoads,
    SolverValidationError,
    capacity_error,
    exceeded_capacity,
)


def tun_peak_volume_l(
    m_grist: float,
    cascade: StageCascade,
    v_dead: float,
    displacement: float = GRAIN_DISPLACEMENT_METRIC,
) -> float:
    """Largest tun occupancy across the mash and sparge phases, in liters.

    ``V_mash = displacement * M + v_strike``; ``V_sparge = displacement * M +
    v_absorption + v_dead + v_sparge``. The binding phase changes with gravity.
    """
    mash_phase = (displacement * m_grist) + cascade.v_strike
    sparge_phase = (
        (displacement * m_grist) + cascade.v_absorption + v_dead + cascade.v_sparge
    )
    return max(mash_phase, sparge_phase)


def _capacity_loads(
    inputs: BatchSolverInput,
    v_pre_boil: float,
    m_grist: float,
    cascade: StageCascade,
) -> CapacityLoads:
    """Measure every capacity limit at one candidate batch."""
    return CapacityLoads(
        v_pre_boil=v_pre_boil,
        peak_mash_tun_l=tun_peak_volume_l(m_grist, cascade, inputs.v_dead),
        hlt_target_l=hlt_top_up_target(
            v_sparge_demand=cascade.v_sparge,
            hlt_dead_space_l=inputs.hlt_dead_space_l,
            hlt_transfer_loss_l=inputs.hlt_transfer_loss_l,
            hlt_coil_floor_l=inputs.hlt_coil_floor_l,
        ),
    )


UNREACHABLE_MESSAGE = (
    "This batch's target cannot be reached at the current mash thickness and "
    "conversion efficiency: no equipment capacity is exceeded by the minimum "
    "grist the target needs, so the limit is the extraction itself. Thicken the "
    "mash, raise the conversion efficiency, or lower the target."
)


def strike_ceiling_l(
    inputs: BatchSolverInput,
    reversal: VolumetricReversal,
    yield_fraction: float,
    mc_bar: float,
    eta_conv: float,
) -> float | None:
    """Largest grist mass the strike geometry can drain, in kg.

    The formula lives in ``grist.strike_ceiling_mass``; this wrapper supplies
    the batch inputs and the volumetric reversal. See ``domain-equations.md``
    §2.5.
    """
    return strike_ceiling_mass(
        v_pre_boil=reversal.v_pre_boil,
        intensive_value=inputs.intensive_value,
        yield_fraction=yield_fraction,
        mc_bar=mc_bar,
        eta_conv=eta_conv,
        v_dead=inputs.v_dead,
        k_abs_true=inputs.k_abs_true,
        mash_transfer_loss=inputs.mash_transfer_loss,
        topology=inputs.topology,
    )


def _ceiling_message(delivered_kg: float, demand_kg: float) -> str:
    return (
        f"This mash can deliver at most {delivered_kg:.2f} kg of malt extract; "
        f"the target needs {demand_kg:.2f} kg. Thicken the mash, raise the "
        "conversion efficiency, or lower the target."
    )


def _diagnose_bracket(
    inputs: BatchSolverInput,
    reversal: VolumetricReversal,
    yield_fraction: float,
    mc_bar: float,
    eta_conv: float,
    s_late_add: float,
    code: str,
) -> SolverValidationError | None:
    """Name the limit that makes a grist-mass bracket infeasible, if definitive.

    Evaluated at the bracket's **lower** bound: the mass the target needs at
    perfect recovery. No solve can succeed with less grist, so a capacity
    exceeded there is definitive. A capacity that fits there proves nothing, so
    it is never named — probing the upper bound instead blamed a tun that the
    batch never filled, because that bound assumes 50% recovery.

    When no capacity is exceeded, a bracket failure is the extraction limit
    itself. A proven strike ceiling raises ``STRIKE_CEILING_EXCEEDED`` with the
    masses it can deliver and the target needs; where no closed-form ceiling
    exists (``runoff_ratio``), ``BRACKET_NO_SIGN_CHANGE`` carries the unquantified
    message. ``DEGENERATE_BRACKET`` keeps its numerical message (the bracket is
    unusable, not unreachable).
    """

    def cascade_at(m_grist: float) -> StageCascade | None:
        try:
            return resolve_stage_cascade(
                m_grist=m_grist,
                v_pre_boil=reversal.v_pre_boil,
                topology=inputs.topology,
                intensive_value=inputs.intensive_value,
                yield_fraction=yield_fraction,
                mc_bar=mc_bar,
                eta_conv=eta_conv,
                v_dead=inputs.v_dead,
                delta_v_evap=inputs.delta_v_evap,
                mash_transfer_loss=inputs.mash_transfer_loss,
                k_abs_true=inputs.k_abs_true,
            )
        except SolverValidationError:
            return None

    lower, _ = grist_mass_bracket(
        reversal.s_post_boil_target, s_late_add, yield_fraction
    )
    if not math.isfinite(lower) or lower <= 0.0:
        return None
    cascade = cascade_at(lower)
    if cascade is None:
        return None

    loads = _capacity_loads(inputs, reversal.v_pre_boil, lower, cascade)
    exceeded = exceeded_capacity(loads, inputs)
    if exceeded is not None:
        limit, load, cap = exceeded
        return capacity_error(limit, load, cap)
    if code != "BRACKET_NO_SIGN_CHANGE":
        return None

    ceiling = strike_ceiling_l(inputs, reversal, yield_fraction, mc_bar, eta_conv)
    if ceiling is None or not math.isfinite(ceiling) or ceiling <= 0.0:
        return SolverValidationError("BRACKET_NO_SIGN_CHANGE", UNREACHABLE_MESSAGE)
    capped = cascade_at(ceiling)
    if capped is None:
        return SolverValidationError("BRACKET_NO_SIGN_CHANGE", UNREACHABLE_MESSAGE)

    v_drain = reversal.v_pre_boil + inputs.mash_transfer_loss
    delivered = ((capped.s_run1 + capped.s_run2) * reversal.v_pre_boil) / v_drain
    demand = reversal.s_post_boil_target - s_late_add
    if delivered < demand:
        return SolverValidationError(
            "STRIKE_CEILING_EXCEEDED", _ceiling_message(delivered, demand)
        )
    return SolverValidationError("BRACKET_NO_SIGN_CHANGE", UNREACHABLE_MESSAGE)
