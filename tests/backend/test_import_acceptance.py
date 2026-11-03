"""Acceptance: one real document becomes one import record.

This is the test the plan's J.2 promised, and it is deliberately not a unit test of
anything. It starts from the captured provider reply for *Duel Master Black IPA*,
runs it through the real service (stubbed transport, real schema, real
verification), and asserts what the transcription screen will be handed: every
target with its phrase and page, eight hop rows with printed IBUs that sum to the
stated total, and a clean text check.

J.3 extends the same fixture through the ledger, J.4 through the gate.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest
from conftest import FakeImportRepo

from app.schemas.import_record import CreateImportRequest, ImportStatus
from app.schemas.recipe_import import ExtractedRecipe
from app.services import gemini, pdf_text
from app.services.import_service import ImportService

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "llm" / "pristine-black-ipa"
PRINTED_IBUS = [25.0, 20.0, 8.0, 7.0]
WHIRLPOOL_IBUS = {8.0, 7.0}


def fixture_bytes() -> tuple[dict, list[str]]:
    body = json.loads((FIXTURES / "response.json").read_text(encoding="utf-8"))
    pages = json.loads((FIXTURES / "page-text.json").read_text(encoding="utf-8"))
    return body, pages


@pytest.fixture
def recorded(monkeypatch) -> ExtractedRecipe:
    body, pages = fixture_bytes()
    monkeypatch.setattr(
        gemini,
        "generate_raw",
        lambda *_a, **_k: gemini.RawGeneration(
            body,
            {"model": "gemini-3.8-flash", "prompt_id": "extract", "prompt_version": 6},
            False,
            "2026-11-03T00:00:00Z",
        ),
    )
    monkeypatch.setattr(pdf_text, "page_texts", lambda _data: pages)
    service = ImportService(FakeImportRepo())
    record = service.create(
        "u1",
        CreateImportRequest(
            filename="duel-master-black-ipa.pdf",
            content_base64=base64.b64encode(b"%PDF-1.4 fixture\n%%EOF\n").decode("ascii"),
            identity={
                "style": {"id": "s1", "name": "Black IPA"},
                "equipment": {"id": "e1", "name": "20 L rig"},
                "water.source": {"id": "w1", "name": "Tap"},
            },
        ),
    )
    return record


def test_the_document_becomes_one_record(recorded):
    assert recorded.status == ImportStatus.EXTRACTED
    assert recorded.extract.source.filename == "duel-master-black-ipa.pdf"
    assert recorded.identity is not None and "equipment" in recorded.identity
    assert recorded.batch_id is None, "a record is not a batch until commit"


def test_the_review_screen_gets_a_phrase_and_a_page_for_every_target(recorded):
    targets = recorded.extract.payload.targets
    for name in ("volume", "og", "fg", "abv", "ibu", "boil_time_min"):
        target = getattr(targets, name)
        assert target is not None, name
        assert target.verbatim.strip(), name
        assert target.page >= 1, name


def test_the_hop_rows_carry_the_printed_ibus(recorded):
    hops = recorded.extract.payload.hops
    assert len(hops) == 8
    printed = [hop.ibu_contribution for hop in hops[:4]]
    assert printed == PRINTED_IBUS
    assert all(hop.ibu_contribution is None for hop in hops[4:])


def test_the_whirlpool_split_is_arithmetic_not_an_estimate(recorded):
    hops = recorded.extract.payload.hops
    total = recorded.extract.payload.targets.ibu.value
    whirlpool = sum(
        hop.ibu_contribution or 0.0
        for hop in hops
        if hop.ibu_contribution in WHIRLPOOL_IBUS
    )
    assert whirlpool + sum(PRINTED_IBUS[:2]) == pytest.approx(total)
    assert whirlpool / total == pytest.approx(0.25)


def test_the_text_check_passed_and_there_was_one_to_pass(recorded):
    verification = recorded.extract.verification
    assert verification is not None
    assert verification.text_layer is True
    assert verification.numbers_checked >= 25
    assert verification.unmatched == []


def test_the_record_is_storable_as_one_document(recorded):
    """Waterstore: the whole record survives JSON, because that is all Firestore keeps."""
    dumped = json.loads(json.dumps(recorded.model_dump(mode="json")))
    assert dumped["extract"]["payload"]["hops"][0]["ibu_contribution"] == 25.0
    assert dumped["extract"]["verification"]["unmatched"] == []
