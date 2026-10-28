"""Phase 3: grist mass resolution by 1D root-finding.

Both constraint topologies are implemented: ``{V_pre_boil, R_L:G}`` and
``{V_pre_boil, r}``. See ``domain-equations.md`` §2.5.
"""

from __future__ import annotations

import math

from scipy.optimize import brentq

from app.core.batch.constants import K_ABS_TRUE_METRIC, RHO_WATER_METRIC, V_BAR_METRIC
from app.core.batch.helpers import (
    converted_extract,
    moisture_volume,
    retained_volume,
    solute_displacement_volume,
)
from app.core.batch.volumetric import ExtractSplit, require_malt_extract
from app.core.errors import SolverValidationError


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
    require_malt_extract(
        ExtractSplit(extract_total_kg=s_post_boil_target, sugar_extract_kg=s_late_add)
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
