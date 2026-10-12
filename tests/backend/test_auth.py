"""Offline tests for the auth dependency (no network, no Firestore)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.auth.deps import get_current_user


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


def test_valid_token_returns_uid(monkeypatch):
    monkeypatch.setattr("app.auth.deps.get_app", lambda: object())
    monkeypatch.setattr(
        "app.auth.deps.auth.verify_id_token",
        lambda _token, **_kwargs: {"uid": "user-123"},
    )
    user = get_current_user("Bearer good")
    assert user["uid"] == "user-123"
