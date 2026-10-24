"""Tests for the backend artifact/catalog validator (mirrors the JS conformance)."""

from __future__ import annotations

import json
from pathlib import Path
from types import MappingProxyType

import pytest

from app import artifact as artifact_module

DATA = Path(__file__).resolve().parents[2] / "data"


def thaw(value):
    if isinstance(value, MappingProxyType):
        return {k: thaw(v) for k, v in value.items()}
    if isinstance(value, tuple):
        return [thaw(v) for v in value]
    return value

SEED_FILES = {
    "malt": ["malts.json", "standard-malts.json"],
    "sugar": ["sugars.json"],
    "yeast": ["yeasts.json"],
    "hop": ["hops.json"],
    "hop_product": ["hop-products.json"],
    "equipment": ["equipment.json"],
    "water_report": ["water_reports.json"],
    "water_target": ["water_target_profiles.json"],
    "style": ["styles.json"],
}


def load_seed(filename):
    with (DATA / "seeds" / filename).open(encoding="utf-8") as handle:
        return json.load(handle)


IMPERIAL_KEYS = {
    "max_kettle_volume_l": "max_kettle_volume_gal",
    "max_mash_tun_volume_l": "max_mash_tun_volume_gal",
    "max_hlt_volume_l": "max_hlt_volume_gal",
    "mash_dead_space_l": "mash_dead_space_gal",
    "mash_transfer_loss_l": "mash_transfer_loss_gal",
    "kettle_dead_space_l": "kettle_dead_space_gal",
    "kettle_transfer_loss_l": "kettle_transfer_loss_gal",
    "trub_loss_l": "trub_loss_gal",
    "hlt_dead_space_l": "hlt_dead_space_gal",
    "hlt_transfer_loss_l": "hlt_transfer_loss_gal",
    "hlt_coil_floor_l": "hlt_coil_floor_gal",
    "nominal_boil_off_rate_l_per_hr": "nominal_boil_off_rate_gal_per_hr",
    "grain_absorption_factor_l_per_kg": "grain_absorption_factor_qt_per_lb",
    "mash_tun_mass_kg": "mash_tun_mass_lb",
    "mash_tun_specific_heat": "mash_tun_specific_heat_btu_per_lb_f",
    "mash_heating_rate_c_per_min": "mash_heating_rate_f_per_min",
}

IMPERIAL_UNIT = {
    "volume": "gal",
    "mass": "lb",
    "volume_per_time": "gal_per_hr",
    "specific_heat": "btu_per_lb_degF",
    "mash_thickness": "qt_per_lb",
    "temperature_delta_per_time": "dF_per_min",
}


def ingest_equipment(raw):
    artifact = artifact_module.load_artifact()
    schema = artifact["primitive_schemas"]["equipment"]
    dimensions = artifact["dimensions"]
    out = {}
    for item_id, profile in raw.items():
        component = dict(profile.get("data", profile))
        if profile.get("units") == "imperial":
            for metric_key, imperial_key in IMPERIAL_KEYS.items():
                if imperial_key not in component:
                    continue
                dimension = schema[metric_key]["dimension"]
                factor = dimensions[dimension]["units"][IMPERIAL_UNIT[dimension]]["factor"]
                component[metric_key] = component[imperial_key] * factor
                del component[imperial_key]
        out[item_id] = component
    return out


def components_for_kind(kind):
    if kind == "equipment":
        return ingest_equipment(load_seed("equipment.json"))
    files = SEED_FILES[kind]
    components = {}
    for filename in files:
        components.update(load_seed(filename))
    return components


def test_data_directory_resolves_the_repository_data():
    assert artifact_module.data_dir() == DATA


def test_artifact_path_override_points_at_a_directory(monkeypatch, tmp_path):
    (tmp_path / "artifact.json").write_text(json.dumps({"nodes": {}}), encoding="utf-8")
    (tmp_path / "catalogs.json").write_text(json.dumps({}), encoding="utf-8")
    monkeypatch.setenv("ARTIFACT_PATH", str(tmp_path))
    artifact_module.clear_cache()

    assert artifact_module.data_dir() == tmp_path
    assert thaw(artifact_module.load_artifact()) == {"nodes": {}}
    monkeypatch.delenv("ARTIFACT_PATH")
    artifact_module.clear_cache()
    assert artifact_module.data_dir() == DATA


def test_validator_accepts_every_committed_seed_for_its_kind():
    for kind in SEED_FILES:
        for item_id, component in components_for_kind(kind).items():
            errors = artifact_module.validate_component(kind, component)
            assert errors == [], f"{kind}:{item_id}: {errors}"


def test_validator_rejects_undeclared_fields():
    errors = artifact_module.validate_component(
        "malt", {"name": "X", "category": "BASE", "bogus": 1}
    )
    assert any("undeclared" in error for error in errors)


def test_validator_rejects_domain_violations():
    errors = artifact_module.validate_component(
        "malt", {"name": "X", "category": "BASE", "yield_fraction": 1.5}
    )
    assert any("yield_fraction" in error for error in errors)


def test_validator_rejects_taxonomy_misses():
    errors = artifact_module.validate_component(
        "malt", {"name": "X", "category": "NOT_A_CATEGORY"}
    )
    assert any("taxonomy" in error for error in errors)


def test_validator_requires_a_title():
    errors = artifact_module.validate_component("equipment", {"name": "  "})
    assert any("required" in error for error in errors)


def test_validator_rejects_the_wrong_identity_field():
    errors = artifact_module.validate_component(
        "water_report", {"laboratory": "Ward", "id": "wrong"}
    )
    assert any("id" in error and "undeclared" in error for error in errors)


def test_validator_rejects_non_finite_dimensions():
    errors = artifact_module.validate_component(
        "equipment", {"name": "Rig", "max_hlt_volume_l": float("nan")}
    )
    assert any("finite" in error for error in errors)


def test_validator_rejects_unknown_kinds_and_non_objects():
    assert artifact_module.validate_component("nope", {})
    assert artifact_module.validate_component("malt", None)


@pytest.mark.parametrize("kind", list(SEED_FILES))
def test_catalogs_registry_covers_every_seed_kind(kind):
    assert kind in artifact_module.load_catalogs()
