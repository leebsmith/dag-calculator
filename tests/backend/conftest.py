"""Shared fixtures for backend boundary tests."""

from __future__ import annotations

import sys
from pathlib import Path

# Make `backend/` importable regardless of pytest's rootdir (the test suite
# lives at the repo root, outside the backend package).
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

import pytest

from app.schemas.boundary import (
    AcidMedium,
    BatchSolverRequest,
    BatchSpargeTopology,
    GristBillRow,
    IonProfile,
    PreferredAlkalineAgent,
    SaltDistribution,
    WaterGristRow,
    WaterSolverRequest,
    WaterStrategy,
)


def make_batch_request(**overrides) -> BatchSolverRequest:
    kwargs: dict = {
        "target_abv": 5.5,
        "apparent_attenuation": 0.75,
        "v_ferm": 20.0,
        "topology": BatchSpargeTopology.R_L_TO_G,
        "intensive_value": 3.0,
        "grain_bill": [GristBillRow(w_i=1.0, yield_i=0.80, mc_i=0.04)],
        "delta_v_evap": 3.0,
        "eta_conv": 0.95,
        "hlt_starting_volume_l": 25.0,
        "max_hlt_volume_l": 30.0,
    }
    kwargs.update(overrides)
    return BatchSolverRequest(**kwargs)


def make_water_request(**overrides) -> WaterSolverRequest:
    kwargs: dict = {
        "grist": [WaterGristRow(mass_kg=5.0, color_lovibond=3.0, grain_type="BASE")],
        "source": IonProfile(
            calcium_ca=10.0,
            magnesium_mg=2.0,
            sodium_na=8.0,
            sulfate_so4=5.0,
            chloride_cl=7.0,
            alkalinity_as_caco3=40.0,
        ),
        "target": IonProfile(
            calcium_ca=80.0,
            magnesium_mg=5.0,
            sodium_na=20.0,
            sulfate_so4=100.0,
            chloride_cl=50.0,
            alkalinity_as_caco3=0.0,
        ),
        "v_mash_treat_l": 15.0,
        "v_hlt_treat_l": 10.0,
        "v_sparge_demand_l": 8.0,
        "mash_thickness_l_per_kg": 3.0,
        "target_mash_ph": 5.35,
        "strategy": WaterStrategy.FLAVOR,
        "salt_distribution": SaltDistribution.PROPORTIONAL,
        "acid_medium": AcidMedium.LACTIC_88,
        "preferred_alkaline_agent": PreferredAlkalineAgent.BAKING_SODA,
    }
    kwargs.update(overrides)
    return WaterSolverRequest(**kwargs)


@pytest.fixture
def batch_request():
    return make_batch_request()


@pytest.fixture
def water_request():
    return make_water_request()
