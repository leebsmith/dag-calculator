"""Recipe import orchestration: document to transcription, shortlists to picks.

Two operations, both stateless:

- ``extract_recipe`` reads one PDF, asks the extraction prompt, and wraps the
  validated payload with server provenance (file hash, model, prompt version).
- ``match_candidates`` tie-breaks screened shortlists and enforces the contract
  the model cannot enforce about itself: every returned id came from the caller,
  and no single standard product crowds out the rest.

Neither operation writes state, and neither is aware of the ledger. The record,
the gate and the commit are the caller's business.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

from pydantic import ValidationError

from app.schemas.recipe_import import (
    ExtractedRecipe,
    ExtractionPayload,
    GapFillPayload,
    GapFillRequest,
    MatchRequest,
    MatchResponse,
    SourceMeta,
    TargetName,
    Targets,
)
from app.services import extraction_check, gemini, pdf_text

MAX_PICKS = 5
MAX_PER_STANDARD = 2


class NoRecipeFound(Exception):
    """A document with no recipe in it. Refused rather than filled with a placeholder."""

    def __init__(self) -> None:
        super().__init__("this document contains no recipe")
        self.titles: list[str] = []


class AmbiguousDocument(Exception):
    """A file that reads as more than one recipe; refused, never narrowed."""

    def __init__(self, titles: list[str]) -> None:
        super().__init__("this document reads as more than one recipe: " + "; ".join(titles))
        self.titles = titles


class ExtractionContractError(Exception):
    """The provider answered with a value the contract cannot hold."""


class MatchContractError(Exception):
    """The provider proposed something the caller did not offer."""


def extract_recipe(
    path: Path,
    *,
    cache: bool = True,
    refresh: bool = False,
) -> ExtractedRecipe:
    """Transcribe one recipe document, with provenance."""
    record, _ = extract_recipe_captured(path, cache=cache, refresh=refresh)
    return record


def extract_recipe_captured(
    path: Path,
    *,
    cache: bool = True,
    refresh: bool = False,
) -> tuple[ExtractedRecipe, gemini.RawGeneration]:
    """As ``extract_recipe``, also returning the provider body for promotion."""
    data = path.read_bytes()
    raw = gemini.generate_raw("extract", [gemini.inline_pdf(path)], cache=cache, refresh=refresh)
    try:
        payload = ExtractionPayload.model_validate(
            gemini.parse_json(gemini.response_text(raw.body))
        )
    except ValidationError as exc:
        first = exc.errors()[0]
        location = ".".join(str(part) for part in first.get("loc", ()))
        raise ExtractionContractError(f"{location}: {first.get('msg')}") from exc
    if not payload.detected_recipes:
        raise NoRecipeFound()
    if len(payload.detected_recipes) > 1:
        raise AmbiguousDocument([recipe.title for recipe in payload.detected_recipes])
    record = ExtractedRecipe(
        source=SourceMeta(
            filename=path.name,
            sha256=hashlib.sha256(data).hexdigest(),
            page_count=_page_count(data),
            model=str(raw.request_meta["model"]),
            prompt_id="extract",
            prompt_version=int(raw.request_meta["prompt_version"]),
            extracted_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        ),
        payload=payload,
    )
    return extraction_check.verify(record, data), raw


def match_candidates(
    request: MatchRequest,
    *,
    cache: bool = True,
    refresh: bool = False,
) -> MatchResponse:
    """Tie-break screened shortlists, then enforce the subset and diversity rules."""
    response, _ = match_candidates_captured(request, cache=cache, refresh=refresh)
    return response


def match_candidates_captured(
    request: MatchRequest,
    *,
    cache: bool = True,
    refresh: bool = False,
) -> tuple[MatchResponse, gemini.RawGeneration]:
    """As ``match_candidates``, also returning the provider body for promotion."""
    body = request.model_dump(mode="json")
    raw = gemini.generate_raw(
        "match", gemini.text_parts([json.dumps(body, ensure_ascii=False)]), cache=cache,
        refresh=refresh,
    )
    response = MatchResponse.model_validate(gemini.parse_json(gemini.response_text(raw.body)))
    _assert_supplied_ids(request, response)
    return _cap_per_standard(request, response), raw


def gap_fill(
    path: Path,
    request: GapFillRequest,
    *,
    cache: bool = True,
    refresh: bool = False,
) -> tuple[Targets, gemini.RawGeneration]:
    """Re-read one document for the requested scalars, and nothing else.

    The document is sent whole: without a PDF library we cannot slice a page
    range, so ``page_hint`` narrows the model's attention, not the payload. A
    gap fill therefore costs another full pass, which is why it is a deliberate
    action rather than an automatic retry.
    """
    body = request.model_dump(mode="json")
    raw = gemini.generate_raw(
        "gapfill",
        _gap_fill_parts(path, body, request.page_hint),
        cache=cache,
        refresh=refresh,
    )
    payload = GapFillPayload.model_validate(gemini.parse_json(gemini.response_text(raw.body)))
    return _requested_only(request.missing, payload.targets), raw


def _gap_fill_parts(path: Path, body: dict, page_hint: str | None) -> list[dict]:
    """Page text when the document has a text layer, the rendered PDF when it does not.

    The text path is roughly ten times cheaper and quotes exact glyphs, which is
    what a re-read for one number wants. A scan has no text to send, so it keeps
    the whole-document pass.
    """
    parts = [*gemini.text_parts([json.dumps(body, ensure_ascii=False)])]
    try:
        pages = pdf_text.page_texts(path.read_bytes())
    except pdf_text.PdfTextError:
        pages = []
    if pdf_text.has_text_layer(pages):
        wanted = pdf_text.parse_page_range(page_hint, len(pages))
        parts.append({"text": pdf_text.page_marked_text(pages, wanted)})
        return parts
    parts.append(gemini.inline_pdf(path))
    return parts


def _requested_only(missing: list[TargetName], filled: Targets) -> Targets:
    """Discard anything the re-read offered that the caller did not ask for."""
    wanted = {name.value for name in missing}
    keep = {
        name: getattr(filled, name)
        for name in Targets.model_fields
        if name in wanted and getattr(filled, name) is not None
    }
    return Targets(**keep)


def apply_gap_fill(payload: ExtractionPayload, filled: Targets) -> ExtractionPayload:
    """Merge a re-read into a transcription, filling only what was absent.

    A gap fill may never overwrite a value the first pass already stated: that
    would be a silent correction, and the review step is where corrections are
    made and attributed.
    """
    targets = payload.targets
    updates = {
        name: getattr(filled, name)
        for name in Targets.model_fields
        if getattr(filled, name) is not None and getattr(targets, name) is None
    }
    if not updates:
        return payload
    return payload.model_copy(update={"targets": targets.model_copy(update=updates)})


def _assert_supplied_ids(request: MatchRequest, response: MatchResponse) -> None:
    """A reply may only name ids the caller sent for that line."""
    offered = {item.text: {candidate.id for candidate in item.candidates} for item in request.items}
    for reply in response.items:
        allowed = offered.get(reply.text)
        if allowed is None:
            raise MatchContractError(f"the provider answered for an unasked line: {reply.text!r}")
        stray = [pick.id for pick in reply.picks if pick.id not in allowed]
        if stray:
            raise MatchContractError(f"the provider invented candidate ids: {stray}")


def _cap_per_standard(request: MatchRequest, response: MatchResponse) -> MatchResponse:
    """Keep at most two picks per standard product, preserving the model's order."""
    standards: dict[str, dict[str, str | None]] = {
        item.text: {candidate.id: candidate.standard for candidate in item.candidates}
        for item in request.items
    }
    trimmed = []
    for reply in response.items:
        seen: dict[str, int] = {}
        kept = []
        for pick in reply.picks[:MAX_PICKS]:
            standard = standards.get(reply.text, {}).get(pick.id)
            if standard is not None:
                seen[standard] = seen.get(standard, 0) + 1
                if seen[standard] > MAX_PER_STANDARD:
                    continue
            kept.append(pick)
        trimmed.append(reply.model_copy(update={"picks": kept}))
    return response.model_copy(update={"items": trimmed})


def _page_count(data: bytes) -> int | None:
    """Best-effort page count without a PDF dependency.

    The page tree's ``/Count`` is the largest count in the file; anything else we
    cannot read is reported as absent rather than guessed.
    """
    counts = [int(match) for match in re.findall(rb"/Count\s+(\d+)", data)]
    usable = [value for value in counts if 0 < value <= 10_000]
    return max(usable) if usable else None
