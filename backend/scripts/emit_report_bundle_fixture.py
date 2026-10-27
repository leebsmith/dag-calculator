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
    },
    "selections": {
        "batch.yeast": {"id": "us-05", "name": "SafAle US-05"},
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
            "apparent_attenuation": 0.756,
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
        "style.name": FormattedValue(text="American Pale Ale"),
        "water.source.source_name": FormattedValue(text="City tap"),
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
                "bill_pct": FormattedValue(text="85.0%", number="85.0", unit="%"),
            },
            {
                "name": FormattedValue(text="Crystal 40"),
                "amount": FormattedValue(text="0.8 kg", number="0.8", unit="kg"),
                "ppg": FormattedValue(text="34.2", number="34.2"),
                "color": FormattedValue(text="40.0 °L", number="40.0", unit="°L"),
                "bill_pct": FormattedValue(text="15.0%", number="15.0", unit="%"),
            },
        ],
        "grist.trace_malts": [
            {
                "name": FormattedValue(text="Carafa Special II"),
                "amount": FormattedValue(text="0.1 kg", number="0.1", unit="kg"),
                "ppg": FormattedValue(text="27.7", number="27.7"),
                "color": FormattedValue(text="500.0 °L", number="500.0", unit="°L"),
                "bill_pct": FormattedValue(text="2.0%", number="2.0", unit="%"),
            },
        ],
    },
)


def main() -> None:
    bundle = build_report_bundle(frozen_id="frozen-1", record=RECORD, payload=PAYLOAD)
    OUT.write_text(json.dumps(bundle, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(OUT.parents[3])}")


if __name__ == "__main__":
    main()
