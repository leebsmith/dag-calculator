"""Water chemistry engine (Step 7) — pure functions.

Ported from the Bru'n Water v1.24 reference module
(``scripts/water-chemistry-module.py``) and converted to metric. See
``plans/water-chemistry-engine.md`` §3.

Design constraints (matching ``app/core/batch_solver.py``):

* Every function is pure — same inputs, same outputs; no I/O, no mutation of
  arguments, no hidden state.
* This module imports nothing from ``app.*``; the service layer maps request
  schemas onto the small dataclasses defined here.

Salt / acid **physical constants** live here (they are universal), not in seed
JSON — seed data is reserved for profile-specific presets.

Port deviations from the workbook (see plan §3.7): the acid specific-gravity
polynomial is replaced by standard commercial solution densities, which are more
accurate for concentrated acids; the grain-acidity ``GRAIN_ACIDITY`` table uses
the *function* coefficients (the workbook table is inconsistent with its own
function).

Black-box boundary contract:

* This module is a sealed boundary supernode in the application's logic graph:
  its interior (salt dosing, pH prediction, acid/alkaline correction) is opaque
  to callers; only ``solve_water_chemistry`` is invoked from outside.
* Nature: pure and deterministic — same inputs, same outputs; no I/O, no
  mutation of arguments, no hidden state.
* Signature: ``solve_water_chemistry(WaterChemistryInput) -> WaterChemistryOutput``.
* Resolution mode: iterative (linear programming via ``scipy.optimize.linprog``).
* Domain: inputs failing a physical or numerical gate raise
  ``SolverValidationError`` (a ``ValueError`` subclass) carrying a ``code``.
* Provenance: ``docs/good-enough-water-chemistry-calculator.md`` and
  ``plans/water-chemistry-engine.md`` (ported from
  ``scripts/water-chemistry-module.py``).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from scipy.optimize import linprog

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Ionic equivalent weights (mg/meq), workbook sheet 1.
BICARBONATE_EQ_WEIGHT = 61.0

# Kolbach residual-alkalinity coefficients (≈ 1/1.4 and 1/1.7).
RA_CA_COEFF = 0.7143
RA_MG_COEFF = 0.5879

# Carbonic-acid pKas (carbonate speciation).
P1_CARBONIC = 6.38
P2_CARBONIC = 10.33
CARBONIC_PKB = 4.3  # pH at which bicarbonate is fully dissociated

# Sparge pH above which tannin extraction becomes a risk.
SPARGE_TANNIN_PH = 5.8

# Mash-pH model (metric; plan §3.2).
MASH_PH_INTERCEPT = 5.76
MASH_PH_SLOPE = 0.17
QT_PER_L_PER_KG = 2.08635  # 1 L/kg == 2.08635 qt/lb

# Optimal mash pH window (for status reporting).
MASH_PH_OPTIMAL_LOW = 5.2
MASH_PH_OPTIMAL_HIGH = 5.6

# Ca floor and Epsom Mg soft-warning thresholds (plan §2).
DEFAULT_CALCIUM_FLOOR_PPM = 50.0
EPSOM_MG_WARN_PPM = 40.0

# Grain acidity (mEq/kg) by grain type: acidity = mass_kg * (slope * color_L + offset).
GRAIN_ACIDITY = {
    "BASE": {"slope": 0.6174, "offset": 0.0},
    "CRYSTAL": {"slope": 0.46305, "offset": 5.5125},
    "ROASTED": {"slope": 0.0, "offset": 83.79},
    "ACID": {"slope": 0.0, "offset": 209.475},
}

# Salt ion yields (mg ion per gram of salt); plan §3.3.
SALT_COEFFS = {
    "GYPSUM_DIHYDRATE": {"ca": 232.8, "so4": 557.9},
    "GYPSUM_ANHYDROUS": {"ca": 294.4, "so4": 705.6},
    "CACL2_DIHYDRATE": {"ca": 272.6, "cl": 482.3},
    "CACL2_ANHYDROUS": {"ca": 361.1, "cl": 638.9},
    "EPSOM": {"mg": 98.6, "so4": 389.7},
    "NACL": {"na": 393.4, "cl": 606.6},
    "BAKING_SODA": {"na": 273.7, "hco3": 726.4},
    "CHALK": {"ca": 400.4, "alk": 999.0},
    "PICKLING_LIME": {"ca": 540.9, "alk": 1350.0},
}

# Acid properties: pKs (up to triprotic), molar mass, solution strength, density.
ACID_PROPERTIES = {
    "LACTIC_88": {"pks": (3.86, 20.0, 20.0), "mol_wt": 90.08, "strength_pct": 88.0, "density_g_per_ml": 1.20},
    "PHOSPHORIC_10": {"pks": (2.12, 7.2, 12.44), "mol_wt": 98.0, "strength_pct": 10.0, "density_g_per_ml": 1.05},
    "PHOSPHORIC_85": {"pks": (2.12, 7.2, 12.44), "mol_wt": 98.0, "strength_pct": 85.0, "density_g_per_ml": 1.685},
}

# Alkaline-agent equivalent weights (g/meq); plan §3.4.
ALKALINE_AGENT_EQUIV = {
    "BAKING_SODA": 0.084,
    "CHALK": 0.050,
    "PICKLING_LIME": 0.037,
}


class SolverValidationError(ValueError):
    """Raised when water-chemistry inputs fail a physical or numerical gate."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Small value types (mapped from request schemas by the service layer)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GrainEntry:
    mass_kg: float
    color_lovibond: float
    grain_type: str


@dataclass(frozen=True)
class WaterChemistryInput:
    grist: Sequence[GrainEntry]
    source: dict  # ion map: ca, mg, na, so4, cl, alk
    target: dict
    v_mash_treat_l: float
    v_hlt_treat_l: float
    v_hlt_debt_l: float
    v_sparge_demand_l: float
    mash_thickness_l_per_kg: float
    target_mash_ph: float
    strategy: str = "CALCIUM_FLOOR"
    salt_distribution: str = "PROPORTIONAL"
    acid_medium: str = "LACTIC_88"
    gypsum_form: str = "GYPSUM_DIHYDRATE"
    cacl2_form: str = "CACL2_DIHYDRATE"
    preferred_alkaline_agent: str = "PICKLING_LIME"
    calcium_floor_ppm: float = DEFAULT_CALCIUM_FLOOR_PPM


@dataclass(frozen=True)
class SaltDose:
    """Per-litre salt concentrations (grams/litre)."""

    gypsum_g_per_l: float = 0.0
    cacl2_g_per_l: float = 0.0
    epsom_g_per_l: float = 0.0
    nacl_g_per_l: float = 0.0


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


# ---------------------------------------------------------------------------
# Grist
# ---------------------------------------------------------------------------


def resolve_grist(grist: Sequence[GrainEntry]) -> tuple[float, dict]:
    """Return (total acidity in mEq, per-category mass in kg)."""
    total_acidity = 0.0
    buckets = {"BASE": 0.0, "CRYSTAL": 0.0, "ROASTED": 0.0, "ACID": 0.0}
    for entry in grist:
        params = GRAIN_ACIDITY.get(entry.grain_type)
        if params is None:
            raise SolverValidationError(
                "UNKNOWN_GRAIN_TYPE", f"Unknown grain type {entry.grain_type!r}."
            )
        total_acidity += entry.mass_kg * (
            params["slope"] * entry.color_lovibond + params["offset"]
        )
        buckets[entry.grain_type] = buckets.get(entry.grain_type, 0.0) + entry.mass_kg
    return total_acidity, buckets


# ---------------------------------------------------------------------------
# Residual alkalinity & mash pH
# ---------------------------------------------------------------------------


def residual_alkalinity(ca_ppm: float, mg_ppm: float, alkalinity_caco3: float) -> float:
    """Kolbach residual alkalinity (ppm as CaCO₃)."""
    return alkalinity_caco3 - (ca_ppm * RA_CA_COEFF + mg_ppm * RA_MG_COEFF)


def bicarbonate_from_alkalinity(alkalinity_caco3: float) -> float:
    """Bicarbonate (ppm) implied by total alkalinity (ppm as CaCO₃)."""
    return alkalinity_caco3 * (BICARBONATE_EQ_WEIGHT / 50.0)


def predict_mash_ph(
    grist_acidity_meq: float,
    ra_ppm: float,
    v_mash_treat_l: float,
    mash_thickness_l_per_kg: float,
) -> float:
    """Estimated room-temperature mash pH (plan §3.2)."""
    if v_mash_treat_l <= 0:
        raise SolverValidationError("INVALID_MASH_VOLUME", "Mash volume must be positive.")
    water_alk_meq = (ra_ppm / 50.0) * v_mash_treat_l
    qt_per_lb = mash_thickness_l_per_kg / QT_PER_L_PER_KG
    i26 = (grist_acidity_meq - water_alk_meq * qt_per_lb / 1.5) / v_mash_treat_l
    return max(MASH_PH_INTERCEPT - MASH_PH_SLOPE * i26, 0.1)


def mash_ph_status(ph: float) -> str:
    if ph < MASH_PH_OPTIMAL_LOW:
        return "LOW"
    if ph > MASH_PH_OPTIMAL_HIGH:
        return "HIGH"
    return "OPTIMAL"


# ---------------------------------------------------------------------------
# Acid / base dosing (carbonate speciation)
# ---------------------------------------------------------------------------


def _carbonate_fractions(ph: float) -> tuple[float, float, float]:
    r1 = 10.0 ** (ph - P1_CARBONIC)
    r2 = 10.0 ** (ph - P2_CARBONIC)
    d = 1.0 + r1 + r1 * r2
    return 1.0 / d, r1 / d, (r1 * r2) / d


def acid_required_meq_l(alkalinity_caco3: float, ph_start: float, ph_target: float) -> float:
    """Acid required (meq/L) to shift water from `ph_start` to `ph_target`."""
    f1_start, _f2s, f3_start = _carbonate_fractions(ph_start)
    f1_end, _f2e, f3_end = _carbonate_fractions(CARBONIC_PKB)
    ct = (alkalinity_caco3 / 50.0) / ((f1_end - f1_start) + (f3_start - f3_end))
    f1_target, _f2t, f3_target = _carbonate_fractions(ph_target)
    return ct * ((f1_target - f1_start) + (f3_start - f3_target)) + (
        10.0 ** (-ph_target) - 10.0 ** (-ph_start)
    ) + 0.01


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
    """Millilitres of liquid acid solution for a total meq of acidity."""
    props = ACID_PROPERTIES.get(acid_medium)
    if props is None:
        raise SolverValidationError("UNKNOWN_ACID", f"Unknown acid medium {acid_medium!r}.")
    charge = _acid_charge_fraction(ph_for_charge, props["pks"])
    if charge <= 0:
        return 0.0
    mmol = acid_meq_total / charge
    pure_acid_mg = mmol * props["mol_wt"]
    strength = props["strength_pct"] / 100.0
    density_mg_per_ml = props["density_g_per_ml"] * 1000.0
    return pure_acid_mg / (strength * density_mg_per_ml)


def alkaline_agent_mass_g(alkaline_meq_total: float, agent: str) -> float:
    """Grams of an alkaline agent to supply a total meq of alkalinity."""
    equiv = ALKALINE_AGENT_EQUIV.get(agent)
    if equiv is None:
        raise SolverValidationError("UNKNOWN_ALKALINE_AGENT", f"Unknown agent {agent!r}.")
    return alkaline_meq_total * equiv


# ---------------------------------------------------------------------------
# Salt dosing
# ---------------------------------------------------------------------------


def _salt_ion_coeffs(gypsum_form: str, cacl2_form: str) -> dict[str, dict]:
    if gypsum_form not in SALT_COEFFS or cacl2_form not in SALT_COEFFS:
        raise SolverValidationError("UNKNOWN_SALT_FORM", "Unknown salt hydrate form.")
    return {
        "GYPSUM": SALT_COEFFS[gypsum_form],
        "CACL2": SALT_COEFFS[cacl2_form],
        "EPSOM": SALT_COEFFS["EPSOM"],
        "NACL": SALT_COEFFS["NACL"],
    }


def ions_added_ppm(dose: SaltDose, gypsum_form: str, cacl2_form: str) -> dict:
    """Ion ppm added per litre by a per-litre salt dose."""
    coeffs = _salt_ion_coeffs(gypsum_form, cacl2_form)
    masses_g_per_l = {
        "GYPSUM": dose.gypsum_g_per_l,
        "CACL2": dose.cacl2_g_per_l,
        "EPSOM": dose.epsom_g_per_l,
        "NACL": dose.nacl_g_per_l,
    }
    added = {"ca": 0.0, "mg": 0.0, "na": 0.0, "so4": 0.0, "cl": 0.0, "alk": 0.0}
    for salt, grams in masses_g_per_l.items():
        for ion, coef in coeffs[salt].items():
            added[ion] = added.get(ion, 0.0) + grams * coef
    return added


def add_ions(base: dict, added: dict) -> dict:
    """Add an ion map (ppm) onto a base ion map."""
    return {ion: base.get(ion, 0.0) + added.get(ion, 0.0) for ion in
            {"ca", "mg", "na", "so4", "cl", "alk"}}


def _solve_lp(c, a_eq, b_eq, a_ub, b_ub):
    return linprog(
        c,
        A_ub=a_ub if a_ub else None,
        b_ub=b_ub if b_ub else None,
        A_eq=a_eq if a_eq else None,
        b_eq=b_eq if b_eq else None,
        bounds=[(0.0, None)] * len(c),
        method="highs",
    )


def solve_salt_dose(
    strategy: str,
    source: dict,
    target: dict,
    gypsum_form: str,
    cacl2_form: str,
    calcium_floor_ppm: float,
) -> tuple[SaltDose, list[str]]:
    """Resolve the flavor-salt dose (per-litre) for the chosen strategy.

    Tier 1 ``FLAVOR`` pins sulfate and chloride (Ca floats). Tier 2
    ``CALCIUM_FLOOR`` is **flavor-first**: gypsum / CaCl₂ supply the sulfate and
    chloride, and the counter-ion salts (Epsom / NaCl) are used only when the
    source already meets the calcium floor — in which case added calcium is
    capped and total added ions minimized. Tier 3 ``OPTIMIZE`` is reserved and
    raises.
    """
    notes: list[str] = []
    coeffs = _salt_ion_coeffs(gypsum_form, cacl2_form)
    gyp, cacl2, epsom, nacl = coeffs["GYPSUM"], coeffs["CACL2"], coeffs["EPSOM"], coeffs["NACL"]

    need_so4 = max(0.0, target.get("so4", 0.0) - source.get("so4", 0.0))
    need_cl = max(0.0, target.get("cl", 0.0) - source.get("cl", 0.0))

    if strategy == "FLAVOR":
        dose = SaltDose(
            gypsum_g_per_l=need_so4 / gyp["so4"] if gyp.get("so4") else 0.0,
            cacl2_g_per_l=need_cl / cacl2["cl"] if cacl2.get("cl") else 0.0,
        )
        return dose, notes

    if strategy == "OPTIMIZE":
        raise SolverValidationError(
            "OPTIMIZE_NOT_IMPLEMENTED", "Salt strategy OPTIMIZE is not implemented."
        )

    if strategy != "CALCIUM_FLOOR":
        raise SolverValidationError("UNKNOWN_STRATEGY", f"Unknown strategy {strategy!r}.")

    # Flavor-first: gypsum / CaCl2 supply the sulfate and chloride.
    flavor_gypsum = need_so4 / gyp["so4"] if gyp.get("so4") else 0.0
    flavor_cacl2 = need_cl / cacl2["cl"] if cacl2.get("cl") else 0.0
    ca_from_flavor = flavor_gypsum * gyp.get("ca", 0.0) + flavor_cacl2 * cacl2.get("ca", 0.0)

    if source.get("ca", 0.0) < calcium_floor_ppm:
        # Soft source: the floor is a *minimum*; use flavor salts as-is even
        # though their calcium may rise above the floor.
        if source.get("ca", 0.0) + ca_from_flavor < calcium_floor_ppm - 1e-6:
            notes.append(
                "Calcium floor unreachable with the pinned sulfate/chloride targets."
            )
        return SaltDose(gypsum_g_per_l=flavor_gypsum, cacl2_g_per_l=flavor_cacl2), notes

    # Hard source: cap added calcium by moving sulfate/chloride onto the
    # counter-ion salts while minimizing total added ions.
    salts = [gyp, cacl2, epsom, nacl]

    # Equalities: sulfate and chloride pinned to target.
    a_eq = [
        [gyp.get("so4", 0.0), 0.0, epsom.get("so4", 0.0), 0.0],
        [0.0, cacl2.get("cl", 0.0), 0.0, nacl.get("cl", 0.0)],
    ]
    b_eq = [need_so4, need_cl]

    # Cap *added* calcium at the floor gap => added Ca <= max(0, floor - source).
    calcium_cap = max(0.0, calcium_floor_ppm - source.get("ca", 0.0))
    a_ub = [[gyp.get("ca", 0.0), cacl2.get("ca", 0.0), 0.0, 0.0]]
    b_ub = [calcium_cap]

    # Primary objective: minimize total added ions (ppm).
    c_primary = [sum(s.values()) for s in salts]

    res = _solve_lp(c_primary, a_eq, b_eq, a_ub, b_ub)
    if not res.success:
        # Floor unreachable with the SO4/Cl equalities; relax it and note.
        notes.append("Calcium floor unreachable; solved sulfate/chloride only.")
        res = _solve_lp(c_primary, a_eq, b_eq, None, None)
        if not res.success:
            raise SolverValidationError(
                "SALT_SOLVE_FAILED", "Salt optimization failed to find a feasible dose."
            )

    x = [max(0.0, value) for value in res.x]
    opt_primary = float(res.fun)

    # Lexicographic tie-breaks among the optimal solutions:
    #   (2) balance the Mg/Na split (avoid an all-or-nothing LP vertex);
    #   (3) prefer flavor salts (gypsum / CaCl₂) over Epsom / NaCl.
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

        c_tertiary = [0.0, 0.0, 1.0, 1.0]  # Epsom + NaCl grams
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

    dose = SaltDose(
        gypsum_g_per_l=x[0],
        cacl2_g_per_l=x[1],
        epsom_g_per_l=x[2],
        nacl_g_per_l=x[3],
    )
    return dose, notes


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def solve_water_chemistry(inp: WaterChemistryInput) -> WaterChemistryOutput:
    """Top-level water-chemistry solve (plan §3.6)."""
    warnings: list[str] = []
    notes: list[str] = []

    grist_acidity, buckets = resolve_grist(inp.grist)

    dose, solve_notes = solve_salt_dose(
        inp.strategy, inp.source, inp.target, inp.gypsum_form, inp.cacl2_form, inp.calcium_floor_ppm
    )
    notes.extend(solve_notes)

    added = ions_added_ppm(dose, inp.gypsum_form, inp.cacl2_form)
    post_mash = add_ions(inp.source, added)
    proportional = inp.salt_distribution == "PROPORTIONAL"
    post_hlt = add_ions(inp.source, added) if proportional else dict(inp.source)

    # Mash pH from the post-salt mash ions.
    ra_mash = residual_alkalinity(post_mash["ca"], post_mash["mg"], post_mash.get("alk", 0.0))
    predicted_ph = predict_mash_ph(
        grist_acidity, ra_mash, inp.v_mash_treat_l, inp.mash_thickness_l_per_kg
    )
    status = mash_ph_status(predicted_ph)

    # Acid or alkaline correction to reach the target pH.
    meq_l = acid_required_meq_l(post_mash.get("alk", 0.0), predicted_ph, inp.target_mash_ph)
    mash_acid_ml = 0.0
    alkaline_agent_g = 0.0
    if meq_l > 0:
        mash_acid_ml = acid_volume_ml(meq_l * inp.v_mash_treat_l, inp.acid_medium, inp.target_mash_ph)
    else:
        alkaline_agent_g = alkaline_agent_mass_g(
            abs(meq_l) * inp.v_mash_treat_l, inp.preferred_alkaline_agent
        )

    # Sparge protection: neutralize RA2 of the (post-salt) HLT water.
    ra_hlt = residual_alkalinity(post_hlt["ca"], post_hlt["mg"], post_hlt.get("alk", 0.0))
    sparge_acid_ml = 0.0
    sparge_tannin_warning = False
    if inp.source.get("alk", 0.0) > 0.0 and ra_hlt > 0.0:
        sparge_meq_l = ra_hlt / 50.0
        sparge_acid_ml = acid_volume_ml(
            sparge_meq_l * inp.v_hlt_treat_l, inp.acid_medium, SPARGE_TANNIN_PH
        )
        sparge_tannin_warning = True

    # Dosing volumes.
    def _grams(volume_l: float) -> dict:
        return {
            "gypsum_g": dose.gypsum_g_per_l * volume_l,
            "cacl2_g": dose.cacl2_g_per_l * volume_l,
            "epsom_g": dose.epsom_g_per_l * volume_l,
            "nacl_g": dose.nacl_g_per_l * volume_l,
        }

    mash_dose = _grams(inp.v_mash_treat_l)
    sparge_dose = _grams(inp.v_hlt_treat_l) if proportional else {
        "gypsum_g": 0.0, "cacl2_g": 0.0, "epsom_g": 0.0, "nacl_g": 0.0
    }

    residual_hlt = max(0.0, inp.v_hlt_treat_l - inp.v_sparge_demand_l)
    if inp.v_hlt_treat_l - inp.v_hlt_debt_l - inp.v_sparge_demand_l > 0.0:
        warnings.append("HLT surplus: more liquor treated than the sparge will deliver.")

    mg_added = added.get("mg", 0.0)
    if mg_added > EPSOM_MG_WARN_PPM:
        warnings.append(f"Added magnesium {mg_added:.1f} ppm exceeds {EPSOM_MG_WARN_PPM:.0f} ppm.")
    if post_mash["ca"] < inp.calcium_floor_ppm - 1e-6:
        warnings.append(
            f"Calcium {post_mash['ca']:.1f} ppm is below the {inp.calcium_floor_ppm:.0f} ppm floor."
        )

    return WaterChemistryOutput(
        predicted_mash_ph=predicted_ph,
        mash_ph_status=status,
        strategy=inp.strategy,
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
    )
