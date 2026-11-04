"""Import service policy: decode, dedupe, transitions, and the committed guard.

Everything here is offline. The extractor is stubbed, so what is under test is the
service's own contract — what it accepts, what it refuses, and what it will never
let a record do after commit.
"""

from __future__ import annotations

import base64
import hashlib

import pytest
from conftest import FakeImportRepo

from app.schemas.import_record import (
    CreateImportRequest,
    ImportStatus,
    UpdateImportRequest,
)
from app.schemas.recipe_import import ExtractedRecipe, ExtractionPayload, SourceMeta
from app.services import import_service, recipe_import
from app.services.import_service import (
    DuplicateImport,
    ImportConflict,
    ImportNotFound,
    ImportPayloadError,
    ImportService,
)

PDF = b"%PDF-1.4\n1 0 obj << /Type /Pages /Count 1 >>\n%%EOF\n"


def canned_record(data: bytes) -> tuple[ExtractedRecipe, object]:
    return ExtractedRecipe(
        source=SourceMeta(
            filename="page.pdf",
            sha256=hashlib.sha256(data).hexdigest(),
            page_count=1,
            model="test-flash",
            prompt_id="extract",
            prompt_version=1,
            extracted_at="2026-11-03T00:00:00Z",
        ),
        payload=ExtractionPayload.model_validate({
            "detected_recipes": [{"title": "Test Bitter", "pages": [1]}],
            "targets": {
                "volume": {"value": 20.0, "unit": "l", "verbatim": "20 L", "page": 1},
                "og": {"value": 1.042, "unit": "sg", "verbatim": "1.042", "page": 1},
                "ibu": {"value": 32.0, "unit": "ibu", "verbatim": "32 IBU", "page": 1},
            },
        }),
    ), None


def upload(content: bytes = PDF, **overrides) -> CreateImportRequest:
    body = {
        "filename": "page.pdf",
        "content_base64": base64.b64encode(content).decode("ascii"),
    }
    body.update(overrides)
    return CreateImportRequest(**body)


@pytest.fixture
def service(monkeypatch) -> ImportService:
    monkeypatch.setattr(
        recipe_import, "extract_recipe_bytes", lambda data, name, **_k: canned_record(data)
    )
    return ImportService(FakeImportRepo())


def test_create_stores_the_transcription(service):
    record = service.create("u1", upload())
    assert record.status == ImportStatus.EXTRACTED
    assert record.extract.source.filename == "page.pdf"
    assert record.extract.source.sha256 == hashlib.sha256(PDF).hexdigest()
    assert record.ledger == [] and record.suggestions == []
    assert record.batch_id is None


def test_reuploading_the_same_document_is_a_pointer_not_a_copy(service):
    first = service.create("u1", upload())
    with pytest.raises(DuplicateImport) as caught:
        service.create("u1", upload())
    assert caught.value.import_id == first.id


def test_force_creates_a_second_record(service):
    first = service.create("u1", upload())
    second = service.create("u1", upload(force=True))
    assert second.id != first.id
    assert len(service.list("u1")) == 2


def test_duplicate_detection_is_per_user(service):
    service.create("u1", upload())
    assert service.create("u2", upload()).id


def test_an_identity_must_be_complete(service):
    with pytest.raises(ImportPayloadError):
        service.create("u1", upload(identity={"style": {"name": "Bitter"}}))


def test_a_complete_identity_is_stored(service):
    identity = {"style": {"name": "Bitter"}, "equipment": {"name": "Rig"}}
    record = service.create("u1", upload(identity=identity))
    assert record.identity == identity


@pytest.mark.parametrize("content", [b"not a pdf at all", b"<html></html>"])
def test_only_pdfs_are_accepted(content):
    with pytest.raises(ImportPayloadError):
        import_service.decode_document(base64.b64encode(content).decode("ascii"))


def test_an_empty_upload_never_reaches_the_decoder():
    with pytest.raises(ValueError):
        CreateImportRequest(filename="x.pdf", content_base64="")


def test_malformed_base64_is_refused():
    with pytest.raises(ImportPayloadError):
        import_service.decode_document("not base64!!")


def test_an_oversized_document_is_refused():
    oversized = b"%PDF" + b"0" * (import_service.MAX_DOCUMENT_BYTES + 1)
    with pytest.raises(ImportPayloadError):
        import_service.decode_document(base64.b64encode(oversized).decode("ascii"))


def test_status_moves_only_along_the_flow(service):
    record = service.create("u1", upload())
    moved = service.update("u1", record.id, UpdateImportRequest(status=ImportStatus.MAPPING))
    assert moved.status == ImportStatus.MAPPING
    with pytest.raises(ImportConflict):
        service.update("u1", record.id, UpdateImportRequest(status=ImportStatus.COMMITTED))


def test_identity_and_ledger_are_editable_before_commit(service):
    record = service.create("u1", upload())
    identity = {"style": {"name": "Bitter"}, "equipment": {"name": "Rig"}}
    ledger = [{"line_id": "l1", "decision": "mapped"}]
    updated = service.update(
        "u1", record.id, UpdateImportRequest(identity=identity, ledger=ledger)
    )
    assert updated.identity == identity
    assert updated.ledger == ledger


def test_a_committed_record_is_immutable_and_undeletable(service):
    record = service.create("u1", upload())
    repo = service._repo
    repo.docs["u1"][record.id]["status"] = ImportStatus.COMMITTED.value
    with pytest.raises(ImportConflict):
        service.update("u1", record.id, UpdateImportRequest(ledger=[]))
    with pytest.raises(ImportConflict):
        service.delete("u1", record.id)


def test_delete_removes_an_open_record(service):
    record = service.create("u1", upload())
    service.delete("u1", record.id)
    assert service.list("u1") == []


def test_another_users_record_is_not_found(service):
    record = service.create("u1", upload())
    with pytest.raises(ImportNotFound):
        service.get("u2", record.id)


def test_an_unreadable_record_does_not_break_the_queue(service, caplog):
    good = service.create("u1", upload())
    service._repo.docs["u1"]["broken"] = {"id": "broken", "status": "extracted"}
    records = service.list("u1")
    assert [record.id for record in records] == [good.id]
    assert "skipping unreadable import record id=broken" in caplog.text


def test_failing_a_record_keeps_why_and_freezes_it(service):
    record = service.create("u1", upload())
    failed = service.update(
        "u1",
        record.id,
        UpdateImportRequest(
            status=ImportStatus.FAILED,
            failure_reason="no batch quantities: stated per 10 hL",
        ),
    )
    assert failed.status == ImportStatus.FAILED
    assert failed.failure_reason.startswith("no batch quantities")
    assert failed.extract.payload.detected_recipes, "the interpretation is kept"
    with pytest.raises(ImportConflict):
        service.update("u1", record.id, UpdateImportRequest(ledger=[]))


def test_a_failed_record_still_deletes(service):
    record = service.create("u1", upload())
    service.update("u1", record.id, UpdateImportRequest(status=ImportStatus.FAILED))
    service.delete("u1", record.id)
    assert service.list("u1") == []


def test_the_duplicate_pointer_says_how_it_failed(service):
    first = service.create("u1", upload())
    service.update("u1", first.id, UpdateImportRequest(
        status=ImportStatus.FAILED, failure_reason="stated per 10 hL"))
    with pytest.raises(DuplicateImport) as caught:
        service.create("u1", upload())
    assert caught.value.import_id == first.id
    assert caught.value.status == "failed"
    assert caught.value.failure_reason == "stated per 10 hL"


BEERXML = (
    b"<?xml version='1.0'?><RECIPES><RECIPE>"
    b"<NAME>Test Bitter</NAME><BATCH_SIZE>20</BATCH_SIZE><OG>1.042</OG>"
    b"<FERMENTABLES><FERMENTABLE><NAME>Pale</NAME><AMOUNT>4</AMOUNT>"
    b"<AMOUNT_IS_WEIGHT>TRUE</AMOUNT_IS_WEIGHT><TYPE>Grain</TYPE></FERMENTABLE></FERMENTABLES>"
    b"</RECIPE></RECIPES>"
)


def test_a_beerxml_upload_takes_the_parser_path(service, monkeypatch):
    """No provider call: the format is read, not interpreted."""
    calls = []
    monkeypatch.setattr(
        recipe_import, "extract_recipe_bytes", lambda *a, **k: calls.append(a) or canned_record(b"")
    )
    import base64

    record = service.create(
        "u1",
        CreateImportRequest(
            filename="bitter.xml",
            content_base64=base64.b64encode(BEERXML).decode(),
        ),
    )
    assert calls == [], "the LLM was never asked"
    assert record.extract.source.extractor == "beerxml"
    assert record.extract.source.model is None
    assert record.extract.payload.fermentables[0].name == "Pale"
    assert record.extract.payload.targets.og.value == 1.042


def test_a_broken_beerxml_file_is_a_payload_error(service):
    import base64

    with pytest.raises(ImportPayloadError):
        service.create(
            "u1",
            CreateImportRequest(
                filename="broken.xml",
                content_base64=base64.b64encode(b"<?xml version='1.0'?><RECIPES>").decode(),
            ),
        )
