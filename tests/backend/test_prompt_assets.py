"""Guards: prompt assets, their derived wire schemas, and the captured fixtures.

The prompt is the one artifact whose change silently invalidates every stored
extraction's interpretation, so the hash and the schema snapshot are held to the
same standard the repo applies to generated docs: edit the asset without bumping
its version and re-recording the hash, and this file fails.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.recipe_import import ExtractionPayload
from app.services import gemini
from app.services.prompts import (
    PROMPTS_DIR,
    entry,
    gemini_schema,
    load_manifest,
    prompt_ids,
    response_model,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "llm"
SCHEMAS = FIXTURES / "schema"


def fixture_cases() -> list[Path]:
    return sorted(path for path in FIXTURES.iterdir() if (path / "meta.json").exists())


def test_every_declared_prompt_resolves_and_matches_its_hash() -> None:
    manifest = load_manifest()["prompts"]
    assert set(prompt_ids()) == set(manifest)
    for prompt_id in prompt_ids():
        asset = entry(prompt_id)
        assert asset.text.strip(), f"{prompt_id} has no text"
        assert (PROMPTS_DIR / manifest[prompt_id]["file"]).exists()


def test_a_prompt_edit_without_a_version_bump_is_refused(monkeypatch) -> None:
    from app.services import prompts

    stale = json.loads((PROMPTS_DIR / "manifest.json").read_text(encoding="utf-8"))
    stale["prompts"]["extract"]["sha256"] = "0" * 64
    monkeypatch.setattr(prompts, "load_manifest", lambda: stale)
    with pytest.raises(prompts.PromptAssetError):
        prompts.entry("extract")


def test_every_prompt_declares_a_strict_response_model() -> None:
    for prompt_id in prompt_ids():
        model = response_model(prompt_id)
        assert model.model_config.get("extra") == "forbid"
        assert model.model_config.get("frozen") is True


def test_schema_snapshot_matches_the_model() -> None:
    for prompt_id in prompt_ids():
        path = SCHEMAS / f"{prompt_id}.json"
        assert path.exists(), f"missing schema snapshot for {prompt_id}"
        recorded = json.loads(path.read_text(encoding="utf-8"))
        assert recorded == gemini_schema(prompt_id), (
            f"{prompt_id} wire schema drifted from its pydantic model: "
            "regenerate with scripts/extract_recipe.py --dump-schemas"
        )


def test_wire_schema_is_flattened() -> None:
    for prompt_id in prompt_ids():
        text = json.dumps(gemini_schema(prompt_id))
        assert "$ref" not in text
        assert "$defs" not in text
        assert "anyOf" not in text


def test_fixtures_name_a_version_the_manifest_knows() -> None:
    assert fixture_cases(), "no captured fixtures"
    manifest = load_manifest()["prompts"]
    for case in fixture_cases():
        meta = json.loads((case / "meta.json").read_text(encoding="utf-8"))
        assert meta["prompt_id"] in manifest, case.name
        assert meta["prompt_version"] == manifest[meta["prompt_id"]]["version"], (
            f"{case.name} was captured under a prompt version that no longer exists"
        )
        assert (case / "response.json").exists(), case.name


def test_fixtures_replay_without_a_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_args, **_kwargs):
        raise AssertionError("a fixture replay must not reach the provider")

    monkeypatch.setattr(gemini.httpx, "post", refuse)
    for case in fixture_cases():
        meta = json.loads((case / "meta.json").read_text(encoding="utf-8"))
        body = json.loads((case / "response.json").read_text(encoding="utf-8"))
        model = response_model(meta["prompt_id"])
        payload = model.model_validate(gemini.parse_json(gemini.response_text(body)))
        assert payload is not None


def test_extraction_fixture_keeps_its_known_limits() -> None:
    case = FIXTURES / "self-report"
    meta = json.loads((case / "meta.json").read_text(encoding="utf-8"))
    assert "note" in meta
    body = json.loads((case / "response.json").read_text(encoding="utf-8"))
    payload = ExtractionPayload.model_validate(
        gemini.parse_json(gemini.response_text(body))
    )
    assert len(payload.detected_recipes) == 1
    assert payload.missing_scalars() == []
    assert payload.fermentables
    assert payload.warnings, "the document states IBU with no hop schedule; warn, do not invent"
