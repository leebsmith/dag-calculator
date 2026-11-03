"""Prompt assets: manifest, text, and the derived Gemini response schema.

Prompts are assets, not string literals. They live beside the templates the
report renderer ships (package-relative), carry a version and a content hash in
``manifest.json``, and own exactly one response model each. The wire schema the
provider sees is *derived* from that pydantic model here, so the shape has one
definition and a change to it is a diff in the committed snapshot, never a
runtime surprise.

Editing a prompt without bumping ``version`` and re-recording ``sha256`` is a
guard failure by design: an extract is only interpretable alongside the prompt
that produced it.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.schemas.recipe_import import ExtractionPayload, GapFillPayload, MatchResponse

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

RESPONSE_MODELS: dict[str, type[BaseModel]] = {
    "extract": ExtractionPayload,
    "match": MatchResponse,
    "gapfill": GapFillPayload,
}

# Keys a Gemini response schema does not accept, or that would bias the model.
# ``exclusiveMinimum``/``exclusiveMaximum`` have no wire equivalent here; the
# pydantic model remains the strict validator.
_DROPPED = {
    "$defs",
    "$ref",
    "additionalProperties",
    "const",
    "default",
    "examples",
    "exclusiveMaximum",
    "exclusiveMinimum",
    "pattern",
}


class PromptAssetError(Exception):
    """A prompt asset is missing, misnamed, or out of step with its manifest hash."""


@dataclass(frozen=True)
class PromptEntry:
    """One manifest entry, resolved."""

    prompt_id: str
    version: int
    model: str
    temperature: float
    thinking_budget: int
    sha256: str
    text: str


@lru_cache(maxsize=1)
def load_manifest() -> dict[str, Any]:
    """Read and shape-check ``manifest.json`` once per process."""
    path = PROMPTS_DIR / "manifest.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PromptAssetError(f"prompt manifest missing at {path}") from exc
    prompts = manifest.get("prompts")
    if not isinstance(prompts, dict) or not prompts:
        raise PromptAssetError("manifest.json declares no prompts")
    unknown = set(prompts) - set(RESPONSE_MODELS)
    if unknown:
        raise PromptAssetError(f"manifest declares prompts with no response model: {sorted(unknown)}")
    return manifest


def entry(prompt_id: str) -> PromptEntry:
    """Resolve one prompt, verifying its text against the recorded hash."""
    prompts = load_manifest()["prompts"]
    if prompt_id not in prompts:
        raise PromptAssetError(f"no prompt named {prompt_id!r}")
    record = prompts[prompt_id]
    path = PROMPTS_DIR / str(record["file"])
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise PromptAssetError(f"prompt file missing at {path}") from exc
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    if digest != record["sha256"]:
        raise PromptAssetError(
            f"prompt {prompt_id!r} does not match its manifest hash: "
            f"file is {digest}, manifest records {record['sha256']}. "
            "Bump the version and re-record the hash."
        )
    return PromptEntry(
        prompt_id=prompt_id,
        version=int(record["version"]),
        model=str(record["model"]),
        temperature=float(record["temperature"]),
        thinking_budget=int(record["thinking_budget"]),
        sha256=digest,
        text=text,
    )


def prompt_ids() -> list[str]:
    """Declared prompt ids, sorted for a stable interface."""
    return sorted(load_manifest()["prompts"])


def response_model(prompt_id: str) -> type[BaseModel]:
    """The pydantic model that defines this prompt's wire shape."""
    try:
        return RESPONSE_MODELS[prompt_id]
    except KeyError as exc:
        raise PromptAssetError(f"no response model for prompt {prompt_id!r}") from exc


# -----------------------------------------------------------------------------
# Pydantic -> Gemini response schema
# -----------------------------------------------------------------------------

def gemini_schema(prompt_id: str) -> dict[str, Any]:
    """Derive the flattened ``responseSchema`` for one prompt's response model."""
    raw = response_model(prompt_id).model_json_schema()
    defs = raw.get("$defs", {})
    resolved = _resolve_refs(raw, defs)
    resolved.pop("$defs", None)
    return _clean(_flatten_nullable(resolved))


def _resolve_refs(node: Any, defs: dict[str, Any]) -> Any:
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str):
            target = defs.get(ref.rsplit("/", 1)[-1], {})
            merged = {**_resolve_refs(target, defs), **{k: v for k, v in node.items() if k != "$ref"}}
            return merged
        return {k: _resolve_refs(v, defs) for k, v in node.items()}
    if isinstance(node, list):
        return [_resolve_refs(item, defs) for item in node]
    return node


def _flatten_nullable(node: Any) -> Any:
    """Turn ``anyOf [T, null]`` into ``T`` with ``nullable: true``."""
    if isinstance(node, list):
        return [_flatten_nullable(item) for item in node]
    if not isinstance(node, dict):
        return node
    node = {k: _flatten_nullable(v) for k, v in node.items()}
    branches = node.pop("anyOf", None)
    if isinstance(branches, list) and len(branches) == 2:
        nulls = [b for b in branches if b.get("type") == "null"]
        others = [b for b in branches if b.get("type") != "null"]
        if len(nulls) == 1 and len(others) == 1:
            merged = {**others[0], **node, "nullable": True}
            return merged
    if branches is not None:
        node["anyOf"] = branches
    return node


def _clean(node: Any) -> Any:
    """Drop unsupported keys and pin property order to the model's declaration."""
    if isinstance(node, list):
        return [_clean(item) for item in node]
    if not isinstance(node, dict):
        return node
    out = {k: _clean(v) for k, v in node.items() if k not in _DROPPED}
    properties = out.get("properties")
    if isinstance(properties, dict) and "type" in out:
        out["propertyOrdering"] = list(properties)
    return out
