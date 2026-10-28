"""Grist acidity, residual alkalinity, the bounded mash-pH model, and acid/base dosing."""

from __future__ import annotations

import math
from collections.abc import Sequence

from app.core.errors import SolverValidationError
from app.core.water.constants import (
    ACID_PROPERTIES,
    ALKALINE_AGENT_EQUIV,
    BICARBONATE_EQ_WEIGHT,
    GRAIN_ACIDITY,
    MASH_PH_CEIL,
    MASH_PH_FLOOR,
    MASH_PH_MID,
    MASH_PH_OPTIMAL_HIGH,
    MASH_PH_OPTIMAL_LOW,
    MASH_PH_SCALE,
    P1_CARBONIC,
    P2_CARBONIC,
    QT_PER_L_PER_KG,
    RA_CA_COEFF,
    RA_MG_COEFF,
)
from app.core.water.inputs import GrainEntry


def resolve_grist(grist: Sequence[GrainEntry]) -> tuple[float, dict[str, float]]:
    """Return total grain acidity in mEq and mass breakdown by grain bucket."""
    total_acidity = 0.0
    buckets: dict[str, float] = {"BASE": 0.0, "CRYSTAL": 0.0, "ROASTED": 0.0, "ACID": 0.0}

    for entry in grist:
        params = GRAIN_ACIDITY.get(entry.grain_type)
        if params is None:
            raise SolverValidationError(
                "UNKNOWN_GRAIN_TYPE",
                f"Unknown grain type {entry.grain_type!r}. Expected: BASE, CRYSTAL, ROASTED, ACID.",
            )
        total_acidity += entry.mass_kg * (params["slope"] * entry.color_lovibond + params["offset"])
        buckets[entry.grain_type] = buckets.get(entry.grain_type, 0.0) + entry.mass_kg

    return total_acidity, buckets


def residual_alkalinity(ca_ppm: float, mg_ppm: float, alkalinity_caco3: float) -> float:
    """Kolbach residual alkalinity (ppm as CaCO3)."""
    return alkalinity_caco3 - (ca_ppm * RA_CA_COEFF + mg_ppm * RA_MG_COEFF)


def bicarbonate_from_alkalinity(alkalinity_caco3: float) -> float:
    """Bicarbonate (ppm) implied by total alkalinity (ppm as CaCO3)."""
    return alkalinity_caco3 * (BICARBONATE_EQ_WEIGHT / 50.0)


def predict_mash_ph(
    grist_acidity_meq: float,
    ra_ppm: float,
    v_mash_treat_l: float,
    mash_thickness_l_per_kg: float,
) -> float:
    """Estimated room-temperature mash pH (bounded buffer-capacity model)."""
    if v_mash_treat_l <= 0.0:
        raise SolverValidationError("INVALID_MASH_VOLUME", "Mash volume must be positive.")

    water_alk_meq = (ra_ppm / 50.0) * v_mash_treat_l
    qt_per_lb = mash_thickness_l_per_kg / QT_PER_L_PER_KG
    i26 = (grist_acidity_meq - water_alk_meq * qt_per_lb / 1.5) / v_mash_treat_l
    return MASH_PH_FLOOR + (MASH_PH_CEIL - MASH_PH_FLOOR) * _logistic(
        (MASH_PH_MID - i26) / MASH_PH_SCALE
    )


def _logistic(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def mash_ph_status(ph: float) -> str:
    """Status categorizer for predicted mash pH."""
    if ph < MASH_PH_OPTIMAL_LOW:
        return "LOW"
    if ph > MASH_PH_OPTIMAL_HIGH:
        return "HIGH"
    return "OPTIMAL"


def _carbonate_fractions(ph: float) -> tuple[float, float, float]:
    r1 = 10.0 ** (ph - P1_CARBONIC)
    r2 = 10.0 ** (ph - P2_CARBONIC)
    d = 1.0 + r1 + r1 * r2
    return 1.0 / d, r1 / d, (r1 * r2) / d


def residual_alkalinity_for_target_ph(
    grist_acidity_meq: float,
    target_ph: float,
    v_mash_treat_l: float,
    mash_thickness_l_per_kg: float,
) -> float | None:
    """Residual alkalinity (ppm as CaCO3) that lands on ``target_ph``.

    Inverts the bounded logistic pH model. Returns ``None`` when the target lies
    outside the model's open floor/ceiling band.
    """
    if v_mash_treat_l <= 0.0:
        raise SolverValidationError("INVALID_MASH_VOLUME", "Mash volume must be positive.")
    if not (MASH_PH_FLOOR < target_ph < MASH_PH_CEIL):
        return None
    qt_per_lb = mash_thickness_l_per_kg / QT_PER_L_PER_KG
    if not (qt_per_lb > 0.0):
        return None
    fraction = (target_ph - MASH_PH_FLOOR) / (MASH_PH_CEIL - MASH_PH_FLOOR)
    z = math.log(fraction / (1.0 - fraction))
    i26_target = MASH_PH_MID - z * MASH_PH_SCALE
    water_alk_meq = (grist_acidity_meq - i26_target * v_mash_treat_l) * 1.5 / qt_per_lb
    return water_alk_meq * 50.0 / v_mash_treat_l


def _acid_charge_fraction(ph: float, pks: tuple[float, float, float]) -> float:
    r1 = 10.0 ** (ph - pks[0])
    r2 = 10.0 ** (ph - pks[1])
    r3 = 10.0 ** (ph - pks[2])
    dd = 1.0 / (1.0 + r1 + r1 * r2 + r1 * r2 * r3)
    f2 = dd * r1
    f3 = r1 * r2 * dd
    f4 = r1 * r2 * r3 * dd
    return f2 + 2.0 * f3 + 3.0 * f4


def acid_volume_ml(acid_meq_total: float, acid_medium: str, ph_for_charge: float) -> float:
    """Milliliters of liquid acid solution for a given mEq demand."""
    props = ACID_PROPERTIES.get(acid_medium)
    if props is None:
        raise SolverValidationError(
            "UNKNOWN_ACID_MEDIUM",
            f"Unknown acid medium {acid_medium!r}. Expected: LACTIC_88, PHOSPHORIC_10, PHOSPHORIC_85.",
        )
    charge = _acid_charge_fraction(ph_for_charge, props["pks"])
    if charge <= 0.0:
        return 0.0
    mmol = acid_meq_total / charge
    pure_acid_mg = mmol * props["mol_wt"]
    strength = props["strength_pct"] / 100.0
    density_mg_per_ml = props["density_g_per_ml"] * 1000.0
    return pure_acid_mg / (strength * density_mg_per_ml)


def alkaline_agent_mass_g(alkaline_meq_total: float, agent: str) -> float:
    """Grams of alkaline agent to supply a given mEq deficit."""
    equiv = ALKALINE_AGENT_EQUIV.get(agent)
    if equiv is None:
        raise SolverValidationError(
            "UNKNOWN_ALKALINE_AGENT",
            f"Unknown alkaline agent {agent!r}. Expected: BAKING_SODA, CHALK, PICKLING_LIME.",
        )
    return alkaline_meq_total * equiv
