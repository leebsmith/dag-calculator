"""The text-layer sidecar and the number check.

The check is a narrow instrument: does a reported number appear in the page text?
These tests pin that narrowness, because widening it would turn a review aid into
a second opinion about the recipe.
"""

from __future__ import annotations

from pathlib import Path

from app.schemas.recipe_import import (
    ExtractedRecipe,
    ExtractionPayload,
    SourceMeta,
)
from app.services import extraction_check, pdf_text, recipe_import

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "llm"


def payload(**targets) -> ExtractionPayload:
    return ExtractionPayload.model_validate({
        "detected_recipes": [{"title": "Test", "pages": [1]}],
        "targets": targets,
    })


def record_for(payload_model: ExtractionPayload) -> ExtractedRecipe:
    return ExtractedRecipe(
        source=SourceMeta(
            filename="page.pdf",
            sha256="0" * 64,
            page_count=1,
            model="test-flash",
            prompt_id="extract",
            prompt_version=1,
            extracted_at="2026-11-03T00:00:00Z",
        ),
        payload=payload_model,
    )


def test_render_offers_the_printed_forms() -> None:
    assert "20" in extraction_check.render(20.0)
    assert extraction_check.render(1.065)[0] == "1.065"
    assert "1,065" in extraction_check.render(1.065), "a decimal comma is still the same value"
    assert "4,5" in extraction_check.render(4.5)


def test_every_reported_number_is_checked() -> None:
    numbers = list(extraction_check.iter_numbers(ExtractionPayload.model_validate({
        "detected_recipes": [{"title": "T", "pages": [1]}],
        "targets": {"og": {"value": 1.048, "unit": "sg", "verbatim": "1.048", "page": 1}},
        "fermentables": [{"name": "Pale", "quantity": {"value": 4.5, "unit": "kg"},
                          "verbatim": "4.5 kg Pale", "page": 1}],
        "hops": [{"name": "Cascade", "quantity": {"value": 28, "unit": "g"},
                  "alpha_acid_pct": 5.5, "ibu_contribution": 26, "minutes": 60,
                  "verbatim": "28 g Cascade", "page": 2}],
        "mashes": [{"step_verbatim": "60 min at 65C", "duration_min": 60,
                    "temperature": {"value": 65, "unit": "c"}, "page": 3}],
    })))
    paths = [path for path, _value, _page in numbers]
    assert "targets.og" in paths
    assert "fermentables[0].quantity" in paths
    assert "hops[0].alpha_acid_pct" in paths
    assert "hops[0].ibu_contribution" in paths
    assert "mashes[0].temperature" in paths


def test_a_number_absent_from_the_page_is_flagged() -> None:
    model = payload(
        og={"value": 1.048, "unit": "sg", "verbatim": "1.048", "page": 1},
        ibu={"value": 99.0, "unit": "ibu", "verbatim": "99 IBU", "page": 1},
    )
    verification = extraction_check.check(model, ["Pale ale, OG 1.048, 35 IBU on page one " * 2])
    assert verification.text_layer is True
    assert verification.numbers_checked == 2
    assert [item.field for item in verification.unmatched] == ["targets.ibu"]
    assert verification.unmatched[0].value == "99"


def test_a_scan_reports_no_check_rather_than_passing() -> None:
    model = payload(og={"value": 1.048, "unit": "sg", "verbatim": "1.048", "page": 1})
    verification = extraction_check.check(model, ["", "   "])
    assert verification.text_layer is False
    assert verification.numbers_checked == 0
    assert verification.unmatched == []


def test_verify_attaches_the_check_when_a_text_layer_exists(monkeypatch) -> None:
    model = record_for(payload(og={"value": 1.048, "unit": "sg", "verbatim": "1.048", "page": 1}))
    monkeypatch.setattr(pdf_text, "page_texts", lambda _data: ["OG: 1.048 " * 8])
    checked = extraction_check.verify(model, b"pdf")
    assert checked.verification is not None
    assert checked.verification.text_layer is True
    assert checked.verification.unmatched == []


def test_verify_leaves_an_unreadable_document_unchecked(monkeypatch) -> None:
    def refuse(_data: bytes) -> list[str]:
        raise pdf_text.PdfTextError("nope")

    monkeypatch.setattr(pdf_text, "page_texts", refuse)
    model = record_for(payload())
    assert extraction_check.verify(model, b"pdf").verification is None


def test_page_range_hints() -> None:
    assert pdf_text.parse_page_range("2", 9) == [2]
    assert pdf_text.parse_page_range("pages 2-3", 9) == [2, 3]
    assert pdf_text.parse_page_range("2–3", 9) == [2, 3]
    assert pdf_text.parse_page_range("11", 9) is None
    assert pdf_text.parse_page_range(None, 9) is None


def test_page_marked_text_keeps_attribution() -> None:
    text = pdf_text.page_marked_text(["one", "two", "three"], [2, 3])
    assert "--- page 2 ---" in text and "two" in text
    assert "one" not in text


def test_gap_fill_uses_page_text_when_the_document_has_one(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(pdf_text, "page_texts", lambda _data: ["targets: 5 gal " * 8, "page two " * 8])
    data = b"%PDF-1.4"
    parts = recipe_import._gap_fill_parts(data, "page.pdf", {"missing": ["volume"]}, "pages 1-2")
    assert any("--- page 1 ---" in str(part.get("text", "")) for part in parts)
    assert all("inline_data" not in part for part in parts), "a text layer must not re-send the PDF"


def test_gap_fill_falls_back_to_the_pdf_for_a_scan(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(pdf_text, "page_texts", lambda _data: ["", ""])
    data = b"%PDF-1.4"
    parts = recipe_import._gap_fill_parts(data, "scan.pdf", {"missing": ["volume"]}, None)
    assert any("inline_data" in part for part in parts)
