"""
Batch solver: canonical mass and volume balance for single-strike, single-sparge
batch sparging.

This module implements the four-phase pipeline described in
``docs/dag-artifacts/domain-equations.md`` §2.4–2.6 and mapped in
``docs/batch-math/dependency-graph.md``.

Stage 1.0 scope: shared pure helpers and frozen result dataclasses only.
Phases 1-4 are added in subsequent sub-stages.

Design constraints (see ``docs/batch-math/implementation-plan.md`` §0):

* Every computational step is a pure function: same inputs -> same outputs,
  no I/O, no mutation of arguments, no hidden state.
* Composite constants are computed exactly once, here, and composed by the
  phase functions. No phase re-derives them.

Black-box boundary contract:

* This module is a sealed boundary supernode in the application's logic graph:
  its interior (the four-phase pipeline and its helpers) is opaque to callers;
  only ``solve_batch`` is invoked from outside.
* Nature: pure and deterministic — same inputs, same outputs; no I/O, no
  mutation of arguments, no hidden state.
* Signature: ``solve_batch(BatchSolverInput) -> BatchSolverResult``.
* Resolution mode: iterative (bracketed root-finding via
  ``scipy.optimize.brentq``).
* Domain: inputs failing a physical or numerical gate raise
  ``SolverValidationError`` (a ``ValueError`` subclass) carrying a ``code``.
* Provenance: the legacy ``docs/batch-math/`` treatment (not present in this
  repository), consolidated in ``docs/dag-artifacts/domain-equations.md`` §2.4–2.6.
* Scope: imports nothing from ``app.*`` except the shared equation layer
  ``app.core.utils``; the service layer maps request schemas onto the
  dataclasses defined here.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from scipy.optimize import brentq

from app.core.utils import (
    apparent_extract_for_real_extract,
    apparent_to_real_attenuation,
    cutaia_abw,
    plato_to_sg,
    sg_to_plato,
)

# ---------------------------------------------------------------------------
# Physical constants (metric standards; see inputs-and-outputs.md)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class SolverValidationError(ValueError):
    """Raised when the solver's inputs fail a physical or numerical gate.

    Carries a machine-readable ``code`` alongside the human-readable message
    so the API layer can map it to a structured error response.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Input dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GrainBillEntry:
    """A single malt component of the grain bill.

    Attributes:
        w_i: Normalized mass fraction of this component (sum over the bill = 1.0).
        yield_i: Dry-basis fine-grind extract yield fraction (0..1).
        mc_i: As-is moisture content fraction (0..1).
    """

    w_i: float
    yield_i: float
    mc_i: float
    fermentability_i: float | None = None


# ---------------------------------------------------------------------------
# Shared pure helpers
# ---------------------------------------------------------------------------


def composite_yield_fraction(grain_bill: Sequence[GrainBillEntry]) -> float:
    """Compute the composite dry-basis yield fraction ``E``.

    ``E = sum_i( w_i * DBFG_i * (1 - MC_i) )``

    See ``domain-equations.md`` §2.4.
    """
    return sum(
        entry.w_i * entry.yield_i * (1.0 - entry.mc_i) for entry in grain_bill
    )


def composite_moisture_fraction(grain_bill: Sequence[GrainBillEntry]) -> float:
    """Compute the weighted moisture fraction ``MC_bar``.

    ``MC_bar = sum_i( w_i * MC_i )``

    See ``domain-equations.md`` §2.4.
    """
    return sum(entry.w_i * entry.mc_i for entry in grain_bill)


def composite_fermentability_fraction(
    grain_bill: Sequence[GrainBillEntry],
) -> float | None:
    """Compute the extract-weighted malt fermentability baseline.

    ``AA_malt = sum_i( extract_i * F_i ) / sum_i( extract_i )``

    ``extract_i = w_i * yield_i * (1 - mc_i)``. Returns ``None`` when any row
    omits ``fermentability_i`` so legacy callers keep the old scalar-AA path.
    """
    if any(entry.fermentability_i is None for entry in grain_bill):
        return None
    total = 0.0
    fermentable = 0.0
    for entry in grain_bill:
        extract = entry.w_i * entry.yield_i * (1.0 - entry.mc_i)
        total += extract
        fermentable += extract * entry.fermentability_i
    return fermentable / total if total > 0.0 else None


def validate_grain_bill_normalization(grain_bill: Sequence[GrainBillEntry]) -> None:
    """Enforce that the grain-bill mass fractions sum to 1.0.

    The sealed solver boundary must not trust callers: the HTTP schema checks
    this too, but the core re-validates so a direct ``solve_batch`` caller
    cannot silently derive a wrong grist mass from a malformed bill.
    """
    total = sum(entry.w_i for entry in grain_bill)
    if abs(total - 1.0) > 1e-6:
        raise SolverValidationError(
            "INVALID_GRAIN_BILL_NORMALIZATION",
            f"Grain bill weights must sum to 1.0; got {total}.",
        )


def composite_volumetric_expansion(
    mc_bar: float,
    v_bar: float,
    eta_conv: float,
    yield_fraction: float,
) -> float:
    """Compute the composite volumetric expansion coefficient ``c_vol``.

    ``c_vol = MC_bar / rho_water + v_bar * eta_conv * E``

    Note: ``rho_water`` is fixed at the metric standard (1.00 kg/L), so the
    ``MC_bar / rho_water`` term reduces to ``MC_bar``. The parameter is kept
    explicit in the signature for clarity and future unit-system support.

    See ``domain-equations.md`` §2.4.
    """
    return (mc_bar / RHO_WATER_METRIC) + (v_bar * eta_conv * yield_fraction)


def retained_volume(m_grist: float, k_abs_true: float, v_dead: float) -> float:
    """Compute the total retained liquid volume ``V_ret``.

    ``V_ret = k_abs_true * M_grist + V_dead``

    See ``domain-equations.md`` §2.4.
    """
    return (k_abs_true * m_grist) + v_dead


def moisture_volume(m_grist: float, mc_bar: float) -> float:
    """Compute the intrinsic grain moisture volume ``V_mc``.

    ``V_mc = M_grist * MC_bar / rho_water``

    See ``domain-equations.md`` §2.4.
    """
    return (m_grist * mc_bar) / RHO_WATER_METRIC


def solute_displacement_volume(s_conv: float, v_bar: float) -> float:
    """Compute the dissolved solute displacement volume ``V_sol``.

    ``V_sol = v_bar * S_conv``

    See ``domain-equations.md`` §2.4.
    """
    return v_bar * s_conv


def converted_extract(
    m_grist: float, yield_fraction: float, eta_conv: float
) -> float:
    """Compute the converted soluble extract mass ``S_conv``.

    ``S_conv = eta_conv * E * M_grist``

    See ``domain-equations.md`` §2.4.
    """
    return eta_conv * yield_fraction * m_grist


# ---------------------------------------------------------------------------
# Phase 1: Cold-Side Inverse Resolution
# ---------------------------------------------------------------------------
#
# Stage 5 reconciliation: the ASBC conversion polynomials are sourced from
# ``app.core.utils`` (official ASBC 3rd-order Plato -> SG and cubic SG -> Plato).
# The artifact exposes them as the functions ``plato_to_sg`` / ``sg_to_plato``,
# and ``utils.py`` carries the Python coefficients. The local aliases below
# preserve the solver's public API without duplicating the math.


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


# ---------------------------------------------------------------------------
# Phase 2: Volumetric Reversal & Extract Targeting
# ---------------------------------------------------------------------------


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
    s_post_boil_target = post_boil_extract_target(
        sg_post_boil, v_kettle_cold, gamma
    )

    if (s_post_boil_target - s_late_add) <= 0.0:
        raise SolverValidationError(
            "EXTRACT_TARGET_NON_POSITIVE",
            (
                f"Post-boil extract target ({s_post_boil_target:.4f} kg) must "
                f"exceed late-addition extract ({s_late_add:.4f} kg)."
            ),
        )

    v_pre_boil = pre_boil_volume(
        v_ferm, v_kettle_dead, v_kettle_transfer, v_trub, delta_v_evap, s_late_add, v_bar, f_shrink
    )

    return VolumetricReversal(
        v_kettle_cold=v_kettle_cold,
        s_post_boil_target=s_post_boil_target,
        v_pre_boil=v_pre_boil,
    )


# ---------------------------------------------------------------------------
# Phase 1b: Extract-composition attenuation
# ---------------------------------------------------------------------------
#
# Extract composition is the primitive: malt extract ferments in proportion to
# its fermentable share ``F`` (a real fraction), capped by the yeast's
# attenuation converted into real space; sugar extract keeps its own ``F`` and
# is never capped; a diastaticus strain consumes the malt's dextrin residue
# (``d = 1``). ``UE``/``FE`` are masses; ``RE``/``AE`` in °P follow from the
# Cutaia regression. Apparent extract (and attenuation) may go below 0 / above
# 1 in the dextrin-consumption regime.
#
# See ``docs/attenuation-model.md`` and ``domain-equations.md`` §1–§2.


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
    if extract_total_kg <= s_late_add:
        raise SolverValidationError(
            "EXTRACT_TARGET_NON_POSITIVE",
            (
                f"Post-boil extract target ({extract_total_kg:.4f} kg) must "
                f"exceed late-addition extract ({s_late_add:.4f} kg)."
            ),
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

    def extract_at(oe_plato: float) -> float:
        return post_boil_extract_target(
            asbc_plato_to_sg(oe_plato), v_kettle_cold, gamma
        )

    def sugar_at(oe_plato: float) -> float:
        return sugar_extract_for(
            sugar_extract_share, extract_at(oe_plato), s_late_add
        )

    if extract_at(40.0) <= sugar_at(40.0):
        raise SolverValidationError(
            "EXTRACT_TARGET_NON_POSITIVE",
            (
                f"Late-addition extract ({sugar_at(40.0):.4f} kg) alone exceeds "
                "the 40 °P kettle extract ceiling."
            ),
        )

    def abv_at(oe_plato: float) -> float:
        extract_total = extract_at(oe_plato)
        sugar = sugar_at(oe_plato)
        if extract_total <= sugar:
            return 0.0
        return resolve_wort_composition(
            oe_plato=oe_plato,
            extract_total_kg=extract_total,
            s_late_add=sugar,
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


# ---------------------------------------------------------------------------
# Phase 3: Grist Mass Resolution (1D Root-Finding)
# ---------------------------------------------------------------------------
#
# Both constraint topologies are implemented: {V_pre_boil, R_L:G} and
# {V_pre_boil, r}. See domain-equations.md §2.5.


def grist_mass_bracket(
    s_post_boil_target: float,
    s_late_add: float,
    yield_fraction: float,
) -> tuple[float, float]:
    """Compute the guaranteed bracketing interval ``[a, b]`` for ``M_grist``.

    ``a = max(0.0, (S_post_boil_target - S_late_add) / E)``
    ``b = (S_post_boil_target - S_late_add) / (0.50 * E)``

    See ``domain-equations.md`` §2.5.
    """
    delta_s = s_post_boil_target - s_late_add
    a = max(0.0, delta_s / yield_fraction)
    b = delta_s / (0.50 * yield_fraction)
    return a, b


def grist_mass_residual(
    m_grist: float,
    v_pre_boil: float,
    r_l_to_g: float,
    yield_fraction: float,
    mc_bar: float,
    eta_conv: float,
    s_post_boil_target: float,
    s_late_add: float,
    v_dead: float,
    k_abs_true: float = K_ABS_TRUE_METRIC,
    v_bar: float = V_BAR_METRIC,
    topology: str = "r_l_to_g",
    mash_transfer_loss: float = 0.0,
) -> float:
    """Evaluate the cleared-denominator cubic residual ``P(M_grist)``.

    ``P(M) = (eta_conv * E * M) * [D1(M) * D2(M) - V_ret(M)^2]
             - (S_target - S_late) * D1(M) * D2(M)``

    where:

    * ``c_vol = MC_bar / rho_water + v_bar * eta_conv * E``
    * ``D1(M) = V_strike + c_vol * M``
    * ``D2(M) = V_sparge + V_dead + k_abs_true * M``

    ``V_drain = V_pre_boil + mash_transfer_loss`` is the volume the tun must
    yield. The hose holds homogeneous wort, so the discarded transfer volume
    carries extract at ``S_tun / V_drain`` and the kettle receives
    ``S_tun * V_pre_boil / V_drain``. The residual therefore targets the tun
    extract ``(S_target - S_late) * V_drain / V_pre_boil`` and uses
    ``V_drain`` for both sparge topologies.

    Under the ``{V_pre_boil, R_L:G}`` topology (``topology="r_l_to_g"``):

    * ``V_strike = R_L:G * M``
    * ``V_sparge = V_drain - V_run1``, with ``V_run1`` derived from the tun
      mass balance.

    Under the ``{V_pre_boil, r}`` topology (``topology="runoff_ratio"``):

    * ``V_sparge = V_drain / (r + 1)`` (static, independent of ``M``)
    * ``V_strike`` is reversed from the tun mass balance to absorb retention.

    See ``domain-equations.md`` §2.5–2.6.
    """
    c_vol = (mc_bar / RHO_WATER_METRIC) + (v_bar * eta_conv * yield_fraction)
    v_drain = v_pre_boil + mash_transfer_loss

    v_mc = moisture_volume(m_grist, mc_bar)
    s_conv = converted_extract(m_grist, yield_fraction, eta_conv)
    v_sol = solute_displacement_volume(s_conv, v_bar)
    v_ret = retained_volume(m_grist, k_abs_true, v_dead)

    if topology == "runoff_ratio":
        # Static sparge split; reverse the tun mass balance for V_strike.
        v_sparge = v_drain / (r_l_to_g + 1.0)
        v_run1 = v_drain - v_sparge
        v_strike = v_run1 + v_ret - v_mc - v_sol
    else:
        v_strike = r_l_to_g * m_grist
        v_run1 = v_strike + v_mc + v_sol - v_ret
        v_sparge = v_drain - v_run1

    d1 = v_strike + (c_vol * m_grist)
    d2 = v_sparge + v_dead + (k_abs_true * m_grist)

    delta_s = (s_post_boil_target - s_late_add) * (v_drain / v_pre_boil)
    return (eta_conv * yield_fraction * m_grist) * (
        (d1 * d2) - (v_ret**2)
    ) - (delta_s * d1 * d2)


def solve_grist_mass(
    v_pre_boil: float,
    r_l_to_g: float,
    yield_fraction: float,
    mc_bar: float,
    eta_conv: float,
    s_post_boil_target: float,
    s_late_add: float,
    v_dead: float,
    k_abs_true: float = K_ABS_TRUE_METRIC,
    v_bar: float = V_BAR_METRIC,
    topology: str = "r_l_to_g",
    mash_transfer_loss: float = 0.0,
) -> float:
    """Phase 3: resolve the dry grist mass ``M_grist`` via Brent's method.

    Supports both constraint topologies via the ``topology`` discriminator:

    * ``"r_l_to_g"``: ``{V_pre_boil, R_L:G}``; ``r_l_to_g`` is the L:G ratio.
    * ``"runoff_ratio"``: ``{V_pre_boil, r}``; ``r_l_to_g`` is the runoff
      ratio ``r`` (dimensionless).

    Args:
        v_pre_boil: Derived pre-boil kettle volume, in liters (from Phase 2).
        r_l_to_g: Liquor-to-grist ratio (L/kg) or runoff ratio (dimensionless),
            matching ``topology``.
        yield_fraction: Composite dry-basis yield fraction ``E``.
        mc_bar: Composite moisture fraction ``MC_bar``.
        eta_conv: Mash conversion efficiency as a fraction.
        s_post_boil_target: Required post-boil extract mass, in kg.
        s_late_add: Late-addition extract mass, in kg.
        v_dead: Mash tun dead space, in liters.
        k_abs_true: True husk absorption coefficient, in L/kg.
        v_bar: Apparent specific volume of dissolved extract, in L/kg.
        topology: Either ``"r_l_to_g"`` or ``"runoff_ratio"``.
        mash_transfer_loss: Mash tun transfer (hose/pump) loss, in liters. The
            loss carries wort at the tun concentration, so the grist must
            generate extract for the drain volume, not just the kettle target.

    Returns:
        The converged dry grist mass ``M_grist``, in kg.

    Raises:
        SolverValidationError: If the bracket is degenerate or the residual
            does not change sign across it.

    See ``domain-equations.md`` §2.5–2.6.
    """
    if topology not in ("r_l_to_g", "runoff_ratio"):
        raise SolverValidationError(
            "UNKNOWN_TOPOLOGY",
            f"Unknown constraint topology: {topology!r}.",
        )
    if not math.isfinite(r_l_to_g) or r_l_to_g <= 0.0:
        raise SolverValidationError(
            "INVALID_INTENSIVE_VALUE",
            (
                f"Intensive constraint must be positive and finite; got "
                f"{r_l_to_g}."
            ),
        )
    if yield_fraction <= 0.0:
        raise SolverValidationError(
            "INVALID_YIELD",
            f"Composite extract yield must be positive; got {yield_fraction}.",
        )
    if (s_post_boil_target - s_late_add) <= 0.0:
        raise SolverValidationError(
            "EXTRACT_TARGET_NON_POSITIVE",
            (
                f"Post-boil extract target ({s_post_boil_target:.4f} kg) must "
                f"exceed late-addition extract ({s_late_add:.4f} kg)."
            ),
        )
    # Physical realizability pre-check: under the {V_pre_boil, R_L:G}
    # topology, a mash thickness below the husk absorption floor guarantees
    # negative first runnings for any grist mass, which makes the residual
    # P(M_grist) monotonic and the bracket sign-change test fail. Catch it
    # here (Phase 3) rather than in Phase 4, so the user sees MASH_TOO_THIN
    # instead of the opaque BRACKET_NO_SIGN_CHANGE.
    if topology == "r_l_to_g" and r_l_to_g < k_abs_true:
        raise SolverValidationError(
            "MASH_TOO_THIN",
            (
                f"Liquor-to-grist ratio ({r_l_to_g:.2f} L/kg) is below the "
                f"husk absorption floor ({k_abs_true} L/kg). The grain "
                f"bed would retain more liquid than the strike provides."
            ),
        )

    a, b = grist_mass_bracket(s_post_boil_target, s_late_add, yield_fraction)
    if b <= a:
        raise SolverValidationError(
            "DEGENERATE_BRACKET",
            f"Grist mass bracket is degenerate: a={a}, b={b}.",
        )

    def residual(m_grist: float) -> float:
        return grist_mass_residual(
            m_grist=m_grist,
            v_pre_boil=v_pre_boil,
            r_l_to_g=r_l_to_g,
            yield_fraction=yield_fraction,
            mc_bar=mc_bar,
            eta_conv=eta_conv,
            s_post_boil_target=s_post_boil_target,
            s_late_add=s_late_add,
            v_dead=v_dead,
            k_abs_true=k_abs_true,
            v_bar=v_bar,
            topology=topology,
            mash_transfer_loss=mash_transfer_loss,
        )

    f_a = residual(a)
    f_b = residual(b)
    if f_a * f_b > 0.0:
        raise SolverValidationError(
            "BRACKET_NO_SIGN_CHANGE",
            (
                f"Grist mass residual does not change sign on [{a:.4f}, "
                f"{b:.4f}]: f(a)={f_a:.6f}, f(b)={f_b:.6f}."
            ),
        )

    return brentq(residual, a, b)


# ---------------------------------------------------------------------------
# Phase 4: Stage Volume & Gravity Cascade
# ---------------------------------------------------------------------------
#
# Post-convergence cascade. Dispatches on the solver constraint topology:
#   * "r_l_to_g"      -> {V_pre_boil, R_L:G}
#   * "runoff_ratio"  -> {V_pre_boil, r}


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


# ---------------------------------------------------------------------------
# HLT Water Budget
# ---------------------------------------------------------------------------
#
# The HLT holds water, not wort, so this budget never enters the extract mass
# balance. It constrains how much liquor the HLT can deliver as sparge water.
# See ``domain-equations.md`` §2.6.


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
    """

    v_hlt_debt: float
    v_hlt_after_strike: float
    v_hlt_top_up: float
    v_sparge_deliverable: float


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
    v_hlt_target = max(hlt_coil_floor_l, v_hlt_required)

    if v_hlt_target > max_hlt_volume_l:
        raise SolverValidationError(
            "HLT_TOO_SMALL",
            (
                f"HLT top-up target ({v_hlt_target:.2f} L) exceeds the HLT's "
                f"maximum capacity ({max_hlt_volume_l:.2f} L). The HLT cannot "
                f"hold enough liquor to cover the coil and deliver the sparge."
            ),
        )

    v_hlt_top_up = max(0.0, v_hlt_target - v_hlt_after_strike)
    v_sparge_deliverable = v_hlt_after_strike + v_hlt_top_up - v_hlt_debt

    return HltWaterBudget(
        v_hlt_debt=v_hlt_debt,
        v_hlt_after_strike=v_hlt_after_strike,
        v_hlt_top_up=v_hlt_top_up,
        v_sparge_deliverable=v_sparge_deliverable,
    )


# ---------------------------------------------------------------------------
# Orchestration: top-level solve_batch entry point
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BatchSolverInput:
    """Application-side inputs for a single batch-sparge solve.

    Attributes:
        target_abv: Desired alcohol by volume, as a percentage (e.g. 5.5).
        malt_attenuation_cap: The yeast's apparent attenuation cap as a fraction
            in (0, 1] (the strain's typical attenuation times the batch derate).
            Converted to real space per candidate ``OE`` before it clamps the
            malt's fermentability.
        v_ferm: Target cold fermenter volume, in liters.
        topology: Either ``"r_l_to_g"`` or ``"runoff_ratio"``.
        intensive_value: ``R_L:G`` (L/kg) or ``r`` (dimensionless).
        grain_bill: The malt specification vector.
        s_late_add: Late-addition extract mass, in kg.
        v_kettle_dead: Unrecoverable kettle/chiller dead space, in liters.
        v_kettle_transfer: Kettle/chiller transfer (hose/pump) loss, in liters.
        v_trub: Kettle trub loss, in liters.
        delta_v_evap: Calibrated kettle boil-off volume, in liters.
        v_dead: Mash tun dead space, in liters.
        mash_transfer_loss: Mash tun transfer (hose/pump) loss, in liters.
        eta_conv: Mash conversion efficiency as a fraction.
        f_shrink: Thermal contraction coefficient (default 4%).
        k_abs_true: Grain absorption coefficient, in L/kg. The equipment
            profile's ``grain_absorption_factor_l_per_kg`` is authoritative;
            the module constant is the fallback.
        sta1: Vendor STA1 QC result. ``True`` consumes the malt's dextrin
            residue (``d = 1``); ``False`` is an ordinary strain; ``None``
            means "not published" and models as ``d = 0`` with an advisory.
        sugar_extract_share: Sugar extract as a fraction of total post-boil
            extract. ``0`` means dose mode (``s_late_add`` is authoritative);
            a positive share is solved per candidate ``OE``.
        sugar_fermentability: Extract-weighted real fermentability of the
            late-addition blend (0..1).
        scale_pin: Which gravity/strength constraint is active:
            ``abv`` (default), ``og``, or ``fg``.
        target_og: Post-boil original gravity for the OG pin, SG. Ignored by
            the active solve when another pin is selected; used by the preview
            block.
        target_fg: Final gravity for the FG pin, SG. Same preview rule.
        hlt_starting_volume_l: Volume of liquor in the HLT at the start of the
            brew day, in liters. Batch-level parameter; the frontend pre-fills
            it from the equipment profile's ``max_hlt_volume_l``. Consumed by
            the HLT water budget (top-up and deliverable sparge volume), not
            by the extract mass balance.
        hlt_dead_space_l: Liquor trapped below the HLT drain port, in liters.
            Permanently undeliverable debt (see ``domain-equations.md`` §2.6).
        hlt_transfer_loss_l: Liquor permanently held in the HLT hose and pump,
            in liters. Permanently undeliverable debt.
        hlt_coil_floor_l: Minimum HLT volume required to submerge the HERMS
            coil, in liters. A constraint, not a debt.
        max_hlt_volume_l: Maximum HLT capacity, in liters. Used to gate the
            top-up target (``HLT_TOO_SMALL``).
        max_kettle_volume_l: Maximum kettle capacity, in liters. Diagnostic
            only: it never constrains the solve, but it bounds ``max_feasible_abv``
            and names a bracket failure.
        max_mash_tun_volume_l: Maximum mash tun capacity, in liters. Diagnostic
            only, like ``max_kettle_volume_l``.
    """

    target_abv: float
    malt_attenuation_cap: float
    v_ferm: float
    topology: str
    intensive_value: float
    grain_bill: Sequence[GrainBillEntry]
    s_late_add: float
    v_kettle_dead: float
    v_kettle_transfer: float
    v_trub: float
    delta_v_evap: float
    v_dead: float
    mash_transfer_loss: float
    eta_conv: float
    hlt_starting_volume_l: float
    hlt_dead_space_l: float
    hlt_transfer_loss_l: float
    hlt_coil_floor_l: float
    max_hlt_volume_l: float
    max_kettle_volume_l: float
    max_mash_tun_volume_l: float
    f_shrink: float = F_SHRINK_DEFAULT
    k_abs_true: float = K_ABS_TRUE_METRIC
    sta1: bool | None = None
    sugar_extract_share: float = 0.0
    sugar_fermentability: float = 1.0
    scale_pin: str = "abv"
    target_og: float | None = None
    target_fg: float | None = None

    def __post_init__(self) -> None:
        if self.topology not in ("r_l_to_g", "runoff_ratio"):
            raise SolverValidationError(
                "UNKNOWN_TOPOLOGY",
                f"Unknown constraint topology: {self.topology!r}.",
            )
        if self.scale_pin not in ("abv", "og", "fg"):
            raise SolverValidationError(
                "INVALID_SCALE_PIN",
                f"Unknown scale pin: {self.scale_pin!r}.",
            )
        if not math.isfinite(self.intensive_value) or self.intensive_value <= 0.0:
            raise SolverValidationError(
                "INVALID_INTENSIVE_VALUE",
                (
                    f"Intensive constraint must be positive and finite; got "
                    f"{self.intensive_value}."
                ),
            )
        if (
            not math.isfinite(self.sugar_extract_share)
            or self.sugar_extract_share < 0.0
            or self.sugar_extract_share >= 1.0
        ):
            raise SolverValidationError(
                "INVALID_SUGAR_SHARE",
                (
                    "Sugar extract share must be in [0, 1); got "
                    f"{self.sugar_extract_share}."
                ),
            )
        if (
            not math.isfinite(self.sugar_fermentability)
            or self.sugar_fermentability < 0.0
            or self.sugar_fermentability > 1.0
        ):
            raise SolverValidationError(
                "INVALID_SUGAR_FERMENTABILITY",
                (
                    "Sugar fermentability must be in [0, 1]; got "
                    f"{self.sugar_fermentability}."
                ),
            )
        if self.target_og is not None and (
            not math.isfinite(self.target_og) or self.target_og <= 0.0
        ):
            raise SolverValidationError(
                "INVALID_TARGET_OG",
                f"Target OG must be positive and finite; got {self.target_og}.",
            )
        if self.target_fg is not None and (
            not math.isfinite(self.target_fg) or self.target_fg <= 0.0
        ):
            raise SolverValidationError(
                "INVALID_TARGET_FG",
                f"Target FG must be positive and finite; got {self.target_fg}.",
            )


@dataclass(frozen=True)
class ScalePreview:
    """One hypothetical solve at a persisted scale target.

    Attributes:
        pin: ``abv``, ``og``, or ``fg``.
        og: Post-boil gravity at that target, SG (0 when infeasible).
        fg: Final gravity at that target, SG (0 when infeasible).
        abv: ABV at that target, % (0 when infeasible).
        ok: Whether the target could be solved.
        reason: Error code (or empty) when ``ok`` is false.
    """

    pin: str
    og: float
    fg: float
    abv: float
    ok: bool
    reason: str


@dataclass(frozen=True)
class BatchSolverResult:
    """Full result of a batch-sparge solve.

    Attributes:
        sg_post_boil: Post-boil specific gravity from Phase 1.
        v_pre_boil: Derived pre-boil kettle volume, in liters.
        s_post_boil_target: Required post-boil extract mass, in kg.
        m_grist: Converged dry grist mass, in kg.
        cascade: The Phase 4 stage volume and gravity cascade.
        max_achievable_abv: The Phase 1 bracket ceiling for the given
            attenuation and composition, as a percentage. Echoed back so the
            frontend can bound the target-ABV input without duplicating the
            Cutaia model.
        real_attenuation: The solved batch's real attenuation (RDF), after the
            cap and any dextrin consumption.
        apparent_attenuation: The solved batch's apparent attenuation, after the
            cap and any dextrin consumption. May exceed 1 when diastaticus
            consumes the dextrin residue.
        hlt: The HLT water budget (top-up and deliverable sparge volume).
        max_feasible_abv: The largest target ABV that both solves and fits the
            rig's capacity limits, as a percentage.
        binding_constraint: Which limit sets ``max_feasible_abv``:
            ``fermentation``, ``volume``, ``tun``, ``kettle``, or ``hlt``.
        mash_thickness_l_per_kg: Resolved liquor-to-grist ratio, in L/kg.
            Surfaced at the top level (in addition to ``cascade``) because the
            Mash Card reads it directly to derive strike water temperature
            (design record Q3/Q12). Under ``r_l_to_g`` it equals the input
            ``R_L:G``; under ``runoff_ratio`` it is derived from the cascade.
        previews: One hypothetical gravity/strength row per scale pin, at that
            pin's persisted target. Diagnostics only; never the active solve.
    """

    sg_post_boil: float
    v_pre_boil: float
    s_post_boil_target: float
    m_grist: float
    cascade: StageCascade
    max_achievable_abv: float
    real_attenuation: float
    apparent_attenuation: float
    hlt: HltWaterBudget
    max_feasible_abv: float
    binding_constraint: str
    mash_thickness_l_per_kg: float
    previews: tuple[ScalePreview, ...]


@dataclass(frozen=True)
class _Pipeline:
    sg_post_boil: float
    reversal: VolumetricReversal
    m_grist: float
    cascade: StageCascade
    hlt: HltWaterBudget
    real_attenuation: float
    apparent_attenuation: float
    max_abv: float


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


def _capacity_violation(inputs: BatchSolverInput, pipeline: _Pipeline) -> str | None:
    if pipeline.reversal.v_pre_boil > inputs.max_kettle_volume_l:
        return "kettle"
    peak = tun_peak_volume_l(pipeline.m_grist, pipeline.cascade, inputs.v_dead)
    if peak > inputs.max_mash_tun_volume_l:
        return "tun"
    return None


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

    if reversal.v_pre_boil > inputs.max_kettle_volume_l:
        return SolverValidationError(
            "KETTLE_TOO_SMALL",
            (
                f"Kettle capacity exceeded: pre-boil volume "
                f"{reversal.v_pre_boil:.1f} L exceeds "
                f"{inputs.max_kettle_volume_l:.1f} L."
            ),
        )
    peak = tun_peak_volume_l(upper, cascade, inputs.v_dead)
    if peak > inputs.max_mash_tun_volume_l:
        return SolverValidationError(
            "MASH_TUN_TOO_SMALL",
            (
                f"Mash tun capacity exceeded: the tun needs {peak:.1f} L of "
                f"{inputs.max_mash_tun_volume_l:.1f} L at the bracket bound."
            ),
        )
    try:
        resolve_hlt_water_budget(
            hlt_starting_volume_l=inputs.hlt_starting_volume_l,
            v_strike_drawn=cascade.v_strike,
            v_sparge_demand=cascade.v_sparge,
            hlt_dead_space_l=inputs.hlt_dead_space_l,
            hlt_transfer_loss_l=inputs.hlt_transfer_loss_l,
            hlt_coil_floor_l=inputs.hlt_coil_floor_l,
            max_hlt_volume_l=inputs.max_hlt_volume_l,
        )
    except SolverValidationError as exc:
        if exc.code == "HLT_TOO_SMALL":
            return exc
        raise
    return None


@dataclass(frozen=True)
class _GravityState:
    oe_plato: float
    sg_post_boil: float
    extract_total_kg: float
    sugar_extract_kg: float
    composition: WortComposition


def _target_for(inputs: BatchSolverInput, pin: str) -> float | None:
    if pin == "abv":
        return inputs.target_abv
    if pin == "og":
        return inputs.target_og
    if pin == "fg":
        return inputs.target_fg
    raise SolverValidationError(
        "INVALID_SCALE_PIN", f"Unknown scale pin: {pin!r}."
    )


def _abv_ceiling(
    inputs: BatchSolverInput,
    v_kettle_cold: float,
    aa_malt: float,
    dextrin_consumption: float,
) -> float:
    ceiling_extract = post_boil_extract_target(
        asbc_plato_to_sg(40.0), v_kettle_cold, GAMMA_METRIC
    )
    sugar = sugar_extract_for(
        inputs.sugar_extract_share, ceiling_extract, inputs.s_late_add
    )
    if ceiling_extract <= sugar:
        return 0.0
    return resolve_wort_composition(
        oe_plato=40.0,
        extract_total_kg=ceiling_extract,
        s_late_add=sugar,
        malt_fermentability=aa_malt,
        yeast_cap_apparent=inputs.malt_attenuation_cap,
        dextrin_consumption=dextrin_consumption,
        sugar_fermentability=inputs.sugar_fermentability,
    ).abv_pct


def _resolve_gravity(
    inputs: BatchSolverInput,
    pin: str,
    target: float | None,
    v_kettle_cold: float,
    aa_malt: float,
    dextrin_consumption: float,
) -> _GravityState:
    """Resolve OE, extract and composition for one active scale pin."""

    if pin == "abv":
        oe_plato = solve_oe_from_composition(
            target_abv=target if target is not None else 0.0,
            yeast_cap_apparent=inputs.malt_attenuation_cap,
            malt_fermentability=aa_malt,
            v_kettle_cold=v_kettle_cold,
            s_late_add=inputs.s_late_add,
            dextrin_consumption=dextrin_consumption,
            sugar_extract_share=inputs.sugar_extract_share,
            sugar_fermentability=inputs.sugar_fermentability,
        )
        sg_post_boil = asbc_plato_to_sg(oe_plato)
        extract_total = post_boil_extract_target(
            sg_post_boil, v_kettle_cold, GAMMA_METRIC
        )
        sugar = sugar_extract_for(
            inputs.sugar_extract_share, extract_total, inputs.s_late_add
        )
    elif pin == "og":
        if target is None or not math.isfinite(target) or target <= 1.0:
            raise SolverValidationError(
                "INVALID_TARGET_OG",
                f"Target OG must be greater than 1.000; got {target}.",
            )
        sg_post_boil = target
        oe_plato = sg_to_plato(sg_post_boil)
        extract_total = post_boil_extract_target(
            sg_post_boil, v_kettle_cold, GAMMA_METRIC
        )
        sugar = sugar_extract_for(
            inputs.sugar_extract_share, extract_total, inputs.s_late_add
        )
        if extract_total <= sugar:
            raise SolverValidationError(
                "EXTRACT_TARGET_NON_POSITIVE",
                (
                    f"Post-boil extract target ({extract_total:.4f} kg) must "
                    f"exceed late-addition extract ({sugar:.4f} kg)."
                ),
            )
    elif pin == "fg":
        if target is None or not math.isfinite(target) or target <= 0.0:
            raise SolverValidationError(
                "INVALID_TARGET_FG",
                f"Target FG must be positive; got {target}.",
            )
        if target < 1.0 and inputs.sta1 is not True:
            raise SolverValidationError(
                "FG_BELOW_ZERO_WITHOUT_STA1",
                (
                    "An FG below 1.000 requires a diastaticus strain "
                    "(sta1 = true); select one or raise the target."
                ),
            )
        target_ae = sg_to_plato(target)

        def residual(oe_plato: float) -> float | None:
            sg = asbc_plato_to_sg(oe_plato)
            extract_total = post_boil_extract_target(
                sg, v_kettle_cold, GAMMA_METRIC
            )
            sugar = sugar_extract_for(
                inputs.sugar_extract_share, extract_total, inputs.s_late_add
            )
            if extract_total <= sugar:
                # No malt extract at this candidate: outside the physical
                # domain, not a residual to bracket.
                return None
            composition = resolve_wort_composition(
                oe_plato=oe_plato,
                extract_total_kg=extract_total,
                s_late_add=sugar,
                malt_fermentability=aa_malt,
                yeast_cap_apparent=inputs.malt_attenuation_cap,
                dextrin_consumption=dextrin_consumption,
                sugar_fermentability=inputs.sugar_fermentability,
            )
            return composition.apparent_extract_plato - target_ae

        grid = [1e-9, 0.5, 1.0, 2.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0]
        bracket = None
        previous_oe = None
        previous = None
        for candidate in grid:
            current = residual(candidate)
            if current is None:
                previous_oe = None
                previous = None
                continue
            if abs(current) < 1e-12:
                bracket = (candidate, candidate)
                break
            if previous is not None and previous * current < 0.0:
                bracket = (previous_oe, candidate)
                break
            previous_oe, previous = candidate, current
        if bracket is None:
            raise SolverValidationError(
                "FG_UNREACHABLE",
                (
                    f"Target FG {target:.4f} is not reachable within the "
                    "0-40 °P bracket at this composition."
                ),
            )
        if bracket[0] == bracket[1]:
            oe_plato = bracket[0]
        else:
            oe_plato = brentq(
                lambda x: residual(x)  # type: ignore[arg-type]
                if residual(x) is not None
                else 0.0,
                bracket[0],
                bracket[1],
            )
        sg_post_boil = asbc_plato_to_sg(oe_plato)
        extract_total = post_boil_extract_target(
            sg_post_boil, v_kettle_cold, GAMMA_METRIC
        )
        sugar = sugar_extract_for(
            inputs.sugar_extract_share, extract_total, inputs.s_late_add
        )
    else:
        raise SolverValidationError(
            "INVALID_SCALE_PIN", f"Unknown scale pin: {pin!r}."
        )

    if extract_total <= sugar:
        raise SolverValidationError(
            "EXTRACT_TARGET_NON_POSITIVE",
            (
                f"Post-boil extract target ({extract_total:.4f} kg) must "
                f"exceed late-addition extract ({sugar:.4f} kg)."
            ),
        )
    composition = resolve_wort_composition(
        oe_plato=oe_plato,
        extract_total_kg=extract_total,
        s_late_add=sugar,
        malt_fermentability=aa_malt,
        yeast_cap_apparent=inputs.malt_attenuation_cap,
        dextrin_consumption=dextrin_consumption,
        sugar_fermentability=inputs.sugar_fermentability,
    )
    return _GravityState(
        oe_plato=oe_plato,
        sg_post_boil=sg_post_boil,
        extract_total_kg=extract_total,
        sugar_extract_kg=sugar,
        composition=composition,
    )


def _preview_rows(
    inputs: BatchSolverInput,
    v_kettle_cold: float,
    aa_malt: float,
    dextrin_consumption: float,
) -> tuple[ScalePreview, ...]:
    rows: list[ScalePreview] = []
    for pin in ("abv", "og", "fg"):
        try:
            state = _resolve_gravity(
                inputs,
                pin,
                _target_for(inputs, pin),
                v_kettle_cold,
                aa_malt,
                dextrin_consumption,
            )
        except SolverValidationError as exc:
            rows.append(ScalePreview(pin, 0.0, 0.0, 0.0, False, exc.code))
            continue
        rows.append(
            ScalePreview(
                pin,
                state.sg_post_boil,
                asbc_plato_to_sg(state.composition.apparent_extract_plato),
                state.composition.abv_pct,
                True,
                "",
            )
        )
    return tuple(rows)


def _solve_pipeline(
    inputs: BatchSolverInput, pin: str, target: float | None
) -> _Pipeline:
    validate_grain_bill_normalization(inputs.grain_bill)
    yield_fraction = composite_yield_fraction(inputs.grain_bill)
    mc_bar = composite_moisture_fraction(inputs.grain_bill)
    aa_malt = composite_fermentability_fraction(inputs.grain_bill)

    # A diastaticus strain consumes the malt's dextrin residue (d = 1). An
    # unknown status is modelled as d = 0 and surfaced as a host-side finding,
    # never as a silent negative.
    dextrin_consumption = 1.0 if inputs.sta1 is True else 0.0

    def solve_phase_1(aa: float):
        sg = solve_sg_post_boil_from_abv(
            target if target is not None else 0.0, aa
        )
        rev = resolve_volumetric_reversal(
            v_ferm=inputs.v_ferm,
            sg_post_boil=sg,
            v_kettle_dead=inputs.v_kettle_dead,
            v_kettle_transfer=inputs.v_kettle_transfer,
            v_trub=inputs.v_trub,
            delta_v_evap=inputs.delta_v_evap,
            s_late_add=inputs.s_late_add,
            f_shrink=inputs.f_shrink,
        )
        return sg, rev

    if aa_malt is None:
        # Legacy scalar path: a caller that supplies no per-row fermentability
        # keeps the original apparent-attenuation inversion. Share mode and the
        # OG/FG pins are composition features and have no meaning without it.
        if pin != "abv" or inputs.sugar_extract_share > 0.0:
            raise SolverValidationError(
                "INVALID_SCALE_PIN",
                (
                    "This scale pin requires per-row fermentability; the grain "
                    "bill omits it."
                ),
            )
        cap = inputs.malt_attenuation_cap
        apparent_attenuation = cap
        real_attenuation = cap
        sg_post_boil, reversal = solve_phase_1(apparent_attenuation)
        max_abv = max_achievable_abv(apparent_attenuation)
        s_late_add = inputs.s_late_add
    else:
        v_kettle_cold = kettle_cold_volume(
            inputs.v_ferm, inputs.v_kettle_dead, inputs.f_shrink
        )
        state = _resolve_gravity(
            inputs, pin, target, v_kettle_cold, aa_malt, dextrin_consumption
        )
        sg_post_boil = state.sg_post_boil
        s_late_add = state.sugar_extract_kg
        reversal = resolve_volumetric_reversal(
            v_ferm=inputs.v_ferm,
            sg_post_boil=sg_post_boil,
            v_kettle_dead=inputs.v_kettle_dead,
            v_kettle_transfer=inputs.v_kettle_transfer,
            v_trub=inputs.v_trub,
            delta_v_evap=inputs.delta_v_evap,
            s_late_add=s_late_add,
            f_shrink=inputs.f_shrink,
        )
        composition = state.composition
        real_attenuation = composition.real_attenuation
        apparent_attenuation = composition.apparent_attenuation
        max_abv = _abv_ceiling(
            inputs, v_kettle_cold, aa_malt, dextrin_consumption
        )

    try:
        m_grist = solve_grist_mass(
            v_pre_boil=reversal.v_pre_boil,
            r_l_to_g=inputs.intensive_value,
            yield_fraction=yield_fraction,
            mc_bar=mc_bar,
            eta_conv=inputs.eta_conv,
            s_post_boil_target=reversal.s_post_boil_target,
            s_late_add=s_late_add,
            v_dead=inputs.v_dead,
            k_abs_true=inputs.k_abs_true,
            topology=inputs.topology,
            mash_transfer_loss=inputs.mash_transfer_loss,
        )
    except SolverValidationError as exc:
        if exc.code in ("BRACKET_NO_SIGN_CHANGE", "DEGENERATE_BRACKET"):
            cause = _diagnose_bracket(
                inputs, reversal, yield_fraction, mc_bar, inputs.eta_conv, s_late_add
            )
            if cause is not None:
                raise cause from exc
        raise

    cascade = resolve_stage_cascade(
        m_grist=m_grist,
        v_pre_boil=reversal.v_pre_boil,
        topology=inputs.topology,
        intensive_value=inputs.intensive_value,
        yield_fraction=yield_fraction,
        mc_bar=mc_bar,
        eta_conv=inputs.eta_conv,
        v_dead=inputs.v_dead,
        delta_v_evap=inputs.delta_v_evap,
        mash_transfer_loss=inputs.mash_transfer_loss,
        k_abs_true=inputs.k_abs_true,
    )

    hlt = resolve_hlt_water_budget(
        hlt_starting_volume_l=inputs.hlt_starting_volume_l,
        v_strike_drawn=cascade.v_strike,
        v_sparge_demand=cascade.v_sparge,
        hlt_dead_space_l=inputs.hlt_dead_space_l,
        hlt_transfer_loss_l=inputs.hlt_transfer_loss_l,
        hlt_coil_floor_l=inputs.hlt_coil_floor_l,
        max_hlt_volume_l=inputs.max_hlt_volume_l,
    )

    return _Pipeline(
        sg_post_boil=sg_post_boil,
        reversal=reversal,
        m_grist=m_grist,
        cascade=cascade,
        hlt=hlt,
        real_attenuation=real_attenuation,
        apparent_attenuation=apparent_attenuation,
        max_abv=max_abv,
    )


def _feasible_bound(
    inputs: BatchSolverInput, fermentation_ceiling: float
) -> tuple[float, str]:
    def probe(target_abv: float) -> str | None:
        if target_abv <= 0.0:
            return "volume"
        try:
            pipeline = _solve_pipeline(inputs, "abv", target_abv)
        except SolverValidationError as exc:
            if exc.code == "ABV_UNREACHABLE":
                return "fermentation"
            if exc.code == "HLT_TOO_SMALL":
                return "hlt"
            if exc.code == "MASH_TUN_TOO_SMALL":
                return "tun"
            if exc.code == "KETTLE_TOO_SMALL":
                return "kettle"
            if exc.code in (
                "BRACKET_NO_SIGN_CHANGE",
                "DEGENERATE_BRACKET",
                "MASH_TOO_THIN",
                "EXTRACT_TARGET_NON_POSITIVE",
                "INVALID_YIELD",
            ):
                return "volume"
            raise
        return _capacity_violation(inputs, pipeline)

    low = None
    low_reason = None
    for candidate in range(1, 20):
        reason = probe(float(candidate))
        if reason is None:
            low = float(candidate)
            break
        if low_reason is None:
            low_reason = reason
    if low is None:
        return 0.0, low_reason or "volume"

    high = max(fermentation_ceiling, low)
    high_reason = probe(high)
    if high_reason is None:
        return high, "fermentation"

    for _ in range(30):
        mid = (low + high) / 2.0
        if probe(mid) is None:
            low = mid
        else:
            high = mid
    return low, probe(high) or "fermentation"


def solve_batch(inputs: BatchSolverInput) -> BatchSolverResult:
    """Top-level orchestrator composing Phases 1-4.

    Pipeline:

    1. Phase 1: isolate the active scale target (ABV, OG, or FG) and the
       composition block.
    2. Phase 2: reverse kettle mechanics to derive ``V_pre_boil`` and
       ``S_post_boil_target``.
    3. Phase 3: resolve ``M_grist`` via Brent's method.
    4. Phase 4: cascade stage volumes and gravities.

    The feasible-ABV bound is found by bisecting the ABV pipeline against the
    rig's capacity limits; it never changes the active target solve. The preview
    rows are diagnostics at the three persisted targets.

    Args:
        inputs: The frozen ``BatchSolverInput`` bundle.

    Returns:
        A frozen ``BatchSolverResult`` with all derived anchors.

    Raises:
        SolverValidationError: Propagated from any phase's validation gate. A
            bracket failure is replaced by a named capacity code when the
            upper-bound check is definitive.

    See ``domain-equations.md`` §2.5.
    """
    pin = inputs.scale_pin
    target = _target_for(inputs, pin)
    pipeline = _solve_pipeline(inputs, pin, target)
    fermentation_ceiling = pipeline.max_abv
    max_feasible_abv, binding_constraint = _feasible_bound(
        inputs, fermentation_ceiling
    )

    aa_malt = composite_fermentability_fraction(inputs.grain_bill)
    has_sugar = inputs.s_late_add > 0.0 or inputs.sugar_extract_share > 0.0
    if not has_sugar:
        # The preview matrix is a sugar-composition diagnostic. 85% of batches
        # never open it, so skip the three lightweight solves entirely.
        previews = ()
    elif aa_malt is None:
        previews = tuple(
            ScalePreview(p, 0.0, 0.0, 0.0, False, "INVALID_ATTENUATION")
            for p in ("abv", "og", "fg")
        )
    else:
        v_kettle_cold = kettle_cold_volume(
            inputs.v_ferm, inputs.v_kettle_dead, inputs.f_shrink
        )
        dextrin_consumption = 1.0 if inputs.sta1 is True else 0.0
        previews = _preview_rows(
            inputs, v_kettle_cold, aa_malt, dextrin_consumption
        )

    return BatchSolverResult(
        sg_post_boil=pipeline.sg_post_boil,
        v_pre_boil=pipeline.reversal.v_pre_boil,
        s_post_boil_target=pipeline.reversal.s_post_boil_target,
        m_grist=pipeline.m_grist,
        cascade=pipeline.cascade,
        max_achievable_abv=fermentation_ceiling,
        real_attenuation=pipeline.real_attenuation,
        apparent_attenuation=pipeline.apparent_attenuation,
        hlt=pipeline.hlt,
        max_feasible_abv=max_feasible_abv,
        binding_constraint=binding_constraint,
        mash_thickness_l_per_kg=pipeline.cascade.mash_thickness_l_per_kg,
        previews=previews,
    )
