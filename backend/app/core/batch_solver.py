"""
Batch solver: canonical mass and volume balance for single-strike, single-sparge
batch sparging.

This module implements the four-phase pipeline described in
``docs/batch-math/unified-treatment.md`` and mapped in
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
* Provenance: ``docs/batch-math/unified-treatment.md`` and
  ``docs/batch-math/batch-sparge-non-linear-root-finding-v2.md``.
* Scope: imports nothing from ``app.*`` except the shared equation layer
  ``app.core.utils``; the service layer maps request schemas onto the
  dataclasses defined here.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from scipy.optimize import brentq

from app.core.utils import plato_to_sg, sg_to_plato

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

K_ABS_TRUE_METRIC: float = 1.67
"""True husk absorption coefficient in L/kg."""

RHO_WATER_METRIC: float = 1.00
"""Density of water at strike temperature in kg/L."""

F_SHRINK_DEFAULT: float = 0.04
"""Thermal contraction coefficient (dimensionless)."""


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


# ---------------------------------------------------------------------------
# Shared pure helpers
# ---------------------------------------------------------------------------


def composite_yield_fraction(grain_bill: Sequence[GrainBillEntry]) -> float:
    """Compute the composite dry-basis yield fraction ``E``.

    ``E = sum_i( w_i * DBFG_i * (1 - MC_i) )``

    See ``unified-treatment.md`` §2 (Mash Solute Generation) and
    ``batch-sparge-non-linear-root-finding-v2.md`` §1.1.
    """
    return sum(
        entry.w_i * entry.yield_i * (1.0 - entry.mc_i) for entry in grain_bill
    )


def composite_moisture_fraction(grain_bill: Sequence[GrainBillEntry]) -> float:
    """Compute the weighted moisture fraction ``MC_bar``.

    ``MC_bar = sum_i( w_i * MC_i )``

    See ``batch-sparge-non-linear-root-finding-v2.md`` §1.1.
    """
    return sum(entry.w_i * entry.mc_i for entry in grain_bill)


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

    See ``batch-sparge-non-linear-root-finding-v2.md`` §1.1.
    """
    return (mc_bar / RHO_WATER_METRIC) + (v_bar * eta_conv * yield_fraction)


def retained_volume(m_grist: float, k_abs_true: float, v_dead: float) -> float:
    """Compute the total retained liquid volume ``V_ret``.

    ``V_ret = k_abs_true * M_grist + V_dead``

    See ``unified-treatment.md`` §2 (Retention Kinetics).
    """
    return (k_abs_true * m_grist) + v_dead


def moisture_volume(m_grist: float, mc_bar: float) -> float:
    """Compute the intrinsic grain moisture volume ``V_mc``.

    ``V_mc = M_grist * MC_bar / rho_water``

    See ``unified-treatment.md`` §2 (Mash Solute Generation).
    """
    return (m_grist * mc_bar) / RHO_WATER_METRIC


def solute_displacement_volume(s_conv: float, v_bar: float) -> float:
    """Compute the dissolved solute displacement volume ``V_sol``.

    ``V_sol = v_bar * S_conv``

    See ``unified-treatment.md`` §2 (Mash Solute Generation).
    """
    return v_bar * s_conv


def converted_extract(
    m_grist: float, yield_fraction: float, eta_conv: float
) -> float:
    """Compute the converted soluble extract mass ``S_conv``.

    ``S_conv = eta_conv * E * M_grist``

    See ``unified-treatment.md`` §2 (Mash Solute Generation).
    """
    return eta_conv * yield_fraction * m_grist


# ---------------------------------------------------------------------------
# Phase 1: Cold-Side Inverse Resolution
# ---------------------------------------------------------------------------
#
# Stage 5 reconciliation: the ASBC conversion polynomials are now sourced from
# ``app.core.utils``, which implements the official ASBC 3rd-order (Plato -> SG)
# and cubic (SG -> Plato) polynomials. ``unified-treatment.md`` §6's snippet
# used simplified coefficients; ``utils.py`` is authoritative. The local
# aliases below preserve the solver's public API without duplicating the math.


def asbc_plato_to_sg(plato: float) -> float:
    """Convert degrees Plato to specific gravity (ASBC 3rd-order polynomial).

    Delegates to ``app.core.utils.plato_to_sg``. See ``unified-treatment.md``
    §6 and ``utils.py`` for the authoritative coefficients.
    """
    return plato_to_sg(plato)


def asbc_sg_to_plato(sg: float) -> float:
    """Convert specific gravity to degrees Plato (ASBC cubic polynomial).

    Delegates to ``app.core.utils.sg_to_plato``. See ``unified-treatment.md``
    §6 and ``utils.py`` for the authoritative coefficients.
    """
    return sg_to_plato(sg)


def cutaia_abv(oe_plato: float, apparent_attenuation: float) -> float:
    """Compute ABV via the Cutaia et al. (2009) empirical model.

    ``ae_plato = oe_plato * (1 - AA)``
    ``abw = (0.372 + 0.00357 * oe_plato) * (oe_plato - ae_plato)``
    ``abv = abw * (fg_sg / 0.7907)``

    See ``unified-treatment.md`` §6.
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

    See ``unified-treatment.md`` §5 Phase 1 and §6.
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

    See ``unified-treatment.md`` §5 Phase 2.
    """
    return v_ferm + (v_kettle_dead * (1.0 - f_shrink))


def post_boil_extract_target(
    sg_post_boil: float, v_kettle_cold: float, gamma: float
) -> float:
    """Compute the required post-boil extract mass ``S_post_boil_target``.

    ``S_post_boil_target = 1000 * (SG_post_boil - 1) * V_kettle_cold / gamma``

    See ``unified-treatment.md`` §5 Phase 2.
    """
    return (1000.0 * (sg_post_boil - 1.0) * v_kettle_cold) / gamma


def pre_boil_volume(
    v_ferm: float,
    v_kettle_dead: float,
    delta_v_evap: float,
    s_late_add: float,
    v_bar: float,
    f_shrink: float,
) -> float:
    """Compute the derived pre-boil kettle volume ``V_pre_boil``.

    ``V_pre_boil = V_ferm / (1 - f_shrink) + V_kettle_dead + delta_v_evap
                   - v_bar * S_late_add``

    See ``unified-treatment.md`` §5 Phase 2.
    """
    return (
        (v_ferm / (1.0 - f_shrink))
        + v_kettle_dead
        + delta_v_evap
        - (v_bar * s_late_add)
    )


def resolve_volumetric_reversal(
    v_ferm: float,
    sg_post_boil: float,
    v_kettle_dead: float,
    delta_v_evap: float,
    s_late_add: float,
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

    See ``unified-treatment.md`` §5 Phase 2.
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
        v_ferm, v_kettle_dead, delta_v_evap, s_late_add, v_bar, f_shrink
    )

    return VolumetricReversal(
        v_kettle_cold=v_kettle_cold,
        s_post_boil_target=s_post_boil_target,
        v_pre_boil=v_pre_boil,
    )


# ---------------------------------------------------------------------------
# Phase 3: Grist Mass Resolution (1D Root-Finding)
# ---------------------------------------------------------------------------
#
# Stage 1.3 implements only the {V_pre_boil, R_L:G} constraint topology.
# The {V_pre_boil, r} topology is deferred to Stage 1.4.


def grist_mass_bracket(
    s_post_boil_target: float,
    s_late_add: float,
    yield_fraction: float,
) -> tuple[float, float]:
    """Compute the guaranteed bracketing interval ``[a, b]`` for ``M_grist``.

    ``a = max(0.0, (S_post_boil_target - S_late_add) / E)``
    ``b = (S_post_boil_target - S_late_add) / (0.50 * E)``

    See ``unified-treatment.md`` §4.
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
) -> float:
    """Evaluate the cleared-denominator cubic residual ``P(M_grist)``.

    ``P(M) = (eta_conv * E * M) * [D1(M) * D2(M) - V_ret(M)^2]
             - (S_target - S_late) * D1(M) * D2(M)``

    where:

    * ``c_vol = MC_bar / rho_water + v_bar * eta_conv * E``
    * ``D1(M) = V_strike + c_vol * M``
    * ``D2(M) = V_sparge + V_dead + k_abs_true * M``

    Under the ``{V_pre_boil, R_L:G}`` topology (``topology="r_l_to_g"``):

    * ``V_strike = R_L:G * M``
    * ``V_sparge = V_pre_boil - V_run1``, with ``V_run1`` derived from the tun
      mass balance. Because ``V_sparge`` itself depends on ``M``, the residual
      is evaluated by first computing ``V_run1`` and then subtracting.

    Under the ``{V_pre_boil, r}`` topology (``topology="runoff_ratio"``):

    * ``V_sparge = V_pre_boil / (r + 1)`` (static, independent of ``M``)
    * ``V_strike`` is reversed from the tun mass balance to absorb retention.

    See ``unified-treatment.md`` §4.
    """
    c_vol = (mc_bar / RHO_WATER_METRIC) + (v_bar * eta_conv * yield_fraction)

    v_mc = moisture_volume(m_grist, mc_bar)
    s_conv = converted_extract(m_grist, yield_fraction, eta_conv)
    v_sol = solute_displacement_volume(s_conv, v_bar)
    v_ret = retained_volume(m_grist, k_abs_true, v_dead)

    if topology == "runoff_ratio":
        # Static sparge split; reverse the tun mass balance for V_strike.
        v_sparge = v_pre_boil / (r_l_to_g + 1.0)
        v_run1 = v_pre_boil - v_sparge
        v_strike = v_run1 + v_ret - v_mc - v_sol
    else:
        v_strike = r_l_to_g * m_grist
        v_run1 = v_strike + v_mc + v_sol - v_ret
        v_sparge = v_pre_boil - v_run1

    d1 = v_strike + (c_vol * m_grist)
    d2 = v_sparge + v_dead + (k_abs_true * m_grist)

    delta_s = s_post_boil_target - s_late_add
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

    Returns:
        The converged dry grist mass ``M_grist``, in kg.

    Raises:
        SolverValidationError: If the bracket is degenerate or the residual
            does not change sign across it.

    See ``unified-treatment.md`` §4 and §5 Phase 3.
    """
    if topology not in ("r_l_to_g", "runoff_ratio"):
        raise SolverValidationError(
            "UNKNOWN_TOPOLOGY",
            f"Unknown constraint topology: {topology!r}.",
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
    if topology == "r_l_to_g" and r_l_to_g < K_ABS_TRUE_METRIC:
        raise SolverValidationError(
            "MASH_TOO_THIN",
            (
                f"Liquor-to-grist ratio ({r_l_to_g:.2f} L/kg) is below the "
                f"husk absorption floor ({K_ABS_TRUE_METRIC} L/kg). The grain "
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

    See ``unified-treatment.md`` §2 (Runoff Volumetrics and Kettle Balance).
    """
    return v_strike + v_mc + v_sol - v_ret


def second_runnings_volume(v_pre_boil: float, v_run1: float) -> float:
    """Compute the second-runnings volume ``V_run2``.

    ``V_run2 = V_pre_boil - V_run1``

    See ``unified-treatment.md`` §2 (Runoff Volumetrics and Kettle Balance).
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

    See ``unified-treatment.md`` §2 (Stage Extract Distribution and Specific
    Gravity).
    """
    r_f1 = v_ret / (v_strike + v_mc + v_sol)
    r_f2 = v_ret / (v_sparge + v_ret)
    s_run1 = s_conv * (1.0 - r_f1)
    s_run2 = (s_conv * r_f1) * (1.0 - r_f2)
    return s_run1, s_run2


def calculate_sg_pre_boil(
    s_run1: float,
    s_run2: float,
    v_pre_boil: float,
    gamma: float = GAMMA_METRIC,
) -> float:
    """Phase 4: assemble the consolidated pre-boil specific gravity.

    ``SG_pre_boil = 1 + ((S_run1 + S_run2) * gamma) / (1000 * V_pre_boil)``

    See ``unified-treatment.md`` §2 and §6.
    """
    return 1.0 + (((s_run1 + s_run2) * gamma) / (1000.0 * v_pre_boil))


@dataclass(frozen=True)
class StageCascade:
    """Result of Phase 4: the post-convergence stage volumes and gravities.

    Attributes:
        v_strike: Strike volume, in liters.
        v_run1: First-runnings volume, in liters.
        v_run2: Second-runnings volume, in liters.
        v_sparge: Sparge volume, in liters.
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
    k_abs_true: float = K_ABS_TRUE_METRIC,
    v_bar: float = V_BAR_METRIC,
    gamma: float = GAMMA_METRIC,
) -> StageCascade:
    """Phase 4: cascade stage volumes and gravities post-convergence.

    Dispatches on ``topology``:

    * ``"r_l_to_g"``: ``V_strike = R_L:G * M_grist``; ``V_run1`` from the tun
      mass balance; ``V_run2 = V_sparge = V_pre_boil - V_run1``.
    * ``"runoff_ratio"``: ``V_sparge = V_run2 = V_pre_boil / (r + 1)``;
      ``V_run1 = V_pre_boil - V_run2``; ``V_strike`` is reversed from the tun
      mass balance to absorb retention.

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
        k_abs_true: True husk absorption coefficient, in L/kg.
        v_bar: Apparent specific volume of dissolved extract, in L/kg.
        gamma: Gravity-points conversion constant, in GU·L/kg.

    Returns:
        A frozen ``StageCascade`` with the derived volumes and gravities.

    Raises:
        SolverValidationError: If ``topology`` is unknown or the intensive
            value is non-positive.

    See ``unified-treatment.md`` §5 Phase 4.
    """
    if topology not in ("r_l_to_g", "runoff_ratio"):
        raise SolverValidationError(
            "UNKNOWN_TOPOLOGY",
            f"Unknown constraint topology: {topology!r}.",
        )
    if intensive_value <= 0.0:
        raise SolverValidationError(
            "INVALID_INTENSIVE_VALUE",
            f"Intensive constraint must be positive; got {intensive_value}.",
        )
    if topology == "r_l_to_g" and intensive_value < K_ABS_TRUE_METRIC:
        raise SolverValidationError(
            "MASH_TOO_THIN",
            (
                f"Liquor-to-grist ratio ({intensive_value:.2f} L/kg) is below "
                f"the husk absorption floor ({K_ABS_TRUE_METRIC} L/kg). The "
                f"grain bed would retain more liquid than the strike provides."
            ),
        )

    v_mc = moisture_volume(m_grist, mc_bar)
    s_conv = converted_extract(m_grist, yield_fraction, eta_conv)
    v_sol = solute_displacement_volume(s_conv, v_bar)
    v_ret = retained_volume(m_grist, k_abs_true, v_dead)

    if topology == "r_l_to_g":
        v_strike = intensive_value * m_grist
        v_run1 = first_runnings_volume(v_strike, v_mc, v_sol, v_ret)
        v_run2 = second_runnings_volume(v_pre_boil, v_run1)
        v_sparge = v_run2
    else:  # "runoff_ratio"
        v_sparge = v_pre_boil / (intensive_value + 1.0)
        v_run2 = v_sparge
        v_run1 = v_pre_boil - v_run2
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
    sg_pre_boil = calculate_sg_pre_boil(s_run1, s_run2, v_pre_boil, gamma)

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

    return StageCascade(
        v_strike=v_strike,
        v_run1=v_run1,
        v_run2=v_run2,
        v_sparge=v_sparge,
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
# See ``plans/vessel-loss-model.md`` §4.4.


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

    See ``plans/vessel-loss-model.md`` §4.4.
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
        apparent_attenuation: Expected apparent attenuation as a fraction
            in (0, 1] (e.g. 0.75).
        v_ferm: Target cold fermenter volume, in liters.
        topology: Either ``"r_l_to_g"`` or ``"runoff_ratio"``.
        intensive_value: ``R_L:G`` (L/kg) or ``r`` (dimensionless).
        grain_bill: The malt specification vector.
        s_late_add: Late-addition extract mass, in kg.
        v_kettle_dead: Unrecoverable kettle/chiller dead space, in liters.
        delta_v_evap: Calibrated kettle boil-off volume, in liters.
        v_dead: Mash tun dead space, in liters.
        eta_conv: Mash conversion efficiency as a fraction.
        f_shrink: Thermal contraction coefficient (default 4%).
        hlt_starting_volume_l: Volume of liquor in the HLT at the start of the
            brew day, in liters. Batch-level parameter; the frontend pre-fills
            it from the equipment profile's ``max_hlt_volume_l``. Consumed by
            the HLT water budget (top-up and deliverable sparge volume), not
            by the extract mass balance.
        hlt_dead_space_l: Liquor trapped below the HLT drain port, in liters.
            Permanently undeliverable debt (see ``plans/vessel-loss-model.md``
            §4.4.1).
        hlt_transfer_loss_l: Liquor permanently held in the HLT hose and pump,
            in liters. Permanently undeliverable debt.
        hlt_coil_floor_l: Minimum HLT volume required to submerge the HERMS
            coil, in liters. A constraint, not a debt.
        max_hlt_volume_l: Maximum HLT capacity, in liters. Used to gate the
            top-up target (``HLT_TOO_SMALL``).
    """

    target_abv: float
    apparent_attenuation: float
    v_ferm: float
    topology: str
    intensive_value: float
    grain_bill: Sequence[GrainBillEntry]
    s_late_add: float
    v_kettle_dead: float
    delta_v_evap: float
    v_dead: float
    eta_conv: float
    hlt_starting_volume_l: float
    hlt_dead_space_l: float
    hlt_transfer_loss_l: float
    hlt_coil_floor_l: float
    max_hlt_volume_l: float
    f_shrink: float = F_SHRINK_DEFAULT


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
            attenuation, as a percentage. Echoed back so the frontend can
            bound the target-ABV input without duplicating the Cutaia model.
        hlt: The HLT water budget (top-up and deliverable sparge volume).
        mash_thickness_l_per_kg: Resolved liquor-to-grist ratio, in L/kg.
            Surfaced at the top level (in addition to ``cascade``) because the
            Mash Card reads it directly to derive strike water temperature
            (design record Q3/Q12). Under ``r_l_to_g`` it equals the input
            ``R_L:G``; under ``runoff_ratio`` it is derived from the cascade.
    """

    sg_post_boil: float
    v_pre_boil: float
    s_post_boil_target: float
    m_grist: float
    cascade: StageCascade
    max_achievable_abv: float
    hlt: HltWaterBudget
    mash_thickness_l_per_kg: float


def solve_batch(inputs: BatchSolverInput) -> BatchSolverResult:
    """Top-level orchestrator composing Phases 1-4.

    Pipeline:

    1. Phase 1: isolate ``SG_post_boil`` from the target ABV and attenuation.
    2. Phase 2: reverse kettle mechanics to derive ``V_pre_boil`` and
       ``S_post_boil_target``.
    3. Phase 3: resolve ``M_grist`` via Brent's method.
    4. Phase 4: cascade stage volumes and gravities.

    Args:
        inputs: The frozen ``BatchSolverInput`` bundle.

    Returns:
        A frozen ``BatchSolverResult`` with all derived anchors.

    Raises:
        SolverValidationError: Propagated from any phase's validation gate.

    See ``unified-treatment.md`` §5.
    """
    yield_fraction = composite_yield_fraction(inputs.grain_bill)
    mc_bar = composite_moisture_fraction(inputs.grain_bill)

    # Phase 1: cold-side inverse resolution.
    sg_post_boil = solve_sg_post_boil_from_abv(
        inputs.target_abv, inputs.apparent_attenuation
    )

    # Phase 2: volumetric reversal & extract targeting.
    reversal = resolve_volumetric_reversal(
        v_ferm=inputs.v_ferm,
        sg_post_boil=sg_post_boil,
        v_kettle_dead=inputs.v_kettle_dead,
        delta_v_evap=inputs.delta_v_evap,
        s_late_add=inputs.s_late_add,
        f_shrink=inputs.f_shrink,
    )

    # Phase 3: grist mass resolution.
    m_grist = solve_grist_mass(
        v_pre_boil=reversal.v_pre_boil,
        r_l_to_g=inputs.intensive_value,
        yield_fraction=yield_fraction,
        mc_bar=mc_bar,
        eta_conv=inputs.eta_conv,
        s_post_boil_target=reversal.s_post_boil_target,
        s_late_add=inputs.s_late_add,
        v_dead=inputs.v_dead,
        topology=inputs.topology,
    )

    # Phase 4: stage volume & gravity cascade.
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
    )

    # HLT water budget: derived from the cascade's sparge demand.
    hlt = resolve_hlt_water_budget(
        hlt_starting_volume_l=inputs.hlt_starting_volume_l,
        v_strike_drawn=cascade.v_strike,
        v_sparge_demand=cascade.v_sparge,
        hlt_dead_space_l=inputs.hlt_dead_space_l,
        hlt_transfer_loss_l=inputs.hlt_transfer_loss_l,
        hlt_coil_floor_l=inputs.hlt_coil_floor_l,
        max_hlt_volume_l=inputs.max_hlt_volume_l,
    )

    return BatchSolverResult(
        sg_post_boil=sg_post_boil,
        v_pre_boil=reversal.v_pre_boil,
        s_post_boil_target=reversal.s_post_boil_target,
        m_grist=m_grist,
        cascade=cascade,
        max_achievable_abv=max_achievable_abv(inputs.apparent_attenuation),
        hlt=hlt,
        mash_thickness_l_per_kg=cascade.mash_thickness_l_per_kg,
    )
