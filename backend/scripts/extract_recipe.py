"""Recipe-import CLI: the prompt iteration loop.

Three modes, all offline after the first call for a given prompt version:

    uv run python scripts/extract_recipe.py --pdf page.pdf
    uv run python scripts/extract_recipe.py --replay synthetic-report
    uv run python scripts/extract_recipe.py --pdf page.pdf --promote my-case

``--replay`` runs the parser and the contract against a captured provider body
with no client and no key, which is how the ledger and the mapping work are
debugged once extraction is settled. ``--promote`` copies the exact request that
produced a reply into ``tests/backend/fixtures/llm/<case>/``, so promotion is a
decision, not an accident.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.schemas.recipe_import import (
    ExtractedRecipe,
    ExtractionPayload,
    GapFillPayload,
    GapFillRequest,
    MatchRequest,
    MatchResponse,
    TargetName,
)
from app.services import gemini, recipe_import
from app.services.prompts import gemini_schema, prompt_ids

BACKEND = Path(__file__).resolve().parent.parent
FIXTURES = BACKEND.parent / "tests" / "backend" / "fixtures" / "llm"

MODELS = {"extract": ExtractionPayload, "match": MatchResponse, "gapfill": GapFillPayload}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pdf", type=Path, help="a PDF to transcribe")
    parser.add_argument("--match", type=Path, help="a MatchRequest JSON file")
    parser.add_argument(
        "--missing",
        metavar="NAMES",
        help="comma-separated scalars to re-read for, e.g. volume,og,ibu",
    )
    parser.add_argument("--page-hint", help="where the caller suspects a value is")
    parser.add_argument("--replay", metavar="CASE", help="replay a captured fixture")
    parser.add_argument("--promote", metavar="CASE", help="write the run to a fixture")
    parser.add_argument("--dump-schemas", action="store_true", help="refresh schema snapshots")
    parser.add_argument("--out", type=Path, help="write the result here instead of stdout")
    parser.add_argument("--no-cache", action="store_true", help="ignore the response cache")
    parser.add_argument("--refresh", action="store_true", help="re-call even if cached")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.dump_schemas:
        return dump_schemas()
    if args.replay:
        return replay(args.replay)
    if args.pdf and args.missing:
        return run_gap_fill(args)
    if args.pdf:
        return run_extract(args)
    if args.match:
        return run_match(args)
    print("nothing to do: pass --pdf, --match, --replay or --dump-schemas", file=sys.stderr)
    return 2


def run_extract(args: argparse.Namespace) -> int:
    if not args.pdf.exists():
        print(f"no such file: {args.pdf}", file=sys.stderr)
        return 2
    try:
        record, raw = recipe_import.extract_recipe_captured(
            args.pdf, cache=not args.no_cache, refresh=args.refresh
        )
    except (
        gemini.GeminiError,
        gemini.GeminiUnavailable,
        recipe_import.AmbiguousDocument,
        recipe_import.NoRecipeFound,
    ) as exc:
        print(f"extraction failed: {exc}", file=sys.stderr)
        if args.promote and isinstance(
            exc, (recipe_import.AmbiguousDocument, recipe_import.NoRecipeFound)
        ):
            refusal_fixture(args, exc)
        return 1
    emit(record.payload.model_dump(mode="json"), args.out)
    summarise(record)
    if args.promote:
        write_fixture(args.promote, "extract", raw)
    return 0


def run_gap_fill(args: argparse.Namespace) -> int:
    try:
        request = GapFillRequest(
            missing=[TargetName(name.strip()) for name in args.missing.split(",") if name.strip()],
            page_hint=args.page_hint,
        )
    except ValueError as exc:
        print(f"bad --missing list: {exc}", file=sys.stderr)
        return 2
    try:
        filled, raw = recipe_import.gap_fill(
            args.pdf, request, cache=not args.no_cache, refresh=args.refresh
        )
    except (gemini.GeminiError, gemini.GeminiUnavailable) as exc:
        print(f"gap fill failed: {exc}", file=sys.stderr)
        return 1
    emit(filled.model_dump(mode="json", exclude_none=True), args.out)
    still = [name.value for name in request.missing if getattr(filled, name.value) is None]
    print(
        f"gap fill: {len(request.missing) - len(still)} filled, "
        f"{len(still)} still absent{(': ' + ', '.join(still)) if still else ''}",
        file=sys.stderr,
    )
    if args.promote:
        write_fixture(args.promote, "gapfill", raw)
    return 0


def run_match(args: argparse.Namespace) -> int:
    request = MatchRequest.model_validate(json.loads(args.match.read_text(encoding="utf-8")))
    try:
        response, raw = recipe_import.match_candidates_captured(
            request, cache=not args.no_cache, refresh=args.refresh
        )
    except (gemini.GeminiError, gemini.GeminiUnavailable, recipe_import.MatchContractError) as exc:
        print(f"match failed: {exc}", file=sys.stderr)
        return 1
    emit(response.model_dump(mode="json"), args.out)
    picks = sum(len(reply.picks) for reply in response.items)
    print(f"match: {len(response.items)} line(s), {picks} pick(s)", file=sys.stderr)
    if args.promote:
        write_fixture(args.promote, "match", raw)
    return 0


def replay(case: str) -> int:
    directory = FIXTURES / case
    meta_path = directory / "meta.json"
    body_path = directory / "response.json"
    if not meta_path.exists() or not body_path.exists():
        print(f"no fixture at {directory}", file=sys.stderr)
        return 2
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    body = json.loads(body_path.read_text(encoding="utf-8"))
    model = MODELS.get(meta["prompt_id"])
    if model is None:
        print(f"fixture names an unknown prompt: {meta['prompt_id']}", file=sys.stderr)
        return 2
    payload = model.model_validate(gemini.parse_json(gemini.response_text(body)))
    if isinstance(payload, ExtractedRecipe):
        payload = payload.payload
    emit(payload.model_dump(mode="json"), None)
    print(f"replay: {case} ({meta['prompt_id']} v{meta['prompt_version']})", file=sys.stderr)
    return 0


def refusal_fixture(args: argparse.Namespace, exc: Exception) -> None:
    """Capture a refusal (no recipe, or several) from the cached reply."""
    raw = gemini.generate_raw("extract", [gemini.inline_pdf(args.pdf)], cache=True, refresh=False)
    write_fixture(args.promote, "extract", raw, note=f"refusal: {type(exc).__name__}")


def write_fixture(case: str, prompt_id: str, raw: gemini.RawGeneration, note: str = "capture") -> None:
    """Copy this exact request and reply into the committed fixture set."""
    directory = FIXTURES / case
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "response.json").write_text(json.dumps(raw.body, indent=2), encoding="utf-8")
    (directory / "meta.json").write_text(
        json.dumps(
            {
                "prompt_id": prompt_id,
                "prompt_version": int(raw.request_meta["prompt_version"]),
                "model": str(raw.request_meta["model"]),
                "captured_at": raw.captured_at,
                "note": note,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"promoted to {directory}", file=sys.stderr)


def dump_schemas() -> int:
    target = FIXTURES / "schema"
    target.mkdir(parents=True, exist_ok=True)
    for prompt_id in prompt_ids():
        path = target / f"{prompt_id}.json"
        path.write_text(json.dumps(gemini_schema(prompt_id), indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path}", file=sys.stderr)
    return 0


def emit(payload: dict, out: Path | None) -> None:
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    if out:
        out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {out}", file=sys.stderr)
        return
    print(text)


def summarise(record: ExtractedRecipe) -> None:
    payload = record.payload
    missing = payload.missing_scalars()
    print(
        "extract: "
        f"{len(payload.fermentables)} fermentable(s), {len(payload.hops)} hop(s), "
        f"{len(payload.yeasts)} yeast(s), {len(payload.mashes)} mash step(s), "
        f"{len(payload.unmodeled)} unmodeled, {len(payload.warnings)} warning(s)",
        file=sys.stderr,
    )
    print(
        f"source: {record.source.filename} · {record.source.page_count or '?'} page(s) · "
        f"{record.source.model} · prompt v{record.source.prompt_version}",
        file=sys.stderr,
    )
    if missing:
        print(f"missing required: {', '.join(missing)}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
