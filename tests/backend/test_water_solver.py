"""Offline tests for the sealed water-chemistry solver and its service adapter."""

from __future__ import annotations

import re

import pytest
from conftest import make_water_request

from app.core.errors import SolverValidationError
from app.core.water.chemistry import (
    acid_volume_ml,
    alkaline_agent_mass_g,
    predict_mash_ph,
    resolve_grist,
)
from app.core.water.dosing import solve_salt_dose
from app.core.water.inputs import GrainEntry, WaterChemistryInput
from app.core.water.orchestration import solve_water_chemistry
from app.core.water.salts import _salt_ion_coeffs, ions_added_ppm
from app.schemas.boundary import (
    IonProfile,
    MashPhStatus,
    SaltDistribution,
    WaterSolverErrorCode,
    WaterStrategy,
)
from app.services import SolverServiceError, solve_water_request

_SOURCE = {"ca": 10.0, "mg": 2.0, "na": 8.0, "so4": 5.0, "cl": 7.0, "alk": 40.0}
_TARGET = {"ca": 80.0, "mg": 5.0, "na": 20.0, "so4": 100.0, "cl": 50.0, "alk": 0.0}


# ---------------------------------------------------------------------------
# Error taxonomy (core)
# ---------------------------------------------------------------------------


def test_unknown_grain_type():
    with pytest.raises(SolverValidationError) as exc:
        resolve_grist([GrainEntry(mass_kg=5.0, color_lovibond=3.0, grain_type="BOGUS")])
    assert exc.value.code == "UNKNOWN_GRAIN_TYPE"


def test_invalid_mash_volume():
    with pytest.raises(SolverValidationError) as exc:
        predict_mash_ph(0.0, 0.0, 0.0, 3.0)
    assert exc.value.code == "INVALID_MASH_VOLUME"


def test_unknown_acid():
    with pytest.raises(SolverValidationError) as exc:
        acid_volume_ml(1.0, "BOGUS", 5.2)
    assert exc.value.code == "UNKNOWN_ACID_MEDIUM"


def test_unknown_alkaline_agent():
    with pytest.raises(SolverValidationError) as exc:
        alkaline_agent_mass_g(1.0, "BOGUS")
    assert exc.value.code == "UNKNOWN_ALKALINE_AGENT"


def test_unknown_salt_form():
    with pytest.raises(SolverValidationError) as exc:
        _salt_ion_coeffs("BOGUS", "CACL2_DIHYDRATE")
    assert exc.value.code == "UNKNOWN_SALT_FORM"


def test_optimize_returns_a_clone_dose():
    dose, _notes, strat = solve_salt_dose(
        "OPTIMIZE", _SOURCE, _TARGET, "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE", 50.0
    )
    assert strat == "OPTIMIZE"
    assert dose.gypsum_g_per_l >= 0.0


def test_unknown_strategy():
    with pytest.raises(SolverValidationError) as exc:
        solve_salt_dose("BOGUS", _SOURCE, _TARGET, "GYPSUM_DIHYDRATE",
                        "CACL2_DIHYDRATE", 50.0)
    assert exc.value.code == "UNKNOWN_STRATEGY"


# ---------------------------------------------------------------------------
# Feasibility surface (positive cases)
# ---------------------------------------------------------------------------


def test_solve_water_flavor_end_to_end():
    resp = solve_water_request(make_water_request())
    assert resp.prescription.predicted_mash_ph > 0.0
    assert resp.prescription.mash_ph_status in MashPhStatus
    assert resp.mash_additions.gypsum_kg >= 0.0
    assert resp.mash_additions.cacl2_kg >= 0.0
    assert resp.mash_additions.acid_l >= 0.0
    ions = resp.post_dose_mash_ions
    for field in ("calcium_ca", "magnesium_mg", "sodium_na",
                  "sulfate_so4", "chloride_cl", "alkalinity_as_caco3"):
        assert getattr(ions, field) >= 0.0


def test_solve_water_calcium_floor_end_to_end():
    resp = solve_water_request(
        make_water_request(strategy=WaterStrategy.CALCIUM_FLOOR)
    )
    assert resp.prescription.predicted_mash_ph > 0.0


def test_six_pins_route_to_best_fit():
    req = make_water_request(
        strategy=WaterStrategy.OPTIMIZE,
        custom_pinned_ions=["ca", "mg", "na", "so4", "cl", "alk"],
    )
    resp = solve_water_request(req)
    assert resp.strategy is WaterStrategy.OPTIMIZE


def test_uncorrected_mash_ph_is_reported():
    resp = solve_water_request(make_water_request())
    assert resp.mash_additions.acid_l > 0.0
    assert resp.prescription.uncorrected_mash_ph > resp.prescription.predicted_mash_ph


def test_baseline_does_not_grade_the_calcium_floor():
    req = make_water_request(
        source=IonProfile(
            calcium_ca=10.0,
            magnesium_mg=2.0,
            sodium_na=8.0,
            sulfate_so4=5.0,
            chloride_cl=7.0,
            alkalinity_as_caco3=40.0,
        ),
        strategy=WaterStrategy.BASELINE,
        custom_pinned_ions=[],
    )
    resp = solve_water_request(req)
    codes = {event["code"] for event in resp.telemetry}
    assert "GUARDRAIL_CALCIUM_BELOW_FLOOR" not in codes
    assert "GUARDRAIL_CALCIUM_FLOOR_UNREACHABLE" not in codes


def test_calcium_shortfall_is_reported_once():
    req = make_water_request(
        target=IonProfile(
            calcium_ca=0.0,
            magnesium_mg=0.0,
            sodium_na=0.0,
            sulfate_so4=20.0,
            chloride_cl=10.0,
            alkalinity_as_caco3=0.0,
        ),
        strategy=WaterStrategy.CALCIUM_FLOOR,
        custom_pinned_ions=["so4", "cl"],
        calcium_floor_ppm=50.0,
    )
    resp = solve_water_request(req)
    floor = [
        event
        for event in resp.telemetry
        if event["code"]
        in ("GUARDRAIL_CALCIUM_FLOOR_UNREACHABLE", "GUARDRAIL_CALCIUM_BELOW_FLOOR")
    ]
    assert len(floor) == 1
    assert floor[0]["code"] == "GUARDRAIL_CALCIUM_FLOOR_UNREACHABLE"


def test_custom_pin_reports_one_floor_finding():
    req = make_water_request(
        target=IonProfile(
            calcium_ca=0.0,
            magnesium_mg=0.0,
            sodium_na=20.0,
            sulfate_so4=50.0,
            chloride_cl=120.0,
            alkalinity_as_caco3=0.0,
        ),
        strategy=WaterStrategy.CUSTOM,
        custom_pinned_ions=["so4", "cl", "na"],
        calcium_floor_ppm=200.0,
    )
    resp = solve_water_request(req)
    floor = [
        event
        for event in resp.telemetry
        if event["code"] == "GUARDRAIL_CALCIUM_BELOW_FLOOR"
    ]
    assert len(floor) == 1


def test_high_sodium_is_reported():
    # Table salt and baking soda can push sodium past the published maximum; it
    # is a taste convention, so it warns and never clamps the dose.
    req = make_water_request(
        target=IonProfile(
            calcium_ca=0.0,
            magnesium_mg=0.0,
            sodium_na=150.0,
            sulfate_so4=0.0,
            chloride_cl=0.0,
            alkalinity_as_caco3=0.0,
        ),
        strategy=WaterStrategy.CUSTOM,
        custom_pinned_ions=["na"],
    )
    resp = solve_water_request(req)
    sodium = [
        event
        for event in resp.telemetry
        if event["code"] == "GUARDRAIL_SODIUM_ABOVE_RECOMMENDED"
    ]
    assert len(sodium) == 1
    assert sodium[0]["severity"] == "WARNING"
    assert resp.post_dose_mash_ions.sodium_na >= 150.0 - 1e-6


def test_typical_sodium_is_not_reported():
    resp = solve_water_request(make_water_request())
    codes = {event["code"] for event in resp.telemetry}
    assert "GUARDRAIL_SODIUM_ABOVE_RECOMMENDED" not in codes


def test_high_chloride_is_reported():
    req = make_water_request(
        target=IonProfile(
            calcium_ca=0.0,
            magnesium_mg=0.0,
            sodium_na=0.0,
            sulfate_so4=0.0,
            chloride_cl=350.0,
            alkalinity_as_caco3=0.0,
        ),
        strategy=WaterStrategy.CUSTOM,
        custom_pinned_ions=["cl"],
    )
    resp = solve_water_request(req)
    chloride = [
        event
        for event in resp.telemetry
        if event["code"] == "GUARDRAIL_CHLORIDE_ABOVE_RECOMMENDED"
    ]
    assert len(chloride) == 1
    assert chloride[0]["severity"] == "WARNING"
    assert resp.post_dose_mash_ions.chloride_cl >= 350.0 - 1e-6


def test_typical_chloride_is_not_reported():
    resp = solve_water_request(make_water_request())
    codes = {event["code"] for event in resp.telemetry}
    assert "GUARDRAIL_CHLORIDE_ABOVE_RECOMMENDED" not in codes


def test_a_failed_solve_carries_the_messages_before_it():
    req = make_water_request(
        source=IonProfile(
            calcium_ca=21.5,
            magnesium_mg=5.0,
            sodium_na=10.0,
            sulfate_so4=60.0,
            chloride_cl=3.0,
            alkalinity_as_caco3=78.0,
        ),
        target=IonProfile(
            calcium_ca=0.0,
            magnesium_mg=0.0,
            sodium_na=0.0,
            sulfate_so4=50.0,
            chloride_cl=120.0,
            alkalinity_as_caco3=0.0,
        ),
        strategy=WaterStrategy.CUSTOM,
        custom_pinned_ions=["so4"],
        calcium_floor_ppm=20.0,
    )
    with pytest.raises(SolverServiceError) as exc:
        solve_water_request(req)
    messages = exc.value.details["messages"]
    codes = [message["code"] for message in messages]
    assert codes[-1] == "ION_TARGET_BELOW_SOURCE"
    assert messages[-1]["severity"] == "ERROR"
    assert "GUARDRAIL_CALCIUM_FLOOR_OVERRIDDEN" in codes


def test_below_source_pin_is_rejected():
    req = make_water_request(
        source=IonProfile(
            calcium_ca=21.5,
            magnesium_mg=5.0,
            sodium_na=10.0,
            sulfate_so4=60.0,
            chloride_cl=3.0,
            alkalinity_as_caco3=78.0,
        ),
        target=IonProfile(
            calcium_ca=0.0,
            magnesium_mg=0.0,
            sodium_na=0.0,
            sulfate_so4=50.0,
            chloride_cl=120.0,
            alkalinity_as_caco3=0.0,
        ),
        strategy=WaterStrategy.CUSTOM,
        custom_pinned_ions=["so4"],
    )
    with pytest.raises(SolverServiceError) as exc:
        solve_water_request(req)
    assert exc.value.code == "ION_TARGET_BELOW_SOURCE"


def test_pinned_calcium_above_the_ceiling_names_the_maximum():
    req = make_water_request(
        target=IonProfile(
            calcium_ca=200.0,
            magnesium_mg=0.0,
            sodium_na=0.0,
            sulfate_so4=50.0,
            chloride_cl=120.0,
            alkalinity_as_caco3=80.0,
        ),
        strategy=WaterStrategy.CUSTOM,
        custom_pinned_ions=["ca", "so4", "cl", "alk"],
    )
    with pytest.raises(SolverServiceError) as exc:
        solve_water_request(req)
    assert exc.value.code == "SALT_SOLVE_FAILED"
    message = str(exc.value)
    match = re.search(r"reach is ([\d.]+) ppm", message)
    assert match, message
    assert float(match.group(1)) < 200.0


def test_mash_only_zeroes_sparge_salts_but_keeps_acid():
    req = make_water_request(salt_distribution=SaltDistribution.MASH_ONLY)
    resp = solve_water_request(req)
    assert resp.sparge_additions.gypsum_kg == 0.0
    assert resp.sparge_additions.cacl2_kg == 0.0
    assert resp.sparge_additions.epsom_kg == 0.0
    assert resp.sparge_additions.nacl_kg == 0.0
    assert resp.sparge_additions.acid_l > 0.0


def test_proportional_doses_the_hlt():
    req = make_water_request(salt_distribution=SaltDistribution.PROPORTIONAL)
    resp = solve_water_request(req)
    assert resp.sparge_additions.gypsum_kg > 0.0


def test_salt_form_normalization():
    # Schema default "dihydrate" must map to core "GYPSUM_DIHYDRATE".
    resp = solve_water_request(make_water_request())
    assert resp.mash_additions.gypsum_kg > 0.0


def test_service_unknown_salt_form():
    with pytest.raises(SolverServiceError) as exc:
        solve_water_request(make_water_request(gypsum_form="bogus"))
    assert exc.value.code == "UNKNOWN_SALT_FORM"


def test_service_unknown_grain_type():
    req = make_water_request()
    req = req.model_copy(update={"grist": [
        req.grist[0].model_copy(update={"grain_type": "BOGUS"})
    ]})
    with pytest.raises(SolverServiceError) as exc:
        solve_water_request(req)
    assert exc.value.code == "UNKNOWN_GRAIN_TYPE"


# ---------------------------------------------------------------------------
# Error surface completeness
# ---------------------------------------------------------------------------


def test_error_surface_complete():
    declared = {c.value for c in WaterSolverErrorCode}
    expected = {
        "INVALID_MASH_VOLUME", "INVALID_SPARGE_VOLUME", "UNKNOWN_GRAIN_TYPE",
        "UNKNOWN_ACID_MEDIUM", "UNKNOWN_ALKALINE_AGENT", "UNKNOWN_SALT_FORM",
        "SALT_SOLVE_FAILED", "UNKNOWN_STRATEGY",
        "PINNED_IONS_REQUIRED", "ION_TARGET_BELOW_SOURCE",
    }
    assert declared == expected


def test_dose_telemetry_reports_the_corrected_predicted_ph():
    resp = solve_water_request(make_water_request())
    dose_events = [
        event
        for event in resp.telemetry
        if event["code"] in {"ENZYMATIC_ACID_DOSE_PRESCRIBED", "ENZYMATIC_ALKALINE_DOSE_PRESCRIBED"}
    ]
    assert dose_events, "expected a prescribed dose for the default fixture"
    for event in dose_events:
        assert "model predicts pH" in event["message"]
        assert event["context"]["ph_after"] == pytest.approx(
            resp.prescription.predicted_mash_ph
        )


def test_feasible_targets_are_hit_after_dosing():
    for target in (5.2, 5.35, 5.4, 5.5, 5.6, 5.8):
        resp = solve_water_request(make_water_request(target_mash_ph=target))
        assert resp.prescription.predicted_mash_ph == pytest.approx(target, abs=0.01)
        codes = {event["code"] for event in resp.telemetry}
        assert "TARGET_MASH_PH_UNREACHABLE" not in codes
        assert "TARGET_MASH_PH_MISSED" not in codes

    # Excess acid is carried as a signed pH-model alkalinity; the reported ion
    # vector still floors at zero.
    resp = solve_water_request(make_water_request(target_mash_ph=5.35))
    assert resp.prescription.predicted_mash_ph == pytest.approx(5.35, abs=0.01)
    assert resp.post_dose_mash_ions.alkalinity_as_caco3 == 0.0


def test_alkaline_agent_ion_feedback_hits_the_target():
    resp = solve_water_request(
        make_water_request(target_mash_ph=5.8, preferred_alkaline_agent="CHALK")
    )
    assert resp.prescription.predicted_mash_ph == pytest.approx(5.8, abs=0.01)
    assert resp.mash_additions.chalk_kg > 0.0


def test_targets_outside_the_model_band_are_flagged():
    low = solve_water_request(make_water_request(target_mash_ph=4.0))
    low_event = next(
        event for event in low.telemetry if event["code"] == "TARGET_MASH_PH_UNREACHABLE"
    )
    assert low_event["context"]["reason"] == "below_model_floor"
    assert low_event["context"]["predicted_ph"] == pytest.approx(
        low.prescription.predicted_mash_ph
    )
    assert "Mitigations" in low_event["message"]

    high = solve_water_request(make_water_request(target_mash_ph=6.5))
    high_event = next(
        event for event in high.telemetry if event["code"] == "TARGET_MASH_PH_UNREACHABLE"
    )
    assert high_event["context"]["reason"] == "above_model_ceiling"
    assert high_event["context"]["predicted_ph"] == pytest.approx(
        high.prescription.predicted_mash_ph
    )
    assert high_event["context"]["model_ceiling"] == 6.0


# ---------------------------------------------------------------------------
# Lexicographic salt-dose hierarchy
# ---------------------------------------------------------------------------

_WARD = {"ca": 21.5, "mg": 5.0, "na": 3.3, "so4": 6.7, "cl": 3.3, "alk": 40.0}


def _post(dose):
    added = ions_added_ppm(dose, "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE")
    return {ion: _WARD.get(ion, 0.0) + added.get(ion, 0.0) for ion in _WARD}


def test_linear_route_prefers_gypsum_over_epsom():
    dose, _notes, _route = solve_salt_dose(
        "CALCIUM_FLOOR",
        _WARD,
        {"so4": 140.0, "cl": 70.0},
        "GYPSUM_DIHYDRATE",
        "CACL2_DIHYDRATE",
        50.0,
        150.0,
    )
    post = _post(dose)
    assert dose.gypsum_g_per_l > 0.0
    assert dose.epsom_g_per_l == 0.0
    assert post["so4"] == pytest.approx(140.0)
    assert post["cl"] == pytest.approx(70.0)
    assert post["mg"] == pytest.approx(_WARD["mg"])
    assert 110.0 < post["ca"] < 120.0


def test_the_calcium_ceiling_forces_epsom_back_in():
    dose, _notes, _route = solve_salt_dose(
        "CALCIUM_FLOOR",
        _WARD,
        {"so4": 400.0, "cl": 70.0},
        "GYPSUM_DIHYDRATE",
        "CACL2_DIHYDRATE",
        50.0,
        150.0,
    )
    post = _post(dose)
    assert dose.epsom_g_per_l > 0.0
    assert post["so4"] == pytest.approx(400.0)
    assert post["ca"] == pytest.approx(150.0, abs=1e-4)
    assert post["mg"] > _WARD["mg"]


def test_custom_pins_resolve_like_the_linear_route():
    custom, _notes, _route = solve_salt_dose(
        "CUSTOM",
        _WARD,
        {"so4": 140.0, "cl": 70.0},
        "GYPSUM_DIHYDRATE",
        "CACL2_DIHYDRATE",
        50.0,
        150.0,
        custom_pinned_ions=["so4", "cl"],
    )
    linear, _notes, _route = solve_salt_dose(
        "CALCIUM_FLOOR",
        _WARD,
        {"so4": 140.0, "cl": 70.0},
        "GYPSUM_DIHYDRATE",
        "CACL2_DIHYDRATE",
        50.0,
        150.0,
    )
    assert custom == linear
    assert custom.epsom_g_per_l == 0.0


def test_an_inverted_band_collapses_to_the_floor():
    out = solve_water_chemistry(
        WaterChemistryInput(
            grist=[GrainEntry(5.0, 3.0, "BASE")],
            source=_WARD,
            target={"so4": 140.0, "cl": 70.0},
            v_mash_treat_l=23.85,
            v_hlt_treat_l=0.0,
            v_hlt_debt_l=0.0,
            v_sparge_demand_l=0.0,
            mash_thickness_l_per_kg=2.6,
            target_mash_ph=5.4,
            strategy="CALCIUM_FLOOR",
            calcium_floor_ppm=120.0,
            calcium_ceiling_ppm=80.0,
        )
    )
    codes = {event["code"] for event in out.telemetry}
    assert "GUARDRAIL_CALCIUM_BAND_OVERRIDDEN" in codes
    assert "OPT_LP_RELAXATION_APPLIED" not in codes


def test_a_source_above_the_ceiling_is_reported_and_uses_epsom():
    source = {**_WARD, "ca": 180.0}
    out = solve_water_chemistry(
        WaterChemistryInput(
            grist=[GrainEntry(5.0, 3.0, "BASE")],
            source=source,
            target={"so4": 140.0, "cl": 70.0},
            v_mash_treat_l=23.85,
            v_hlt_treat_l=0.0,
            v_hlt_debt_l=0.0,
            v_sparge_demand_l=0.0,
            mash_thickness_l_per_kg=2.6,
            target_mash_ph=5.4,
            strategy="CALCIUM_FLOOR",
        )
    )
    codes = {event["code"] for event in out.telemetry}
    assert "GUARDRAIL_CALCIUM_ABOVE_CEILING" in codes
    assert out.post_dose_mash_ions["mg"] > source["mg"]


@pytest.mark.parametrize(("magnesium", "warns"), [(25.0, False), (35.0, True)])
def test_magnesium_warns_above_the_recommended_band(magnesium, warns):
    response = solve_water_request(
        make_water_request(
            strategy=WaterStrategy.BASELINE,
            source=IonProfile(
                calcium_ca=90.0,
                magnesium_mg=magnesium,
                sodium_na=30.0,
                sulfate_so4=40.0,
                chloride_cl=30.0,
                alkalinity_as_caco3=150.0,
            ),
            target=IonProfile(
                calcium_ca=0.0,
                magnesium_mg=0.0,
                sodium_na=0.0,
                sulfate_so4=0.0,
                chloride_cl=0.0,
                alkalinity_as_caco3=0.0,
            ),
        )
    )
    codes = {event["code"] for event in response.telemetry}
    assert ("GUARDRAIL_MAGNESIUM_TOXICITY_CEILING" in codes) is warns


# ---------------------------------------------------------------------------
# Sparge acidification
# ---------------------------------------------------------------------------

_REPORT_SOURCE = {"ca": 21.5, "mg": 5.0, "na": 10.0, "so4": 9.0, "cl": 3.0, "alk": 78.0}

_LACTATE_BATCH = {
    "grist": [GrainEntry(5.0, 3.0, "BASE")],
    "target": {"so4": 140.0, "cl": 70.0},
    "v_mash_treat_l": 23.85,
    "v_hlt_treat_l": 41.64,
    "v_hlt_debt_l": 2.27,
    "v_sparge_demand_l": 17.4,
    "mash_thickness_l_per_kg": 2.6,
    "target_mash_ph": 5.4,
    "strategy": "CALCIUM_FLOOR",
}


def test_no_sparge_acid_is_explained_when_the_salts_offset_the_alkalinity():
    out = solve_water_chemistry(
        WaterChemistryInput(source=dict(_REPORT_SOURCE), **_LACTATE_BATCH)
    )
    assert out.sparge_acid_ml == 0.0
    event = next(
        item
        for item in out.telemetry
        if item["code"] == "ENZYMATIC_SPARGE_ACID_NOT_REQUIRED"
    )
    assert event["context"]["residual_alkalinity_ppm"] == pytest.approx(-6.3, abs=0.5)
    assert event["context"]["source_alkalinity_ppm"] == pytest.approx(78.0)


def test_a_high_alkalinity_source_still_prescribes_sparge_acid():
    out = solve_water_chemistry(
        WaterChemistryInput(source={**_REPORT_SOURCE, "alk": 200.0}, **_LACTATE_BATCH)
    )
    assert out.sparge_acid_ml > 0.0
    codes = {item["code"] for item in out.telemetry}
    assert "ENZYMATIC_SPARGE_ACID_NOT_REQUIRED" not in codes
    assert "ENZYMATIC_SPARGE_ACID_PRESCRIBED" in codes


def test_an_alkalinity_free_source_has_nothing_to_explain():
    source = {"ca": 5.0, "mg": 0.0, "na": 0.0, "so4": 0.0, "cl": 0.0, "alk": 0.0}
    out = solve_water_chemistry(WaterChemistryInput(source=source, **_LACTATE_BATCH))
    assert out.sparge_acid_ml == 0.0
    codes = {item["code"] for item in out.telemetry}
    assert "ENZYMATIC_SPARGE_ACID_NOT_REQUIRED" not in codes
