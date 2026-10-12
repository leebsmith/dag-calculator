"""Pydantic V2 boundary contracts for black-box numerical solvers.

Defines the request, response, and error taxonomy models for:
- solver.batch (batch_sparge_solver: scipy.optimize.brentq)
- solver.water (water_chemistry_solver: scipy.optimize.linprog)
"""

from __future__ import annotations

import hashlib
import json
from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field


def _js_float_to_string(x: float) -> str:
    """Format a float the way ECMAScript ``Number::toString`` / ``JSON.stringify`` does.

    This is the canonical numeric form used by the shared fingerprint so the
    backend SHA-256 matches the frontend JS engine byte-for-byte. Rules mirrored:

    * shortest round-trip digits (CPython's ``repr`` already gives these),
    * integral doubles lose their ``.0`` suffix,
    * scientific notation only when the decimal exponent is ``<= -6`` or ``>= 21``,
    * ``-0`` and non-finite values collapse to ``0`` / ``null`` respectively.
    """
    if x != x or x in (float("inf"), float("-inf")):
        return "null"
    if x == 0.0:
        return "0"

    sign = "-" if x < 0 else ""
    ax = abs(x)

    # Normalize the shortest round-trip decimal into (digits, exp10) such that
    # ax == int(digits) * 10**exp10, with no leading/trailing zeros in `digits`.
    mant, sep, exp = repr(ax).partition("e")
    e = int(exp) if sep else 0
    point = mant.find(".")
    if point == -1:
        digits = mant
        frac_len = 0
    else:
        digits = mant[:point] + mant[point + 1 :]
        frac_len = len(mant) - point - 1
    exp10 = e - frac_len

    stripped = digits.lstrip("0")  # leading zeros leave the integer value unchanged
    digits = stripped.rstrip("0")  # trailing zeros shrink the integer
    exp10 += len(stripped) - len(digits)

    k = len(digits)
    n = exp10 + k  # ax == int(digits) * 10**(n - k)

    if k <= n <= 21:
        body = digits + "0" * (n - k)
    elif 0 < n <= 21:
        body = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        body = "0." + "0" * (-n) + digits
    else:
        exponent = n - 1
        body = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + (
            "+" if exponent >= 0 else "-"
        ) + str(abs(exponent))
    return sign + body


def _canonicalize(obj: Any) -> str:
    """Serialize a ``model_dump(mode="json")`` structure as compact JS-compatible JSON."""
    if obj is None:
        return "null"
    if obj is True:
        return "true"
    if obj is False:
        return "false"
    if isinstance(obj, str):
        return json.dumps(obj, ensure_ascii=False)
    if isinstance(obj, float):
        return _js_float_to_string(obj)
    if isinstance(obj, int):
        return str(obj)
    if isinstance(obj, (list, tuple)):
        return "[" + ",".join(_canonicalize(v) for v in obj) + "]"
    if isinstance(obj, dict):
        return "{" + ",".join(
            json.dumps(k, ensure_ascii=False) + ":" + _canonicalize(v)
            for k, v in sorted(obj.items(), key=lambda kv: kv[0])
        ) + "}"
    raise TypeError(f"Unsupported type in fingerprint: {type(obj)!r}")


# -----------------------------------------------------------------------------
# Base Boundary Schema
# -----------------------------------------------------------------------------

class BoundaryModel(BaseModel):
    """Base model enforcing boundary invariants and deterministic fingerprinting."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        validate_default=True,
    )

    def canonical_fingerprint(self) -> str:
        """Computes deterministic SHA-256 fingerprint matching the frontend JS engine."""
        canonical_json = _canonicalize(self.model_dump(mode="json"))
        return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


# -----------------------------------------------------------------------------
# Error Taxonomies
# -----------------------------------------------------------------------------

class BatchSolverErrorCode(StrEnum):
    """Error codes declared on solver.batch error surface."""

    INVALID_TARGET_ABV = "INVALID_TARGET_ABV"
    INVALID_ATTENUATION = "INVALID_ATTENUATION"
    ABV_UNREACHABLE = "ABV_UNREACHABLE"
    INVALID_FERM_VOLUME = "INVALID_FERM_VOLUME"
    INVALID_SHRINKAGE = "INVALID_SHRINKAGE"
    EXTRACT_TARGET_NON_POSITIVE = "EXTRACT_TARGET_NON_POSITIVE"
    INVALID_YIELD = "INVALID_YIELD"
    DEGENERATE_BRACKET = "DEGENERATE_BRACKET"
    BRACKET_NO_SIGN_CHANGE = "BRACKET_NO_SIGN_CHANGE"
    UNKNOWN_TOPOLOGY = "UNKNOWN_TOPOLOGY"
    INVALID_INTENSIVE_VALUE = "INVALID_INTENSIVE_VALUE"
    MASH_TOO_THIN = "MASH_TOO_THIN"
    HLT_TOO_SMALL = "HLT_TOO_SMALL"


class WaterSolverErrorCode(StrEnum):
    """Error codes declared on solver.water error surface."""

    OPTIMIZE_NOT_IMPLEMENTED = "OPTIMIZE_NOT_IMPLEMENTED"
    SOURCE_NOT_FOUND = "SOURCE_NOT_FOUND"
    MISSING_SOURCE = "MISSING_SOURCE"
    SALT_SOLVE_FAILED = "SALT_SOLVE_FAILED"
    INVALID_MASH_VOLUME = "INVALID_MASH_VOLUME"
    UNKNOWN_STRATEGY = "UNKNOWN_STRATEGY"
    UNKNOWN_ACID = "UNKNOWN_ACID"
    UNKNOWN_ALKALINE_AGENT = "UNKNOWN_ALKALINE_AGENT"
    UNKNOWN_SALT_FORM = "UNKNOWN_SALT_FORM"
    UNKNOWN_GRAIN_TYPE = "UNKNOWN_GRAIN_TYPE"


class SolverErrorResponse(BoundaryModel):
    """Standardized failure envelope for boundary requests."""

    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


# -----------------------------------------------------------------------------
# Solver 1: Batch Sparge Solver (solver.batch)
# -----------------------------------------------------------------------------

class BatchSpargeTopology(StrEnum):
    R_L_TO_G = "r_l_to_g"
    RUNOFF_RATIO = "runoff_ratio"


class GristBillRow(BoundaryModel):
    """Normalized grain bill entry (w_i normalized fraction summing to 1.0)."""

    w_i: Annotated[float, Field(ge=0.0, le=1.0, description="Normalized grist fraction")]
    yield_i: Annotated[float, Field(ge=0.0, le=1.0, description="Dry-basis extract yield fraction")]
    mc_i: Annotated[float, Field(ge=0.0, le=1.0, description="As-is moisture fraction")]


class BatchSolverRequest(BoundaryModel):
    """Input contract for batch_sparge_solver (Brent's method root-finding)."""

    target_abv: Annotated[float, Field(gt=0.0, description="Target ABV in percent (e.g. 5.5)")]
    apparent_attenuation: Annotated[float, Field(gt=0.0, le=1.0, description="Expected attenuation fraction")]
    v_ferm: Annotated[float, Field(gt=0.0, description="Target cold fermenter volume in Liters")]
    topology: BatchSpargeTopology = Field(description="Runoff model topology")
    intensive_value: Annotated[float, Field(gt=0.0, description="R_L:G ratio (L/kg) or runoff ratio r")]
    grain_bill: list[GristBillRow] = Field(min_length=1, description="Normalized grain bill rows")
    s_late_add: Annotated[float, Field(ge=0.0, default=0.0, description="Late-addition kettle extract in kg")]
    v_kettle_dead: Annotated[float, Field(ge=0.0, default=0.0, description="Kettle/chiller dead space in Liters")]
    delta_v_evap: Annotated[float, Field(ge=0.0, description="Boil-off evaporation loss in Liters")]
    v_dead: Annotated[float, Field(ge=0.0, default=0.0, description="Mash-tun dead space in Liters")]
    eta_conv: Annotated[float, Field(gt=0.0, le=1.0, description="Mash conversion efficiency fraction")]
    f_shrink: Annotated[float, Field(ge=0.0, lt=1.0, default=0.04, description="Thermal shrinkage fraction")]
    hlt_starting_volume_l: Annotated[float, Field(ge=0.0, description="Brew-day initial HLT fill in Liters")]
    hlt_dead_space_l: Annotated[float, Field(ge=0.0, default=0.0, description="HLT dead space loss in Liters")]
    hlt_transfer_loss_l: Annotated[float, Field(ge=0.0, default=0.0, description="HLT transfer debt in Liters")]
    hlt_coil_floor_l: Annotated[float, Field(ge=0.0, default=0.0, description="HLT coil immersion floor in Liters")]
    max_hlt_volume_l: Annotated[float, Field(gt=0.0, description="Maximum HLT capacity in Liters")]


class BatchCascadeOutputs(BoundaryModel):
    v_strike: Annotated[float, Field(description="Strike water volume (L)")]
    v_run1: Annotated[float, Field(description="First runnings volume (L)")]
    v_run2: Annotated[float, Field(description="Second runnings volume (L)")]
    v_sparge: Annotated[float, Field(description="Sparge water volume delivered (L)")]
    s_run1: Annotated[float, Field(description="First runnings extract mass (kg)")]
    s_run2: Annotated[float, Field(description="Second runnings extract mass (kg)")]
    sg_pre_boil: Annotated[float, Field(description="Pre-boil specific gravity")]
    v_post_boil: Annotated[float, Field(description="Post-boil volume (L)")]
    mash_thickness_l_per_kg: Annotated[float, Field(description="Resolved mash thickness (L/kg)")]


class BatchHltOutputs(BoundaryModel):
    v_hlt_debt: Annotated[float, Field(description="Undeliverable HLT debt volume (L)")]
    v_hlt_after_strike: Annotated[float, Field(description="HLT volume remaining after strike strike delivery (L)")]
    v_hlt_top_up: Annotated[float, Field(description="Required HLT cold water addition (L)")]
    v_sparge_deliverable: Annotated[float, Field(description="Available deliverable sparge volume from HLT (L)")]


class BatchSolverResponse(BoundaryModel):
    """Output contract for batch_sparge_solver."""

    sg_post_boil: Annotated[float, Field(description="Post-boil specific gravity")]
    v_pre_boil: Annotated[float, Field(description="Pre-boil wort volume (L)")]
    s_post_boil_target: Annotated[float, Field(description="Post-boil sugar extract mass (kg)")]
    m_grist: Annotated[float, Field(description="Total required grist mass (kg)")]
    cascade: BatchCascadeOutputs
    max_achievable_abv: Annotated[float, Field(description="Upper bound achievable ABV given geometry")]
    hlt: BatchHltOutputs
    mash_thickness_l_per_kg: Annotated[float, Field(description="Resolved mash thickness (L/kg)")]


# -----------------------------------------------------------------------------
# Solver 2: Water Chemistry Solver (solver.water)
# -----------------------------------------------------------------------------

class WaterStrategy(StrEnum):
    FLAVOR = "FLAVOR"
    CALCIUM_FLOOR = "CALCIUM_FLOOR"
    OPTIMIZE = "OPTIMIZE"


class SaltDistribution(StrEnum):
    MASH_ONLY = "MASH_ONLY"
    PROPORTIONAL = "PROPORTIONAL"


class AcidMedium(StrEnum):
    LACTIC_88 = "LACTIC_88"
    PHOSPHORIC_10 = "PHOSPHORIC_10"
    PHOSPHORIC_85 = "PHOSPHORIC_85"


class PreferredAlkalineAgent(StrEnum):
    BAKING_SODA = "BAKING_SODA"
    CHALK = "CHALK"
    PICKLING_LIME = "PICKLING_LIME"


class MashPhStatus(StrEnum):
    HIGH = "HIGH"
    LOW = "LOW"
    OPTIMAL = "OPTIMAL"


class IonProfile(BoundaryModel):
    """The six working brewing ions in ppm (parts per million)."""

    calcium_ca: Annotated[float, Field(ge=0.0, description="Ca2+ (ppm)")]
    magnesium_mg: Annotated[float, Field(ge=0.0, description="Mg2+ (ppm)")]
    sodium_na: Annotated[float, Field(ge=0.0, description="Na+ (ppm)")]
    sulfate_so4: Annotated[float, Field(ge=0.0, description="SO4 2- (ppm)")]
    chloride_cl: Annotated[float, Field(ge=0.0, description="Cl- (ppm)")]
    alkalinity_as_caco3: Annotated[float, Field(ge=0.0, description="Total Alkalinity as CaCO3 (ppm)")]


class WaterGristRow(BoundaryModel):
    mass_kg: Annotated[float, Field(gt=0.0, description="Grain mass in kg")]
    color_lovibond: Annotated[float, Field(ge=0.0, description="Grain color in Lovibond")]
    grain_type: str = Field(description="Taxonomy grain category (e.g. BASE, CRYSTAL, ROASTED, ACID)")


class WaterSolverRequest(BoundaryModel):
    """Input contract for water_chemistry_solver (Linear Program)."""

    grist: list[WaterGristRow] = Field(min_length=1, description="Grist rows for buffering calculations")
    source: IonProfile = Field(description="Working ions from source report")
    target: IonProfile = Field(description="Target water profile ions")
    v_mash_treat_l: Annotated[float, Field(gt=0.0, description="Mash liquor treatment volume (L)")]
    v_hlt_treat_l: Annotated[float, Field(ge=0.0, description="HLT liquor treatment volume (L)")]
    v_hlt_debt_l: Annotated[float, Field(ge=0.0, default=0.0, description="Undeliverable HLT debt volume (L)")]
    v_sparge_demand_l: Annotated[float, Field(ge=0.0, description="Total sparge volume demand (L)")]
    mash_thickness_l_per_kg: Annotated[float, Field(gt=0.0, description="Resolved L/kg mash thickness")]
    target_mash_ph: Annotated[float, Field(ge=4.0, le=7.0, default=5.4, description="Desired mash pH")]
    strategy: WaterStrategy = Field(default=WaterStrategy.CALCIUM_FLOOR)
    salt_distribution: SaltDistribution = Field(default=SaltDistribution.PROPORTIONAL)
    acid_medium: AcidMedium = Field(default=AcidMedium.LACTIC_88)
    gypsum_form: str = Field(default="dihydrate")
    cacl2_form: str = Field(default="dihydrate")
    preferred_alkaline_agent: PreferredAlkalineAgent = Field(default=PreferredAlkalineAgent.BAKING_SODA)
    calcium_floor_ppm: Annotated[float, Field(ge=0.0, default=50.0, description="Calcium floor in ppm")]


class SaltAdditions(BoundaryModel):
    gypsum_g: Annotated[float, Field(ge=0.0, default=0.0)]
    cacl2_g: Annotated[float, Field(ge=0.0, default=0.0)]
    epsom_g: Annotated[float, Field(ge=0.0, default=0.0)]
    nacl_g: Annotated[float, Field(ge=0.0, default=0.0)]
    acid_ml: Annotated[float, Field(ge=0.0, default=0.0)]
    baking_soda_g: Annotated[float, Field(ge=0.0, default=0.0)]
    chalk_g: Annotated[float, Field(ge=0.0, default=0.0)]
    pickling_lime_g: Annotated[float, Field(ge=0.0, default=0.0)]


class WaterPrescription(BoundaryModel):
    predicted_mash_ph: Annotated[float, Field(description="Modeled mash pH")]
    mash_ph_status: MashPhStatus = Field(description="Interpretation: HIGH, LOW, or OPTIMAL")
    residual_hlt_water_l: Annotated[float, Field(description="Remaining treated HLT water (L)")]
    sparge_tannin_warning: bool = Field(default=False, description="Flagged if sparge alkalinity triggers tannin extraction")


class WaterSolverResponse(BoundaryModel):
    """Output contract for water_chemistry_solver."""

    strategy: WaterStrategy
    prescription: WaterPrescription
    mash_additions: SaltAdditions
    sparge_additions: SaltAdditions
    post_salt_mash_ions: IonProfile
    grist_buckets_kg: dict[str, float]
    warnings: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
