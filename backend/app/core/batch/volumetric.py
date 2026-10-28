"""Phase 2: volumetric reversal and extract targeting.

Kettle mechanics reversed against the application's fermenter volume, plus the
post-boil extract split between malt and late addition.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.batch.constants import (
    F_SHRINK_DEFAULT,
    GAMMA_METRIC,
    V_BAR_METRIC,
    sugar_extract_for,
)
from app.core.errors import SolverValidationError


@dataclass(frozen=True)
class VolumetricReversal:
    """Result of Phase 2: the derived solver-side anchors.

    Attributes:
        v_kettle_cold: Cold kettle volume at 20 °C, in liters.
        s_post_boil_target: Required post-boil extract mass, in kg.
        v_pre_boil: Derived pre-boil kettle volume, in liters.
    """

    v_kettle_cold: float
    s_post_boil_target: float
    v_pre_boil: float


def kettle_cold_volume(
    v_ferm: float, v_kettle_dead: float, f_shrink: float
) -> float:
    """Compute the cold kettle volume ``V_kettle_cold``.

    ``V_kettle_cold = V_ferm + V_kettle_dead * (1 - f_shrink)``

    See ``domain-equations.md`` §2.5.
    """
    return v_ferm + (v_kettle_dead * (1.0 - f_shrink))


def post_boil_extract_target(
    sg_post_boil: float, v_kettle_cold: float, gamma: float
) -> float:
    """Compute the required post-boil extract mass ``S_post_boil_target``.

    ``S_post_boil_target = 1000 * (SG_post_boil - 1) * V_kettle_cold / gamma``

    See ``domain-equations.md`` §2.5.
    """
    return (1000.0 * (sg_post_boil - 1.0) * v_kettle_cold) / gamma


@dataclass(frozen=True)
class ExtractSplit:
    """Post-boil extract target divided into malt and late-addition shares."""

    extract_total_kg: float
    sugar_extract_kg: float

    @property
    def malt_extract_kg(self) -> float:
        """Malt extract available to the grain bill, in kg."""
        return self.extract_total_kg - self.sugar_extract_kg


def resolve_extract_split(
    sg_post_boil: float,
    v_kettle_cold: float,
    sugar_extract_share: float,
    s_late_add: float,
    gamma: float = GAMMA_METRIC,
) -> ExtractSplit:
    """Derive the post-boil extract target and the late-addition share.

    A zero share keeps the fixed ``s_late_add`` dose; a positive share moves the
    sugar mass with the candidate gravity.

    Raises:
        SolverValidationError: If the share is outside ``[0, 1)``
            (``INVALID_SUGAR_SHARE``).
    """
    extract_total = post_boil_extract_target(sg_post_boil, v_kettle_cold, gamma)
    sugar = sugar_extract_for(sugar_extract_share, extract_total, s_late_add)
    return ExtractSplit(extract_total_kg=extract_total, sugar_extract_kg=sugar)


def require_malt_extract(split: ExtractSplit) -> None:
    """Gate a split that leaves no malt extract to solve against.

    Raises:
        SolverValidationError: When the late addition alone covers the target
            (``EXTRACT_TARGET_NON_POSITIVE``).
    """
    if split.malt_extract_kg <= 0.0:
        raise SolverValidationError(
            "EXTRACT_TARGET_NON_POSITIVE",
            (
                f"Post-boil extract target ({split.extract_total_kg:.4f} kg) must "
                f"exceed late-addition extract ({split.sugar_extract_kg:.4f} kg)."
            ),
        )


def pre_boil_volume(
    v_ferm: float,
    v_kettle_dead: float,
    v_kettle_transfer: float,
    v_trub: float,
    delta_v_evap: float,
    s_late_add: float,
    v_bar: float,
    f_shrink: float,
) -> float:
    """Compute the derived pre-boil kettle volume ``V_pre_boil``.

    ``V_pre_boil = (V_ferm + V_kettle_dead + V_kettle_transfer + V_trub)
                   / (1 - f_shrink) + delta_v_evap - v_bar * S_late_add``

    The cold-side additive losses (kettle dead space, kettle transfer loss,
    trub) are added to ``V_ferm`` before the shrinkage is reversed, per
    ``domain-equations.md`` §2.6 (shrink the entire hot volume, then
    subtract the additive losses).

    See ``domain-equations.md`` §2.5.
    """
    return (
        ((v_ferm + v_kettle_dead + v_kettle_transfer + v_trub) / (1.0 - f_shrink))
        + delta_v_evap
        - (v_bar * s_late_add)
    )


def resolve_volumetric_reversal(
    v_ferm: float,
    sg_post_boil: float,
    v_kettle_dead: float,
    delta_v_evap: float,
    s_late_add: float,
    v_kettle_transfer: float = 0.0,
    v_trub: float = 0.0,
    f_shrink: float = F_SHRINK_DEFAULT,
    v_bar: float = V_BAR_METRIC,
    gamma: float = GAMMA_METRIC,
) -> VolumetricReversal:
    """Phase 2: reverse kettle mechanics to derive the solver-side anchors.

    Bridges the application input state (``V_ferm``) to the solver constraint
    topology (``V_pre_boil``), and computes the post-boil extract target.

    Args:
        v_ferm: Target cold fermenter volume, in liters.
        sg_post_boil: Post-boil specific gravity (20 °C reference) from Phase 1.
        v_kettle_dead: Unrecoverable kettle/chiller dead space, in liters.
        v_kettle_transfer: Kettle/chiller transfer loss, in liters.
        v_trub: Kettle trub loss, in liters.
        delta_v_evap: Calibrated kettle boil-off volume, in liters.
        s_late_add: Late-addition extract mass, in kg.
        f_shrink: Thermal contraction coefficient (default 4%).
        v_bar: Apparent specific volume of dissolved extract, in L/kg.
        gamma: Gravity-points conversion constant, in GU·L/kg.

    Returns:
        A frozen ``VolumetricReversal`` with the derived anchors.

    Raises:
        SolverValidationError: If ``v_ferm`` is non-positive, ``f_shrink`` is
            outside ``[0, 1)``, or the extract target is not strictly greater
            than the late-addition extract mass.

    See ``domain-equations.md`` §2.5.
    """
    if v_ferm <= 0:
        raise SolverValidationError(
            "INVALID_FERM_VOLUME",
            f"Fermenter volume must be positive; got {v_ferm}.",
        )
    if not (0.0 <= f_shrink < 1.0):
        raise SolverValidationError(
            "INVALID_SHRINKAGE",
            f"Shrinkage coefficient must be in [0, 1); got {f_shrink}.",
        )

    v_kettle_cold = kettle_cold_volume(v_ferm, v_kettle_dead, f_shrink)
    split = resolve_extract_split(sg_post_boil, v_kettle_cold, 0.0, s_late_add, gamma)
    require_malt_extract(split)
    s_post_boil_target = split.extract_total_kg

    v_pre_boil = pre_boil_volume(
        v_ferm, v_kettle_dead, v_kettle_transfer, v_trub, delta_v_evap, s_late_add, v_bar, f_shrink
    )

    return VolumetricReversal(
        v_kettle_cold=v_kettle_cold,
        s_post_boil_target=s_post_boil_target,
        v_pre_boil=v_pre_boil,
    )
