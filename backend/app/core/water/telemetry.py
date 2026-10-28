"""The telemetry stream, one factory per finding code.

Every user-facing finding is a ``TelemetryEvent``; ``warnings`` and ``notes`` on
the boundary response are projections of that single stream rather than a second
wording of the same fact (``derive_findings``). Adding a finding is one factory
edit plus its entry in ``TELEMETRY_CODES``.

Factories take measurements; the thresholds and policy wording live here so a
message cannot drift from the guardrail it reports.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

from app.core.water.constants import (
    EPSOM_MG_WARN_PPM,
    HARD_MAGNESIUM_MAX_PPM,
    HARD_SULFATE_MAX_PPM,
    MASH_PH_CEIL,
    MASH_PH_FLOOR,
    MASH_PH_MODEL_MAX,
    MASH_PH_MODEL_MIN,
    MASH_PH_OPTIMAL_HIGH,
    MASH_PH_OPTIMAL_LOW,
    MASH_PH_TARGET_TOLERANCE,
    RECOMMENDED_CALCIUM_MIN_PPM,
    SPARGE_ACID_PH,
)

ROUTER = "ROUTER"
GUARDRAIL = "GUARDRAIL"
OPTIMIZATION = "OPTIMIZATION"
ENZYMATIC = "ENZYMATIC"
OPERATIONAL = "OPERATIONAL"
VALIDATION = "VALIDATION"

INFO = "INFO"
NOTE = "NOTE"
WARNING = "WARNING"
ERROR = "ERROR"

IONS = ("ca", "mg", "na", "so4", "cl", "alk")


@dataclass(frozen=True)
class TelemetryEvent:
    """Structured decision and telemetry message matching the ADSCO telemetry contract."""

    code: str
    category: str
    severity: str
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


def _event(
    code: str, category: str, severity: str, message: str, **context: Any
) -> TelemetryEvent:
    return TelemetryEvent(
        code=code, category=category, severity=severity, message=message, context=context
    )


# ---------------------------------------------------------------------------
# Routing (ROUTER)
# ---------------------------------------------------------------------------


def router_mode_1_linear_flavor() -> TelemetryEvent:
    return _event(
        "ROUTER_MODE_1_LINEAR_FLAVOR",
        ROUTER,
        INFO,
        "Routed to Linear Minimalist Engine (Mode 1: Flavor Balance). Objective: "
        "Minimizing total added salt mass to satisfy flavor equalities while "
        "enforcing background biological guardrails.",
    )


def router_mode_2_hybrid_buffer(agent: str) -> TelemetryEvent:
    return _event(
        "ROUTER_MODE_2_HYBRID_BUFFER",
        ROUTER,
        INFO,
        "Routed to Hybrid Optimization Engine (Mode 2: Ratio + Buffer). Objective: "
        "Minimizing flavor salts via Linear Programming while allocating structural "
        f"alkalinity via {agent} and secondary acid neutralization.",
    )


def router_mode_3_nonlinear_clone() -> TelemetryEvent:
    return _event(
        "ROUTER_MODE_3_NONLINEAR_CLONE",
        ROUTER,
        INFO,
        "Routed to Non-Linear Cloner Engine (Mode 3: Profile Clone). Objective: "
        "Minimizing weighted sum of squared errors (SSE) across all 6 ions "
        "simultaneously.",
    )


def router_mode_4_baseline_only() -> TelemetryEvent:
    return _event(
        "ROUTER_MODE_4_BASELINE_ONLY",
        ROUTER,
        INFO,
        "Routed to Baseline Water Correction Engine (Mode 4: Null Targets). Mineral "
        "salt dosing bypassed (0.0 g). Solving strictly for grist residual alkalinity, "
        "mash pH, and sparge acidification.",
    )


def router_mode_5_custom_sparse(pinned_ions: Sequence[str]) -> TelemetryEvent:
    floating = [ion for ion in IONS if ion not in pinned_ions]
    return _event(
        "ROUTER_MODE_5_CUSTOM_SPARSE",
        ROUTER,
        INFO,
        "Routed to Dynamic Sparse Linear Engine (Mode 5: Custom Permutation). "
        f"Pinned targets: {list(pinned_ions)}; floating unconstrained: {floating}.",
    )


def router_auto_best_fit() -> TelemetryEvent:
    return _event(
        "ROUTER_AUTO_BEST_FIT",
        ROUTER,
        NOTE,
        "Strategy AUTO could not classify the target vector; routed to the Non-Linear "
        "Cloner (Mode 3: best fit across all six ions, nothing held exactly).",
    )


# ---------------------------------------------------------------------------
# Guardrails (GUARDRAIL)
# ---------------------------------------------------------------------------


def flavor_target_below_source(ion: str, target_ppm: float, source_ppm: float) -> TelemetryEvent:
    return _event(
        "FLAVOR_TARGET_BELOW_SOURCE",
        GUARDRAIL,
        WARNING,
        f"{ion.upper()} target is {target_ppm:.1f} ppm but the source already carries "
        f"{source_ppm:.1f} ppm; salts only add, so the kettle will stay above the target.",
        ion=ion,
        target=target_ppm,
        source=source_ppm,
    )


def pinned_target_below_source(ion: str, target_ppm: float, source_ppm: float) -> TelemetryEvent:
    return _event(
        "PINNED_TARGET_BELOW_SOURCE",
        GUARDRAIL,
        WARNING,
        f"{ion.upper()} is pinned at {target_ppm:.1f} ppm but the source already carries "
        f"{source_ppm:.1f} ppm; salts only add, so that pin cannot be reached - unpin it "
        "to free the other targets.",
        ion=ion,
        target=target_ppm,
        source=source_ppm,
    )


def calcium_floor_unreachable(actual: float, floor: float) -> TelemetryEvent:
    return _event(
        "GUARDRAIL_CALCIUM_FLOOR_UNREACHABLE",
        GUARDRAIL,
        WARNING,
        "Calcium floor unreachable with pinned flavor targets: Resulting Ca2+ "
        f"({actual:.1f} ppm) is below the {floor:.1f} ppm floor. Flavor equalities took "
        "precedence.",
        actual=actual,
        floor=floor,
    )


def calcium_floor_overridden(floor: float) -> TelemetryEvent:
    return _event(
        "GUARDRAIL_CALCIUM_FLOOR_OVERRIDDEN",
        GUARDRAIL,
        WARNING,
        f"User overrode Minimum Calcium Floor to {floor:.1f} ppm (below recommended "
        f"{RECOMMENDED_CALCIUM_MIN_PPM:.0f} ppm baseline). Verify adequate yeast "
        "nutrients (zinc/amino acids) are added in the fermenter.",
        floor=floor,
        recommended_min=RECOMMENDED_CALCIUM_MIN_PPM,
    )


def calcium_below_floor(actual: float, floor: float) -> TelemetryEvent:
    return _event(
        "GUARDRAIL_CALCIUM_BELOW_FLOOR",
        GUARDRAIL,
        WARNING,
        f"Calcium {actual:.1f} ppm is below the {floor:.0f} ppm floor.",
        actual=actual,
        floor=floor,
    )


def source_contaminant_detected(ion: str, actual: float, limit: float) -> TelemetryEvent:
    return _event(
        "GUARDRAIL_SOURCE_CONTAMINANT_DETECTED",
        GUARDRAIL,
        WARNING,
        f"Source water contaminant threshold exceeded: {ion.upper()} is {actual:.2f} ppm "
        f"(recommended max: {limit:.2f} ppm). Dilution with Reverse Osmosis (RO) water is "
        "strongly advised.",
        ion=ion,
        actual=actual,
        limit=limit,
    )


def magnesium_toxicity_ceiling(actual_mg: float, added_mg: float) -> TelemetryEvent:
    return _event(
        "GUARDRAIL_MAGNESIUM_TOXICITY_CEILING",
        GUARDRAIL,
        WARNING,
        f"Magnesium ceiling breached: Total Mg2+ reached {actual_mg:.1f} ppm (caution "
        f"threshold: {EPSOM_MG_WARN_PPM:.0f} ppm, hard max: {HARD_MAGNESIUM_MAX_PPM:.0f} "
        "ppm). Risk of astringent bitterness or laxative defect.",
        actual_mg=actual_mg,
        added_mg=added_mg,
    )


def sulfate_harshness_ceiling(actual_so4: float) -> TelemetryEvent:
    return _event(
        "GUARDRAIL_SULFATE_HARSHNESS_CEILING",
        GUARDRAIL,
        WARNING,
        f"Sulfate harshness limit exceeded: Total SO4(2-) reached {actual_so4:.1f} ppm. "
        "Bitterness perception will likely turn dry, metallic, and astringent above "
        f"{HARD_SULFATE_MAX_PPM:.0f} ppm.",
        actual_so4=actual_so4,
        limit=HARD_SULFATE_MAX_PPM,
    )


def ph_model_out_of_range(predicted_ph: float) -> TelemetryEvent:
    return _event(
        "GUARDRAIL_PH_MODEL_OUT_OF_RANGE",
        GUARDRAIL,
        WARNING,
        f"Predicted mash pH ({predicted_ph:.2f}) is outside the model's calibrated band "
        f"({MASH_PH_MODEL_MIN:.1f} - {MASH_PH_MODEL_MAX:.1f}); treat it as indicative and "
        "re-check the target vector and alkalinity inputs.",
        predicted_ph=predicted_ph,
    )


# ---------------------------------------------------------------------------
# Optimization (OPTIMIZATION)
# ---------------------------------------------------------------------------


def lp_relaxation_applied() -> TelemetryEvent:
    return _event(
        "OPT_LP_RELAXATION_APPLIED",
        OPTIMIZATION,
        NOTE,
        "Calcium upper boundary relaxed: Primary solver could not satisfy flavor "
        "equalities without exceeding the calcium ceiling. Pinned SO4/Cl preserved.",
    )


def lp_lexicographic_tie_break() -> TelemetryEvent:
    return _event(
        "OPT_LP_LEXICOGRAPHIC_TIE_BREAK",
        OPTIMIZATION,
        INFO,
        "Lexicographic tie-break executed: Multi-pass LP resolved degenerate vertex by "
        "penalizing secondary counter-ions (preferring Gypsum/CaCl2 over Epsom/NaCl).",
    )


def clone_weighted_compromise(
    ca_error: float, alk_error: float, na_error: float
) -> TelemetryEvent:
    return _event(
        "OPT_CLONE_WEIGHTED_COMPROMISE",
        OPTIMIZATION,
        NOTE,
        "Profile compromise accepted: Prioritized enzymatic ions (Ca2+ error: "
        f"{ca_error:+.1f} ppm, Alk error: {alk_error:+.1f} ppm); accepted variance on "
        f"sensory counter-ions (Na+ error: {na_error:+.1f} ppm).",
        ca_error=ca_error,
        alk_error=alk_error,
        na_error=na_error,
    )


def clone_constraint_relaxed() -> TelemetryEvent:
    return _event(
        "OPT_CLONE_CONSTRAINT_RELAXED",
        OPTIMIZATION,
        NOTE,
        "Profile cloner relaxed calcium floor to locate mathematical fit.",
    )


def sparse_equalities_only() -> TelemetryEvent:
    return _event(
        "OPT_SPARSE_EQUALITIES_ONLY",
        OPTIMIZATION,
        NOTE,
        "Sparse solve could not satisfy all constraints; solving equalities only.",
    )


def minimal_mass_achieved(
    total_mass_g: float, dose_rate_g_l: float, added_tds_ppm: float
) -> TelemetryEvent:
    return _event(
        "OPT_MINIMAL_MASS_ACHIEVED",
        OPTIMIZATION,
        INFO,
        f"Optimal mineral dose identified: Total added salt mass is {total_mass_g:.2f} g "
        f"({dose_rate_g_l:.2f} g/L). Added mineral contribution to TDS: "
        f"{added_tds_ppm:.1f} ppm.",
        total_mass_g=total_mass_g,
        dose_rate_g_l=dose_rate_g_l,
        added_tds_ppm=added_tds_ppm,
    )


# ---------------------------------------------------------------------------
# Enzymatic (ENZYMATIC)
# ---------------------------------------------------------------------------


def acid_dose_prescribed(
    volume_ml: float,
    acid_medium: str,
    meq_total: float,
    ph_start: float,
    ph_target: float,
    ph_after: float,
) -> TelemetryEvent:
    return _event(
        "ENZYMATIC_ACID_DOSE_PRESCRIBED",
        ENZYMATIC,
        INFO,
        f"Mash acidification prescribed: {volume_ml:.2f} mL of {acid_medium} "
        f"({meq_total:.1f} mEq) required to shift mash from pH {ph_start:.2f} toward "
        f"target pH {ph_target:.2f}; model predicts pH {ph_after:.2f} after dosing.",
        volume_ml=volume_ml,
        acid_medium=acid_medium,
        meq_total=meq_total,
        ph_start=ph_start,
        ph_target=ph_target,
        ph_after=ph_after,
    )


def alkaline_dose_prescribed(
    mass_g: float,
    agent: str,
    meq_total: float,
    ph_start: float,
    ph_target: float,
    ph_after: float,
) -> TelemetryEvent:
    return _event(
        "ENZYMATIC_ALKALINE_DOSE_PRESCRIBED",
        ENZYMATIC,
        INFO,
        f"Mash buffering prescribed: {mass_g:.2f} g of {agent} ({meq_total:.1f} mEq) "
        f"required to raise mash pH from {ph_start:.2f} toward target pH {ph_target:.2f}; "
        f"model predicts pH {ph_after:.2f} after dosing.",
        mass_g=mass_g,
        agent=agent,
        meq_total=meq_total,
        ph_start=ph_start,
        ph_target=ph_target,
        ph_after=ph_after,
    )


def sparge_acid_prescribed(volume_ml: float, acid_medium: str, meq_total: float) -> TelemetryEvent:
    return _event(
        "ENZYMATIC_SPARGE_ACID_PRESCRIBED",
        ENZYMATIC,
        INFO,
        f"Sparge acidification prescribed: {volume_ml:.2f} mL of {acid_medium} "
        f"({meq_total:.1f} mEq) required to neutralize sparge alkalinity and cap pH at "
        f"{SPARGE_ACID_PH:.2f}.",
        volume_ml=volume_ml,
        target_ph=SPARGE_ACID_PH,
    )


def mash_ph_optimal(predicted_ph: float) -> TelemetryEvent:
    return _event(
        "ENZYMATIC_MASH_PH_OPTIMAL",
        ENZYMATIC,
        INFO,
        f"Predicted mash pH ({predicted_ph:.2f}) is within the optimal enzymatic window "
        f"({MASH_PH_OPTIMAL_LOW:.2f} - {MASH_PH_OPTIMAL_HIGH:.2f}). Optimal "
        "alpha/beta-amylase activity projected.",
        predicted_ph=predicted_ph,
    )


def mash_ph_out_of_bounds(predicted_ph: float, status: str) -> TelemetryEvent:
    return _event(
        "ENZYMATIC_MASH_PH_OUT_OF_BOUNDS",
        ENZYMATIC,
        WARNING,
        f"Predicted mash pH ({predicted_ph:.2f}) is {status} (optimal: "
        f"{MASH_PH_OPTIMAL_LOW:.2f} - {MASH_PH_OPTIMAL_HIGH:.2f}). Acid or alkaline "
        "correction prescribed.",
        predicted_ph=predicted_ph,
        status=status,
    )


def target_mash_ph_unreachable(
    reason: str,
    target_ph: float,
    predicted_ph: float,
    ca_ppm: float,
    mg_ppm: float,
    mitigations: Sequence[str],
) -> TelemetryEvent:
    if reason == "below_model_floor":
        message = (
            f"Mash pH target {target_ph:.2f} is at or below the model floor "
            f"({MASH_PH_FLOOR:.1f}); the model saturates there. The current correction "
            f"neutralises all available alkalinity and predicts pH {predicted_ph:.2f}. "
            f"Mitigations: choose a target above {MASH_PH_FLOOR:.1f}, increase grist "
            "acidity, or lower the Ca/Mg target."
        )
    else:
        message = (
            f"Mash pH target {target_ph:.2f} is above the model ceiling "
            f"({MASH_PH_CEIL:.1f}); the model saturates there. The current vector predicts "
            f"pH {predicted_ph:.2f} with no correction. Mitigations: choose a target below "
            f"{MASH_PH_CEIL:.1f}, or increase alkalinity/use a lower-acidity grist."
        )
    return _event(
        "TARGET_MASH_PH_UNREACHABLE",
        ENZYMATIC,
        WARNING,
        message,
        reason=reason,
        target_ph=target_ph,
        predicted_ph=predicted_ph,
        model_floor=MASH_PH_FLOOR,
        model_ceiling=MASH_PH_CEIL,
        ca_ppm=ca_ppm,
        mg_ppm=mg_ppm,
        mitigations=list(mitigations),
    )


def target_mash_ph_missed(target_ph: float, achieved_ph: float) -> TelemetryEvent:
    return _event(
        "TARGET_MASH_PH_MISSED",
        ENZYMATIC,
        WARNING,
        f"Dose inversion missed the mash pH target (target {target_ph:.2f}, achieved "
        f"{achieved_ph:.2f}). This is a solver defect; report the batch inputs.",
        target_ph=target_ph,
        achieved_ph=achieved_ph,
        tolerance=MASH_PH_TARGET_TOLERANCE,
    )


# ---------------------------------------------------------------------------
# Operational (OPERATIONAL)
# ---------------------------------------------------------------------------


def salt_dissolution_limit() -> TelemetryEvent:
    return _event(
        "OPERATIONAL_SALT_DISSOLUTION_LIMIT",
        OPERATIONAL,
        WARNING,
        "Low salt solubility: Chalk (CaCO3) has extremely low solubility at room "
        "temperature. Ensure chalk is added directly to the mash tun with grains, or "
        "substitute Baking Soda/Pickling Lime.",
    )


def hlt_surplus(surplus_l: float) -> TelemetryEvent:
    return _event(
        "OPERATIONAL_HLT_SURPLUS",
        OPERATIONAL,
        WARNING,
        f"HLT surplus detected: Treated liquor exceeds sparge demand by {surplus_l:.2f} L. "
        "Surplus minerals will be left behind in the HLT.",
        surplus_l=surplus_l,
    )


TELEMETRY_CODES: frozenset[str] = frozenset(
    {
        "ROUTER_MODE_1_LINEAR_FLAVOR",
        "ROUTER_MODE_2_HYBRID_BUFFER",
        "ROUTER_MODE_3_NONLINEAR_CLONE",
        "ROUTER_MODE_4_BASELINE_ONLY",
        "ROUTER_MODE_5_CUSTOM_SPARSE",
        "ROUTER_AUTO_BEST_FIT",
        "FLAVOR_TARGET_BELOW_SOURCE",
        "PINNED_TARGET_BELOW_SOURCE",
        "GUARDRAIL_CALCIUM_FLOOR_UNREACHABLE",
        "GUARDRAIL_CALCIUM_FLOOR_OVERRIDDEN",
        "GUARDRAIL_CALCIUM_BELOW_FLOOR",
        "GUARDRAIL_SOURCE_CONTAMINANT_DETECTED",
        "GUARDRAIL_MAGNESIUM_TOXICITY_CEILING",
        "GUARDRAIL_SULFATE_HARSHNESS_CEILING",
        "GUARDRAIL_PH_MODEL_OUT_OF_RANGE",
        "OPT_LP_RELAXATION_APPLIED",
        "OPT_LP_LEXICOGRAPHIC_TIE_BREAK",
        "OPT_CLONE_WEIGHTED_COMPROMISE",
        "OPT_CLONE_CONSTRAINT_RELAXED",
        "OPT_SPARSE_EQUALITIES_ONLY",
        "OPT_MINIMAL_MASS_ACHIEVED",
        "ENZYMATIC_ACID_DOSE_PRESCRIBED",
        "ENZYMATIC_ALKALINE_DOSE_PRESCRIBED",
        "ENZYMATIC_SPARGE_ACID_PRESCRIBED",
        "ENZYMATIC_MASH_PH_OPTIMAL",
        "ENZYMATIC_MASH_PH_OUT_OF_BOUNDS",
        "TARGET_MASH_PH_UNREACHABLE",
        "TARGET_MASH_PH_MISSED",
        "OPERATIONAL_SALT_DISSOLUTION_LIMIT",
        "OPERATIONAL_HLT_SURPLUS",
    }
)
"""Every code a factory can emit. The findings channel speaks only this vocabulary."""


def derive_findings(events: Iterable[TelemetryEvent]) -> tuple[list[str], list[str]]:
    """Project ``warnings`` and ``notes`` from the one telemetry stream.

    Warnings are the ``WARNING`` events; notes are the informational optimization
    and guardrail events. Order and deduplication mirror the event stream, so a
    fact appears once per channel.
    """
    warnings: list[str] = []
    notes: list[str] = []
    for event in events:
        if event.severity == WARNING:
            if event.message not in warnings:
                warnings.append(event.message)
        elif event.severity in {NOTE, INFO} and event.category in {OPTIMIZATION, GUARDRAIL}:
            if event.message not in notes:
                notes.append(event.message)
    return warnings, notes
