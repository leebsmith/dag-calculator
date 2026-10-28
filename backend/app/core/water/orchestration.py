"""Top-level orchestration: the sealed boundary function and its phases.

``solve_water_chemistry`` is the only entry point. Each numbered phase below is
a pure function over the previous phase's output; findings are emitted as
telemetry inside the phase that decides them, and ``warnings``/``notes`` are
projected from that one stream at the end.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.errors import SolverValidationError
from app.core.water.chemistry import (
    acid_volume_ml,
    alkaline_agent_mass_g,
    mash_ph_status,
    predict_mash_ph,
    residual_alkalinity,
    residual_alkalinity_for_target_ph,
    resolve_grist,
)
from app.core.water.constants import (
    CONTAMINANT_LIMITS,
    EPSOM_MG_WARN_PPM,
    HARD_MAGNESIUM_MAX_PPM,
    HARD_SULFATE_MAX_PPM,
    MASH_PH_CEIL,
    MASH_PH_FLOOR,
    MASH_PH_MODEL_MAX,
    MASH_PH_MODEL_MIN,
    MASH_PH_TARGET_TOLERANCE,
    RA_CA_COEFF,
    RA_MG_COEFF,
    RECOMMENDED_CALCIUM_MIN_PPM,
    SALT_COEFFS,
    SPARGE_ACID_PH,
)
from app.core.water.dosing import solve_salt_dose
from app.core.water.inputs import WaterChemistryInput
from app.core.water.salts import SaltDose, add_ions, ions_added_ppm
from app.core.water.telemetry import (
    TelemetryEvent,
    acid_dose_prescribed,
    alkaline_dose_prescribed,
    calcium_below_floor,
    calcium_floor_overridden,
    derive_findings,
    hlt_surplus,
    magnesium_toxicity_ceiling,
    mash_ph_optimal,
    mash_ph_out_of_bounds,
    minimal_mass_achieved,
    ph_model_out_of_range,
    salt_dissolution_limit,
    source_contaminant_detected,
    sparge_acid_prescribed,
    sulfate_harshness_ceiling,
    target_mash_ph_missed,
    target_mash_ph_unreachable,
)


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
    post_dose_mash_ions: dict
    residual_hlt_water_l: float
    grist_buckets_kg: dict
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    telemetry: list[dict[str, Any]] = field(default_factory=list)
    total_added_salt_mass_g: float = 0.0
    added_mineral_tds_ppm: float = 0.0


@dataclass(frozen=True)
class MashCorrection:
    """Stage-2 acid/alkaline prescription, before the corrected vector is known."""

    ph_stage1: float
    mash_acid_ml: float
    stage2_agent_g: float
    alk_correction_ppm: float
    dose_kind: str | None
    meq_total: float
    unreachable: dict[str, Any] | None


@dataclass(frozen=True)
class _DoseAllocation:
    mash_dose_g: dict[str, float]
    sparge_dose_g: dict[str, float]
    alkaline_agent_g: float
    total_added_salt_mass_g: float
    added_mineral_tds_ppm: float
    dose_rate_g_per_l: float


def _gate_inputs(inp: WaterChemistryInput, events: list[TelemetryEvent]) -> None:
    """Phase 1: reject impossible volumes and report source/floor overrides."""
    if inp.v_mash_treat_l <= 0.0:
        raise SolverValidationError("INVALID_MASH_VOLUME", "Mash volume must be positive.")
    if inp.v_sparge_demand_l < 0.0:
        raise SolverValidationError("INVALID_SPARGE_VOLUME", "Sparge volume cannot be negative.")

    # Check for raw source water contaminants
    for ion, limit in CONTAMINANT_LIMITS.items():
        val = inp.source.get(ion, 0.0)
        if val > limit:
            events.append(source_contaminant_detected(ion, val, limit))

    # Validate Calcium Floor user setting
    if inp.calcium_floor_ppm < RECOMMENDED_CALCIUM_MIN_PPM:
        events.append(calcium_floor_overridden(inp.calcium_floor_ppm))


def _stage1_ions(
    inp: WaterChemistryInput, dose: SaltDose
) -> tuple[dict[str, float], dict[str, float], dict[str, float], bool]:
    """Phase 4: post-salt mash and HLT vectors before the pH correction."""
    added = ions_added_ppm(
        dose, inp.gypsum_form, inp.cacl2_form, preferred_alkaline_agent=inp.preferred_alkaline_agent
    )
    post_salt = add_ions(inp.source, added)
    proportional = inp.salt_distribution.upper() == "PROPORTIONAL"
    post_hlt = add_ions(inp.source, added) if proportional else dict(inp.source)
    return added, post_salt, post_hlt, proportional


def _resolve_mash_correction(
    inp: WaterChemistryInput, grist_acidity: float, post_salt: dict[str, float]
) -> MashCorrection:
    """Phase 5: invert the pH model to a stage-2 acid or alkaline demand."""
    ra_stage1 = residual_alkalinity(post_salt["ca"], post_salt["mg"], post_salt.get("alk", 0.0))
    ph_stage1 = predict_mash_ph(
        grist_acidity, ra_stage1, inp.v_mash_treat_l, inp.mash_thickness_l_per_kg
    )
    mash_acid_ml = 0.0
    stage2_agent_g = 0.0
    alk_correction_ppm = 0.0
    dose_kind: str | None = None
    meq_total = 0.0
    unreachable: dict[str, Any] | None = None

    ra_target = residual_alkalinity_for_target_ph(
        grist_acidity,
        inp.target_mash_ph,
        inp.v_mash_treat_l,
        inp.mash_thickness_l_per_kg,
    )

    if ra_target is None:
        if inp.target_mash_ph <= MASH_PH_FLOOR:
            alk_correction_ppm = -post_salt.get("alk", 0.0)
            unreachable = {
                "reason": "below_model_floor",
                "mitigations": [
                    f"Choose a target above {MASH_PH_FLOOR:.1f}.",
                    "Increase grist acidity (acidulated or dark malt).",
                    "Lower the calcium/magnesium target.",
                ],
            }
        else:
            unreachable = {
                "reason": "above_model_ceiling",
                "mitigations": [
                    f"Choose a target below {MASH_PH_CEIL:.1f}.",
                    "Increase alkalinity or use a lower-acidity grist.",
                ],
            }
    else:
        alk_target = (
            ra_target + post_salt["ca"] * RA_CA_COEFF + post_salt["mg"] * RA_MG_COEFF
        )
        alk_correction_ppm = alk_target - post_salt.get("alk", 0.0)
        if alk_correction_ppm > 0.0:
            for _ in range(20):
                agent_g = alkaline_agent_mass_g(
                    alk_correction_ppm * inp.v_mash_treat_l / 50.0,
                    inp.preferred_alkaline_agent,
                )
                per_l = agent_g / inp.v_mash_treat_l
                agent_yields = SALT_COEFFS.get(inp.preferred_alkaline_agent, {})
                ca_dose = post_salt["ca"] + per_l * agent_yields.get("ca", 0.0)
                mg_dose = post_salt["mg"] + per_l * agent_yields.get("mg", 0.0)
                needed = ra_target + ca_dose * RA_CA_COEFF + mg_dose * RA_MG_COEFF
                next_correction = needed - post_salt.get("alk", 0.0)
                if abs(next_correction - alk_correction_ppm) <= 1e-9:
                    alk_correction_ppm = next_correction
                    break
                alk_correction_ppm = next_correction

    if alk_correction_ppm < 0.0:
        total_acid_meq = abs(alk_correction_ppm) * inp.v_mash_treat_l / 50.0
        mash_acid_ml = acid_volume_ml(total_acid_meq, inp.acid_medium, inp.target_mash_ph)
        dose_kind = "acid"
        meq_total = total_acid_meq
    elif alk_correction_ppm > 0.0:
        total_alk_meq = alk_correction_ppm * inp.v_mash_treat_l / 50.0
        stage2_agent_g = alkaline_agent_mass_g(total_alk_meq, inp.preferred_alkaline_agent)
        dose_kind = "alkaline"
        meq_total = total_alk_meq

    return MashCorrection(
        ph_stage1=ph_stage1,
        mash_acid_ml=mash_acid_ml,
        stage2_agent_g=stage2_agent_g,
        alk_correction_ppm=alk_correction_ppm,
        dose_kind=dose_kind,
        meq_total=meq_total,
        unreachable=unreachable,
    )


def _post_dose_ions(
    inp: WaterChemistryInput,
    grist_acidity: float,
    post_salt: dict[str, float],
    correction: MashCorrection,
) -> tuple[dict[str, float], float, str]:
    """Phase 6: the corrected mash vector and the predicted pH it produces."""
    post_dose = dict(post_salt)
    ph_alkalinity = post_salt.get("alk", 0.0) + correction.alk_correction_ppm
    post_dose["alk"] = max(0.0, ph_alkalinity)
    if correction.stage2_agent_g > 0.0:
        agent_yields = SALT_COEFFS.get(inp.preferred_alkaline_agent, {})
        per_l = correction.stage2_agent_g / inp.v_mash_treat_l
        post_dose["na"] = post_dose.get("na", 0.0) + per_l * agent_yields.get("na", 0.0)
        post_dose["ca"] = post_dose.get("ca", 0.0) + per_l * agent_yields.get("ca", 0.0)

    ra_dose = residual_alkalinity(post_dose["ca"], post_dose["mg"], ph_alkalinity)
    predicted_ph = predict_mash_ph(
        grist_acidity, ra_dose, inp.v_mash_treat_l, inp.mash_thickness_l_per_kg
    )
    return post_dose, predicted_ph, mash_ph_status(predicted_ph)


def _emit_mash_findings(
    inp: WaterChemistryInput,
    correction: MashCorrection,
    post_salt: dict[str, float],
    predicted_ph: float,
    status: str,
    events: list[TelemetryEvent],
) -> None:
    """Phase 6b: the dose, target and model-band findings for the corrected pH."""
    if correction.dose_kind == "acid":
        events.append(
            acid_dose_prescribed(
                correction.mash_acid_ml,
                inp.acid_medium,
                correction.meq_total,
                correction.ph_stage1,
                inp.target_mash_ph,
                predicted_ph,
            )
        )
    elif correction.dose_kind == "alkaline":
        events.append(
            alkaline_dose_prescribed(
                correction.stage2_agent_g,
                inp.preferred_alkaline_agent,
                correction.meq_total,
                correction.ph_stage1,
                inp.target_mash_ph,
                predicted_ph,
            )
        )

    if correction.unreachable is not None:
        events.append(
            target_mash_ph_unreachable(
                correction.unreachable["reason"],
                inp.target_mash_ph,
                predicted_ph,
                post_salt["ca"],
                post_salt["mg"],
                correction.unreachable["mitigations"],
            )
        )
    elif abs(predicted_ph - inp.target_mash_ph) > MASH_PH_TARGET_TOLERANCE:
        events.append(target_mash_ph_missed(inp.target_mash_ph, predicted_ph))

    if not (MASH_PH_MODEL_MIN <= predicted_ph <= MASH_PH_MODEL_MAX):
        events.append(ph_model_out_of_range(predicted_ph))

    if status == "OPTIMAL":
        events.append(mash_ph_optimal(predicted_ph))
    else:
        events.append(mash_ph_out_of_bounds(predicted_ph, status))


def _resolve_sparge_acid(
    inp: WaterChemistryInput, post_hlt: dict[str, float], events: list[TelemetryEvent]
) -> float:
    """Phase 7: acid demand that caps the sparge liquor at the target pH."""
    ra_hlt = residual_alkalinity(post_hlt["ca"], post_hlt["mg"], post_hlt.get("alk", 0.0))
    sparge_acid_ml = 0.0

    if inp.source.get("alk", 0.0) > 0.0 and ra_hlt > 0.0:
        sparge_meq_l = ra_hlt / 50.0
        sparge_acid_ml = acid_volume_ml(
            sparge_meq_l * inp.v_hlt_treat_l, inp.acid_medium, SPARGE_ACID_PH
        )
        events.append(
            sparge_acid_prescribed(
                sparge_acid_ml, inp.acid_medium, sparge_meq_l * inp.v_hlt_treat_l
            )
        )
    return sparge_acid_ml


def _dose_grams(dose: SaltDose, volume_l: float) -> dict[str, float]:
    return {
        "gypsum_g": dose.gypsum_g_per_l * volume_l,
        "cacl2_g": dose.cacl2_g_per_l * volume_l,
        "epsom_g": dose.epsom_g_per_l * volume_l,
        "nacl_g": dose.nacl_g_per_l * volume_l,
    }


def _resolve_allocations(
    inp: WaterChemistryInput,
    dose: SaltDose,
    correction: MashCorrection,
    proportional: bool,
) -> _DoseAllocation:
    """Phase 8: physical mash/sparge masses and the added-mineral footprint."""
    mash_dose = _dose_grams(dose, inp.v_mash_treat_l)
    sparge_dose = (
        _dose_grams(dose, inp.v_hlt_treat_l)
        if proportional
        else {"gypsum_g": 0.0, "cacl2_g": 0.0, "epsom_g": 0.0, "nacl_g": 0.0}
    )

    alkaline_agent_g = dose.alkaline_agent_g_per_l * inp.v_mash_treat_l + correction.stage2_agent_g

    flavor_per_l = (
        dose.gypsum_g_per_l + dose.cacl2_g_per_l + dose.epsom_g_per_l + dose.nacl_g_per_l
    )
    flavor_mass = flavor_per_l * inp.v_mash_treat_l + (
        flavor_per_l * inp.v_hlt_treat_l if proportional else 0.0
    )
    total_added_salt_mass_g = flavor_mass + alkaline_agent_g
    added_tds_ppm = total_added_salt_mass_g / inp.v_mash_treat_l * 1000.0
    dose_rate_g_per_l = flavor_per_l + dose.alkaline_agent_g_per_l

    return _DoseAllocation(
        mash_dose_g=mash_dose,
        sparge_dose_g=sparge_dose,
        alkaline_agent_g=alkaline_agent_g,
        total_added_salt_mass_g=total_added_salt_mass_g,
        added_mineral_tds_ppm=added_tds_ppm,
        dose_rate_g_per_l=dose_rate_g_per_l,
    )


def _emit_operational_findings(
    inp: WaterChemistryInput,
    added: dict[str, float],
    post_dose: dict[str, float],
    events: list[TelemetryEvent],
) -> float:
    """Phase 9: brewhouse diagnostics; returns the residual HLT liquor."""
    residual_hlt = max(0.0, inp.v_hlt_treat_l - inp.v_sparge_demand_l)
    if inp.v_hlt_treat_l - inp.v_hlt_debt_l - inp.v_sparge_demand_l > 0.0:
        surplus = inp.v_hlt_treat_l - inp.v_hlt_debt_l - inp.v_sparge_demand_l
        events.append(hlt_surplus(surplus))

    # Magnesium threshold check
    mg_added = added.get("mg", 0.0)
    mg_total = post_dose.get("mg", 0.0)
    if mg_added > EPSOM_MG_WARN_PPM or mg_total > HARD_MAGNESIUM_MAX_PPM:
        events.append(magnesium_toxicity_ceiling(mg_total, mg_added))

    # Sulfate threshold check
    so4_total = post_dose.get("so4", 0.0)
    if so4_total > HARD_SULFATE_MAX_PPM:
        events.append(sulfate_harshness_ceiling(so4_total))

    # Calcium floor audit
    if post_dose["ca"] < inp.calcium_floor_ppm - 1e-6:
        events.append(calcium_below_floor(post_dose["ca"], inp.calcium_floor_ppm))

    return residual_hlt


def solve_water_chemistry(inp: WaterChemistryInput) -> WaterChemistryOutput:
    """Execute complete ADSCO water chemistry formulation.

    Pure, deterministic boundary function matching the existing signature.
    """
    events: list[TelemetryEvent] = []

    # 1. Gatekeeping validation
    _gate_inputs(inp, events)

    # 2. Grist resolution
    grist_acidity, buckets = resolve_grist(inp.grist)

    # 3. Primary salt dosing optimization
    dose, _solve_notes, resolved_strat = solve_salt_dose(
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

    # 4. Stage-1 post-salt ions (flavor salts + stage-1 alkaline agent)
    added, post_salt, post_hlt, proportional = _stage1_ions(inp, dose)

    # 5. Stage-2 acid / alkaline correction to target_mash_ph
    correction = _resolve_mash_correction(inp, grist_acidity, post_salt)
    if (
        correction.dose_kind == "alkaline"
        and inp.preferred_alkaline_agent == "CHALK"
    ):
        events.append(salt_dissolution_limit())

    # 6. Post-dose ions and corrected mash pH
    post_dose, predicted_ph, status = _post_dose_ions(
        inp, grist_acidity, post_salt, correction
    )
    _emit_mash_findings(inp, correction, post_salt, predicted_ph, status, events)

    # 7. Sparge acid prescription
    sparge_acid_ml = _resolve_sparge_acid(inp, post_hlt, events)

    # 8. Physical mass allocations for mash and sparge liquor
    allocation = _resolve_allocations(inp, dose, correction, proportional)

    # 8b. Added mineral mass and TDS
    if resolved_strat != "OPTIMIZE":
        events.append(
            minimal_mass_achieved(
                allocation.total_added_salt_mass_g,
                allocation.dose_rate_g_per_l,
                allocation.added_mineral_tds_ppm,
            )
        )

    # 9. Brewhouse diagnostics and guardrail checks
    residual_hlt = _emit_operational_findings(inp, added, post_dose, events)

    warnings, notes = derive_findings(events)

    return WaterChemistryOutput(
        predicted_mash_ph=predicted_ph,
        mash_ph_status=status,
        strategy=resolved_strat,
        mash_dose_g=allocation.mash_dose_g,
        sparge_dose_g=allocation.sparge_dose_g,
        mash_acid_ml=correction.mash_acid_ml,
        sparge_acid_ml=sparge_acid_ml,
        alkaline_agent_g=allocation.alkaline_agent_g,
        post_salt_mash_ions=post_salt,
        post_dose_mash_ions=post_dose,
        residual_hlt_water_l=residual_hlt,
        grist_buckets_kg=buckets,
        warnings=warnings,
        notes=notes,
        telemetry=[ev.to_dict() for ev in events],
        total_added_salt_mass_g=allocation.total_added_salt_mass_g,
        added_mineral_tds_ppm=allocation.added_mineral_tds_ppm,
    )
