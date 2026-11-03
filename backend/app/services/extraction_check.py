"""Mechanical verification of an extraction against the page text.

The extract prompt reads the document as a picture, which is why a scan works.
The cost of that choice is that nothing checks the numbers afterwards: the model
says 1.065 and we have no independent copy of the page to compare it with.

When a text layer exists, this module supplies that copy. It does not re-read the
recipe and it does not correct anything — it answers one narrow question per
reported number: *does this value appear in the document at all?* A number that
does not is either a printed value the text layer lost (a chart, an image caption)
or an invention, and either way it belongs in front of the user.
"""

from __future__ import annotations

from collections.abc import Iterator

from app.schemas.recipe_import import (
    ExtractedRecipe,
    ExtractionPayload,
    ExtractionVerification,
    Targets,
    UnmatchedNumber,
)
from app.services import pdf_text


def iter_numbers(payload: ExtractionPayload) -> Iterator[tuple[str, float, int | None]]:
    """Every reported number, with the field path it sits at and its claimed page."""
    yield from _target_numbers(payload.targets)
    yield from _quantity_numbers("fermentables", payload.fermentables)
    yield from _hop_numbers(payload.hops)
    yield from _yeast_numbers(payload.yeasts)
    yield from _mash_numbers(payload.mashes)
    yield from _quantity_numbers("unmodeled", payload.unmodeled)
    yield from _pool_numbers(payload.pool_ibu)


def _target_numbers(targets: Targets) -> Iterator[tuple[str, float, int | None]]:
    for name in Targets.model_fields:
        target = getattr(targets, name)
        if target is not None:
            yield f"targets.{name}", target.value, target.page


def _quantity_numbers(prefix: str, lines) -> Iterator[tuple[str, float, int | None]]:
    for index, line in enumerate(lines):
        if line.quantity is not None:
            yield f"{prefix}[{index}].quantity", line.quantity.value, line.page


def _hop_numbers(lines) -> Iterator[tuple[str, float, int | None]]:
    for index, line in enumerate(lines):
        if line.quantity is not None:
            yield f"hops[{index}].quantity", line.quantity.value, line.page
        for field in ("alpha_acid_pct", "ibu_contribution", "minutes"):
            value = getattr(line, field)
            if value is not None:
                yield f"hops[{index}].{field}", value, line.page
        if line.temperature is not None:
            yield f"hops[{index}].temperature", line.temperature.value, line.page


def _yeast_numbers(lines) -> Iterator[tuple[str, float, int | None]]:
    for index, line in enumerate(lines):
        if line.attenuation_pct is not None:
            yield f"yeasts[{index}].attenuation_pct", line.attenuation_pct, line.page
        for field in ("temp_low", "temp_high"):
            bound = getattr(line, field)
            if bound is not None:
                yield f"yeasts[{index}].{field}", bound.value, line.page


def _mash_numbers(lines) -> Iterator[tuple[str, float, int | None]]:
    for index, line in enumerate(lines):
        for field in ("duration_min", "temperature", "thickness"):
            value = getattr(line, field)
            if value is not None:
                yield f"mashes[{index}].{field}", getattr(value, "value", value), line.page


def _pool_numbers(pool) -> Iterator[tuple[str, float, int | None]]:
    if pool is None:
        return
    for name in ("boil", "whirlpool"):
        value = getattr(pool, name)
        if value is not None:
            yield f"pool_ibu.{name}", value, None


def render(value: float) -> list[str]:
    """The forms a printed number may take for the same value, plain form first."""
    plain = f"{value:g}"
    forms = [plain]
    decimal_comma = plain.replace(".", ",")
    if decimal_comma != plain:
        forms.append(decimal_comma)
    if plain.endswith(".0"):
        forms.append(plain[:-2])
    return forms


def check(payload: ExtractionPayload, pages: list[str]) -> ExtractionVerification:
    """Compare every reported number with the page text."""
    if not pdf_text.has_text_layer(pages):
        return ExtractionVerification(
            text_layer=False, pages=len(pages), numbers_checked=0, unmatched=[]
        )
    document = "\n".join(pages)
    checked = 0
    unmatched = []
    for field, value, page in iter_numbers(payload):
        checked += 1
        if any(form in document for form in render(value)):
            continue
        unmatched.append(UnmatchedNumber(field=field, value=render(value)[0], page=page))
    return ExtractionVerification(
        text_layer=True, pages=len(pages), numbers_checked=checked, unmatched=unmatched
    )


def verify(record: ExtractedRecipe, data: bytes) -> ExtractedRecipe:
    """Attach the check when the document has a readable text layer."""
    try:
        pages = pdf_text.page_texts(data)
    except pdf_text.PdfTextError:
        return record
    return record.model_copy(update={"verification": check(record.payload, pages)})
