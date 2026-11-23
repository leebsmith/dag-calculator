"""Gemini transport: one call, one JSON body, no authority of its own.

The client owns three things and nothing else: how a request is shaped, how a
response is unwrapped, and how failure surfaces. It never decides what a value
means — validation belongs to the pydantic response model, and application
belongs to the ledger.

Configuration is environment-only, matching the rest of this backend:
``GEMINI_API_KEY`` (required), ``GEMINI_BASE_URL`` and ``LLM_CACHE_DIR``
(optional). A missing key is a configuration failure, not an empty request.

The response cache exists so prompt iteration is not a round trip per run. It is
keyed by the prompt version and the request body, so editing a prompt cannot
replay a stale reply, and it lives outside the repository tree by default. The
test suite never reads it.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import time
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.services.prompts import entry, gemini_schema

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
REQUEST_TIMEOUT_S = 90.0
MAX_INLINE_BYTES = 14_000_000
_REPO_ROOT = Path(__file__).resolve().parents[3]


class GeminiUnavailable(Exception):
    """The client is not configured. The surface maps this to 503."""


class GeminiError(Exception):
    """The provider failed, or answered outside the contract. Maps to 502."""


class GeminiCreditsExhausted(GeminiError):
    """The provider refused for a billing or credit reason. Maps to 503."""


class GeminiKeyRejected(GeminiError):
    """The provider refused the key or its project. Maps to 503."""


logger = logging.getLogger("app.gemini")

_CREDIT_REASONS = {"BILLING_DISABLED", "BILLING_NOT_ACTIVE"}
_CREDIT_WORDS = (
    "credit",
    "billing",
    "prepay",
    "payment",
    "funds",
    "insufficient",
    "balance",
)
_KEY_REASONS = {
    "API_KEY_INVALID",
    "API_KEY_SERVICE_BLOCKED",
    "SERVICE_DISABLED",
    "PERMISSION_DENIED",
    "CONSUMER_INVALID",
    "CONSUMER_SUSPENDED",
    "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
}


@dataclass(frozen=True)
class Generation:
    """A validated model plus the provenance a record must carry."""

    payload: Any
    prompt_id: str
    prompt_version: int
    model: str
    cached: bool


@dataclass(frozen=True)
class RawGeneration:
    """The provider's own JSON body, kept for fixtures and promotion."""

    body: dict[str, Any]
    request_meta: dict[str, Any]
    cached: bool
    captured_at: str


def api_key() -> str:
    """The provider key, or a configuration failure."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise GeminiUnavailable("GEMINI_API_KEY is not set in the backend environment")
    return key


def base_url() -> str:
    return os.environ.get("GEMINI_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def cache_dir() -> Path:
    override = os.environ.get("LLM_CACHE_DIR", "").strip()
    return Path(override) if override else _REPO_ROOT / ".local" / "llm-cache"


def inline_pdf(path: Path) -> dict[str, Any]:
    """The document part for a file on disk."""
    return inline_pdf_bytes(path.read_bytes(), path.name)


def inline_pdf_bytes(data: bytes, name: str) -> dict[str, Any]:
    """The document part. Size is checked before the upload, not after."""
    if len(data) > MAX_INLINE_BYTES:
        raise GeminiError(
            f"{name} is {len(data) // 1_000_000} MB; the inline limit is "
            f"{MAX_INLINE_BYTES // 1_000_000} MB"
        )
    return {
        "inline_data": {
            "mime_type": "application/pdf",
            "data": base64.b64encode(data).decode("ascii"),
        }
    }


def build_request(prompt_id: str, parts: list[dict[str, Any]]) -> dict[str, Any]:
    """The generateContent body for one prompt and its parts."""
    asset = entry(prompt_id)
    generation_config: dict[str, Any] = {
        "temperature": asset.temperature,
        "responseMimeType": "application/json",
        "responseSchema": gemini_schema(prompt_id),
    }
    if asset.thinking_budget >= 0:
        generation_config["thinkingConfig"] = {"thinkingBudget": asset.thinking_budget}
    return {
        "model": asset.model,
        "prompt_id": prompt_id,
        "prompt_version": asset.version,
        "body": {
            "system_instruction": {"parts": [{"text": asset.text}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": generation_config,
        },
    }


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _cache_key(request: dict[str, Any]) -> str:
    material = json.dumps(
        {
            "model": request["model"],
            "prompt_id": request["prompt_id"],
            "prompt_version": request["prompt_version"],
            "body": request["body"],
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _cache_path(key: str) -> Path:
    return cache_dir() / f"{key}.json"


def generate_raw(
    prompt_id: str,
    parts: list[dict[str, Any]],
    *,
    cache: bool = True,
    refresh: bool = False,
) -> RawGeneration:
    """Call the provider, or replay an identical request from the local cache."""
    request = build_request(prompt_id, parts)
    key = _cache_key(request)
    path = _cache_path(key)
    if cache and not refresh and path.exists():
        try:
            stored = json.loads(path.read_text(encoding="utf-8"))
            return RawGeneration(
                stored["response"],
                request,
                cached=True,
                captured_at=str(stored["request"].get("captured_at", _now())),
            )
        except (json.JSONDecodeError, KeyError):
            path.unlink(missing_ok=True)
    body = _post(request)
    if cache:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "request": {
                        "prompt_id": prompt_id,
                        "prompt_version": request["prompt_version"],
                        "model": request["model"],
                        "captured_at": _now(),
                    },
                    "response": body,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    return RawGeneration(body, request, cached=False, captured_at=_now())


def _post(request: dict[str, Any]) -> dict[str, Any]:
    url = f"{base_url()}/models/{request['model']}:generateContent"
    try:
        response = httpx.post(
            url,
            headers={"x-goog-api-key": api_key(), "content-type": "application/json"},
            json=request["body"],
            timeout=REQUEST_TIMEOUT_S,
        )
    except httpx.TimeoutException as exc:
        raise GeminiError("the provider timed out") from exc
    except httpx.HTTPError as exc:
        raise GeminiError(f"the provider could not be reached: {type(exc).__name__}") from exc
    if response.status_code != 200:
        raise _provider_failure(response.status_code, _json_body(response))
    try:
        return response.json()
    except json.JSONDecodeError as exc:
        raise GeminiError("the provider returned a body that is not JSON") from exc


def _json_body(response: httpx.Response) -> object:
    try:
        return response.json()
    except ValueError:
        return None


def _error_parts(status_code: int, payload: object) -> tuple[str, str, set[str]]:
    """Pull the provider's status, message, and reason codes out of an error body."""
    detail = payload.get("error") if isinstance(payload, dict) else None
    if not isinstance(detail, dict):
        return str(status_code), "", set()
    status = str(detail.get("status") or status_code)
    message = str(detail.get("message") or "")
    details = detail.get("details")
    reasons = {
        str(item.get("reason"))
        for item in (details if isinstance(details, list) else [])
        if isinstance(item, dict) and item.get("reason")
    }
    return status, message, reasons


def _is_credit_exhaustion(status: str, reasons: set[str], message: str) -> bool:
    """True only for a money-shaped refusal, never for a per-minute quota."""
    if reasons & _CREDIT_REASONS:
        return True
    if status != "RESOURCE_EXHAUSTED":
        return False
    lowered = message.lower()
    return any(word in lowered for word in _CREDIT_WORDS)


def _is_key_rejection(status: str, reasons: set[str]) -> bool:
    """True when the key or the project behind it was refused."""
    return status == "PERMISSION_DENIED" or bool(reasons & _KEY_REASONS)


def _log_failure(event: str, detail: str) -> None:
    """One structured record per classified failure; never the key or the document."""
    logger.error(json.dumps({"event": event, "detail": detail}))


def _provider_failure(status_code: int, payload: object) -> GeminiError:
    """Classify a non-200 provider response into the narrowest error available."""
    status, message, reasons = _error_parts(status_code, payload)
    described = f"the provider returned {status}: {message[:200]}".strip()
    if _is_credit_exhaustion(status, reasons, message):
        _log_failure("llm.credits_exhausted", described)
        return GeminiCreditsExhausted(described)
    if _is_key_rejection(status, reasons):
        _log_failure("llm.provider_key_rejected", described)
        return GeminiKeyRejected(described)
    return GeminiError(described)


def response_text(body: dict[str, Any]) -> str:
    """Concatenate the text parts of the first candidate."""
    candidates = body.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        feedback = body.get("promptFeedback") or {}
        raise GeminiError(f"the provider returned no candidate ({feedback.get('blockReason')})")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(str(part.get("text", "")) for part in parts)
    if not text.strip():
        reason = candidates[0].get("finishReason")
        raise GeminiError(f"the provider returned an empty candidate ({reason})")
    return text


def parse_json(text: str) -> dict[str, Any]:
    """Strict JSON, with a narrow repair for a fenced block."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise GeminiError(f"the provider's JSON did not parse: {exc.msg}") from exc
    if not isinstance(parsed, dict):
        raise GeminiError("the provider's JSON is not an object")
    return parsed


def generate(
    prompt_id: str,
    parts: list[dict[str, Any]],
    response_model: Any,
    *,
    cache: bool = True,
    refresh: bool = False,
) -> Generation:
    """One call, unwrapped and validated against the prompt's response model."""
    raw = generate_raw(prompt_id, parts, cache=cache, refresh=refresh)
    payload = response_model.model_validate(parse_json(response_text(raw.body)))
    meta = raw.request_meta
    return Generation(
        payload=payload,
        prompt_id=raw.request_meta["prompt_id"],
        prompt_version=int(meta["prompt_version"]),
        model=str(meta["model"]),
        cached=raw.cached,
    )


def text_parts(lines: Iterable[str]) -> list[dict[str, Any]]:
    """Plain-text parts, for prompts whose input is JSON rather than a document."""
    return [{"text": line} for line in lines]
