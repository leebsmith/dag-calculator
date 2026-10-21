"""Offline tests for the lazy Firebase Admin app and Firestore client wiring."""

from __future__ import annotations

from app.database import firebase, firestore


def test_get_app_initializes_lazily_with_the_configured_project(monkeypatch):
    calls = []
    monkeypatch.setattr(firebase, "_app", None)
    monkeypatch.setattr(
        firebase.firebase_admin,
        "get_app",
        lambda: (_ for _ in ()).throw(ValueError("no default app")),
    )

    def _initialize(**kwargs):
        app = object()
        calls.append((kwargs, app))
        return app

    monkeypatch.setattr(firebase.firebase_admin, "initialize_app", _initialize)

    first = firebase.get_app()
    second = firebase.get_app()

    assert first is second
    assert len(calls) == 1
    assert calls[0][0] == {"options": {"projectId": firebase._PROJECT_ID}}


def test_get_app_reuses_an_already_initialized_default(monkeypatch):
    existing = object()
    monkeypatch.setattr(firebase, "_app", None)
    monkeypatch.setattr(firebase.firebase_admin, "get_app", lambda: existing)

    assert firebase.get_app() is existing


def test_get_db_binds_the_shared_app(monkeypatch):
    app = object()
    seen = []
    monkeypatch.setattr(firestore, "get_app", lambda: app)
    monkeypatch.setattr(firestore.firestore, "client", lambda app=None: seen.append(app) or "db")

    assert firestore.get_db() == "db"
    assert seen == [app]
