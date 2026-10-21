"""Tests for the per-uid token bucket and its route enforcement."""

from __future__ import annotations

from conftest import make_batch_request
from fastapi.testclient import TestClient

from app.auth import throttle
from app.auth.deps import get_current_user, require_allowed_user
from app.main import app

UID = "user-1"


def test_token_bucket_allows_up_to_capacity_then_denies():
    bucket = throttle.TokenBucket(capacity=2, rate=0.0)
    assert bucket.allow("u1") is True
    assert bucket.allow("u1") is True
    assert bucket.allow("u1") is False


def test_token_bucket_refills_over_time(monkeypatch):
    now = [0.0]
    monkeypatch.setattr(throttle.time, "monotonic", lambda: now[0])
    bucket = throttle.TokenBucket(capacity=1, rate=1.0)
    assert bucket.allow("u1") is True
    assert bucket.allow("u1") is False
    now[0] = 10.0
    assert bucket.allow("u1") is True


def test_rate_limited_route_returns_429(monkeypatch):
    monkeypatch.setattr(throttle, "rate_limiter", throttle.TokenBucket(capacity=1, rate=0.0))
    app.dependency_overrides[get_current_user] = lambda: {"uid": UID, "token": "t"}
    app.dependency_overrides[require_allowed_user] = lambda: {"uid": UID, "token": "t"}
    try:
        client = TestClient(app)
        body = make_batch_request().model_dump(mode="json")
        assert client.post("/solve/batch", json=body).status_code == 200
        second = client.post("/solve/batch", json=body)
        assert second.status_code == 429
        assert second.json()["code"] == "RATE_LIMITED"
    finally:
        app.dependency_overrides.clear()
