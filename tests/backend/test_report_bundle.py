"""Guard tests for the report bundle schema (plans/report-bundle.md)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.report_bundle import BUNDLE_FORMAT, ReportBundle

ARTIFACT = {
    "schema_version": 7,
    "dimensions": {
        "volume": {"base_unit": "L", "kind": "linear", "units": {"gal": {"factor": 3.785411784}}}
    },
    "primitive_schemas": {
        "equipment": {"name": {}, "max_hlt_volume_l": {"dimension": "volume"}},
        "mash_rest": {"rest_id": {}, "use_temp_c": {"dimension": "volume"}},
    },
    "identity": {"equipment": "equipment", "water.source": "equipment", "style": "equipment"},
    "nodes": {
        "mash.rests": {"kind": "collection", "item_schema": "mash_rest"},
        "batch.v_ferm": {"kind": "root", "dimension": "volume"},
        "solver.batch": {
            "kind": "boundary",
            "binding": "batch_sparge_solver",
            "outputs": {"cascade.v_strike": {"dimension": "volume"}},
        },
        "water.target_profile": {
            "kind": "selection",
            "output": {"schema": "equipment"},
            "ref": "batch.v_ferm",
        },
    },
}

IDENTITY = {
    "equipment": {"id": "rig", "name": "Test rig", "max_hlt_volume_l": 30},
    "water.source": {"report_id": "w1", "name": "Test water"},
    "style": {"id": "21A", "name": "American IPA"},
}


def bundle(**overrides) -> dict:
    base = {
        "bundle_format": BUNDLE_FORMAT,
        "artifact": {"schema_version": 7, "hash": "sha256:artifact", "content": ARTIFACT},
        "catalog": {
            "hash": "sha256:catalog",
            "dimensions": {"volume": {"base_unit": "L", "kind": "linear", "units": {}}},
            "nodes": {
                "batch.v_ferm": {"label": "Fermenter volume", "unit": "L", "decimals": 1},
                "mash.rests": {"label": "Mash rests"},
                "mash.rests.rest_id": {"label": "Step"},
                "mash.rests.use_temp_c": {"label": "Rest temperature"},
                "solver.batch": {"label": "Batch solver"},
                "solver.batch.cascade.v_strike": {"label": "Strike volume"},
                "water.target_profile": {"label": "Water target"},
                "water.target_profile.name": {"label": "Water target name"},
                "equipment.max_hlt_volume_l": {"label": "Max HLT"},
            },
        },
        "batch": {
            "id": "b1",
            "name": "House Pale",
            "frozen_at": 1.0,
            "parent_batch_id": None,
            "identity": IDENTITY,
        },
        "state": {
            "valuation": {
                "batch.v_ferm": 20,
                "mash.rests": [{"rest_id": "dough_in", "use_temp_c": 67}],
                "solver.batch": {"cascade.v_strike": 14},
                "water.target_profile": {"name": "rig"},
            },
            "roots": {"batch.v_ferm": 20},
            "collections": {"mash.rests": [{"rest_id": "dough_in"}]},
            "selections": {"water.target_profile": {"name": "rig"}},
            "provenance": {"water.target_profile": {"source_template_id": "rig"}},
        },
        "conformance": {"sai": 92.0},
        "validation": {
            "relations": [{"id": "r", "holds": True}],
            "domains": [],
            "field_domains": [],
            "collection_domains": [],
        },
        "telemetry": {
            "solver.batch": {
                "binding": "batch_sparge_solver",
                "fingerprint": "sha256:fp",
                "telemetry": [{"code": "X", "severity": "INFO"}],
                "warnings": [],
                "notes": ["ok"],
            }
        },
    }
    base.update(overrides)
    return ReportBundle.seal(base).model_dump(mode="json")


def test_a_well_formed_bundle_validates() -> None:
    parsed = ReportBundle.model_validate(bundle())
    assert parsed.bundle_format == 1
    assert parsed.batch.identity["equipment"]["name"] == "Test rig"


def test_unknown_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        ReportBundle.model_validate(bundle(unexpected="nope"))


def test_unknown_bundle_format_is_rejected() -> None:
    with pytest.raises(ValidationError):
        ReportBundle.model_validate(bundle(bundle_format=2))


def test_valuation_must_name_declared_nodes() -> None:
    state = bundle()["state"] | {"valuation": {"nope": 1}}
    with pytest.raises(ValidationError, match="undeclared nodes: nope"):
        ReportBundle.model_validate(bundle(state=state))


def test_telemetry_must_target_a_matching_boundary() -> None:
    bad_key = bundle() | {"telemetry": {"mash.rests": bundle()["telemetry"]["solver.batch"]}}
    with pytest.raises(ValidationError, match="is not a boundary node"):
        ReportBundle.model_validate(bad_key)

    bad_binding = bundle()["telemetry"]["solver.batch"] | {"binding": "other"}
    with pytest.raises(ValidationError, match="does not match"):
        ReportBundle.model_validate(bundle(telemetry={"solver.batch": bad_binding}))


def test_catalog_dimensions_must_be_declared() -> None:
    catalog = bundle()["catalog"] | {"dimensions": {"pressure": {"base_unit": "bar", "kind": "linear"}}}
    with pytest.raises(ValidationError, match="undeclared dimensions: pressure"):
        ReportBundle.model_validate(bundle(catalog=catalog))


def test_identity_namespaces_must_be_declared() -> None:
    batch = bundle()["batch"] | {"identity": {"yeast": {"id": "y"}}}
    with pytest.raises(ValidationError, match="identity namespaces not declared: yeast"):
        ReportBundle.model_validate(bundle(batch=batch))


@pytest.mark.parametrize(
    "path",
    [
        "batch.v_ferm",
        "mash.rests.use_temp_c",
        "solver.batch.cascade.v_strike",
        "equipment.max_hlt_volume_l",
    ],
)
def test_known_catalog_paths_resolve(path: str) -> None:
    catalog = bundle()["catalog"]
    nodes = catalog["nodes"] | {path: {"label": "x"}}
    parsed = ReportBundle.model_validate(bundle(catalog=catalog | {"nodes": nodes}))
    assert parsed.catalog.nodes[path].label == "x"


def test_unknown_catalog_paths_are_rejected() -> None:
    catalog = bundle()["catalog"]
    catalog = catalog | {"nodes": catalog["nodes"] | {"mash.nope": {"label": "x"}}}
    with pytest.raises(ValidationError, match="resolves to no node"):
        ReportBundle.model_validate(bundle(catalog=catalog))


def test_collection_state_must_name_a_collection_node() -> None:
    state = bundle()["state"] | {"collections": {"batch.v_ferm": []}}
    with pytest.raises(ValidationError, match="non-collection node"):
        ReportBundle.model_validate(bundle(state=state))


def test_content_hash_must_match_the_body() -> None:
    tampered = bundle()
    tampered["batch"]["name"] = "Edited after sealing"
    with pytest.raises(ValidationError, match="content_hash does not match"):
        ReportBundle.model_validate(tampered)


def test_catalog_nodes_may_declare_their_dimension() -> None:
    catalog = bundle()["catalog"]
    catalog = catalog | {
        "nodes": catalog["nodes"]
        | {"batch.v_ferm": {"label": "V", "dimension": "volume", "unit": "L", "decimals": 1}}
    }
    parsed = ReportBundle.model_validate(bundle(catalog=catalog))
    entry = parsed.catalog.nodes["batch.v_ferm"]
    assert entry.dimension == "volume"
    assert entry.unit == "L"
    assert entry.decimals == 1


def test_catalog_must_cover_every_solved_node():
    catalog = bundle()["catalog"]
    nodes = {k: v for k, v in catalog["nodes"].items() if k != "solver.batch"}
    with pytest.raises(ValidationError, match="catalog does not cover the solved state"):
        ReportBundle.model_validate(bundle(catalog=catalog | {"nodes": nodes}))


def test_catalog_must_cover_boundary_outputs_in_the_state():
    catalog = bundle()["catalog"]
    nodes = {
        k: v for k, v in catalog["nodes"].items() if k != "solver.batch.cascade.v_strike"
    }
    with pytest.raises(ValidationError, match="solver.batch.cascade.v_strike"):
        ReportBundle.model_validate(bundle(catalog=catalog | {"nodes": nodes}))


def test_catalog_must_cover_collection_row_fields():
    catalog = bundle()["catalog"]
    nodes = {k: v for k, v in catalog["nodes"].items() if k != "mash.rests.use_temp_c"}
    with pytest.raises(ValidationError, match="mash.rests.use_temp_c"):
        ReportBundle.model_validate(bundle(catalog=catalog | {"nodes": nodes}))


def test_telemetry_must_name_a_solved_boundary():
    telemetry = bundle()["telemetry"] | {
        "solver.batch": bundle()["telemetry"]["solver.batch"],
    }
    state = bundle()["state"] | {"valuation": {"batch.v_ferm": 20}}
    with pytest.raises(ValidationError, match="telemetry names unsolved boundaries"):
        ReportBundle.model_validate(bundle(state=state, telemetry=telemetry))


def test_freeze_payload_requires_the_bundle_inputs() -> None:
    from app.schemas.batch import FreezePayload

    with pytest.raises(ValidationError) as exc:
        FreezePayload()
    missing = {error["loc"][0] for error in exc.value.errors()}
    assert missing == {"report_inputs", "catalog"}
