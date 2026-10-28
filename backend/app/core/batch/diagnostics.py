"""Capacity measurement and bracket diagnosis.

Measures every declared capacity limit at one candidate batch and names the
limit that makes a grist-mass bracket infeasible. The limit table itself lives
in ``app.core.errors``; this module only measures against it.
"""

from __future__ import annotations

import math

from app.core.batch.cascade import StageCascade, resolve_stage_cascade
from app.core.batch.constants import GRAIN_DISPLACEMENT_METRIC
from app.core.batch.grist import grist_mass_bracket
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


def _diagnose_bracket(
    inputs: BatchSolverInput,
    reversal: VolumetricReversal,
    yield_fraction: float,
    mc_bar: float,
    eta_conv: float,
    s_late_add: float,
) -> SolverValidationError | None:
    """Name the capacity limit that makes the bracket infeasible, if definitive.

    Evaluated at the bracket's upper bound, where the residual has the most
    extract available. If no capacity limit is exceeded there, the numerical
    failure is left untouched.
    """
    _, upper = grist_mass_bracket(
        reversal.s_post_boil_target, s_late_add, yield_fraction
    )
    if not math.isfinite(upper) or upper <= 0.0:
        return None
    try:
        cascade = resolve_stage_cascade(
            m_grist=upper,
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

    loads = _capacity_loads(inputs, reversal.v_pre_boil, upper, cascade)
    exceeded = exceeded_capacity(loads, inputs)
    if exceeded is None:
        return None
    limit, load, cap = exceeded
    return capacity_error(limit, load, cap)
