"""Offline tests for the sealed water-chemistry solver and its service adapter."""

from __future__ import annotations

import pytest
from conftest import make_water_request

from app.core.water import (
    GrainEntry,
    SolverValidationError,
    _salt_ion_coeffs,
    acid_volume_ml,
    alkaline_agent_mass_g,
    predict_mash_ph,
    resolve_grist,
    solve_salt_dose,
)
from app.schemas.boundary import (
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
    assert exc.value.code == "UNKNOWN_ACID"


def test_unknown_alkaline_agent():
    with pytest.raises(SolverValidationError) as exc:
        alkaline_agent_mass_g(1.0, "BOGUS")
    assert exc.value.code == "UNKNOWN_ALKALINE_AGENT"


def test_unknown_salt_form():
    with pytest.raises(SolverValidationError) as exc:
        _salt_ion_coeffs("BOGUS", "CACL2_DIHYDRATE")
    assert exc.value.code == "UNKNOWN_SALT_FORM"


def test_optimize_not_implemented():
    with pytest.raises(SolverValidationError) as exc:
        solve_salt_dose("OPTIMIZE", _SOURCE, _TARGET, "GYPSUM_DIHYDRATE",
                        "CACL2_DIHYDRATE", 50.0)
    assert exc.value.code == "OPTIMIZE_NOT_IMPLEMENTED"


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
    ions = resp.post_salt_mash_ions
    for field in ("calcium_ca", "magnesium_mg", "sodium_na",
                  "sulfate_so4", "chloride_cl", "alkalinity_as_caco3"):
        assert getattr(ions, field) >= 0.0


def test_solve_water_calcium_floor_end_to_end():
    resp = solve_water_request(
        make_water_request(strategy=WaterStrategy.CALCIUM_FLOOR)
    )
    assert resp.prescription.predicted_mash_ph > 0.0


def test_post_salt_hlt_ions_proportional_matches_mash():
    resp = solve_water_request(
        make_water_request(salt_distribution=SaltDistribution.PROPORTIONAL)
    )
    assert resp.post_salt_hlt_ions == resp.post_salt_mash_ions


def test_post_salt_hlt_ions_mash_only_is_source():
    req = make_water_request(salt_distribution=SaltDistribution.MASH_ONLY)
    resp = solve_water_request(req)
    assert resp.post_salt_hlt_ions == req.source


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
        "OPTIMIZE_NOT_IMPLEMENTED", "SOURCE_NOT_FOUND", "MISSING_SOURCE",
        "SALT_SOLVE_FAILED", "INVALID_MASH_VOLUME", "UNKNOWN_STRATEGY",
        "UNKNOWN_ACID", "UNKNOWN_ALKALINE_AGENT", "UNKNOWN_SALT_FORM",
        "UNKNOWN_GRAIN_TYPE",
    }
    assert declared == expected
