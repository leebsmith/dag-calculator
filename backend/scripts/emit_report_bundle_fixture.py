"""Regenerate tests/conformance/fixtures/report-bundle.json.

The fixture is a sample freeze bundle (real artifact + a representative state,
catalog, validation, and telemetry). Tests validate it on every run; re-run this
script in the same commit as any artifact change so the pinned artifact hash
stays current.

    cd backend && uv run python scripts/emit_report_bundle_fixture.py
"""

from __future__ import annotations

import json
from pathlib import Path

from app.artifact import load_artifact
from app.schemas.batch import FreezePayload
from app.schemas.report_bundle import (
    BoundaryTelemetry,
    CatalogContent,
    FormattedSummary,
    FormattedValue,
    NodePresentation,
    ReportInputs,
    ValidationBundle,
)
from app.services.report_bundle_service import build_report_bundle

OUT = (
    Path(__file__).resolve().parents[2]
    / "tests"
    / "conformance"
    / "fixtures"
    / "report-bundle.json"
)

MAJOR_MALTS = [
    {
        "name": "American 2-row",
        "pct": 0.85,
        "parts": 85.0,
        "yield_fraction": 0.78,
        "color_lovibond": 1.8,
    },
    {
        "name": "Crystal 40",
        "pct": 0.15,
        "parts": 15.0,
        "yield_fraction": 0.74,
        "color_lovibond": 40.0,
    },
]

TRACE_MALTS = [
    {
        "name": "Carafa Special II",
        "mass_kg": 0.1,
        "yield_fraction": 0.60,
        "color_lovibond": 500.0,
    },
]

SUGARS = [
    {
        "sugar_id": "d-180",
        "name": "Candi Syrup D-180",
        "mass_kg": 0.5,
        "parts": 10.0,
        "resolved_mass_kg": 0.5,
        "yield_fraction": 0.80,
        "color_lovibond": 180.0,
    },
]

RECORD = {
    "name": "House Pale",
    "status": "frozen",
    "frozen_at": 1_700_000_000.0,
    "parent_batch_id": "draft-1",
    "identity": {
        "equipment": {
            "id": "herms-30l",
            "name": "HERMS 30L",
            "max_hlt_volume_l": 30.0,
            "hlt_dead_space_l": 0.5,
            "hlt_transfer_loss_l": 0.5,
            "hlt_coil_floor_l": 4.0,
            "max_kettle_volume_l": 40.0,
            "mash_dead_space_l": 0.5,
            "mash_transfer_loss_l": 0.5,
            "kettle_dead_space_l": 1.0,
            "kettle_transfer_loss_l": 0.5,
            "trub_loss_l": 0.5,
        },
        "water.source": {
            "report_id": "w-2026-01",
            "laboratory": "Ward Labs",
            "source_name": "City tap",
            "calcium_ca": 42.0,
            "total_alkalinity_caco3": 38.0,
        },
        "style": {"id": "18B", "name": "American Pale Ale", "og_min": 1.045, "og_max": 1.060},
    },
    "roots": {
        "batch.v_ferm": 20.0,
        "batch.target_abv": 5.5,
        "batch.fermentation": "ale",
        "batch.attenuation_derate_points": 0.03,
        "mash.grain_temp_c": 20.0,
        "water.target_mash_ph": 5.4,
    },
    "collections": {
        "mash.rests": [
            {
                "rest_id": "beta",
                "use_temp_c": 67.0,
                "duration_min": 60.0,
                "enabled": True,
            }
        ],
        "grist.major_malts": MAJOR_MALTS,
        "grist.trace_malts": TRACE_MALTS,
        "batch.sugars": SUGARS,
    },
    "selections": {
        "batch.yeast": {
            "id": "us-05",
            "name": "SafAle US-05",
            "manufacturer": "Fermentis",
            "form": "Dry",
            "attenuation_pct": 0.76,
            "temp_low_c": 15.0,
            "temp_high_c": 22.0,
            "flocculation": "Medium",
            "sta1": True,
        },
        "water.target_profile": {"id": "pale-ale", "name": "Pale ale target"},
    },
    "provenance": {
        "batch.yeast": {"source_template_id": "us-05"},
        "water.target_profile": {"source_template_id": "pale-ale"},
    },
    "conformance": {"og": {"holds": True}, "ibu": {"holds": True}},
    "valuation": {
        "batch.v_ferm": 20.0,
        "batch.target_abv": 5.5,
        "batch.topology": "r_l_to_g",
        "batch.conversion_efficiency": 0.90,
        "batch.mash_thickness_l_per_kg": 3.0,
        "batch.runoff_ratio": 1.5,
        "batch.boil_time_min": 60.0,
        "batch.boil_off_rate_l_per_hr": 3.0,
        "batch.sparge_water_temp_c": 76.0,
        "batch.grain_moisture_fraction": 0.04,
        "batch.hlt_starting_volume_l": 30.0,
        "batch.surplus_sparge_capacity": 0.0,
        "batch.yeast_id": "us-05",
        "batch.fermentation": "ale",
        "batch.attenuation_derate_points": 0.03,
        "batch.yeast_cap": 0.73,
        "batch.attenuation_above_cap": 0.026,
        "batch.yeast": {
            "name": "SafAle US-05",
            "manufacturer": "Fermentis",
            "form": "Dry",
            "attenuation_pct": 0.76,
            "temp_low_c": 15.0,
            "temp_high_c": 22.0,
            "flocculation": "Medium",
            "sta1": True,
        },
        "batch.realized_abv": 5.62,
        "mash.grain_temp_c": 20.0,
        "mash.strike_water_temp_c": 68.3,
        "mash.rests": [
            {
                "rest_id": "beta",
                "use_temp_c": 67.0,
                "duration_min": 60.0,
                "enabled": True,
            }
        ],
        "grist.major_malts": MAJOR_MALTS,
        "grist.trace_malts": TRACE_MALTS,
        "batch.sugars": SUGARS,
        # The volume-ledger rows reconcile: (V_post 22.4 + late 0.5) * 0.96
        # - (kettle dead 1.0 + transfer 0.5 + trub 0.5) = V_ferm 20.0.
        "solver.batch": {
            "sg_post_boil": 1.055,
            "v_pre_boil": 25.4,
            "m_grist": 5.0,
            "cascade.v_strike": 15.0,
            "cascade.v_mc": 0.2,
            "cascade.v_sol": 1.5,
            "cascade.v_absorption": 8.0,
            "cascade.v_run1": 8.2,
            "cascade.v_sparge": 17.2,
            "cascade.v_run2": 17.2,
            "cascade.v_post_boil": 22.4,
            "cascade.sg_pre_boil": 1.045,
            "apparent_attenuation": 0.756,
            "hlt.v_hlt_debt": 1.0,
            "hlt.v_hlt_after_strike": 15.0,
            "hlt.v_hlt_top_up": 3.2,
            "hlt.v_sparge_deliverable": 17.2,
            "hlt.v_hlt_required": 18.2,
            "hlt.v_hlt_target": 18.2,
            "brewhouse_efficiency": 0.819,
        },
        "batch.target_ibu": 40.0,
        "batch.realized_fg": 1.012,
        "grist.finished_beer_srm": 6.0,
        "batch.delta_v_evap": 3.0,
        "batch.late_addition_volume_l": 0.5,
        "batch.shrinkage_volume_l": 0.9,
        "solver.water": {
            "strategy": "CALCIUM_FLOOR",
            "prescription.predicted_mash_ph": 5.42,
            "total_added_salt_mass_g": 3.0,
        },
        "solver.hops": {"total_mass_kg": 0.024},
    },
}

PAYLOAD = FreezePayload(
    valuation=RECORD["valuation"],
    valuation_format="outputs",
    provenance=RECORD["provenance"],
    conformance=RECORD["conformance"],
    schema_version=4,
    report_inputs=ReportInputs(
        validation=ValidationBundle(
            relations=[{"id": "hlt_not_overfilled", "holds": True}],
            domains=[{"nodeId": "batch.target_abv", "bounded": True, "holds": True}],
            field_domains=[{"nodeId": "batch.yeast", "field": "attenuation_pct", "holds": True}],
            collection_domains=[
                {"nodeId": "mash.rests", "index": 0, "field": "use_temp_c", "holds": True}
            ],
        ),
        telemetry={
            "solver.batch": BoundaryTelemetry(
                binding="batch_sparge_solver",
                fingerprint="sha256:1111",
                warnings=[],
                notes=[],
            ),
            "solver.water": BoundaryTelemetry(
                binding="water_chemistry_solver",
                fingerprint="sha256:2222",
                telemetry=[
                    {
                        "code": "ROUTER_MODE_1_LINEAR_FLAVOR",
                        "severity": "INFO",
                        "message": "Sulfate/chloride targets only.",
                    }
                ],
                warnings=[],
                notes=[],
            ),
            "solver.hops": BoundaryTelemetry(
                binding="hop_bitterness_solver",
                fingerprint="sha256:3333",
                warnings=[],
                notes=[],
            ),
        },
    ),
    # The catalog's dimension block is the artifact's, verbatim: production
    # copies it through `buildReportCatalog`, so a hand-built thinner copy would
    # let a broken helper pass the fixture and fail in production.
    catalog=CatalogContent(
        dimensions=load_artifact()["dimensions"],
        nodes={
            "batch.v_ferm": NodePresentation(
                label="Fermenter volume", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "batch.target_abv": NodePresentation(
                label="Target ABV", dimension="abv", unit="pct", symbol="%", decimals=1
            ),
            "batch.topology": NodePresentation(
                label="Topology",
                options=["r_l_to_g", "runoff_ratio"],
                option_labels={
                    "r_l_to_g": "Liquor-to-grist ratio",
                    "runoff_ratio": "Runnings ratio",
                },
            ),
            "batch.conversion_efficiency": NodePresentation(
                label="Conversion efficiency", dimension="percentage", unit="pct", symbol="%", decimals=1
            ),
            "batch.mash_thickness_l_per_kg": NodePresentation(
                label="Mash thickness", dimension="mash_thickness", unit="L_per_kg", symbol="L/kg", decimals=1
            ),
            "batch.runoff_ratio": NodePresentation(
                label="Runoff ratio", dimension="dimensionless", decimals=1
            ),
            "batch.boil_time_min": NodePresentation(
                label="Boil time", dimension="time", unit="min", symbol="min", decimals=0
            ),
            "batch.boil_off_rate_l_per_hr": NodePresentation(
                label="Boil-off rate", dimension="volume_per_time", unit="L_per_hr", symbol="L/hr", decimals=1
            ),
            "batch.sparge_water_temp_c": NodePresentation(
                label="Sparge water temperature", dimension="temperature", unit="degC", symbol="°C", decimals=1
            ),
            "batch.grain_moisture_fraction": NodePresentation(
                label="Grain moisture", dimension="percentage", unit="pct", symbol="%", decimals=1
            ),
            "batch.hlt_starting_volume_l": NodePresentation(
                label="HLT fill", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "batch.surplus_sparge_capacity": NodePresentation(
                label="Sparge surplus", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.cascade.sg_pre_boil": NodePresentation(
                label="Pre-boil gravity", dimension="gravity", unit="Plato", symbol="°P", decimals=1
            ),
            "solver.batch.brewhouse_efficiency": NodePresentation(
                label="Brewhouse efficiency", dimension="percentage", unit="pct", symbol="%", decimals=1
            ),
            "solver.batch.hlt.v_hlt_debt": NodePresentation(
                label="HLT debt", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.hlt.v_hlt_after_strike": NodePresentation(
                label="HLT after strike", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.hlt.v_hlt_top_up": NodePresentation(
                label="HLT top-up", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.hlt.v_sparge_deliverable": NodePresentation(
                label="Sparge deliverable", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.hlt.v_hlt_required": NodePresentation(
                label="HLT required", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.hlt.v_hlt_target": NodePresentation(
                label="HLT top-up target", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "mash.grain_temp_c": NodePresentation(
                label="Grain temperature", dimension="temperature", unit="degC", symbol="°C", decimals=1
            ),
            "mash.strike_water_temp_c": NodePresentation(
                label="Strike water temp", dimension="temperature", unit="degC", symbol="°C", decimals=1
            ),
            "mash.rests.use_temp_c": NodePresentation(
                label="Temp", dimension="temperature", unit="degC", symbol="°C", decimals=1
            ),
            "solver.batch": NodePresentation(label="Batch solver"),
            "solver.batch.sg_post_boil": NodePresentation(
                label="Post-boil gravity", dimension="gravity", unit="Plato", symbol="°P", decimals=1
            ),
            "solver.batch.apparent_attenuation": NodePresentation(
                label="Apparent attenuation", dimension="percentage", unit="pct", symbol="%", decimals=1
            ),
            "solver.batch.v_pre_boil": NodePresentation(
                label="Pre-boil volume", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.m_grist": NodePresentation(
                label="Grist mass", dimension="mass", unit="kg", symbol="kg", decimals=1
            ),
            "solver.batch.cascade.v_strike": NodePresentation(
                label="Strike Volume", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.cascade.v_mc": NodePresentation(
                label="Grain moisture", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.cascade.v_sol": NodePresentation(
                label="Dissolved extract", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.cascade.v_absorption": NodePresentation(
                label="Grain absorption", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.cascade.v_run1": NodePresentation(
                label="First runnings", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.cascade.v_sparge": NodePresentation(
                label="Sparge water", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.cascade.v_run2": NodePresentation(
                label="Second runnings", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.cascade.v_post_boil": NodePresentation(
                label="Post-boil volume", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "batch.delta_v_evap": NodePresentation(
                label="Boil-off", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "batch.late_addition_volume_l": NodePresentation(
                label="Late-addition volume", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "batch.shrinkage_volume_l": NodePresentation(
                label="Shrinkage", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "equipment.mash_dead_space_l": NodePresentation(
                label="Mash dead space", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "equipment.mash_transfer_loss_l": NodePresentation(
                label="Mash transfer loss", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "equipment.kettle_dead_space_l": NodePresentation(
                label="Kettle dead space", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "equipment.kettle_transfer_loss_l": NodePresentation(
                label="Kettle transfer", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "equipment.trub_loss_l": NodePresentation(
                label="Trub", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "batch.realized_abv": NodePresentation(
                label="Realized ABV", dimension="abv", unit="pct", symbol="%", decimals=1
            ),
            "batch.realized_fg": NodePresentation(
                label="Final gravity", dimension="gravity", unit="Plato", symbol="°P", decimals=1
            ),
            "batch.target_ibu": NodePresentation(
                label="Target IBU", dimension="ibu", unit="IBU", symbol="IBU", decimals=1
            ),
            "grist.finished_beer_srm": NodePresentation(
                label="Beer color", dimension="beer_color", unit="SRM", symbol="SRM", decimals=1
            ),
            "equipment.name": NodePresentation(label="Equipment"),
            "style.name": NodePresentation(label="Style"),
            "water.source.source_name": NodePresentation(label="Water source"),
            "mash.rests": NodePresentation(label="Mash rests"),
            "mash.rests.rest_id": NodePresentation(label="Step"),
            "mash.rests.duration_min": NodePresentation(
                label="Time", dimension="time", unit="min", symbol="min", decimals=0
            ),
            "mash.rests.enabled": NodePresentation(label="Enabled"),
            "grist.major_malts": NodePresentation(label="Grain bill"),
            "grist.major_malts.name": NodePresentation(label="Fermentable"),
            "grist.major_malts.parts": NodePresentation(label="Parts"),
            "grist.major_malts.pct": NodePresentation(
                label="Bill share", dimension="percentage", unit="pct", symbol="%", decimals=1
            ),
            "grist.major_malts.yield_fraction": NodePresentation(
                label="Yield", dimension="percentage", unit="pct", symbol="%", decimals=1
            ),
            "grist.major_malts.color_lovibond": NodePresentation(
                label="Color", dimension="grain_color", unit="Lovibond", symbol="°L", decimals=1
            ),
            "grist.trace_malts": NodePresentation(label="Trace malts"),
            "grist.trace_malts.name": NodePresentation(label="Fermentable"),
            "grist.trace_malts.mass_kg": NodePresentation(
                label="Mass", dimension="mass", unit="kg", symbol="kg", decimals=1
            ),
            "grist.trace_malts.yield_fraction": NodePresentation(
                label="Yield", dimension="percentage", unit="pct", symbol="%", decimals=1
            ),
            "grist.trace_malts.color_lovibond": NodePresentation(
                label="Color", dimension="grain_color", unit="Lovibond", symbol="°L", decimals=1
            ),
            "batch.sugars": NodePresentation(label="Late additions"),
            "batch.sugars.sugar_id": NodePresentation(label="Sugar ID"),
            "batch.sugars.name": NodePresentation(label="Sugar"),
            "batch.sugars.mass_kg": NodePresentation(
                label="Mass", dimension="mass", unit="kg", symbol="kg", decimals=1
            ),
            "batch.sugars.parts": NodePresentation(label="Parts"),
            "batch.sugars.resolved_mass_kg": NodePresentation(
                label="Resolved mass", dimension="mass", unit="kg", symbol="kg", decimals=2
            ),
            "batch.sugars.yield_fraction": NodePresentation(
                label="Yield", dimension="percentage", unit="pct", symbol="%", decimals=1
            ),
            "batch.sugars.color_lovibond": NodePresentation(
                label="Color", dimension="grain_color", unit="Lovibond", symbol="°L", decimals=1
            ),
            "solver.water": NodePresentation(label="Water solver"),
            "solver.water.strategy": NodePresentation(
                label="Strategy",
                options=[
                    "FLAVOR",
                    "CALCIUM_FLOOR",
                    "OPTIMIZE",
                    "AUTO",
                    "HYBRID",
                    "BASELINE",
                    "CUSTOM",
                ],
            ),
            "solver.water.total_added_salt_mass_g": NodePresentation(
                label="Added salt mass", dimension="mass", unit="g", symbol="g", decimals=1
            ),
            "solver.hops": NodePresentation(label="Hop solver"),
            "solver.water.prescription.predicted_mash_ph": NodePresentation(
                label="Predicted mash pH", dimension="ph", unit="pH", symbol="pH", decimals=2
            ),
            "solver.water.mash_additions.gypsum_kg": NodePresentation(
                label="Mash gypsum", dimension="mass", unit="g", symbol="g", decimals=1
            ),
            "solver.hops.total_mass_kg": NodePresentation(
                label="Total hop mass", dimension="mass", unit="g", symbol="g", decimals=1
            ),
            "batch.yeast.name": NodePresentation(label="Yeast"),
            "batch.yeast": NodePresentation(label="Yeast"),
            "batch.yeast.manufacturer": NodePresentation(label="Manufacturer"),
            "batch.yeast.form": NodePresentation(label="Form"),
            "batch.fermentation": NodePresentation(
                label="Fermentation",
                options=["ale", "lager", "wild", "mixed"],
                option_labels={"ale": "Ale", "lager": "Lager", "wild": "Wild", "mixed": "Mixed"},
            ),
            "batch.yeast.attenuation_pct": NodePresentation(
                label="Typical attenuation",
                dimension="percentage",
                unit="pct",
                symbol="%",
                decimals=1,
            ),
            "batch.attenuation_derate_points": NodePresentation(
                label="Batch derate (points)",
                dimension="percentage",
                unit="pct",
                symbol="pts",
                decimals=1,
            ),
            "batch.yeast_cap": NodePresentation(
                label="Malt attenuation cap",
                dimension="percentage",
                unit="pct",
                symbol="%",
                decimals=1,
            ),
            "batch.attenuation_above_cap": NodePresentation(
                label="Above malt cap",
                dimension="percentage",
                unit="pct",
                symbol="pts",
                decimals=1,
            ),
            "batch.yeast.temp_low_c": NodePresentation(
                label="Temp low", dimension="temperature", unit="degC", symbol="°C", decimals=1
            ),
            "batch.yeast.temp_high_c": NodePresentation(
                label="Temp high", dimension="temperature", unit="degC", symbol="°C", decimals=1
            ),
            "batch.yeast.flocculation": NodePresentation(label="Flocculation"),
            "batch.yeast.sta1": NodePresentation(label="STA1"),
            "batch.yeast_id": NodePresentation(label="Yeast", dimension="reference"),
            "equipment.max_hlt_volume_l": NodePresentation(
                label="Max HLT", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "style.og_min": NodePresentation(
                label="OG min", dimension="gravity", unit="SG", symbol="SG", decimals=3
            ),
        },
    ),
    formatted={
        "equipment.name": FormattedValue(text="HERMS 30L"),
        "batch.yeast_id": FormattedValue(text="us-05"),
        "batch.yeast.name": FormattedValue(text="SafAle US-05"),
        "batch.yeast.manufacturer": FormattedValue(text="Fermentis"),
        "batch.yeast.form": FormattedValue(text="Dry"),
        "batch.fermentation": FormattedValue(text="Ale"),
        "batch.yeast.attenuation_pct": FormattedValue(text="76.0%", number="76.0", unit="%"),
        "batch.attenuation_derate_points": FormattedValue(text="3.0 pts", number="3.0", unit="pts"),
        "batch.yeast_cap": FormattedValue(text="73.0%", number="73.0", unit="%"),
        "batch.attenuation_above_cap": FormattedValue(
            text="2.6 pts", number="2.6", unit="pts"
        ),
        "batch.yeast.temp_low_c": FormattedValue(text="15.0 °C", number="15.0", unit="°C"),
        "batch.yeast.temp_high_c": FormattedValue(text="22.0 °C", number="22.0", unit="°C"),
        "batch.yeast.flocculation": FormattedValue(text="Medium"),
        "batch.yeast.sta1": FormattedValue(text="true"),
        "style.name": FormattedValue(text="American Pale Ale"),
        "water.source.source_name": FormattedValue(text="City tap"),
        "batch.target_abv": FormattedValue(text="5.5%", number="5.5", unit="%"),
        "mash.strike_water_temp_c": FormattedValue(text="68.3 °C", number="68.3", unit="°C"),
        "batch.topology": FormattedValue(text="Liquor-to-grist ratio"),
        "batch.conversion_efficiency": FormattedValue(text="90.0%", number="90.0", unit="%"),
        "solver.batch.brewhouse_efficiency": FormattedValue(text="81.9%", number="81.9", unit="%"),
        "batch.mash_thickness_l_per_kg": FormattedValue(text="3.0 L/kg", number="3.0", unit="L/kg"),
        "batch.runoff_ratio": FormattedValue(text="1.5", number="1.5"),
        "batch.boil_time_min": FormattedValue(text="60 min", number="60", unit="min"),
        "batch.boil_off_rate_l_per_hr": FormattedValue(text="3.0 L/hr", number="3.0", unit="L/hr"),
        "batch.sparge_water_temp_c": FormattedValue(text="76.0 °C", number="76.0", unit="°C"),
        "batch.grain_moisture_fraction": FormattedValue(text="4.0%", number="4.0", unit="%"),
        "batch.hlt_starting_volume_l": FormattedValue(text="30.0 L", number="30.0", unit="L"),
        "batch.surplus_sparge_capacity": FormattedValue(text="0.0 L", number="0.0", unit="L"),
        "solver.batch.cascade.sg_pre_boil": FormattedValue(text="11.2 °P", number="11.2", unit="°P"),
        "solver.batch.hlt.v_hlt_debt": FormattedValue(text="1.0 L", number="1.0", unit="L"),
        "solver.batch.hlt.v_hlt_after_strike": FormattedValue(text="15.0 L", number="15.0", unit="L"),
        "solver.batch.hlt.v_hlt_top_up": FormattedValue(text="3.2 L", number="3.2", unit="L"),
        "solver.batch.hlt.v_sparge_deliverable": FormattedValue(text="17.2 L", number="17.2", unit="L"),
        "solver.batch.hlt.v_hlt_required": FormattedValue(text="18.2 L", number="18.2", unit="L"),
        "solver.batch.hlt.v_hlt_target": FormattedValue(text="18.2 L", number="18.2", unit="L"),
        "solver.batch.sg_post_boil": FormattedValue(text="13.6 °P", number="13.6", unit="°P"),
        "batch.realized_fg": FormattedValue(text="3.1 °P", number="3.1", unit="°P"),
        "solver.batch.apparent_attenuation": FormattedValue(text="75.6%", number="75.6", unit="%"),
        "batch.realized_abv": FormattedValue(text="5.6%", number="5.6", unit="%"),
        "batch.target_ibu": FormattedValue(text="40.0 IBU", number="40.0", unit="IBU"),
        "grist.finished_beer_srm": FormattedValue(text="6.0 SRM", number="6.0", unit="SRM"),
        "solver.batch.cascade.v_strike": FormattedValue(text="15.0 L", number="15.0", unit="L"),
        "solver.batch.cascade.v_mc": FormattedValue(text="0.2 L", number="0.2", unit="L"),
        "solver.batch.cascade.v_sol": FormattedValue(text="1.5 L", number="1.5", unit="L"),
        "solver.batch.cascade.v_absorption": FormattedValue(text="8.0 L", number="8.0", unit="L"),
        "solver.batch.cascade.v_run1": FormattedValue(text="8.2 L", number="8.2", unit="L"),
        "solver.batch.cascade.v_sparge": FormattedValue(text="17.2 L", number="17.2", unit="L"),
        "solver.batch.cascade.v_run2": FormattedValue(text="17.2 L", number="17.2", unit="L"),
        "solver.batch.cascade.v_post_boil": FormattedValue(text="22.4 L", number="22.4", unit="L"),
        "solver.batch.v_pre_boil": FormattedValue(text="25.4 L", number="25.4", unit="L"),
        "batch.delta_v_evap": FormattedValue(text="3.0 L", number="3.0", unit="L"),
        "batch.late_addition_volume_l": FormattedValue(text="0.5 L", number="0.5", unit="L"),
        "batch.shrinkage_volume_l": FormattedValue(text="0.9 L", number="0.9", unit="L"),
        "batch.v_ferm": FormattedValue(text="20.0 L", number="20.0", unit="L"),
        "equipment.mash_dead_space_l": FormattedValue(text="0.5 L", number="0.5", unit="L"),
        "equipment.mash_transfer_loss_l": FormattedValue(text="0.5 L", number="0.5", unit="L"),
        "equipment.kettle_dead_space_l": FormattedValue(text="1.0 L", number="1.0", unit="L"),
        "equipment.kettle_transfer_loss_l": FormattedValue(text="0.5 L", number="0.5", unit="L"),
        "equipment.trub_loss_l": FormattedValue(text="0.5 L", number="0.5", unit="L"),
        "solver.batch.m_grist": FormattedValue(text="5.0 kg", number="5.0", unit="kg"),
    },
    formatted_tables={
        "grist.major_malts": [
            {
                "name": FormattedValue(text="American 2-row"),
                "amount": FormattedValue(text="4.3 kg", number="4.3", unit="kg"),
                "ppg": FormattedValue(text="36.0", number="36.0"),
                "color": FormattedValue(text="1.8 °L", number="1.8", unit="°L"),
                "own_pct": FormattedValue(text="85.0%", number="85.0", unit="%"),
                "grist_pct": FormattedValue(text="83.3%", number="83.3", unit="%"),
            },
            {
                "name": FormattedValue(text="Crystal 40"),
                "amount": FormattedValue(text="0.8 kg", number="0.8", unit="kg"),
                "ppg": FormattedValue(text="34.2", number="34.2"),
                "color": FormattedValue(text="40.0 °L", number="40.0", unit="°L"),
                "own_pct": FormattedValue(text="15.0%", number="15.0", unit="%"),
                "grist_pct": FormattedValue(text="14.7%", number="14.7", unit="%"),
            },
        ],
        "grist.trace_malts": [
            {
                "name": FormattedValue(text="Carafa Special II"),
                "amount": FormattedValue(text="0.1 kg", number="0.1", unit="kg"),
                "ppg": FormattedValue(text="27.7", number="27.7"),
                "color": FormattedValue(text="500.0 °L", number="500.0", unit="°L"),
                "own_pct": FormattedValue(text="100.0%", number="100.0", unit="%"),
                "grist_pct": FormattedValue(text="2.0%", number="2.0", unit="%"),
            },
        ],
        "batch.sugars": [
            {
                "name": FormattedValue(text="Candi Syrup D-180"),
                "amount": FormattedValue(text="0.5 kg", number="0.5", unit="kg"),
                "ppg": FormattedValue(text="37.0", number="37.0"),
                "color": FormattedValue(text="180.0 °L", number="180.0", unit="°L"),
                "grist_pct": FormattedValue(text="9.8%", number="9.8", unit="%"),
            },
        ],
    },
    formatted_summaries={
        "grist.major_malts": FormattedSummary(
            color=FormattedValue(text="7.5 °L", number="7.5", unit="°L"),
            extract_yield=FormattedValue(text="77.4%", number="77.4", unit="%"),
        ),
        "grist.trace_malts": FormattedSummary(
            color=FormattedValue(text="500.0 °L", number="500.0", unit="°L"),
            extract_yield=FormattedValue(text="60.0%", number="60.0", unit="%"),
        ),
        "batch.sugars": FormattedSummary(
            color=FormattedValue(text="180.0 °L", number="180.0", unit="°L"),
            extract_yield=FormattedValue(text="80.0%", number="80.0", unit="%"),
        ),
        "overall": FormattedSummary(
            color=FormattedValue(text="31.7 °L", number="31.7", unit="°L"),
            extract_yield=FormattedValue(text="77.6%", number="77.6", unit="%"),
        ),
    },
)


def main() -> None:
    bundle = build_report_bundle(frozen_id="frozen-1", record=RECORD, payload=PAYLOAD)
    OUT.write_text(json.dumps(bundle, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(OUT.parents[3])}")


if __name__ == "__main__":
    main()
