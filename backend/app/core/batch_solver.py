"""Re-export shim for the batch solver, now split into ``app.core.batch``.

Every public name the pre-split module exposed stays importable here until the
callers migrate to the package modules.
"""

from __future__ import annotations

from app.core.batch.cascade import (
    StageCascade,
    calculate_sg_pre_boil,
    first_runnings_volume,
    resolve_stage_cascade,
    second_runnings_volume,
    stage_extract_split,
)
from app.core.batch.composition import (
    WortComposition,
    asbc_plato_to_sg,
    asbc_sg_to_plato,
    cutaia_abv,
    max_achievable_abv,
    resolve_wort_composition,
    solve_oe_from_composition,
    solve_sg_post_boil_from_abv,
)
from app.core.batch.constants import (
    ETHANOL_DENSITY_METRIC,
    F_SHRINK_DEFAULT,
    GAMMA_METRIC,
    GRAIN_DISPLACEMENT_METRIC,
    K_ABS_TRUE_METRIC,
    RHO_WATER_METRIC,
    SUGAR_FERMENTABILITY,
    V_BAR_METRIC,
    sugar_extract_for,
)
from app.core.batch.diagnostics import tun_peak_volume_l
from app.core.batch.grist import (
    grist_mass_bracket,
    grist_mass_residual,
    solve_grist_mass,
)
from app.core.batch.helpers import (
    brewhouse_efficiency,
    composite_fermentability_fraction,
    composite_moisture_fraction,
    composite_volumetric_expansion,
    composite_yield_fraction,
    converted_extract,
    grist_apparent_attenuation,
    moisture_volume,
    retained_volume,
    solute_displacement_volume,
    validate_grain_bill_normalization,
)
from app.core.batch.hlt import (
    HltWaterBudget,
    hlt_top_up_target,
    resolve_hlt_water_budget,
)
from app.core.batch.inputs import BatchSolverInput, GrainBillEntry
from app.core.batch.orchestration import (
    BatchSolverResult,
    ScalePreview,
    solve_batch,
)
from app.core.batch.volumetric import (
    ExtractSplit,
    VolumetricReversal,
    kettle_cold_volume,
    post_boil_extract_target,
    pre_boil_volume,
    require_malt_extract,
    resolve_extract_split,
    resolve_volumetric_reversal,
)
from app.core.errors import (
    CAPACITY_BY_CONSTRAINT,
    CapacityLoads,
    SolverValidationError,
    binding_constraint_for,
    capacity_error,
    exceeded_capacity,
)
from app.core.utils import (
    apparent_extract_for_real_extract,
    apparent_to_real_attenuation,
    cutaia_abw,
    plato_to_sg,
    sg_to_plato,
)

__all__ = [
    "CAPACITY_BY_CONSTRAINT",
    "ETHANOL_DENSITY_METRIC",
    "F_SHRINK_DEFAULT",
    "GAMMA_METRIC",
    "GRAIN_DISPLACEMENT_METRIC",
    "K_ABS_TRUE_METRIC",
    "RHO_WATER_METRIC",
    "SUGAR_FERMENTABILITY",
    "V_BAR_METRIC",
    "BatchSolverInput",
    "BatchSolverResult",
    "CapacityLoads",
    "ExtractSplit",
    "GrainBillEntry",
    "HltWaterBudget",
    "ScalePreview",
    "SolverValidationError",
    "StageCascade",
    "VolumetricReversal",
    "WortComposition",
    "apparent_extract_for_real_extract",
    "apparent_to_real_attenuation",
    "asbc_plato_to_sg",
    "asbc_sg_to_plato",
    "binding_constraint_for",
    "brewhouse_efficiency",
    "calculate_sg_pre_boil",
    "capacity_error",
    "composite_fermentability_fraction",
    "composite_moisture_fraction",
    "composite_volumetric_expansion",
    "composite_yield_fraction",
    "converted_extract",
    "cutaia_abv",
    "cutaia_abw",
    "exceeded_capacity",
    "first_runnings_volume",
    "grist_apparent_attenuation",
    "grist_mass_bracket",
    "grist_mass_residual",
    "hlt_top_up_target",
    "kettle_cold_volume",
    "max_achievable_abv",
    "moisture_volume",
    "plato_to_sg",
    "post_boil_extract_target",
    "pre_boil_volume",
    "require_malt_extract",
    "resolve_extract_split",
    "resolve_hlt_water_budget",
    "resolve_stage_cascade",
    "resolve_volumetric_reversal",
    "resolve_wort_composition",
    "retained_volume",
    "second_runnings_volume",
    "sg_to_plato",
    "solve_batch",
    "solve_grist_mass",
    "solve_oe_from_composition",
    "solve_sg_post_boil_from_abv",
    "solute_displacement_volume",
    "stage_extract_split",
    "sugar_extract_for",
    "tun_peak_volume_l",
    "validate_grain_bill_normalization",
]
