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
        },
        "water.source": {
            "report_id": "w-2026-01",
            "laboratory": "Ward Labs",
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
        ]
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
        "solver.batch": {
            "sg_post_boil": 1.055,
            "v_pre_boil": 24.0,
        },
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
                label="Post-boil gravity", dimension="gravity", unit="SG", symbol="SG", decimals=3
            ),
            "solver.batch.v_pre_boil": NodePresentation(
                label="Pre-boil volume", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "solver.batch.cascade.v_strike": NodePresentation(
                label="Strike Volume", dimension="volume", unit="L", symbol="L", decimals=1
            ),
            "batch.realized_abv": NodePresentation(
                label="Realized ABV", dimension="abv", unit="pct", symbol="%", decimals=1
            ),
            "mash.rests": NodePresentation(label="Mash rests"),
            "mash.rests.rest_id": NodePresentation(label="Step"),
            "mash.rests.duration_min": NodePresentation(
                label="Time", dimension="time", unit="min", symbol="min", decimals=0
            ),
            "mash.rests.enabled": NodePresentation(label="Enabled"),
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
)


def main() -> None:
    bundle = build_report_bundle(frozen_id="frozen-1", record=RECORD, payload=PAYLOAD)
    OUT.write_text(json.dumps(bundle, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(OUT.parents[3])}")


if __name__ == "__main__":
    main()
