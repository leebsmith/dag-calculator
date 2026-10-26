"""D2.4 — committed conformance fixtures for the boundary request adapter.

The backend dumps ``model_dump(mode="json")`` + ``canonical_fingerprint()`` for a
canonical Batch/Water request into ``tests/conformance/fixtures/``; the node
suite rebuilds the same bodies from a matching engine state and asserts
deep-equality (shape + values + fingerprint). Regenerate the fixtures with:

    UPDATE_FIXTURES=1 uv run pytest tests/backend/conformance/test_boundary_fixtures.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from app.schemas.boundary import (
    AcidMedium,
    BatchSolverRequest,
    BatchSpargeTopology,
    BoilHopRow,
    GristBillRow,
    HopSolverRequest,
    IonProfile,
    PreferredAlkalineAgent,
    SaltDistribution,
    WaterGristRow,
    WaterSolverRequest,
    WaterStrategy,
    WhirlpoolHopForm,
    WhirlpoolHopRow,
)

FIXTURE_DIR = Path(__file__).resolve().parents[3] / "tests" / "conformance" / "fixtures"

# Canonical host state (mirrored by the node test's stub engine).
_GRIST = [(0.8, 0.8, 0.04, 0.643), (0.2, 0.74, 0.04, 0.398)]
_M_GRIST = 4.7
_WATER_GRIST = [(1.5, "BASE"), (40.0, "CRYSTAL")]


def canonical_batch() -> BatchSolverRequest:
    return BatchSolverRequest(
        target_abv=5.5,
        malt_attenuation_cap=0.75,
        v_ferm=20.0,
        topology=BatchSpargeTopology.R_L_TO_G,
        intensive_value=3.0,
        grain_bill=[
            GristBillRow(w_i=w, yield_i=y, mc_i=mc, fermentability_i=f)
            for w, y, mc, f in _GRIST
        ],
        s_late_add=0.0,
        v_kettle_dead=0.0,
        delta_v_evap=3.0,
        v_dead=0.0,
        eta_conv=0.95,
        f_shrink=0.04,
        hlt_starting_volume_l=25.0,
        hlt_dead_space_l=0.0,
        hlt_transfer_loss_l=0.0,
        hlt_coil_floor_l=0.0,
        max_hlt_volume_l=30.0,
        max_kettle_volume_l=40.0,
        max_mash_tun_volume_l=40.0,
    )


def canonical_water() -> WaterSolverRequest:
    return WaterSolverRequest(
        grist=[
            WaterGristRow(mass_kg=w * _M_GRIST, color_lovibond=color, grain_type=gt)
            for (w, _y, _mc, _f), (color, gt) in zip(_GRIST, _WATER_GRIST, strict=True)
        ],
        source=IonProfile(
            calcium_ca=20.0,
            magnesium_mg=5.0,
            sodium_na=10.0,
            sulfate_so4=30.0,
            chloride_cl=15.0,
            alkalinity_as_caco3=80.0,
        ),
        target=IonProfile(
            calcium_ca=60.0,
            magnesium_mg=10.0,
            sodium_na=20.0,
            sulfate_so4=100.0,
            chloride_cl=50.0,
            alkalinity_as_caco3=40.0,
        ),
        v_mash_treat_l=14.0,
        v_hlt_treat_l=15.0,
        v_hlt_debt_l=1.0,
        v_sparge_demand_l=14.0,
        mash_thickness_l_per_kg=3.0,
        target_mash_ph=5.4,
        strategy=WaterStrategy.CALCIUM_FLOOR,
        salt_distribution=SaltDistribution.PROPORTIONAL,
        acid_medium=AcidMedium.LACTIC_88,
        gypsum_form="GYPSUM_DIHYDRATE",
        cacl2_form="CACL2_DIHYDRATE",
        preferred_alkaline_agent=PreferredAlkalineAgent.PICKLING_LIME,
        calcium_floor_ppm=50.0,
    )


def canonical_hop() -> HopSolverRequest:
    return HopSolverRequest(
        boil_hops=[
            BoilHopRow(alpha_acid_pct=0.10, boil_time_fraction=1.0, pct=0.6),
            BoilHopRow(alpha_acid_pct=0.12, boil_time_fraction=0.5, pct=0.4),
        ],
        whirlpool_hops=[
            WhirlpoolHopRow(
                alpha_acid_pct=0.10,
                duration_min=30.0,
                initial_temp_c=99.0,
                pct=1.0,
                product_form=WhirlpoolHopForm.T90_PELLET,
            )
        ],
        boil_target_ibu=40.0,
        whirlpool_target_ibu=20.0,
        boil_time_min=60.0,
        pre_boil_gravity=1.048,
        post_boil_gravity=1.055,
        post_boil_volume_l=21.0,
        whirlpool_ambient_temp_c=20.0,
        whirlpool_cooling_time_constant_min=108.7,
    )


CASES = {"batch": canonical_batch, "water": canonical_water, "hop": canonical_hop}


def _dump(model) -> dict:
    return {
        "request": model.model_dump(mode="json"),
        "fingerprint": model.canonical_fingerprint(),
    }


def test_boundary_fixtures_match_committed_dump():
    update = bool(os.environ.get("UPDATE_FIXTURES"))
    if update:
        FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    for name, factory in CASES.items():
        expected = _dump(factory())
        path = FIXTURE_DIR / f"{name}.json"
        if update:
            path.write_text(json.dumps(expected, indent=2, sort_keys=True) + "\n")
        assert path.exists(), f"missing fixture {path}; run with UPDATE_FIXTURES=1"
        assert json.loads(path.read_text()) == expected, f"{name} fixture is stale"
