"""Phase 4: stage volume and gravity cascade.

Post-convergence cascade. Dispatches on the solver constraint topology:
``r_l_to_g`` → ``{V_pre_boil, R_L:G}``; ``runoff_ratio`` →
``{V_pre_boil, r}``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.core.batch.constants import GAMMA_METRIC, K_ABS_TRUE_METRIC, V_BAR_METRIC
from app.core.batch.helpers import (
    converted_extract,
    moisture_volume,
    retained_volume,
    solute_displacement_volume,
)
from app.core.errors import SolverValidationError


def first_runnings_volume(
    v_strike: float,
    v_mc: float,
    v_sol: float,
    v_ret: float,
) -> float:
    """Compute the first-runnings volume ``V_run1`` via the tun mass balance.

    ``V_run1 = V_strike + V_mc + V_sol - V_ret``

    See ``domain-equations.md`` §2.4.
    """
    return v_strike + v_mc + v_sol - v_ret


def second_runnings_volume(v_pre_boil: float, v_run1: float) -> float:
    """Compute the second-runnings volume ``V_run2``.

    ``V_run2 = V_pre_boil - V_run1``

    See ``domain-equations.md`` §2.4.
    """
    return v_pre_boil - v_run1


def stage_extract_split(
    s_conv: float,
    v_ret: float,
    v_strike: float,
    v_mc: float,
    v_sol: float,
    v_sparge: float,
) -> tuple[float, float]:
    """Split the converted extract into first- and second-runnings masses.

    ``R_f1 = V_ret / (V_strike + V_mc + V_sol)``
    ``R_f2 = V_ret / (V_sparge + V_ret)``
    ``S_run1 = S_conv * (1 - R_f1)``
    ``S_run2 = (S_conv * R_f1) * (1 - R_f2)``

    See ``domain-equations.md`` §2.4.
    """
    r_f1 = v_ret / (v_strike + v_mc + v_sol)
    r_f2 = v_ret / (v_sparge + v_ret)
    s_run1 = s_conv * (1.0 - r_f1)
    s_run2 = (s_conv * r_f1) * (1.0 - r_f2)
    return s_run1, s_run2


def calculate_sg_pre_boil(
    s_run1: float,
    s_run2: float,
    v_drain: float,
    gamma: float = GAMMA_METRIC,
) -> float:
    """Phase 4: assemble the consolidated pre-boil specific gravity.

    ``SG_pre_boil = 1 + ((S_run1 + S_run2) * gamma) / (1000 * V_drain)``

    The runnings leaving the tun are homogeneous, so the transfer loss holds
    wort at the same concentration; the denominator is therefore the drain
    volume, not the smaller kettle volume.

    See ``domain-equations.md`` §2.6.
    """
    return 1.0 + (((s_run1 + s_run2) * gamma) / (1000.0 * v_drain))


@dataclass(frozen=True)
class StageCascade:
    """Result of Phase 4: the post-convergence stage volumes and gravities.

    Attributes:
        v_strike: Strike volume, in liters.
        v_run1: First-runnings volume, in liters.
        v_run2: Second-runnings volume, in liters.
        v_sparge: Sparge volume, in liters.
        v_absorption: Grain absorption volume (``k_abs_true * m_grist``), in
            liters. Part of ``V_ret`` along with ``v_dead``.
        v_mc: Grain moisture volume, in liters.
        v_sol: Dissolved-extract displacement volume, in liters.
        s_run1: First-runnings extract mass, in kg.
        s_run2: Second-runnings extract mass, in kg.
        sg_pre_boil: Consolidated pre-boil specific gravity.
        v_post_boil: Hot-side post-boil kettle volume, in liters.
        mash_thickness_l_per_kg: Resolved liquor-to-grist ratio, in L/kg.
            Under the ``r_l_to_g`` topology this is the input ``R_L:G``
            verbatim. Under the ``runoff_ratio`` topology it is derived as
            ``V_strike / M_grist``, since the runoff-ratio topology reverses
            ``V_strike`` from the tun mass balance rather than taking it as an
            input. This is the value the Mash Card reads to derive strike
            water temperature (design record Q3/Q12).
    """

    v_strike: float
    v_run1: float
    v_run2: float
    v_sparge: float
    v_absorption: float
    v_mc: float
    v_sol: float
    s_run1: float
    s_run2: float
    sg_pre_boil: float
    v_post_boil: float
    mash_thickness_l_per_kg: float


def resolve_stage_cascade(
    m_grist: float,
    v_pre_boil: float,
    topology: str,
    intensive_value: float,
    yield_fraction: float,
    mc_bar: float,
    eta_conv: float,
    v_dead: float,
    delta_v_evap: float,
    mash_transfer_loss: float = 0.0,
    k_abs_true: float = K_ABS_TRUE_METRIC,
    v_bar: float = V_BAR_METRIC,
    gamma: float = GAMMA_METRIC,
) -> StageCascade:
    """Phase 4: cascade stage volumes and gravities post-convergence.

    Dispatches on ``topology``:

    * ``"r_l_to_g"``: ``V_strike = R_L:G * M_grist``; ``V_run1`` from the tun
      mass balance; ``V_run2 = V_sparge = V_drain - V_run1``.
    * ``"runoff_ratio"``: ``V_sparge = V_run2 = V_drain / (r + 1)``;
      ``V_run1 = V_drain - V_run2``; ``V_strike`` is reversed from the tun
      mass balance to absorb retention.

    ``V_drain = V_pre_boil + mash_transfer_loss``: the mash tun must drain the
    kettle target plus the volume retained in its transfer hose/pump, per
    ``domain-equations.md`` §2.6.

    Args:
        m_grist: Converged dry grist mass, in kg (from Phase 3).
        v_pre_boil: Derived pre-boil kettle volume, in liters (from Phase 2).
        topology: Either ``"r_l_to_g"`` or ``"runoff_ratio"``.
        intensive_value: ``R_L:G`` (L/kg) or ``r`` (dimensionless), matching
            ``topology``.
        yield_fraction: Composite dry-basis yield fraction ``E``.
        mc_bar: Composite moisture fraction ``MC_bar``.
        eta_conv: Mash conversion efficiency as a fraction.
        v_dead: Mash tun dead space, in liters.
        delta_v_evap: Boil-off evaporation volume, in liters.
        mash_transfer_loss: Mash tun transfer (hose/pump) loss, in liters.
        k_abs_true: True husk absorption coefficient, in L/kg.
        v_bar: Apparent specific volume of dissolved extract, in L/kg.
        gamma: Gravity-points conversion constant, in GU·L/kg.

    Returns:
        A frozen ``StageCascade`` with the derived volumes and gravities.

    Raises:
        SolverValidationError: If ``topology`` is unknown or the intensive
            value is non-positive.

    See ``domain-equations.md`` §2.5.
    """
    if topology not in ("r_l_to_g", "runoff_ratio"):
        raise SolverValidationError(
            "UNKNOWN_TOPOLOGY",
            f"Unknown constraint topology: {topology!r}.",
        )
    if not math.isfinite(intensive_value) or intensive_value <= 0.0:
        raise SolverValidationError(
            "INVALID_INTENSIVE_VALUE",
            (
                f"Intensive constraint must be positive and finite; got "
                f"{intensive_value}."
            ),
        )
    if topology == "r_l_to_g" and intensive_value < k_abs_true:
        raise SolverValidationError(
            "MASH_TOO_THIN",
            (
                f"Liquor-to-grist ratio ({intensive_value:.2f} L/kg) is below "
                f"the husk absorption floor ({k_abs_true} L/kg). The "
                f"grain bed would retain more liquid than the strike provides."
            ),
        )

    v_mc = moisture_volume(m_grist, mc_bar)
    s_conv = converted_extract(m_grist, yield_fraction, eta_conv)
    v_sol = solute_displacement_volume(s_conv, v_bar)
    v_ret = retained_volume(m_grist, k_abs_true, v_dead)
    v_absorption = k_abs_true * m_grist
    v_drain = v_pre_boil + mash_transfer_loss

    if topology == "r_l_to_g":
        v_strike = intensive_value * m_grist
        v_run1 = first_runnings_volume(v_strike, v_mc, v_sol, v_ret)
        v_run2 = second_runnings_volume(v_drain, v_run1)
        v_sparge = v_run2
    else:  # "runoff_ratio"
        v_sparge = v_drain / (intensive_value + 1.0)
        v_run2 = v_sparge
        v_run1 = v_drain - v_run2
        # Reverse the tun mass balance to absorb retention and displacement.
        v_strike = v_run1 + v_ret - v_mc - v_sol

    # Physical realizability gate: the strike water must be sufficient to
    # wet the grain bed. If V_run1 <= 0, the grain absorbed more liquid than
    # the strike provided, which means the mash thickness is below the
    # physical floor for this grist mass. This is a user-input error (too
    # thin a mash), not a numerical failure, so it surfaces as a typed
    # validation error rather than a silent negative volume.
    if v_run1 <= 0.0:
        raise SolverValidationError(
            "MASH_TOO_THIN",
            (
                f"Strike water ({v_strike:.2f} L) is insufficient to wet the "
                f"grain bed (retained {v_ret:.2f} L). Increase the mash "
                f"thickness (R_L:G) or reduce the grist mass."
            ),
        )

    s_run1, s_run2 = stage_extract_split(
        s_conv=s_conv,
        v_ret=v_ret,
        v_strike=v_strike,
        v_mc=v_mc,
        v_sol=v_sol,
        v_sparge=v_sparge,
    )
    sg_pre_boil = calculate_sg_pre_boil(s_run1, s_run2, v_drain, gamma)

    # Hot-side kettle balance: V_post_boil_hot = V_pre_boil - delta_v_evap.
    # (Late-addition displacement is not yet modeled on the hot side; when it
    # is, add ``+ v_bar * s_late_add`` here and thread ``s_late_add`` through.)
    v_post_boil = v_pre_boil - delta_v_evap

    # Resolved liquor-to-grist ratio. Under ``r_l_to_g`` the input *is* the
    # ratio. Under ``runoff_ratio`` the ratio is an output: the topology
    # reverses V_strike from the tun mass balance, so the effective thickness
    # is V_strike / M_grist. Guard against a zero grist mass (which the Phase 3
    # bracket already excludes, but the cascade is also callable standalone).
    if topology == "r_l_to_g":
        mash_thickness_l_per_kg = intensive_value
    elif m_grist > 0.0:
        mash_thickness_l_per_kg = v_strike / m_grist
    else:
        mash_thickness_l_per_kg = 0.0

    # In the runoff topology the strike is reverse-derived from the split, so a
    # sub-absorption strike never appears as negative runnings; it appears only
    # as a derived thickness below the bed's absorption capacity.
    if topology == "runoff_ratio" and mash_thickness_l_per_kg < k_abs_true:
        raise SolverValidationError(
            "MASH_TOO_THIN",
            (
                f"Derived mash thickness ({mash_thickness_l_per_kg:.2f} L/kg) "
                f"is below the husk absorption floor ({k_abs_true} L/kg). The "
                f"strike water cannot wet the grain bed."
            ),
        )

    return StageCascade(
        v_strike=v_strike,
        v_run1=v_run1,
        v_run2=v_run2,
        v_sparge=v_sparge,
        v_absorption=v_absorption,
        v_mc=v_mc,
        v_sol=v_sol,
        s_run1=s_run1,
        s_run2=s_run2,
        sg_pre_boil=sg_pre_boil,
        v_post_boil=v_post_boil,
        mash_thickness_l_per_kg=mash_thickness_l_per_kg,
    )
