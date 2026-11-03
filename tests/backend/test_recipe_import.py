"""Service-level rules for the import seam: provenance, ambiguity, and the match
contract the provider cannot enforce about itself."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.recipe_import import (
    Candidate,
    MatchItem,
    MatchReason,
    MatchReply,
    MatchRequest,
    MatchResponse,
    Pick,
)
from app.services import gemini, recipe_import


def provider_body(payload: dict) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]}


def minimal_payload(**overrides) -> dict:
    payload = {
        "detected_recipes": [{"title": "Test Bitter", "pages": [1]}],
        "targets": {
            "volume": {"value": 20.0, "unit": "l", "verbatim": "20 L", "page": 1},
            "og": {"value": 1.042, "unit": "sg", "verbatim": "OG 1.042", "page": 1},
            "ibu": {"value": 32.0, "unit": "ibu", "verbatim": "32 IBU", "page": 1},
        },
    }
    payload.update(overrides)
    return payload


def write_pdf(tmp_path: Path, pages: int) -> Path:
    path = tmp_path / "page.pdf"
    path.write_bytes(b"%PDF-1.4\n1 0 obj << /Type /Pages /Count " + str(pages).encode() + b" >>\n")
    return path


def test_extract_wraps_provenance_and_checks_required_scalars(tmp_path, monkeypatch):
    monkeypatch.setattr(gemini, "generate_raw", lambda *_a, **_k: gemini.RawGeneration(
        provider_body(minimal_payload()),
        {"model": "test-flash", "prompt_id": "extract", "prompt_version": 7},
        False,
        "2026-11-03T00:00:00Z",
    ))
    record = recipe_import.extract_recipe(write_pdf(tmp_path, 2))
    assert record.source.filename == "page.pdf"
    assert len(record.source.sha256) == 64
    assert record.source.page_count == 2
    assert record.source.model == "test-flash"
    assert record.source.prompt_version == 7
    assert record.payload.missing_scalars() == []


def test_a_multi_recipe_document_is_refused_not_narrowed(tmp_path, monkeypatch):
    payload = minimal_payload(
        detected_recipes=[
            {"title": "First", "pages": [1]},
            {"title": "Second", "pages": [2]},
        ]
    )
    monkeypatch.setattr(gemini, "generate_raw", lambda *_a, **_k: gemini.RawGeneration(
        provider_body(payload),
        {"model": "test-flash", "prompt_id": "extract", "prompt_version": 1},
        False,
        "2026-11-03T00:00:00Z",
    ))
    with pytest.raises(recipe_import.AmbiguousDocument) as caught:
        recipe_import.extract_recipe(write_pdf(tmp_path, 2))
    assert caught.value.titles == ["First", "Second"]


def test_missing_scalars_are_reported_not_defaulted(tmp_path, monkeypatch):
    payload = minimal_payload(targets={})
    monkeypatch.setattr(gemini, "generate_raw", lambda *_a, **_k: gemini.RawGeneration(
        provider_body(payload),
        {"model": "test-flash", "prompt_id": "extract", "prompt_version": 1},
        False,
        "2026-11-03T00:00:00Z",
    ))
    record = recipe_import.extract_recipe(write_pdf(tmp_path, 1))
    assert record.payload.missing_scalars() == ["volume", "og", "ibu"]


def match_request() -> MatchRequest:
    return MatchRequest(
        kind="malt",
        items=[
            MatchItem(
                text="Weyermann Abbey",
                candidates=[
                    Candidate(id="a", name="Abbey Malt", standard="abbey"),
                    Candidate(id="b", name="Abbey Malt (Biscuit)", standard="abbey"),
                    Candidate(id="c", name="Abbey Extra", standard="abbey"),
                    Candidate(id="d", name="Munich Light", standard="munich"),
                ],
            )
        ],
    )


def test_a_reply_may_only_name_supplied_ids():
    response = MatchResponse(items=[MatchReply(text="Weyermann Abbey", picks=[
        Pick(id="z", reason=MatchReason.NAME_SYNONYM),
    ])])
    with pytest.raises(recipe_import.MatchContractError):
        recipe_import._assert_supplied_ids(match_request(), response)


def test_a_reply_for_an_unasked_line_is_refused():
    response = MatchResponse(items=[MatchReply(text="Some other malt", picks=[])])
    with pytest.raises(recipe_import.MatchContractError):
        recipe_import._assert_supplied_ids(match_request(), response)


def test_diversity_cap_keeps_order_and_drops_the_third_of_a_standard():
    response = MatchResponse(items=[MatchReply(text="Weyermann Abbey", picks=[
        Pick(id="a"),
        Pick(id="b"),
        Pick(id="c"),
        Pick(id="d"),
    ])])
    trimmed = recipe_import._cap_per_standard(match_request(), response)
    assert [pick.id for pick in trimmed.items[0].picks] == ["a", "b", "d"]


def test_a_match_reply_cannot_repeat_a_candidate():
    with pytest.raises(ValueError):
        MatchReply(text="x", picks=[Pick(id="a"), Pick(id="a")])


def test_page_count_is_best_effort_and_never_guessed():
    assert recipe_import._page_count(b"<</Type /Pages /Count 12>>") == 12
    assert recipe_import._page_count(b"no counts here") is None
