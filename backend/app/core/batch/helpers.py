"""Shared pure helpers composed by every phase.

Composite grain-bill aggregates, the volumetric primitives, and the two
readouts (brewhouse efficiency, grist attenuation) that have no phase of their
own. Constants are computed once in ``constants`` and composed here; no phase
re-derives them.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.core.batch.constants import RHO_WATER_METRIC
from app.core.batch.inputs import GrainBillEntry
from app.core.errors import SolverValidationError
from app.core.utils import apparent_extract_for_real_extract


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


def grist_apparent_attenuation(
    oe_plato: float, real_fermentability: float | None, fallback: float
) -> float:
    """The grist's real fermentability expressed as apparent attenuation.

    ``RE = OE · (1 − F)``; ``AE`` from the Cutaia real-extract regression; then
    ``(OE − AE) / OE``. The fallback is the yeast's cap, used when the grain bill
    publishes no per-row fermentability (legacy scalar path) so the readout never
    claims a shortfall it cannot see.
    """
    if real_fermentability is None or oe_plato <= 0.0:
        return fallback
    real_extract = oe_plato * (1.0 - real_fermentability)
    apparent_extract = apparent_extract_for_real_extract(oe_plato, real_extract)
    return (oe_plato - apparent_extract) / oe_plato


def brewhouse_efficiency(
    *,
    extract_total_kg: float,
    sugar_extract_kg: float,
    m_grist: float,
    yield_fraction: float,
    v_ferm: float,
    v_kettle_cold: float,
) -> float:
    """Malt extract into the fermenter as a share of the grist's potential.

    ``BE = (S_malt · V_ferm / V_kettle_cold) / (M_grist · E)``, where
    ``S_malt = extract_total − sugar_extract`` is the malt extract recovered in
    the kettle. Late-addition sugar is excluded from the numerator and the
    denominator.

    This is deliberately **not** ``eta_conv · V_ferm / V_kettle_cold``: lauter
    retention is already inside ``m_grist`` (``grist_mass_residual`` solves for
    the *recovered* extract), so the potential extract exceeds the converted
    extract by the absorption, dead-space and transfer losses.
    """
    potential = m_grist * yield_fraction
    if potential <= 0.0 or v_kettle_cold <= 0.0:
        return 0.0
    malt_extract = max(0.0, extract_total_kg - sugar_extract_kg)
    return (malt_extract * (v_ferm / v_kettle_cold)) / potential


def converted_extract(
    m_grist: float, yield_fraction: float, eta_conv: float
) -> float:
    """Compute the converted soluble extract mass ``S_conv``.

    ``S_conv = eta_conv * E * M_grist``

    See ``domain-equations.md`` §2.4.
    """
    return eta_conv * yield_fraction * m_grist
