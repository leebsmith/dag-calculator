"""Firebase Admin app lifecycle (lazy, shared by auth + Firestore)."""

from __future__ import annotations

import os

import firebase_admin

_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "dag-calculator")

_app: firebase_admin.App | None = None


def get_app() -> firebase_admin.App:
    """Return the (lazily initialized) default Firebase Admin app."""
    global _app
    if _app is None:
        try:
            _app = firebase_admin.get_app()
        except ValueError:
            _app = firebase_admin.initialize_app(options={"projectId": _PROJECT_ID})
    return _app
