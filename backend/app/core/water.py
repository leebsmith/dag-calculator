"""ADSCO Water Chemistry Engine — Pure Functional Replacement.

Adaptive Dual-Strategy Constrained Optimizer (ADSCO).
Replaces the legacy water chemistry solver while preserving pure-function,
sealed-boundary semantics and backward compatibility with the existing service adapter.

Key Architectural Enhancements:
1. Dual-Strategy Optimization Core:
   - Mode 1 / CALCIUM_FLOOR: Linear Minimalist Engine (mass minimization via scipy.optimize.linprog).
   - Mode 2 / HYBRID: Linear flavor minimization + structural alkalinity buffering.
   - Mode 3 / OPTIMIZE: Non-Linear Cloner Engine (least-squares profile curve-fitting via SLSQP).
   - Mode 4 / BASELINE: Pure enzymatic and sparge correction with zero added salts.
   - Mode 5 / CUSTOM: Dynamic sparse linear optimization on custom user-selected ion subsets.
2. Smart Intent Router: Automatically detects sparse vs. dense target vectors when strategy="AUTO".
3. Universal Guardrails: Non-negotiable biological (Ca >= 50 ppm default), toxicological (Mg <= 50 ppm,
   SO4 <= 400 ppm), and astringency (sparge pH <= 5.80) boundary enforcement with override transparency.
4. Structured Telemetry Engine: Emits machine-readable telemetry events (code, category, severity,
   message, context) while keeping string-based warnings and notes backward-compatible.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from scipy.optimize import linprog, minimize

# ---------------------------------------------------------------------------
# Physical and Chemical Constants
# ---------------------------------------------------------------------------

BICARBONATE_EQ_WEIGHT = 61.0
CARBONATE_EQ_WEIGHT = 30.0

# Kolbach residual-alkalinity coefficients (approx 1/1.4 and 1/1.7)
RA_CA_COEFF = 0.7143
RA_MG_COEFF = 0.5879

# Carbonic-acid speciation constants
P1_CARBONIC = 6.38
P2_CARBONIC = 10.33
CARBONIC_PKB = 4.3  # pH at which bicarbonate is fully dissociated

# Sparge tannin-extraction threshold
SPARGE_TANNIN_PH = 5.80

# Mash-pH model (metric)
MASH_PH_INTERCEPT = 5.76
MASH_PH_SLOPE = 0.17
QT_PER_L_PER_KG = 2.08635  # 1 L/kg == 2.08635 qt/lb

# Optimal mash pH extraction window
MASH_PH_OPTIMAL_LOW = 5.20
MASH_PH_OPTIMAL_HIGH = 5.60

# Biological and toxicological thresholds
DEFAULT_CALCIUM_FLOOR_PPM = 50.0
RECOMMENDED_CALCIUM_MIN_PPM = 30.0
EPSOM_MG_WARN_PPM = 40.0
HARD_MAGNESIUM_MAX_PPM = 50.0
HARD_SULFATE_MAX_PPM = 400.0

# Secondary ion contaminant limits (ppm)
CONTAMINANT_LIMITS = {
    "k": 10.0,
    "fe": 0.10,
    "mn": 0.05,
    "no3": 44.0,
}

# Grain acidity (mEq/kg) by grain type: acidity = mass_kg * (slope * color_L + offset)
GRAIN_ACIDITY = {
    "BASE": {"slope": 0.6174, "offset": 0.0},
    "CRYSTAL": {"slope": 0.46305, "offset": 5.5125},
    "ROASTED": {"slope": 0.0, "offset": 83.79},
    "ACID": {"slope": 0.0, "offset": 209.475},
}

# Salt ion yields (mg ion per gram of salt added per liter)
SALT_COEFFS = {
    "GYPSUM_DIHYDRATE": {"ca": 232.8, "so4": 557.9},
    "GYPSUM_ANHYDROUS": {"ca": 294.4, "so4": 705.6},
    "CACL2_DIHYDRATE": {"ca": 272.6, "cl": 482.3},
    "CACL2_ANHYDROUS": {"ca": 361.1, "cl": 638.9},
    "EPSOM": {"mg": 98.6, "so4": 389.7},
    "NACL": {"na": 393.4, "cl": 606.6},
    "BAKING_SODA": {"na": 273.7, "hco3": 726.4, "alk": 595.4},
    "CHALK": {"ca": 400.4, "alk": 999.0},
    "PICKLING_LIME": {"ca": 540.9, "alk": 1350.0},
}

# Acid properties: pKs (up to triprotic), molar mass, solution strength, density
ACID_PROPERTIES = {
    "LACTIC_88": {
        "pks": (3.86, 20.0, 20.0),
        "mol_wt": 90.08,
        "strength_pct": 88.0,
        "density_g_per_ml": 1.20,
    },
    "PHOSPHORIC_10": {
        "pks": (2.12, 7.20, 12.44),
        "mol_wt": 98.0,
        "strength_pct": 10.0,
        "density_g_per_ml": 1.05,
    },
    "PHOSPHORIC_85": {
        "pks": (2.12, 7.20, 12.44),
        "mol_wt": 98.0,
        "strength_pct": 85.0,
        "density_g_per_ml": 1.685,
    },
}

# Alkaline-agent equivalent weights (g/meq)
ALKALINE_AGENT_EQUIV = {
    "BAKING_SODA": 0.084,
    "CHALK": 0.050,
    "PICKLING_LIME": 0.037,
}


# ---------------------------------------------------------------------------
# Exceptions & Telemetry Contracts
# ---------------------------------------------------------------------------

class SolverValidationError(ValueError):
    """Raised when water-chemistry inputs fail a physical, numerical, or domain gate."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class TelemetryEvent:
    """Structured decision and telemetry message matching the ADSCO telemetry contract."""

    code: str
    category: str  # ROUTER | GUARDRAIL | OPTIMIZATION | ENZYMATIC | OPERATIONAL | VALIDATION
    severity: str  # INFO | NOTE | WARNING | ERROR
    message: str
    context: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "category": self.category,
            "severity": self.severity,
            "message": self.message,
            "context": self.context,
        }


# ---------------------------------------------------------------------------
# Input / Output Dataclasses
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class GrainEntry:
    mass_kg: float
    color_lovibond: float
    grain_type: str


@dataclass(frozen=True)
class WaterChemistryInput:
    grist: Sequence[GrainEntry]
    source: dict  # Keys: ca, mg, na, so4, cl, alk (and optionally k, fe, mn, no3)
    target: dict  # Keys: ca, mg, na, so4, cl, alk (any subset or empty)
    v_mash_treat_l: float
    v_hlt_treat_l: float
    v_hlt_debt_l: float
    v_sparge_demand_l: float
    mash_thickness_l_per_kg: float
    target_mash_ph: float
    strategy: str = "AUTO"  # AUTO | FLAVOR | CALCIUM_FLOOR | OPTIMIZE | HYBRID | BASELINE | CUSTOM
    salt_distribution: str = "PROPORTIONAL"  # PROPORTIONAL | MASH_ONLY
    acid_medium: str = "LACTIC_88"
    gypsum_form: str = "GYPSUM_DIHYDRATE"
    cacl2_form: str = "CACL2_DIHYDRATE"
    preferred_alkaline_agent: str = "PICKLING_LIME"
    calcium_floor_ppm: float = DEFAULT_CALCIUM_FLOOR_PPM
    custom_pinned_ions: Sequence[str] = field(default_factory=tuple)


@dataclass(frozen=True)
class SaltDose:
    """Per-liter salt concentrations (grams/liter)."""

    gypsum_g_per_l: float = 0.0
    cacl2_g_per_l: float = 0.0
    epsom_g_per_l: float = 0.0
    nacl_g_per_l: float = 0.0
    alkaline_agent_g_per_l: float = 0.0


@dataclass(frozen=True)
class WaterChemistryOutput:
    predicted_mash_ph: float
    mash_ph_status: str  # OPTIMAL | LOW | HIGH
    strategy: str
    mash_dose_g: dict
    sparge_dose_g: dict
    mash_acid_ml: float
    sparge_acid_ml: float
    alkaline_agent_g: float
    post_salt_mash_ions: dict
    residual_hlt_water_l: float
    sparge_tannin_warning: bool
    grist_buckets_kg: dict
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    # Extended ADSCO Telemetry fields
    telemetry: list[dict[str, Any]] = field(default_factory=list)
    total_added_salt_mass_g: float = 0.0
    added_mineral_tds_ppm: float = 0.0


# ---------------------------------------------------------------------------
# Grist and Inherent Acidity
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Residual Alkalinity & Mash pH
# ---------------------------------------------------------------------------

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
    """Estimated room-temperature mash pH."""
    if v_mash_treat_l <= 0.0:
        raise SolverValidationError("INVALID_MASH_VOLUME", "Mash volume must be positive.")

    water_alk_meq = (ra_ppm / 50.0) * v_mash_treat_l
    qt_per_lb = mash_thickness_l_per_kg / QT_PER_L_PER_KG
    i26 = (grist_acidity_meq - water_alk_meq * qt_per_lb / 1.5) / v_mash_treat_l
    return max(MASH_PH_INTERCEPT - MASH_PH_SLOPE * i26, 0.10)


def mash_ph_status(ph: float) -> str:
    """Status categorizer for predicted mash pH."""
    if ph < MASH_PH_OPTIMAL_LOW:
        return "LOW"
    if ph > MASH_PH_OPTIMAL_HIGH:
        return "HIGH"
    return "OPTIMAL"


# ---------------------------------------------------------------------------
# Carbonate Speciation & Acid/Base Dosing
# ---------------------------------------------------------------------------

def _carbonate_fractions(ph: float) -> tuple[float, float, float]:
    r1 = 10.0 ** (ph - P1_CARBONIC)
    r2 = 10.0 ** (ph - P2_CARBONIC)
    d = 1.0 + r1 + r1 * r2
    return 1.0 / d, r1 / d, (r1 * r2) / d


def acid_required_meq_l(alkalinity_caco3: float, ph_start: float, ph_target: float) -> float:
    """Acid required (mEq/L) to shift water from ph_start to ph_target."""
    f1_start, _, f3_start = _carbonate_fractions(ph_start)
    f1_end, _, f3_end = _carbonate_fractions(CARBONIC_PKB)
    denom = (f1_end - f1_start) + (f3_start - f3_end)
    ct = (alkalinity_caco3 / 50.0) / denom if denom != 0.0 else 0.0

    f1_target, _, f3_target = _carbonate_fractions(ph_target)
    delta_co2 = (f1_target - f1_start) + (f3_start - f3_target)
    h_shift = 10.0 ** (-ph_target) - 10.0 ** (-ph_start)

    return ct * delta_co2 + h_shift + 0.01


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


# ---------------------------------------------------------------------------
# Salt Stoichiometry Helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# ADSCO Smart Router (Intent Classification)
# ---------------------------------------------------------------------------

def infer_adsco_mode(
    strategy: str,
    target: dict[str, float],
    custom_pinned_ions: Sequence[str],
) -> tuple[str, str]:
    """Classify the user intent into one of the 5 ADSCO operational branches.

    Returns (resolved_mode, canonical_strategy_code).
    """
    clean_strat = strategy.upper().strip()

    if clean_strat in {"MODE_1", "MODE 1", "FLAVOR_ONLY"}:
        return "MODE_1", "CALCIUM_FLOOR"
    if clean_strat in {"MODE_2", "MODE 2", "HYBRID"}:
        return "MODE_2", "HYBRID"
    if clean_strat in {"MODE_3", "MODE 3", "OPTIMIZE", "CLONE"}:
        return "MODE_3", "OPTIMIZE"
    if clean_strat in {"MODE_4", "MODE 4", "BASELINE", "NONE"}:
        return "MODE_4", "BASELINE"
    if clean_strat in {"MODE_5", "MODE 5", "CUSTOM"}:
        return "MODE_5", "CUSTOM"

    if clean_strat == "CALCIUM_FLOOR":
        return "MODE_1", "CALCIUM_FLOOR"
    if clean_strat == "FLAVOR":
        return "MODE_1", "FLAVOR"

    if clean_strat not in {"AUTO", ""}:
        raise SolverValidationError("UNKNOWN_STRATEGY", f"Unknown strategy {strategy!r}.")

    # AUTO Routing: evaluate target vector shape
    has_target = {k: v for k, v in target.items() if v is not None and v > 0.0}

    if not has_target:
        return "MODE_4", "BASELINE"

    if custom_pinned_ions:
        return "MODE_5", "CUSTOM"

    has_ca = "ca" in has_target
    has_mg = "mg" in has_target
    has_na = "na" in has_target
    has_alk = "alk" in has_target
    has_so4 = "so4" in has_target
    has_cl = "cl" in has_target

    # All 6 ions explicitly provided -> Mode 3 (Profile Cloning)
    if has_ca and has_mg and has_na and has_alk and has_so4 and has_cl:
        return "MODE_3", "OPTIMIZE"

    # Flavor ions plus Alkalinity buffer -> Mode 2 (Ratio + Buffer)
    if (has_so4 or has_cl) and has_alk and not (has_ca or has_mg or has_na):
        return "MODE_2", "HYBRID"

    # Only flavor ions (SO4, Cl, and optionally Na) -> Mode 1 (Linear Minimalist)
    if (has_so4 or has_cl or has_na) and not (has_ca or has_mg or has_alk):
        return "MODE_1", "CALCIUM_FLOOR"

    # Any other arbitrary subset -> Mode 5 (Custom Permutation)
    return "MODE_5", "CUSTOM"


# ---------------------------------------------------------------------------
# Mathematical Optimization Engines
# ---------------------------------------------------------------------------

def _solve_lp(c, a_eq=None, b_eq=None, a_ub=None, b_ub=None):
    """Linear programming wrapper executing HiGHS."""
    return linprog(
        c,
        A_ub=a_ub if a_ub else None,
        b_ub=b_ub if b_ub else None,
        A_eq=a_eq if a_eq else None,
        b_eq=b_eq if b_eq else None,
        bounds=[(0.0, None)] * len(c),
        method="highs",
    )


def _solve_linear_minimalist(
    source: dict[str, float],
    target: dict[str, float],
    coeffs: dict[str, dict[str, float]],
    calcium_floor_ppm: float,
    unbounded_ca: bool = False,
    events: list[TelemetryEvent] | None = None,
) -> tuple[SaltDose, list[str]]:
    """Mode 1: Linear Minimalist Engine (Mass minimization via HiGHS)."""
    notes: list[str] = []
    gyp, cacl2, epsom, nacl = coeffs["GYPSUM"], coeffs["CACL2"], coeffs["EPSOM"], coeffs["NACL"]
    salts = [gyp, cacl2, epsom, nacl]

    need_so4 = max(0.0, target.get("so4", 0.0) - source.get("so4", 0.0))
    need_cl = max(0.0, target.get("cl", 0.0) - source.get("cl", 0.0))

    if unbounded_ca:
        # Pure unconstrained flavor dosing (Ca floats freely)
        dose = SaltDose(
            gypsum_g_per_l=need_so4 / gyp["so4"] if gyp.get("so4") else 0.0,
            cacl2_g_per_l=need_cl / cacl2["cl"] if cacl2.get("cl") else 0.0,
        )
        return dose, notes

    # Flavor-first calculation: initial projection via gypsum & CaCl2
    flavor_gyp = need_so4 / gyp["so4"] if gyp.get("so4") else 0.0
    flavor_cacl2 = need_cl / cacl2["cl"] if cacl2.get("cl") else 0.0
    ca_from_flavor = flavor_gyp * gyp.get("ca", 0.0) + flavor_cacl2 * cacl2.get("ca", 0.0)
    projected_ca = source.get("ca", 0.0) + ca_from_flavor

    if source.get("ca", 0.0) < calcium_floor_ppm:
        if projected_ca < calcium_floor_ppm - 1e-6:
            msg = "Calcium floor unreachable with the pinned sulfate/chloride targets."
            notes.append(msg)
            if events is not None:
                events.append(
                    TelemetryEvent(
                        code="GUARDRAIL_CALCIUM_FLOOR_UNREACHABLE",
                        category="GUARDRAIL",
                        severity="WARNING",
                        message=f"Calcium floor unreachable with pinned flavor targets: Resulting Ca2+ ({projected_ca:.1f} ppm) is below the {calcium_floor_ppm:.1f} ppm floor. Flavor equalities took precedence.",
                        context={"actual": projected_ca, "floor": calcium_floor_ppm},
                    )
                )
        return SaltDose(gypsum_g_per_l=flavor_gyp, cacl2_g_per_l=flavor_cacl2), notes

    # Hard source: added Ca <= max(0, floor - source)
    calcium_cap = max(0.0, calcium_floor_ppm - source.get("ca", 0.0))

    a_eq = [
        [gyp.get("so4", 0.0), 0.0, epsom.get("so4", 0.0), 0.0],
        [0.0, cacl2.get("cl", 0.0), 0.0, nacl.get("cl", 0.0)],
    ]
    b_eq = [need_so4, need_cl]

    a_ub = [[gyp.get("ca", 0.0), cacl2.get("ca", 0.0), 0.0, 0.0]]
    b_ub = [calcium_cap]

    # Primary objective: minimize total salt ion addition
    c_primary = [sum(s.values()) for s in salts]

    res = _solve_lp(c_primary, a_eq, b_eq, a_ub, b_ub)
    if not res.success:
        notes.append("Calcium floor unreachable; solved sulfate/chloride only.")
        if events is not None:
            events.append(
                TelemetryEvent(
                    code="OPT_LP_RELAXATION_APPLIED",
                    category="OPTIMIZATION",
                    severity="NOTE",
                    message="Calcium upper boundary relaxed: Primary solver could not satisfy flavor equalities without exceeding the calcium ceiling. Pinned SO4/Cl preserved.",
                )
            )
        res = _solve_lp(c_primary, a_eq, b_eq, None, None)
        if not res.success:
            raise SolverValidationError(
                "SALT_SOLVE_FAILED", "Salt optimization failed to find a feasible dose."
            )

    x = [max(0.0, val) for val in res.x]
    opt_primary = float(res.fun)

    # Lexicographic tie-break: balance Mg/Na, prefer flavor salts over Epsom/NaCl
    tol = 1e-6
    a_ub_base = a_ub if a_ub else []
    b_ub_base = b_ub if b_ub else []

    c_secondary = [0.0, 0.0, epsom.get("mg", 0.0), nacl.get("na", 0.0)]
    res2 = _solve_lp(
        c_secondary,
        a_eq,
        b_eq,
        a_ub_base + [c_primary, [-v for v in c_primary]],
        b_ub_base + [opt_primary + tol, -(opt_primary - tol)],
    )
    if res2.success:
        x = [max(0.0, v) for v in res2.x]
        opt_secondary = float(res2.fun)

        c_tertiary = [0.0, 0.0, 1.0, 1.0]
        res3 = _solve_lp(
            c_tertiary,
            a_eq,
            b_eq,
            a_ub_base
            + [c_primary, [-v for v in c_primary], c_secondary, [-v for v in c_secondary]],
            b_ub_base
            + [
                opt_primary + tol,
                -(opt_primary - tol),
                opt_secondary + tol,
                -(opt_secondary - tol),
            ],
        )
        if res3.success:
            x = [max(0.0, v) for v in res3.x]
            if events is not None:
                events.append(
                    TelemetryEvent(
                        code="OPT_LP_LEXICOGRAPHIC_TIE_BREAK",
                        category="OPTIMIZATION",
                        severity="INFO",
                        message="Lexicographic tie-break executed: Multi-pass LP resolved degenerate vertex by penalizing secondary counter-ions (preferring Gypsum/CaCl2 over Epsom/NaCl).",
                    )
                )

    dose = SaltDose(
        gypsum_g_per_l=x[0],
        cacl2_g_per_l=x[1],
        epsom_g_per_l=x[2],
        nacl_g_per_l=x[3],
    )
    return dose, notes


def _solve_nonlinear_cloner(
    source: dict[str, float],
    target: dict[str, float],
    coeffs: dict[str, dict[str, float]],
    calcium_floor_ppm: float,
    events: list[TelemetryEvent],
) -> tuple[SaltDose, list[str]]:
    """Mode 3: Non-Linear Cloner Engine (Weighted Least Squares via SLSQP)."""
    notes: list[str] = []
    gyp, cacl2, epsom, nacl = coeffs["GYPSUM"], coeffs["CACL2"], coeffs["EPSOM"], coeffs["NACL"]

    # Ions to curve fit and their relative importance weights
    ions = ["ca", "mg", "na", "so4", "cl", "alk"]
    weights = {
        "ca": 2.0,   # Enzymatic priority
        "alk": 2.5,  # Mash pH buffering priority
        "so4": 1.5,  # Flavor priority
        "cl": 1.5,   # Flavor priority
        "mg": 1.0,   # Sensory/toxicity
        "na": 0.5,   # Lowest priority compromise ion
    }

    target_vec = np.array([target.get(i, source.get(i, 0.0)) for i in ions], dtype=float)
    source_vec = np.array([source.get(i, 0.0) for i in ions], dtype=float)
    w_vec = np.array([weights[i] for i in ions], dtype=float)

    # Matrix of salt yields per gram of salt [gyp, cacl2, epsom, nacl]
    # Dimensions: 6 ions x 4 salts
    A_matrix = np.array([
        [gyp.get("ca", 0.0), cacl2.get("ca", 0.0), 0.0, 0.0],
        [0.0, 0.0, epsom.get("mg", 0.0), 0.0],
        [0.0, 0.0, 0.0, nacl.get("na", 0.0)],
        [gyp.get("so4", 0.0), 0.0, epsom.get("so4", 0.0), 0.0],
        [0.0, cacl2.get("cl", 0.0), 0.0, nacl.get("cl", 0.0)],
        [0.0, 0.0, 0.0, 0.0],  # Flavor salts do not add alkalinity
    ], dtype=float)

    def objective(x):
        predicted = source_vec + A_matrix @ x
        errors = (predicted - target_vec) * w_vec
        # Penalize total salt mass slightly to prevent runaway mineral additions
        mass_penalty = 0.05 * np.sum(x)
        return float(np.sum(errors ** 2) + mass_penalty)

    # Boundary: doses must be non-negative
    bounds = [(0.0, 5.0) for _ in range(4)]

    # Inequality constraints: enforce Calcium floor and Magnesium ceiling
    constraints = []
    # Total Ca >= calcium_floor_ppm => source['ca'] + A[0] @ x >= floor
    constraints.append({
        "type": "ineq",
        "fun": lambda x: float((source_vec[0] + A_matrix[0] @ x) - calcium_floor_ppm),
    })
    # Total Mg <= HARD_MAGNESIUM_MAX_PPM
    constraints.append({
        "type": "ineq",
        "fun": lambda x: float(HARD_MAGNESIUM_MAX_PPM - (source_vec[1] + A_matrix[1] @ x)),
    })

    # Initial guess: linear flavor estimates
    x0 = np.array([
        max(0.0, (target.get("so4", 0.0) - source.get("so4", 0.0)) / gyp.get("so4", 500.0)),
        max(0.0, (target.get("cl", 0.0) - source.get("cl", 0.0)) / cacl2.get("cl", 500.0)),
        0.0,
        0.0,
    ], dtype=float)

    res = minimize(objective, x0, method="SLSQP", bounds=bounds, constraints=constraints)

    if not res.success:
        # If strict constraints fail, relax the Ca floor constraint
        res = minimize(objective, x0, method="SLSQP", bounds=bounds)
        notes.append("Profile cloner relaxed calcium floor to locate mathematical fit.")

    x_opt = [max(0.0, float(v)) for v in res.x]
    final_ions = source_vec + A_matrix @ np.array(x_opt)

    ca_err = final_ions[0] - target_vec[0]
    alk_err = final_ions[5] - target_vec[5]
    na_err = final_ions[2] - target_vec[2]

    events.append(
        TelemetryEvent(
            code="OPT_CLONE_WEIGHTED_COMPROMISE",
            category="OPTIMIZATION",
            severity="NOTE",
            message=f"Profile compromise accepted: Prioritized enzymatic ions (Ca2+ error: {ca_err:+.1f} ppm, Alk error: {alk_err:+.1f} ppm); accepted variance on sensory counter-ions (Na+ error: {na_err:+.1f} ppm).",
            context={"ca_error": ca_err, "alk_error": alk_err, "na_error": na_err},
        )
    )

    return SaltDose(
        gypsum_g_per_l=x_opt[0],
        cacl2_g_per_l=x_opt[1],
        epsom_g_per_l=x_opt[2],
        nacl_g_per_l=x_opt[3],
    ), notes


def _solve_dynamic_sparse(
    source: dict[str, float],
    target: dict[str, float],
    coeffs: dict[str, dict[str, float]],
    pinned_ions: Sequence[str],
    calcium_floor_ppm: float,
    events: list[TelemetryEvent],
) -> tuple[SaltDose, list[str]]:
    """Mode 5: Dynamic Sparse Linear Engine for custom user subsets."""
    notes: list[str] = []
    gyp, cacl2, epsom, nacl = coeffs["GYPSUM"], coeffs["CACL2"], coeffs["EPSOM"], coeffs["NACL"]
    salts = [gyp, cacl2, epsom, nacl]

    a_eq = []
    b_eq = []

    for ion in pinned_ions:
        if ion in target and target[ion] is not None:
            deficit = max(0.0, target[ion] - source.get(ion, 0.0))
            row = [s.get(ion, 0.0) for s in salts]
            a_eq.append(row)
            b_eq.append(deficit)

    c_primary = [sum(s.values()) for s in salts]

    a_ub = None
    b_ub = None
    if "ca" not in pinned_ions and source.get("ca", 0.0) < calcium_floor_ppm:
        # Enforce Ca floor as lower bound inequality
        ca_gap = calcium_floor_ppm - source.get("ca", 0.0)
        # Gypsum and CaCl2 add Ca -> sum >= ca_gap => -sum <= -ca_gap
        a_ub = [[-gyp.get("ca", 0.0), -cacl2.get("ca", 0.0), 0.0, 0.0]]
        b_ub = [-ca_gap]

    res = _solve_lp(c_primary, a_eq, b_eq, a_ub, b_ub)
    if not res.success:
        notes.append("Sparse solve could not satisfy all constraints; solving equalities only.")
        res = _solve_lp(c_primary, a_eq, b_eq, None, None)
        if not res.success:
            raise SolverValidationError(
                "SALT_SOLVE_FAILED", "Custom sparse optimization failed to find a feasible dose."
            )

    x = [max(0.0, val) for val in res.x]
    return SaltDose(
        gypsum_g_per_l=x[0],
        cacl2_g_per_l=x[1],
        epsom_g_per_l=x[2],
        nacl_g_per_l=x[3],
    ), notes


# ---------------------------------------------------------------------------
# Salt Dosing Orchestrator
# ---------------------------------------------------------------------------

def solve_salt_dose(
    strategy: str,
    source: dict[str, float],
    target: dict[str, float],
    gypsum_form: str,
    cacl2_form: str,
    calcium_floor_ppm: float,
    custom_pinned_ions: Sequence[str] = (),
    preferred_alkaline_agent: str = "PICKLING_LIME",
    events: list[TelemetryEvent] | None = None,
) -> tuple[SaltDose, list[str], str]:
    """Resolve salt additions using the appropriate ADSCO engine."""
    notes: list[str] = []
    evs = events if events is not None else []
    coeffs = _salt_ion_coeffs(gypsum_form, cacl2_form)

    mode, canonical_strat = infer_adsco_mode(strategy, target, custom_pinned_ions)

    if mode == "MODE_4":  # Baseline Mode
        evs.append(
            TelemetryEvent(
                code="ROUTER_MODE_4_BASELINE_ONLY",
                category="ROUTER",
                severity="INFO",
                message="Routed to Baseline Water Correction Engine (Mode 4: Null Targets). Mineral salt dosing bypassed (0.0 g). Solving strictly for grist residual alkalinity, mash pH, and sparge acidification.",
            )
        )
        return SaltDose(), notes, canonical_strat

    if mode == "MODE_1":  # Linear Minimalist
        evs.append(
            TelemetryEvent(
                code="ROUTER_MODE_1_LINEAR_FLAVOR",
                category="ROUTER",
                severity="INFO",
                message="Routed to Linear Minimalist Engine (Mode 1: Flavor Balance). Objective: Minimizing total added salt mass to satisfy flavor equalities while enforcing background biological guardrails.",
            )
        )
        dose, l_notes = _solve_linear_minimalist(
            source,
            target,
            coeffs,
            calcium_floor_ppm,
            unbounded_ca=(canonical_strat == "FLAVOR"),
            events=evs,
        )
        notes.extend(l_notes)
        return dose, notes, canonical_strat

    if mode == "MODE_2":  # Hybrid Mode
        evs.append(
            TelemetryEvent(
                code="ROUTER_MODE_2_HYBRID_BUFFER",
                category="ROUTER",
                severity="INFO",
                message=f"Routed to Hybrid Optimization Engine (Mode 2: Ratio + Buffer). Objective: Minimizing flavor salts via Linear Programming while allocating structural alkalinity via {preferred_alkaline_agent} and secondary acid neutralization.",
            )
        )
        dose, l_notes = _solve_linear_minimalist(
            source,
            target,
            coeffs,
            calcium_floor_ppm,
            unbounded_ca=False,
            events=evs,
        )
        notes.extend(l_notes)
        return dose, notes, canonical_strat

    if mode == "MODE_3":  # Non-Linear Cloner
        evs.append(
            TelemetryEvent(
                code="ROUTER_MODE_3_NONLINEAR_CLONE",
                category="ROUTER",
                severity="INFO",
                message="Routed to Non-Linear Cloner Engine (Mode 3: Profile Clone). Objective: Minimizing weighted sum of squared errors (SSE) across all 6 ions simultaneously.",
            )
        )
        dose, c_notes = _solve_nonlinear_cloner(
            source, target, coeffs, calcium_floor_ppm, evs
        )
        notes.extend(c_notes)
        return dose, notes, canonical_strat

    # Mode 5: Custom Sparse
    evs.append(
        TelemetryEvent(
            code="ROUTER_MODE_5_CUSTOM_SPARSE",
            category="ROUTER",
            severity="INFO",
            message=f"Routed to Dynamic Sparse Linear Engine (Mode 5: Custom Permutation). Pinned targets: {list(custom_pinned_ions)}; floating unconstrained: {[k for k in ['ca','mg','na','so4','cl','alk'] if k not in custom_pinned_ions]}.",
        )
    )
    dose, s_notes = _solve_dynamic_sparse(
        source, target, coeffs, custom_pinned_ions, calcium_floor_ppm, evs
    )
    notes.extend(s_notes)
    return dose, notes, canonical_strat


# ---------------------------------------------------------------------------
# Top-Level Orchestration (Pure Sealed Function)
# ---------------------------------------------------------------------------

def solve_water_chemistry(inp: WaterChemistryInput) -> WaterChemistryOutput:
    """Execute complete ADSCO water chemistry formulation.

    Pure, deterministic boundary function matching the existing signature.
    """
    warnings: list[str] = []
    notes: list[str] = []
    events: list[TelemetryEvent] = []

    # 1. Gatekeeping validation
    if inp.v_mash_treat_l <= 0.0:
        raise SolverValidationError("INVALID_MASH_VOLUME", "Mash volume must be positive.")
    if inp.v_sparge_demand_l < 0.0:
        raise SolverValidationError("INVALID_SPARGE_VOLUME", "Sparge volume cannot be negative.")

    # Check for raw source water contaminants
    for ion, limit in CONTAMINANT_LIMITS.items():
        val = inp.source.get(ion, 0.0)
        if val > limit:
            msg = f"Source water contaminant threshold exceeded: {ion.upper()} is {val:.2f} ppm (recommended max: {limit:.2f} ppm). Dilution with Reverse Osmosis (RO) water is strongly advised."
            warnings.append(msg)
            events.append(
                TelemetryEvent(
                    code="GUARDRAIL_SOURCE_CONTAMINANT_DETECTED",
                    category="GUARDRAIL",
                    severity="WARNING",
                    message=msg,
                    context={"ion": ion, "actual": val, "limit": limit},
                )
            )

    # Validate Calcium Floor user setting
    if inp.calcium_floor_ppm < RECOMMENDED_CALCIUM_MIN_PPM:
        msg = f"User overrode Minimum Calcium Floor to {inp.calcium_floor_ppm:.1f} ppm (below recommended {RECOMMENDED_CALCIUM_MIN_PPM:.0f} ppm baseline). Verify adequate yeast nutrients (zinc/amino acids) are added in the fermenter."
        warnings.append(msg)
        events.append(
            TelemetryEvent(
                code="GUARDRAIL_CALCIUM_FLOOR_OVERRIDDEN",
                category="GUARDRAIL",
                severity="WARNING",
                message=msg,
                context={"floor": inp.calcium_floor_ppm, "recommended_min": RECOMMENDED_CALCIUM_MIN_PPM},
            )
        )

    # 2. Grist resolution
    grist_acidity, buckets = resolve_grist(inp.grist)

    # 3. Primary salt dosing optimization
    dose, solve_notes, resolved_strat = solve_salt_dose(
        inp.strategy,
        inp.source,
        inp.target,
        inp.gypsum_form,
        inp.cacl2_form,
        inp.calcium_floor_ppm,
        custom_pinned_ions=inp.custom_pinned_ions,
        preferred_alkaline_agent=inp.preferred_alkaline_agent,
        events=events,
    )
    notes.extend(solve_notes)

    # 4. Post-salt mineral concentrations
    added = ions_added_ppm(
        dose, inp.gypsum_form, inp.cacl2_form, preferred_alkaline_agent=inp.preferred_alkaline_agent
    )
    post_mash = add_ions(inp.source, added)
    proportional = (inp.salt_distribution.upper() == "PROPORTIONAL")
    post_hlt = add_ions(inp.source, added) if proportional else dict(inp.source)

    # Calculate added mineral mass and TDS metrics
    dose_rate_g_per_l = (
        dose.gypsum_g_per_l + dose.cacl2_g_per_l + dose.epsom_g_per_l + dose.nacl_g_per_l
    )
    total_added_salt_mass_g = (
        dose_rate_g_per_l * inp.v_mash_treat_l
        + (dose_rate_g_per_l * inp.v_hlt_treat_l if proportional else 0.0)
    )
    added_tds_ppm = sum(added.values())

    events.append(
        TelemetryEvent(
            code="OPT_MINIMAL_MASS_ACHIEVED",
            category="OPTIMIZATION",
            severity="INFO",
            message=f"Optimal mineral dose identified: Total added salt mass is {total_added_salt_mass_g:.2f} g ({dose_rate_g_per_l:.2f} g/L). Added mineral contribution to TDS: {added_tds_ppm:.1f} ppm.",
            context={
                "total_mass_g": total_added_salt_mass_g,
                "dose_rate_g_l": dose_rate_g_per_l,
                "added_tds_ppm": added_tds_ppm,
            },
        )
    )

    # 5. Residual alkalinity and enzymatic mash pH prediction
    ra_mash = residual_alkalinity(post_mash["ca"], post_mash["mg"], post_mash.get("alk", 0.0))
    predicted_ph = predict_mash_ph(
        grist_acidity, ra_mash, inp.v_mash_treat_l, inp.mash_thickness_l_per_kg
    )
    status = mash_ph_status(predicted_ph)

    if status == "OPTIMAL":
        events.append(
            TelemetryEvent(
                code="ENZYMATIC_MASH_PH_OPTIMAL",
                category="ENZYMATIC",
                severity="INFO",
                message=f"Predicted mash pH ({predicted_ph:.2f}) is within the optimal enzymatic window (5.20 - 5.60). Optimal alpha/beta-amylase activity projected.",
                context={"predicted_ph": predicted_ph},
            )
        )
    else:
        events.append(
            TelemetryEvent(
                code="ENZYMATIC_MASH_PH_OUT_OF_BOUNDS",
                category="ENZYMATIC",
                severity="WARNING",
                message=f"Predicted mash pH ({predicted_ph:.2f}) is {status} (optimal: 5.20 - 5.60). Acid or alkaline correction prescribed.",
                context={"predicted_ph": predicted_ph, "status": status},
            )
        )

    # 6. Acid / Alkaline correction to achieve target_mash_ph
    meq_l = acid_required_meq_l(post_mash.get("alk", 0.0), predicted_ph, inp.target_mash_ph)
    mash_acid_ml = 0.0
    alkaline_agent_g = 0.0

    if meq_l > 0.0:
        total_acid_meq = meq_l * inp.v_mash_treat_l
        mash_acid_ml = acid_volume_ml(total_acid_meq, inp.acid_medium, inp.target_mash_ph)
        events.append(
            TelemetryEvent(
                code="ENZYMATIC_ACID_DOSE_PRESCRIBED",
                category="ENZYMATIC",
                severity="INFO",
                message=f"Mash acidification prescribed: {mash_acid_ml:.2f} mL of {inp.acid_medium} ({total_acid_meq:.1f} mEq) required to shift mash from pH {predicted_ph:.2f} to target pH {inp.target_mash_ph:.2f}.",
                context={
                    "volume_ml": mash_acid_ml,
                    "acid_medium": inp.acid_medium,
                    "meq_total": total_acid_meq,
                    "ph_start": predicted_ph,
                    "ph_target": inp.target_mash_ph,
                },
            )
        )
    elif meq_l < 0.0:
        total_alk_meq = abs(meq_l) * inp.v_mash_treat_l
        alkaline_agent_g = alkaline_agent_mass_g(total_alk_meq, inp.preferred_alkaline_agent)
        events.append(
            TelemetryEvent(
                code="ENZYMATIC_ALKALINE_DOSE_PRESCRIBED",
                category="ENZYMATIC",
                severity="INFO",
                message=f"Mash buffering prescribed: {alkaline_agent_g:.2f} g of {inp.preferred_alkaline_agent} ({total_alk_meq:.1f} mEq) required to raise mash pH from {predicted_ph:.2f} to target pH {inp.target_mash_ph:.2f}.",
                context={
                    "mass_g": alkaline_agent_g,
                    "agent": inp.preferred_alkaline_agent,
                    "meq_total": total_alk_meq,
                    "ph_start": predicted_ph,
                    "ph_target": inp.target_mash_ph,
                },
            )
        )
        if inp.preferred_alkaline_agent == "CHALK":
            events.append(
                TelemetryEvent(
                    code="OPERATIONAL_SALT_DISSOLUTION_LIMIT",
                    category="OPERATIONAL",
                    severity="WARNING",
                    message="Low salt solubility: Chalk (CaCO3) has extremely low solubility at room temperature. Ensure chalk is added directly to the mash tun with grains, or substitute Baking Soda/Pickling Lime.",
                )
            )

    # 7. Sparge tannin protection
    ra_hlt = residual_alkalinity(post_hlt["ca"], post_hlt["mg"], post_hlt.get("alk", 0.0))
    sparge_acid_ml = 0.0
    sparge_tannin_warning = False

    if inp.source.get("alk", 0.0) > 0.0 and ra_hlt > 0.0:
        sparge_meq_l = ra_hlt / 50.0
        sparge_acid_ml = acid_volume_ml(
            sparge_meq_l * inp.v_hlt_treat_l, inp.acid_medium, SPARGE_TANNIN_PH
        )
        sparge_tannin_warning = True
        events.append(
            TelemetryEvent(
                code="ENZYMATIC_SPARGE_ACID_PRESCRIBED",
                category="ENZYMATIC",
                severity="INFO",
                message=f"Sparge acidification prescribed: {sparge_acid_ml:.2f} mL of {inp.acid_medium} ({sparge_meq_l * inp.v_hlt_treat_l:.1f} mEq) required to neutralize sparge alkalinity and cap pH at {SPARGE_TANNIN_PH:.2f}.",
                context={"volume_ml": sparge_acid_ml, "target_ph": SPARGE_TANNIN_PH},
            )
        )

    # 8. Physical mass allocations for mash and sparge liquor
    def _grams(volume_l: float) -> dict[str, float]:
        return {
            "gypsum_g": dose.gypsum_g_per_l * volume_l,
            "cacl2_g": dose.cacl2_g_per_l * volume_l,
            "epsom_g": dose.epsom_g_per_l * volume_l,
            "nacl_g": dose.nacl_g_per_l * volume_l,
        }

    mash_dose = _grams(inp.v_mash_treat_l)
    sparge_dose = _grams(inp.v_hlt_treat_l) if proportional else {
        "gypsum_g": 0.0,
        "cacl2_g": 0.0,
        "epsom_g": 0.0,
        "nacl_g": 0.0,
    }

    # 9. Brewhouse diagnostics and guardrail checks
    residual_hlt = max(0.0, inp.v_hlt_treat_l - inp.v_sparge_demand_l)
    if inp.v_hlt_treat_l - inp.v_hlt_debt_l - inp.v_sparge_demand_l > 0.0:
        surplus = (inp.v_hlt_treat_l - inp.v_hlt_debt_l - inp.v_sparge_demand_l)
        msg = f"HLT surplus: more liquor treated than the sparge will deliver ({surplus:.1f} L surplus)."
        warnings.append(msg)
        events.append(
            TelemetryEvent(
                code="OPERATIONAL_HLT_SURPLUS",
                category="OPERATIONAL",
                severity="WARNING",
                message=f"HLT surplus detected: Treated liquor exceeds sparge demand by {surplus:.2f} L. Surplus minerals will be left behind in the HLT.",
                context={"surplus_l": surplus},
            )
        )

    # Magnesium threshold check
    mg_added = added.get("mg", 0.0)
    mg_total = post_mash.get("mg", 0.0)
    if mg_added > EPSOM_MG_WARN_PPM or mg_total > HARD_MAGNESIUM_MAX_PPM:
        msg = f"Added magnesium {mg_added:.1f} ppm exceeds {EPSOM_MG_WARN_PPM:.0f} ppm (total Mg: {mg_total:.1f} ppm)."
        warnings.append(msg)
        events.append(
            TelemetryEvent(
                code="GUARDRAIL_MAGNESIUM_TOXICITY_CEILING",
                category="GUARDRAIL",
                severity="WARNING",
                message=f"Magnesium ceiling breached: Total Mg2+ reached {mg_total:.1f} ppm (caution threshold: {EPSOM_MG_WARN_PPM:.0f} ppm, hard max: {HARD_MAGNESIUM_MAX_PPM:.0f} ppm). Risk of astringent bitterness or laxative defect.",
                context={"actual_mg": mg_total, "added_mg": mg_added},
            )
        )

    # Sulfate threshold check
    so4_total = post_mash.get("so4", 0.0)
    if so4_total > HARD_SULFATE_MAX_PPM:
        msg = f"Total sulfate {so4_total:.1f} ppm exceeds {HARD_SULFATE_MAX_PPM:.0f} ppm harshness threshold."
        warnings.append(msg)
        events.append(
            TelemetryEvent(
                code="GUARDRAIL_SULFATE_HARSHNESS_CEILING",
                category="GUARDRAIL",
                severity="WARNING",
                message=f"Sulfate harshness limit exceeded: Total SO4(2-) reached {so4_total:.1f} ppm. Bitterness perception will likely turn dry, metallic, and astringent above 400 ppm.",
                context={"actual_so4": so4_total, "limit": HARD_SULFATE_MAX_PPM},
            )
        )

    # Calcium floor audit
    if post_mash["ca"] < inp.calcium_floor_ppm - 1e-6:
        msg = f"Calcium {post_mash['ca']:.1f} ppm is below the {inp.calcium_floor_ppm:.0f} ppm floor."
        warnings.append(msg)

    # Synchronize string warnings/notes with telemetry events for legacy callers
    for ev in events:
        if ev.severity == "WARNING" and ev.message not in warnings:
            warnings.append(ev.message)
        elif ev.severity in {"NOTE", "INFO"} and ev.category in {"OPTIMIZATION", "GUARDRAIL"}:
            if ev.message not in notes:
                notes.append(ev.message)

    return WaterChemistryOutput(
        predicted_mash_ph=predicted_ph,
        mash_ph_status=status,
        strategy=resolved_strat,
        mash_dose_g=mash_dose,
        sparge_dose_g=sparge_dose,
        mash_acid_ml=mash_acid_ml,
        sparge_acid_ml=sparge_acid_ml,
        alkaline_agent_g=alkaline_agent_g,
        post_salt_mash_ions=post_mash,
        residual_hlt_water_l=residual_hlt,
        sparge_tannin_warning=sparge_tannin_warning,
        grist_buckets_kg=buckets,
        warnings=warnings,
        notes=notes,
        telemetry=[ev.to_dict() for ev in events],
        total_added_salt_mass_g=total_added_salt_mass_g,
        added_mineral_tds_ppm=added_tds_ppm,
    )
