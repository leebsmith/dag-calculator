"""Salt stoichiometry: per-litre doses to added ion ppm, and the dose types."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.errors import SolverValidationError
from app.core.water.constants import SALT_COEFFS


@dataclass(frozen=True)
class SaltDose:
    """Per-liter salt concentrations (grams/liter)."""

    gypsum_g_per_l: float = 0.0
    cacl2_g_per_l: float = 0.0
    epsom_g_per_l: float = 0.0
    nacl_g_per_l: float = 0.0
    alkaline_agent_g_per_l: float = 0.0


def _salt_ion_coeffs(gypsum_form: str, cacl2_form: str) -> dict[str, dict[str, float]]:
    if gypsum_form not in SALT_COEFFS or cacl2_form not in SALT_COEFFS:
        raise SolverValidationError("UNKNOWN_SALT_FORM", "Unknown salt hydrate form.")
    return {
        "GYPSUM": SALT_COEFFS[gypsum_form],
        "CACL2": SALT_COEFFS[cacl2_form],
        "EPSOM": SALT_COEFFS["EPSOM"],
        "NACL": SALT_COEFFS["NACL"],
    }


def ions_added_ppm(
    dose: SaltDose,
    gypsum_form: str,
    cacl2_form: str,
    preferred_alkaline_agent: str = "PICKLING_LIME",
) -> dict[str, float]:
    """Calculate the ion ppm added per liter by a per-liter salt dose."""
    coeffs = _salt_ion_coeffs(gypsum_form, cacl2_form)
    added = {"ca": 0.0, "mg": 0.0, "na": 0.0, "so4": 0.0, "cl": 0.0, "alk": 0.0}

    masses = {
        "GYPSUM": dose.gypsum_g_per_l,
        "CACL2": dose.cacl2_g_per_l,
        "EPSOM": dose.epsom_g_per_l,
        "NACL": dose.nacl_g_per_l,
    }
    for salt, grams in masses.items():
        for ion, coef in coeffs[salt].items():
            if ion in added:
                added[ion] += grams * coef

    # Account for alkaline agent contribution if present in dose
    if dose.alkaline_agent_g_per_l > 0.0 and preferred_alkaline_agent in SALT_COEFFS:
        agent_yields = SALT_COEFFS[preferred_alkaline_agent]
        for ion, coef in agent_yields.items():
            if ion in added:
                added[ion] += dose.alkaline_agent_g_per_l * coef

    return added


def add_ions(base: dict[str, float], added: dict[str, float]) -> dict[str, float]:
    """Add two ion profiles together."""
    return {
        ion: float(base.get(ion, 0.0) + added.get(ion, 0.0))
        for ion in {"ca", "mg", "na", "so4", "cl", "alk"}
    }


def _agent_g_per_l(
    source: dict[str, float], target: dict[str, float], preferred_alkaline_agent: str
) -> float:
    """Per-litre alkaline agent mass to raise alkalinity to the target buffer."""
    deficit = target.get("alk", 0.0) - source.get("alk", 0.0)
    if deficit <= 0.0:
        return 0.0
    yield_alk = SALT_COEFFS.get(preferred_alkaline_agent, {}).get("alk", 0.0)
    return deficit / yield_alk if yield_alk > 0.0 else 0.0
