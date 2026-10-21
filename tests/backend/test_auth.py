"""Offline tests for the auth dependencies and the allowlist gate."""

from __future__ import annotations

import pytest
from conftest import FakeBatchRepo
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import deps
from app.auth.deps import get_current_user, parse_allowed_emails, require_allowed_user
from app.main import app
from app.services.batch_service import BatchService, get_batch_service


def test_missing_token_is_401():
    with pytest.raises(HTTPException) as exc:
        get_current_user(None)
    assert exc.value.status_code == 401


def test_non_bearer_token_is_401():
    with pytest.raises(HTTPException) as exc:
        get_current_user("Basic abc")
    assert exc.value.status_code == 401


def test_invalid_token_is_401(monkeypatch):
    monkeypatch.setattr("app.auth.deps.get_app", lambda: object())

    def _reject(_token, **_kwargs):
        raise ValueError("bad token")

    monkeypatch.setattr("app.auth.deps.auth.verify_id_token", _reject)
    with pytest.raises(HTTPException) as exc:
        get_current_user("Bearer badtoken")
    assert exc.value.status_code == 401


def test_valid_token_returns_identity_and_checks_revocation(monkeypatch):
    monkeypatch.setattr("app.auth.deps.get_app", lambda: object())
    seen = {}

    def _verify(_token, **kwargs):
        seen.update(kwargs)
        return {"uid": "user-123", "email": "Brewer@Example.com", "email_verified": True}

    monkeypatch.setattr("app.auth.deps.auth.verify_id_token", _verify)
    user = get_current_user("Bearer good")

    assert user["uid"] == "user-123"
    assert user["email"] == "Brewer@Example.com"
    assert user["email_verified"] is True
    assert user["token"] == "good"
    assert seen["check_revoked"] is True


def test_parse_allowed_emails_is_case_insensitive_and_separator_tolerant():
    assert parse_allowed_emails(" A@x.com, b@y.com\nc@z.com ") == frozenset(
        {"a@x.com", "b@y.com", "c@z.com"}
    )
    assert parse_allowed_emails(None) == frozenset()
    assert parse_allowed_emails("   ") == frozenset()


def _user(**overrides):
    return {"uid": "u1", "email": "brewer@example.com", "email_verified": True, **overrides}


def test_allowlisted_user_passes(monkeypatch):
    monkeypatch.setattr(deps, "ALLOWED_EMAILS", frozenset({"brewer@example.com"}))
    assert require_allowed_user(_user())["uid"] == "u1"
    assert require_allowed_user(_user(email="BREWER@example.com"))["uid"] == "u1"


@pytest.mark.parametrize(
    "user",
    [
        _user(email=""),
        _user(email=None),
        _user(email_verified=False),
        _user(email="someone@else.com"),
    ],
)
def test_blocked_users_are_403(monkeypatch, user):
    monkeypatch.setattr(deps, "ALLOWED_EMAILS", frozenset({"brewer@example.com"}))
    with pytest.raises(HTTPException) as exc:
        require_allowed_user(user)
    assert exc.value.status_code == 403


def test_empty_allowlist_fails_closed(monkeypatch):
    monkeypatch.setattr(deps, "ALLOWED_EMAILS", frozenset())
    with pytest.raises(HTTPException) as exc:
        require_allowed_user(_user())
    assert exc.value.status_code == 403


def test_session_is_reachable_for_a_blocked_user_but_routes_are_403(monkeypatch):
    monkeypatch.setattr(deps, "ALLOWED_EMAILS", frozenset({"brewer@example.com"}))
    app.dependency_overrides[get_current_user] = lambda: _user(email="blocked@example.com")
    app.dependency_overrides[get_batch_service] = lambda: BatchService(FakeBatchRepo())
    try:
        client = TestClient(app)
        session = client.get("/session")
        assert session.status_code == 200
        assert session.json() == {
            "uid": "u1",
            "email": "blocked@example.com",
            "allowed": False,
        }
        assert client.get("/batches").status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_session_reports_an_allowed_user(monkeypatch):
    monkeypatch.setattr(deps, "ALLOWED_EMAILS", frozenset({"brewer@example.com"}))
    app.dependency_overrides[get_current_user] = lambda: _user()
    try:
        response = TestClient(app).get("/session")
        assert response.json()["allowed"] is True
    finally:
        app.dependency_overrides.clear()
