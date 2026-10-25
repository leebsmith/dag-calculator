"""Pydantic V2 boundary contracts for black-box numerical solvers.

Defines the request, response, and error taxonomy models for:
- solver.batch (batch_sparge_solver: scipy.optimize.brentq)
- solver.water (water_chemistry_solver: scipy.optimize.linprog)
- solver.hops (hop_bitterness_solver: Tinseth + Arrhenius cooling integral)
"""

from __future__ import annotations

import hashlib
from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.canonical import canonicalize

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
        canonical_json = canonicalize(self.model_dump(mode="json"))
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
    INVALID_GRAIN_BILL_NORMALIZATION = "INVALID_GRAIN_BILL_NORMALIZATION"


class WaterSolverErrorCode(StrEnum):
    """Error codes declared on solver.water error surface."""

    INVALID_MASH_VOLUME = "INVALID_MASH_VOLUME"
    INVALID_SPARGE_VOLUME = "INVALID_SPARGE_VOLUME"
    UNKNOWN_GRAIN_TYPE = "UNKNOWN_GRAIN_TYPE"
    UNKNOWN_ACID_MEDIUM = "UNKNOWN_ACID_MEDIUM"
    UNKNOWN_ALKALINE_AGENT = "UNKNOWN_ALKALINE_AGENT"
    UNKNOWN_SALT_FORM = "UNKNOWN_SALT_FORM"
    SALT_SOLVE_FAILED = "SALT_SOLVE_FAILED"
    UNKNOWN_STRATEGY = "UNKNOWN_STRATEGY"
    PINNED_IONS_REQUIRED = "PINNED_IONS_REQUIRED"


class HopSolverErrorCode(StrEnum):
    """Error codes declared on solver.hops error surface."""

    INVALID_HOP_INPUT = "INVALID_HOP_INPUT"
    INVALID_GRAVITY = "INVALID_GRAVITY"
    INVALID_VOLUME = "INVALID_VOLUME"
    INVALID_COOLING_CONSTANT = "INVALID_COOLING_CONSTANT"
    UNKNOWN_PRODUCT_FORM = "UNKNOWN_PRODUCT_FORM"


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
    fermentability_i: Annotated[
        float | None,
        Field(default=None, ge=0.0, le=1.0, description="Congress-Mash fermentability fraction"),
    ]


class BatchSolverRequest(BoundaryModel):
    """Input contract for batch_sparge_solver (Brent's method root-finding)."""

    target_abv: Annotated[float, Field(gt=0.0, le=100.0, description="Target ABV in percent (e.g. 5.5)")]
    apparent_attenuation: Annotated[float, Field(gt=0.0, le=1.0, description="Yeast attenuation cap fraction")]
    v_ferm: Annotated[float, Field(gt=0.0, le=1_000_000.0, description="Target cold fermenter volume in Liters")]
    topology: BatchSpargeTopology = Field(description="Runoff model topology")
    intensive_value: Annotated[float, Field(gt=0.0, le=1000.0, description="R_L:G ratio (L/kg) or runoff ratio r")]
    grain_bill: list[GristBillRow] = Field(min_length=1, max_length=50, description="Normalized grain bill rows")
    s_late_add: Annotated[float, Field(ge=0.0, default=0.0, description="Late-addition kettle extract in kg")]
    v_kettle_dead: Annotated[float, Field(ge=0.0, default=0.0, description="Kettle/chiller dead space in Liters")]
    v_kettle_transfer: Annotated[float, Field(ge=0.0, default=0.0, description="Kettle/chiller transfer loss in Liters")]
    v_trub: Annotated[float, Field(ge=0.0, default=0.0, description="Kettle trub loss in Liters")]
    delta_v_evap: Annotated[float, Field(ge=0.0, description="Boil-off evaporation loss in Liters")]
    v_dead: Annotated[float, Field(ge=0.0, default=0.0, description="Mash-tun dead space in Liters")]
    mash_transfer_loss: Annotated[float, Field(ge=0.0, default=0.0, description="Mash-tun transfer (hose/pump) loss in Liters")]
    eta_conv: Annotated[float, Field(gt=0.0, le=1.0, description="Mash conversion efficiency fraction")]
    f_shrink: Annotated[float, Field(ge=0.0, lt=1.0, default=0.04, description="Thermal shrinkage fraction")]
    k_abs_true: Annotated[float, Field(gt=0.0, default=1.043176, description="Grain absorption coefficient in L/kg (per-rig)")]
    hlt_starting_volume_l: Annotated[float, Field(ge=0.0, description="Brew-day initial HLT fill in Liters")]
    hlt_dead_space_l: Annotated[float, Field(ge=0.0, default=0.0, description="HLT dead space loss in Liters")]
    hlt_transfer_loss_l: Annotated[float, Field(ge=0.0, default=0.0, description="HLT transfer debt in Liters")]
    hlt_coil_floor_l: Annotated[float, Field(ge=0.0, default=0.0, description="HLT coil immersion floor in Liters")]
    max_hlt_volume_l: Annotated[float, Field(gt=0.0, le=1_000_000.0, description="Maximum HLT capacity in Liters")]

    @model_validator(mode="after")
    def _check_grain_bill_normalization(self) -> BatchSolverRequest:
        total = sum(row.w_i for row in self.grain_bill)
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"Grain bill weights must sum to 1.0; got {total}")
        return self


class BatchCascadeOutputs(BoundaryModel):
    v_strike: Annotated[float, Field(description="Strike water volume (L)")]
    v_run1: Annotated[float, Field(description="First runnings volume (L)")]
    v_run2: Annotated[float, Field(description="Second runnings volume (L)")]
    v_sparge: Annotated[float, Field(description="Sparge water volume delivered (L)")]
    v_absorption: Annotated[float, Field(description="Grain absorption volume (L)")]
    v_mc: Annotated[float, Field(description="Grain moisture volume (L)")]
    v_sol: Annotated[float, Field(description="Dissolved-extract displacement volume (L)")]
    s_run1: Annotated[float, Field(description="First runnings extract mass (kg)")]
    s_run2: Annotated[float, Field(description="Second runnings extract mass (kg)")]
    sg_pre_boil: Annotated[float, Field(description="Pre-boil specific gravity")]
    v_post_boil: Annotated[float, Field(description="Post-boil volume (L)")]


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
    aa_wort: Annotated[float, Field(description="Extract-weighted wort fermentability")]
    aa_batch: Annotated[float, Field(description="Wort AA clamped by the yeast cap")]
    hlt: BatchHltOutputs
    mash_thickness_l_per_kg: Annotated[float, Field(description="Resolved mash thickness (L/kg)")]


# -----------------------------------------------------------------------------
# Solver 2: Water Chemistry Solver (solver.water)
# -----------------------------------------------------------------------------

class WhirlpoolHopForm(StrEnum):
    T90_PELLET = "t90_pellet"
    FLOWABLE_EXTRACT = "flowable_extract"


class BoilHopRow(BoundaryModel):
    """One boil addition as sent to the hop boundary."""

    alpha_acid_pct: Annotated[float, Field(ge=0.0, le=1.0)]
    boil_time_fraction: Annotated[float, Field(ge=0.0, le=1.0)]
    pct: Annotated[float, Field(ge=0.0, le=1.0, description="IBU share fraction")]


class WhirlpoolHopRow(BoundaryModel):
    """One whirlpool addition as sent to the hop boundary."""

    alpha_acid_pct: Annotated[float, Field(ge=0.0, le=1.0)]
    duration_min: Annotated[float, Field(ge=0.0)]
    initial_temp_c: Annotated[float, Field(ge=0.0, le=100.0)]
    pct: Annotated[float, Field(ge=0.0, le=1.0, description="IBU share fraction")]
    product_form: WhirlpoolHopForm = WhirlpoolHopForm.T90_PELLET


class HopSolverRequest(BoundaryModel):
    """Input contract for hop_bitterness_solver (Tinseth + Arrhenius)."""

    boil_hops: list[BoilHopRow] = Field(default_factory=list, max_length=50)
    whirlpool_hops: list[WhirlpoolHopRow] = Field(default_factory=list, max_length=50)
    boil_target_ibu: Annotated[float, Field(ge=0.0)]
    whirlpool_target_ibu: Annotated[float, Field(ge=0.0)]
    boil_time_min: Annotated[float, Field(ge=0.0)]
    pre_boil_gravity: Annotated[float, Field(gt=0.0)]
    post_boil_gravity: Annotated[float, Field(gt=0.0)]
    post_boil_volume_l: Annotated[float, Field(gt=0.0)]
    whirlpool_ambient_temp_c: Annotated[float, Field(ge=-20.0, le=50.0)]
    whirlpool_cooling_time_constant_min: Annotated[float, Field(gt=0.0)]


class BoilHopResult(BoundaryModel):
    minutes: Annotated[float, Field(ge=0.0)]
    ibu: Annotated[float, Field(ge=0.0)]
    mass_kg: float | None = None


class WhirlpoolHopResult(BoundaryModel):
    minutes: Annotated[float, Field(ge=0.0)]
    ibu: Annotated[float, Field(ge=0.0)]
    mass_kg: float | None = None
    effective_minutes: Annotated[float, Field(ge=0.0)]


class HopSolverResponse(BoundaryModel):
    """Output contract for hop_bitterness_solver."""

    boil_rows: list[BoilHopResult]
    whirlpool_rows: list[WhirlpoolHopResult]
    boil_mass_kg: float
    whirlpool_mass_kg: float
    total_mass_kg: float


class WaterStrategy(StrEnum):
    FLAVOR = "FLAVOR"
    CALCIUM_FLOOR = "CALCIUM_FLOOR"
    OPTIMIZE = "OPTIMIZE"
    AUTO = "AUTO"
    HYBRID = "HYBRID"
    BASELINE = "BASELINE"
    CUSTOM = "CUSTOM"


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

    grist: list[WaterGristRow] = Field(min_length=1, max_length=50, description="Grist rows for buffering calculations")
    source: IonProfile = Field(description="Working ions from source report")
    target: IonProfile = Field(description="Target water profile ions")
    v_mash_treat_l: Annotated[float, Field(gt=0.0, le=1_000_000.0, description="Mash liquor treatment volume (L)")]
    v_hlt_treat_l: Annotated[float, Field(ge=0.0, le=1_000_000.0, description="HLT liquor treatment volume (L)")]
    v_hlt_debt_l: Annotated[float, Field(ge=0.0, default=0.0, description="Undeliverable HLT debt volume (L)")]
    v_sparge_demand_l: Annotated[float, Field(ge=0.0, description="Total sparge volume demand (L)")]
    mash_thickness_l_per_kg: Annotated[float, Field(gt=0.0, description="Resolved L/kg mash thickness")]
    target_mash_ph: Annotated[float, Field(ge=4.0, le=7.0, default=5.4, description="Desired mash pH")]
    strategy: WaterStrategy = Field(default=WaterStrategy.AUTO)
    salt_distribution: SaltDistribution = Field(default=SaltDistribution.PROPORTIONAL)
    acid_medium: AcidMedium = Field(default=AcidMedium.LACTIC_88)
    gypsum_form: str = Field(default="dihydrate")
    cacl2_form: str = Field(default="dihydrate")
    preferred_alkaline_agent: PreferredAlkalineAgent = Field(default=PreferredAlkalineAgent.BAKING_SODA)
    calcium_floor_ppm: Annotated[float, Field(ge=0.0, default=50.0, description="Calcium floor in ppm")]
    custom_pinned_ions: list[str] = Field(
        default_factory=list,
        max_length=6,
        description=(
            "Mode 5 equalities (short ion keys). Five pins are exactly determined and may be "
            "infeasible; six are accepted as a best-fit request."
        ),
    )


class SaltAdditions(BoundaryModel):
    gypsum_kg: Annotated[float, Field(ge=0.0, default=0.0)]
    cacl2_kg: Annotated[float, Field(ge=0.0, default=0.0)]
    epsom_kg: Annotated[float, Field(ge=0.0, default=0.0)]
    nacl_kg: Annotated[float, Field(ge=0.0, default=0.0)]
    acid_l: Annotated[float, Field(ge=0.0, default=0.0)]
    baking_soda_kg: Annotated[float, Field(ge=0.0, default=0.0)]
    chalk_kg: Annotated[float, Field(ge=0.0, default=0.0)]
    pickling_lime_kg: Annotated[float, Field(ge=0.0, default=0.0)]


class WaterPrescription(BoundaryModel):
    predicted_mash_ph: Annotated[float, Field(description="Modeled mash pH")]
    mash_ph_status: MashPhStatus = Field(description="Interpretation: HIGH, LOW, or OPTIMAL")
    residual_hlt_water_l: Annotated[float, Field(description="Remaining treated HLT water (L)")]


class WaterSolverResponse(BoundaryModel):
    """Output contract for water_chemistry_solver."""

    strategy: WaterStrategy
    prescription: WaterPrescription
    mash_additions: SaltAdditions
    sparge_additions: SaltAdditions
    post_salt_mash_ions: IonProfile
    post_salt_hlt_ions: IonProfile
    post_dose_mash_ions: IonProfile
    total_added_salt_mass_g: float
    added_mineral_tds_ppm: float
    grist_buckets_kg: dict[str, float]
    warnings: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    telemetry: list[dict[str, Any]] = Field(default_factory=list)
