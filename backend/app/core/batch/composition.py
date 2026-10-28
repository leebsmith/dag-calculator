"""Phase 1 and 1b: gravity inversion and extract-composition attenuation.

Phase 1 isolates the active scale target; Phase 1b evaluates the attenuated
state implied by the wort's extract composition. Extract composition is the
primitive: malt extract ferments in proportion to its fermentable share ``F``
(a real fraction), capped by the yeast's attenuation converted into real space;
sugar extract keeps its own ``F`` and is never capped; a diastaticus strain
consumes the malt's dextrin residue (``d = 1``). ``UE``/``FE`` are masses;
``RE``/``AE`` in °P follow from the Cutaia regression. Apparent extract (and
attenuation) may go below 0 / above 1 in the dextrin-consumption regime.

See ``docs/attenuation-model.md`` and ``domain-equations.md`` §1–§2.
"""

from __future__ import annotations

from dataclasses import dataclass

from scipy.optimize import brentq

from app.core.batch.constants import (
    ETHANOL_DENSITY_METRIC,
    GAMMA_METRIC,
    SUGAR_FERMENTABILITY,
)
from app.core.batch.volumetric import (
    ExtractSplit,
    require_malt_extract,
    resolve_extract_split,
)
from app.core.errors import SolverValidationError
from app.core.utils import (
    apparent_extract_for_real_extract,
    apparent_to_real_attenuation,
    cutaia_abw,
    plato_to_sg,
    sg_to_plato,
)


def asbc_plato_to_sg(plato: float) -> float:
    """Convert degrees Plato to specific gravity (ASBC 3rd-order polynomial).

    Delegates to ``app.core.utils.plato_to_sg``; the artifact function
    ``plato_to_sg`` carries the same coefficients.
    """
    return plato_to_sg(plato)


def asbc_sg_to_plato(sg: float) -> float:
    """Convert specific gravity to degrees Plato (ASBC cubic polynomial).

    Delegates to ``app.core.utils.sg_to_plato``; the artifact function
    ``sg_to_plato`` carries the same coefficients.
    """
    return sg_to_plato(sg)


def cutaia_abv(oe_plato: float, apparent_attenuation: float) -> float:
    """Compute ABV via the Cutaia et al. (2009) empirical model.

    ``ae_plato = oe_plato * (1 - AA)``
    ``abw = (0.372 + 0.00357 * oe_plato) * (oe_plato - ae_plato)``
    ``abv = abw * (fg_sg / 0.7907)``

    See ``domain-equations.md`` §2.4.
    """
    ae_plato = oe_plato * (1.0 - apparent_attenuation)

    # Alcohol by weight (w/w %) via Cutaia, Reid, & Speers (2009)
    abw = (0.372 + 0.00357 * oe_plato) * (oe_plato - ae_plato)

    # Convert AE to specific gravity for volumetric expansion
    fg_sg = asbc_plato_to_sg(ae_plato)

    return abw * (fg_sg / 0.7907)


def max_achievable_abv(apparent_attenuation: float) -> float:
    """Compute the maximum ABV reachable within the Phase 1 bracket.

    The Phase 1 root-finder brackets over ``[0, 40] °P``. The ceiling is
    therefore the Cutaia ABV at 40 °P for the given attenuation. Exposing
    this lets the frontend bound the target-ABV input so the user cannot
    submit a value that Phase 1 would reject with ``ABV_UNREACHABLE``.

    Args:
        apparent_attenuation: Expected apparent attenuation as a fraction
            in (0, 1].

    Returns:
        The maximum achievable ABV, as a percentage.

    Raises:
        SolverValidationError: If ``apparent_attenuation`` is outside (0, 1].
    """
    if not (0.0 < apparent_attenuation <= 1.0):
        raise SolverValidationError(
            "INVALID_ATTENUATION",
            f"Apparent attenuation must be in (0, 1]; got {apparent_attenuation}.",
        )
    return cutaia_abv(40.0, apparent_attenuation)


def solve_sg_post_boil_from_abv(
    target_abv: float, apparent_attenuation: float
) -> float:
    """Phase 1: isolate the post-boil SG required to hit a target ABV.

    Wraps the Cutaia model in a scalar residual and solves it with Brent's
    method over a 0-40 °P bracket.

    Args:
        target_abv: Desired alcohol by volume, as a percentage (e.g. 5.5).
        apparent_attenuation: Expected apparent attenuation as a fraction
            in (0, 1] (e.g. 0.75 for 75% AA).

    Returns:
        The post-boil specific gravity (20 °C reference) required to hit
        ``target_abv`` at the given attenuation.

    Raises:
        SolverValidationError: If the inputs are outside the physical domain
            or the target ABV is unreachable within the 0-40 °P bracket.

    See ``domain-equations.md`` §2.5.
    """
    if target_abv <= 0:
        raise SolverValidationError(
            "INVALID_TARGET_ABV",
            f"Target ABV must be positive; got {target_abv}.",
        )
    if not (0.0 < apparent_attenuation <= 1.0):
        raise SolverValidationError(
            "INVALID_ATTENUATION",
            f"Apparent attenuation must be in (0, 1]; got {apparent_attenuation}.",
        )

    def residual(oe_plato: float) -> float:
        return cutaia_abv(oe_plato, apparent_attenuation) - target_abv

    # Bracket: pure water (0 °P) to extreme high gravity (40 °P).
    f_low = residual(0.0)
    f_high = residual(40.0)
    if f_low * f_high > 0.0:
        raise SolverValidationError(
            "ABV_UNREACHABLE",
            (
                f"Target ABV of {target_abv}% is not reachable within the "
                f"0-40 °P bracket at {apparent_attenuation:.4f} attenuation."
            ),
        )

    target_oe_plato = brentq(residual, 0.0, 40.0)
    return asbc_plato_to_sg(target_oe_plato)


@dataclass(frozen=True)
class WortComposition:
    """The attenuated state implied by the wort's extract composition.

    Attributes:
        oe_plato: Original extract of the post-boil wort, in °P.
        extract_total_kg: Total post-boil extract (malt + late addition), kg.
        malt_extract_kg: Malt-derived extract mass, kg.
        sugar_extract_kg: Late-addition extract mass, kg.
        malt_fermentability: Effective malt fermentability after the cap.
        real_extract_kg: Unfermented extract mass ``UE``, kg.
        real_extract_plato: ``RE`` in °P (``UE`` scaled by ``OE``/``E``).
        apparent_extract_plato: ``AE`` inverted from the Cutaia regression.
        real_attenuation: ``(OE − RE) / OE``.
        apparent_attenuation: ``(OE − AE) / OE``; may exceed 1.
        abw_pct: Alcohol by weight, %.
        abv_pct: Alcohol by volume, %.
    """

    oe_plato: float
    extract_total_kg: float
    malt_extract_kg: float
    sugar_extract_kg: float
    malt_fermentability: float
    real_extract_kg: float
    real_extract_plato: float
    apparent_extract_plato: float
    real_attenuation: float
    apparent_attenuation: float
    abw_pct: float
    abv_pct: float


def resolve_wort_composition(
    oe_plato: float,
    extract_total_kg: float,
    s_late_add: float,
    malt_fermentability: float,
    yeast_cap_apparent: float,
    *,
    dextrin_consumption: float = 0.0,
    sugar_fermentability: float = SUGAR_FERMENTABILITY,
) -> WortComposition:
    """Evaluate the extract-composition block at one candidate ``OE``.

    ``F_malt_eff = min(F_malt, cap_real(OE))``
    ``UE = E_malt·(1 − F_malt_eff)·(1 − d) + E_sugar·(1 − F_sugar)``
    ``RE = OE·UE/E``; ``AE`` is inverted from the Cutaia RE regression.

    Args:
        oe_plato: Post-boil original extract, in °P.
        extract_total_kg: Post-boil extract mass (malt + late addition), kg.
        s_late_add: Late-addition extract mass, kg.
        malt_fermentability: Extract-weighted real fermentability of the malt.
        yeast_cap_apparent: The yeast's apparent attenuation cap, fraction.
        dextrin_consumption: ``d`` — the share of the malt residue a
            diastaticus strain consumes (0 or 1 today).
        sugar_fermentability: Fermentable share of late-addition extract.

    Raises:
        SolverValidationError: If the extract target cannot cover the late
            addition, or the attenuation inputs are outside their domains.
    """
    if not (0.0 <= dextrin_consumption <= 1.0):
        raise SolverValidationError(
            "INVALID_ATTENUATION",
            f"Dextrin consumption must be in [0, 1]; got {dextrin_consumption}.",
        )
    require_malt_extract(
        ExtractSplit(extract_total_kg=extract_total_kg, sugar_extract_kg=s_late_add)
    )

    malt_extract_kg = extract_total_kg - s_late_add
    cap_real = apparent_to_real_attenuation(oe_plato, yeast_cap_apparent)
    malt_fermentability_eff = min(max(malt_fermentability, 0.0), cap_real)

    real_extract_kg = (
        malt_extract_kg
        * (1.0 - malt_fermentability_eff)
        * (1.0 - dextrin_consumption)
    ) + (s_late_add * (1.0 - sugar_fermentability))
    real_extract_plato = oe_plato * (real_extract_kg / extract_total_kg)

    ae_plato = apparent_extract_for_real_extract(oe_plato, real_extract_plato)
    abw = cutaia_abw(oe_plato, ae_plato)
    abv = abw * asbc_plato_to_sg(ae_plato) / ETHANOL_DENSITY_METRIC

    return WortComposition(
        oe_plato=oe_plato,
        extract_total_kg=extract_total_kg,
        malt_extract_kg=malt_extract_kg,
        sugar_extract_kg=s_late_add,
        malt_fermentability=malt_fermentability_eff,
        real_extract_kg=real_extract_kg,
        real_extract_plato=real_extract_plato,
        apparent_extract_plato=ae_plato,
        real_attenuation=(oe_plato - real_extract_plato) / oe_plato,
        apparent_attenuation=(oe_plato - ae_plato) / oe_plato,
        abw_pct=abw,
        abv_pct=abv,
    )


def solve_oe_from_composition(
    target_abv: float,
    yeast_cap_apparent: float,
    malt_fermentability: float,
    v_kettle_cold: float,
    s_late_add: float,
    *,
    gamma: float = GAMMA_METRIC,
    dextrin_consumption: float = 0.0,
    sugar_fermentability: float = SUGAR_FERMENTABILITY,
    sugar_extract_share: float = 0.0,
) -> float:
    """Phase 1 (composition path): root-find ``OE`` so the target ABV holds.

    The composition block is evaluated per candidate ``OE``: the extract target
    (and therefore the malt/sugar share) moves with the candidate, and the
    yeast cap converts to real space at that same ``OE``. A positive
    ``sugar_extract_share`` replaces the fixed dose with ``share · E(OE)``.

    Raises:
        SolverValidationError: On an invalid target, cap, or share; when the
            late addition alone exceeds the 40 °P extract ceiling
            (``EXTRACT_TARGET_NON_POSITIVE``); or when the target is beyond the
            composition's ceiling (``ABV_UNREACHABLE``).
    """
    if target_abv <= 0:
        raise SolverValidationError(
            "INVALID_TARGET_ABV",
            f"Target ABV must be positive; got {target_abv}.",
        )
    if not (0.0 < yeast_cap_apparent <= 1.0):
        raise SolverValidationError(
            "INVALID_ATTENUATION",
            (
                "Apparent attenuation must be in (0, 1]; got "
                f"{yeast_cap_apparent}."
            ),
        )

    def split_at(oe_plato: float) -> ExtractSplit:
        return resolve_extract_split(
            asbc_plato_to_sg(oe_plato),
            v_kettle_cold,
            sugar_extract_share,
            s_late_add,
            gamma,
        )

    ceiling = split_at(40.0)
    if ceiling.malt_extract_kg <= 0.0:
        raise SolverValidationError(
            "EXTRACT_TARGET_NON_POSITIVE",
            (
                f"Late-addition extract ({ceiling.sugar_extract_kg:.4f} kg) alone "
                "exceeds the 40 °P kettle extract ceiling."
            ),
        )

    def abv_at(oe_plato: float) -> float:
        split = split_at(oe_plato)
        if split.malt_extract_kg <= 0.0:
            return 0.0
        return resolve_wort_composition(
            oe_plato=oe_plato,
            extract_total_kg=split.extract_total_kg,
            s_late_add=split.sugar_extract_kg,
            malt_fermentability=malt_fermentability,
            yeast_cap_apparent=yeast_cap_apparent,
            dextrin_consumption=dextrin_consumption,
            sugar_fermentability=sugar_fermentability,
        ).abv_pct

    def residual(oe_plato: float) -> float:
        return abv_at(oe_plato) - target_abv

    lower = 1e-9
    if residual(lower) * residual(40.0) > 0.0:
        raise SolverValidationError(
            "ABV_UNREACHABLE",
            (
                f"Target ABV of {target_abv}% is not reachable within the "
                "0-40 °P bracket at this extract composition."
            ),
        )
    return brentq(residual, lower, 40.0)
