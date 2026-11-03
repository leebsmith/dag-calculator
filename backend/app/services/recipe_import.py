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

from app.schemas.recipe_import import (
    ExtractedRecipe,
    ExtractionPayload,
    MatchRequest,
    MatchResponse,
    SourceMeta,
)
from app.services import gemini

MAX_PICKS = 5
MAX_PER_STANDARD = 2


class AmbiguousDocument(Exception):
    """A file that reads as more than one recipe; refused, never narrowed."""

    def __init__(self, titles: list[str]) -> None:
        super().__init__("this document reads as more than one recipe: " + "; ".join(titles))
        self.titles = titles


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
    payload = ExtractionPayload.model_validate(gemini.parse_json(gemini.response_text(raw.body)))
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
    return record, raw


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
