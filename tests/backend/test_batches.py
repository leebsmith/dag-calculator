"""Offline tests for the batch service (fake repository — no Firestore/network)."""

from __future__ import annotations

import pytest
from conftest import FakeBatchRepo as FakeRepo
from conftest import freeze_payload
from fastapi import HTTPException

from app.artifact import load_artifact
from app.schemas.batch import DraftPayload
from app.schemas.report_bundle import (
    BoundaryTelemetry,
    CatalogContent,
    DimensionSpec,
    NodePresentation,
    ReportInputs,
    ValidationBundle,
)
from app.services.batch_service import BatchConflictError, BatchService
from app.services.bundle_integrity import parse_bundle


def test_upsert_creates_then_updates():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="A", roots={"mash.grain_temp_c": 20}))
    assert rec.id == "batch-a"
    assert rec.status == "draft"
    assert rec.trashed is False
    assert rec.roots == {"mash.grain_temp_c": 20}

    updated = svc.upsert_draft(
        "u1",
        "batch-a",
        DraftPayload(name="B", roots={"mash.grain_temp_c": 21}, base_updated_at=rec.updated_at),
    )
    assert updated.name == "B"
    assert updated.roots == {"mash.grain_temp_c": 21}


def test_list_is_uid_scoped():
    svc = BatchService(FakeRepo())
    svc.upsert_draft("u1", "batch-a", DraftPayload(name="A"))
    assert len(svc.list_batches("u1")) == 1
    assert svc.list_batches("u2") == []


def test_upsert_frozen_is_409():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload())
    frozen = svc.freeze_batch("u1", rec.id, freeze_payload())

    with pytest.raises(BatchConflictError) as exc:
        svc.upsert_draft("u1", frozen.id, DraftPayload())
    assert exc.value.reason == "frozen"


def test_upsert_stale_baseline_conflicts():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="A"))

    # a first write advances updated_at
    svc.upsert_draft(
        "u1",
        "batch-a",
        DraftPayload(name="B", base_updated_at=rec.updated_at),
    )

    # replaying the original baseline now conflicts
    with pytest.raises(BatchConflictError) as exc:
        svc.upsert_draft(
            "u1",
            "batch-a",
            DraftPayload(name="C", base_updated_at=rec.updated_at),
        )
    assert exc.value.reason == "stale"


def test_upsert_force_overrides_a_stale_baseline():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="A"))
    svc.upsert_draft("u1", "batch-a", DraftPayload(name="B", base_updated_at=rec.updated_at))

    forced = svc.upsert_draft(
        "u1",
        "batch-a",
        DraftPayload(name="C", base_updated_at=rec.updated_at, force=True),
    )
    assert forced.name == "C"


def test_trash_and_restore():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="A"))

    trashed = svc.set_trashed("u1", rec.id, True)
    assert trashed.trashed is True
    assert svc.list_batches("u1")[0].trashed is True

    restored = svc.set_trashed("u1", rec.id, False)
    assert restored.trashed is False


def test_rename_draft_and_frozen_metadata():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="A"))

    renamed = svc.rename_batch("u1", rec.id, "Session IPA")
    assert renamed.name == "Session IPA"
    assert renamed.updated_at > rec.updated_at

    frozen = svc.freeze_batch("u1", rec.id, freeze_payload({"batch.target_abv": 5.5}))
    renamed_frozen = svc.rename_batch("u1", frozen.id, "Session IPA (v1)")
    assert renamed_frozen.name == "Session IPA (v1)"
    assert renamed_frozen.valuation == frozen.valuation


def test_rename_foreign_or_missing_is_404():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="A"))

    with pytest.raises(HTTPException) as foreign:
        svc.rename_batch("u2", rec.id, "Hijack")
    assert foreign.value.status_code == 404

    with pytest.raises(HTTPException) as missing:
        svc.rename_batch("u1", "missing", "Nope")
    assert missing.value.status_code == 404


def test_permanent_delete():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload())

    svc.delete_batch("u1", rec.id)
    assert svc.list_batches("u1") == []

    with pytest.raises(HTTPException) as exc:
        svc.get_batch("u1", rec.id)
    assert exc.value.status_code == 404


def test_foreign_and_missing_are_404():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload())

    with pytest.raises(HTTPException) as exc:
        svc.get_batch("u2", rec.id)
    assert exc.value.status_code == 404

    with pytest.raises(HTTPException) as exc:
        svc.get_batch("u1", "nope")
    assert exc.value.status_code == 404

    with pytest.raises(HTTPException) as exc:
        svc.delete_batch("u2", rec.id)
    assert exc.value.status_code == 404


def test_freeze_refuses_a_violated_blocking_finding_from_the_artifact():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload())
    payload = freeze_payload(
        report_inputs=ReportInputs(
            validation=ValidationBundle(
                relations=[
                    {
                        "id": "mash_tun_not_overfilled",
                        "holds": False,
                        "blocking": False,
                    }
                ]
            )
        )
    )

    with pytest.raises(HTTPException) as exc:
        svc.freeze_batch("u1", rec.id, payload)

    assert exc.value.status_code == 409
    assert "mash_tun_not_overfilled" in exc.value.detail
    assert svc.get_batch("u1", rec.id).status == "draft"


def test_freeze_allows_a_violated_non_blocking_finding():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload())
    payload = freeze_payload(
        report_inputs=ReportInputs(
            validation=ValidationBundle(
                relations=[
                    {
                        "id": "mash_thickness_below_ceiling",
                        "holds": False,
                        "blocking": False,
                    }
                ]
            )
        )
    )

    frozen = svc.freeze_batch("u1", rec.id, payload)
    assert frozen.status == "frozen"


def test_freeze_creates_immutable_linked_record():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="Saison", roots={"mash.grain_temp_c": 20}))

    frozen = svc.freeze_batch(
        "u1",
        rec.id,
        freeze_payload(
            {"mash.grain_temp_c": 20.0, "solver.batch": {"sg_post_boil": 1.055}},
            provenance={"batch.yeast": {"source_template_id": "y1", "source_revision": "abc"}},
        ),
    )
    assert frozen.status == "frozen"
    assert frozen.parent_batch_id == rec.id
    assert frozen.valuation["solver.batch"]["sg_post_boil"] == 1.055
    assert frozen.provenance["batch.yeast"]["source_template_id"] == "y1"

    # the source draft is untouched and still editable
    assert svc.get_batch("u1", rec.id).status == "draft"


def test_cannot_freeze_twice():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload())
    frozen = svc.freeze_batch("u1", rec.id, freeze_payload())

    with pytest.raises(HTTPException) as exc:
        svc.freeze_batch("u1", frozen.id, freeze_payload())
    assert exc.value.status_code == 409


def test_fork_from_frozen_carries_state_and_lineage():
    svc = BatchService(FakeRepo())
    draft = svc.upsert_draft("u1", "batch-a", DraftPayload(name="Saison", roots={"mash.grain_temp_c": 20}))
    frozen = svc.freeze_batch(
        "u1", draft.id, freeze_payload({"batch.target_abv": 5.5})
    )

    # a frozen batch keeps the editable state for lossless forking
    assert frozen.roots == {"mash.grain_temp_c": 20}

    fork = svc.upsert_draft(
        "u1",
        "fork-a",
        DraftPayload(
            name="Saison (copy)",
            parent_batch_id=frozen.id,
            roots=frozen.roots,
            collections=frozen.collections,
        ),
    )
    assert fork.parent_batch_id == frozen.id
    assert fork.roots == {"mash.grain_temp_c": 20}


def test_freeze_emits_a_valid_report_bundle():
    repo = FakeRepo()
    svc = BatchService(repo)
    rec = svc.upsert_draft(
        "u1",
        "batch-a",
        DraftPayload(name="Saison", roots={"mash.grain_temp_c": 20}, schema_version=4),
    )

    frozen = svc.freeze_batch(
        "u1",
        rec.id,
        freeze_payload(
            {"mash.grain_temp_c": 20.0, "solver.batch": {"sg_post_boil": 1.055}},
            provenance={"batch.yeast": {"source_template_id": "y1"}},
            report_inputs=ReportInputs(
                validation=ValidationBundle(
                    relations=[{"id": "hlt_not_overfilled", "holds": True}]
                ),
                telemetry={
                    "solver.batch": BoundaryTelemetry(
                        binding="batch_sparge_solver",
                        fingerprint="sha256:fp",
                        warnings=["thin mash"],
                    )
                },
            ),
            catalog=CatalogContent(
                dimensions={
                    "temperature": DimensionSpec(base_unit="degC", kind="affine"),
                },
                nodes={
                    "mash.grain_temp_c": NodePresentation(
                        label="Grain temperature",
                        dimension="temperature",
                        unit="degC",
                        symbol="°C",
                        decimals=1,
                    ),
                    "solver.batch": NodePresentation(label="Batch solver"),
                    "solver.batch.sg_post_boil": NodePresentation(
                        label="Post-boil gravity",
                        dimension="gravity",
                        unit="SG",
                        symbol="SG",
                        decimals=3,
                    ),
                },
            ),
        ),
    )

    bundle = parse_bundle(repo.bundles[frozen.id])
    assert bundle.bundle_format == 7
    assert bundle.batch.id == frozen.id
    assert bundle.batch.parent_batch_id == rec.id
    assert bundle.batch.name == "Saison"
    assert bundle.batch.frozen_at == frozen.frozen_at
    assert bundle.artifact.schema_version == load_artifact()["schema_version"]
    assert bundle.artifact.hash.startswith("sha256:")
    assert bundle.catalog.hash.startswith("sha256:")
    assert bundle.catalog.nodes["mash.grain_temp_c"].dimension == "temperature"
    assert bundle.state.valuation["mash.grain_temp_c"] == 20.0
    assert bundle.state.valuation["solver.batch"]["sg_post_boil"] == 1.055
    assert bundle.state.roots == {"mash.grain_temp_c": 20}
    assert bundle.state.provenance == {"batch.yeast": {"source_template_id": "y1"}}
    assert bundle.validation.relations[0]["holds"] is True
    assert bundle.telemetry["solver.batch"].fingerprint == "sha256:fp"
    assert bundle.telemetry["solver.batch"].warnings == ["thin mash"]
    assert bundle.content_hash.startswith("sha256:")


def test_freeze_rejects_a_bundle_that_cannot_be_sealed():
    svc = BatchService(FakeRepo())
    rec = svc.upsert_draft("u1", "batch-a", DraftPayload(name="A"))

    with pytest.raises(HTTPException) as exc:
        svc.freeze_batch("u1", rec.id, freeze_payload({"nope": 1}))
    assert exc.value.status_code == 422
    assert "undeclared nodes" in exc.value.detail
