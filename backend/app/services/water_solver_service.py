"""Service adapter mapping the sealed water-chemistry solver onto its Pydantic contract.

Same rationale as ``batch_solver_service``: ``app.core`` must stay free of
``app.schemas`` imports, so this module translates between the core's short ion
keys / dataclasses and the schema's ``IonProfile`` / ``WaterSolverResponse``.
"""

from __future__ import annotations

from app.core.water import (
    GrainEntry,
    SolverValidationError,
    WaterChemistryInput,
    solve_water_chemistry,
)
from app.schemas.boundary import (
    IonProfile,
    MashPhStatus,
    SaltAdditions,
    SaltDistribution,
    WaterPrescription,
    WaterSolverRequest,
    WaterSolverResponse,
    WaterStrategy,
)
from app.services.errors import SolverServiceError
from app.services.parity import assert_field_parity

assert_field_parity(WaterSolverRequest, WaterChemistryInput)

_ION_LONG_TO_SHORT = {
    "calcium_ca": "ca",
    "magnesium_mg": "mg",
    "sodium_na": "na",
    "sulfate_so4": "so4",
    "chloride_cl": "cl",
    "alkalinity_as_caco3": "alk",
}
_ION_SHORT_TO_LONG = {v: k for k, v in _ION_LONG_TO_SHORT.items()}

_GYPSUM_FORMS = {"dihydrate": "GYPSUM_DIHYDRATE", "anhydrous": "GYPSUM_ANHYDROUS"}
_CACL2_FORMS = {"dihydrate": "CACL2_DIHYDRATE", "anhydrous": "CACL2_ANHYDROUS"}


def _to_short_ions(profile: IonProfile) -> dict:
    return {_ION_LONG_TO_SHORT[k]: v for k, v in profile.model_dump().items()}


def _to_long_ions(ions: dict) -> IonProfile:
    return IonProfile(**{_ION_SHORT_TO_LONG[k]: v for k, v in ions.items()})


def _alkaline_fields(agent: str, kg: float) -> dict:
    if agent == "BAKING_SODA":
        return {"baking_soda_kg": kg}
    if agent == "CHALK":
        return {"chalk_kg": kg}
    return {"pickling_lime_kg": kg}


def _to_salt_additions(
    dose_g: dict, acid_ml: float, agent: str, alkaline_g: float
) -> SaltAdditions:
    # The sealed solver emits grams/mL (its serialization unit); the boundary
    # contract declares mass/volume in base kg/L, so convert here.
    fields = {
        "gypsum_kg": dose_g.get("gypsum_g", 0.0) / 1000.0,
        "cacl2_kg": dose_g.get("cacl2_g", 0.0) / 1000.0,
        "epsom_kg": dose_g.get("epsom_g", 0.0) / 1000.0,
        "nacl_kg": dose_g.get("nacl_g", 0.0) / 1000.0,
        "acid_l": acid_ml / 1000.0,
    }
    fields.update(_alkaline_fields(agent, alkaline_g / 1000.0))
    return SaltAdditions(**fields)


def _to_input(req: WaterSolverRequest) -> WaterChemistryInput:
    return WaterChemistryInput(
        grist=[
            GrainEntry(
                mass_kg=row.mass_kg,
                color_lovibond=row.color_lovibond,
                grain_type=row.grain_type,
            )
            for row in req.grist
        ],
        source=_to_short_ions(req.source),
        target=_to_short_ions(req.target),
        v_mash_treat_l=req.v_mash_treat_l,
        v_hlt_treat_l=req.v_hlt_treat_l,
        v_hlt_debt_l=req.v_hlt_debt_l,
        v_sparge_demand_l=req.v_sparge_demand_l,
        mash_thickness_l_per_kg=req.mash_thickness_l_per_kg,
        target_mash_ph=req.target_mash_ph,
        strategy=req.strategy.value,
        salt_distribution=req.salt_distribution.value,
        acid_medium=req.acid_medium.value,
        gypsum_form=_GYPSUM_FORMS.get(req.gypsum_form, req.gypsum_form),
        cacl2_form=_CACL2_FORMS.get(req.cacl2_form, req.cacl2_form),
        preferred_alkaline_agent=req.preferred_alkaline_agent.value,
        calcium_floor_ppm=req.calcium_floor_ppm,
        custom_pinned_ions=req.custom_pinned_ions,
    )


def _post_hlt_ions(result, req: WaterSolverRequest) -> IonProfile:
    """Reconstruct the treated HLT vector from the sealed core's documented rule.

    ``core/water.py`` computes ``post_hlt = source + added`` under
    ``PROPORTIONAL`` and bare ``source`` under ``MASH_ONLY``, but does not return
    it. Both are derivable here: under ``PROPORTIONAL`` the HLT vector equals the
    mash vector (same per-litre dose, by construction); under ``MASH_ONLY`` it is
    the request's source ions. Unknown modes fail loudly rather than guessing.
    """
    if req.salt_distribution is SaltDistribution.PROPORTIONAL:
        return _to_long_ions(result.post_salt_mash_ions)
    if req.salt_distribution is SaltDistribution.MASH_ONLY:
        return req.source
    raise SolverServiceError(
        "UNKNOWN_SALT_DISTRIBUTION",
        f"Unknown salt distribution {req.salt_distribution.value!r}.",
    )


def _to_response(result, req: WaterSolverRequest) -> WaterSolverResponse:
    added_salt_g = (
        sum(result.mash_dose_g.values())
        + sum(result.sparge_dose_g.values())
        + result.alkaline_agent_g
    )
    return WaterSolverResponse(
        strategy=WaterStrategy(result.strategy),
        prescription=WaterPrescription(
            predicted_mash_ph=result.predicted_mash_ph,
            mash_ph_status=MashPhStatus(result.mash_ph_status),
            residual_hlt_water_l=result.residual_hlt_water_l,
            sparge_tannin_warning=result.sparge_tannin_warning,
        ),
        mash_additions=_to_salt_additions(
            result.mash_dose_g,
            result.mash_acid_ml,
            req.preferred_alkaline_agent.value,
            result.alkaline_agent_g,
        ),
        sparge_additions=_to_salt_additions(
            result.sparge_dose_g,
            result.sparge_acid_ml,
            req.preferred_alkaline_agent.value,
            0.0,
        ),
        post_salt_mash_ions=_to_long_ions(result.post_salt_mash_ions),
        post_salt_hlt_ions=_post_hlt_ions(result, req),
        post_dose_mash_ions=_to_long_ions(result.post_salt_mash_ions),
        total_added_salt_mass_g=added_salt_g,
        added_mineral_tds_ppm=(added_salt_g / req.v_mash_treat_l * 1000.0),
        grist_buckets_kg=result.grist_buckets_kg,
        warnings=result.warnings,
        notes=result.notes,
        telemetry=[],
    )


def solve_water_request(req: WaterSolverRequest) -> WaterSolverResponse:
    """Run the sealed water-chemistry solver over a validated request."""
    try:
        result = solve_water_chemistry(_to_input(req))
    except SolverValidationError as exc:
        raise SolverServiceError(exc.code, exc.message) from exc
    return _to_response(result, req)
