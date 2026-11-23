"""Provider failure classification: money and key refusals are not generic 5xx."""

from __future__ import annotations

import json
import logging

from app.services import gemini


def error_body(status: str, message: str, reasons: tuple[str, ...] = ()) -> dict:
    return {
        "error": {
            "code": 429,
            "status": status,
            "message": message,
            "details": [{"reason": reason} for reason in reasons],
        }
    }


def test_new_errors_stay_gemini_errors_for_existing_handlers() -> None:
    assert issubclass(gemini.GeminiCreditsExhausted, gemini.GeminiError)
    assert issubclass(gemini.GeminiKeyRejected, gemini.GeminiError)


def test_a_billing_reason_is_credit_exhaustion() -> None:
    failure = gemini._provider_failure(
        403,
        error_body("PERMISSION_DENIED", "billing is disabled", ("BILLING_DISABLED",)),
    )
    assert isinstance(failure, gemini.GeminiCreditsExhausted)


def test_a_quota_message_about_credits_is_credit_exhaustion() -> None:
    failure = gemini._provider_failure(
        429,
        error_body("RESOURCE_EXHAUSTED", "Your prepayment credits are depleted"),
    )
    assert isinstance(failure, gemini.GeminiCreditsExhausted)


def test_a_plain_rate_limit_stays_a_generic_failure() -> None:
    failure = gemini._provider_failure(
        429,
        error_body("RESOURCE_EXHAUSTED", "Quota exceeded for quota metric 'generate_content'"),
    )
    assert type(failure) is gemini.GeminiError


def test_a_disabled_api_is_a_key_rejection() -> None:
    failure = gemini._provider_failure(
        403,
        error_body(
            "PERMISSION_DENIED",
            "Generative Language API has not been used in project 1",
            ("SERVICE_DISABLED",),
        ),
    )
    assert isinstance(failure, gemini.GeminiKeyRejected)


def test_an_invalid_key_is_a_key_rejection() -> None:
    failure = gemini._provider_failure(
        400,
        error_body("INVALID_ARGUMENT", "API key not valid", ("API_KEY_INVALID",)),
    )
    assert isinstance(failure, gemini.GeminiKeyRejected)


def test_a_body_that_is_not_json_stays_generic() -> None:
    failure = gemini._provider_failure(500, None)
    assert type(failure) is gemini.GeminiError
    assert "500" in str(failure)


def test_a_classified_failure_logs_one_structured_line(caplog) -> None:
    with caplog.at_level(logging.ERROR, logger="app.gemini"):
        gemini._provider_failure(
            429,
            error_body("RESOURCE_EXHAUSTED", "prepayment credits are depleted"),
        )

    records = [json.loads(record.message) for record in caplog.records]
    assert records == [
        {
            "event": "llm.credits_exhausted",
            "detail": "the provider returned RESOURCE_EXHAUSTED: prepayment credits are depleted",
        }
    ]
