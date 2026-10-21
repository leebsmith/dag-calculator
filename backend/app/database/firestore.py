"""Firestore client (emulator-aware via ``FIRESTORE_EMULATOR_HOST``)."""

from __future__ import annotations

import threading

from firebase_admin import firestore

from app.database.firebase import get_app

_db: firestore.Client | None = None
_lock = threading.Lock()


def get_db() -> firestore.Client:
    """Return a lazily created, process-wide Firestore client.

    The client is bound to the shared Firebase Admin app and reused across
    requests instead of constructing a new gRPC channel per call.
    """
    global _db
    if _db is None:
        with _lock:
            if _db is None:
                _db = firestore.client(app=get_app())
    return _db


def clear_db_cache() -> None:
    """Drop the cached client (test isolation; the next call re-creates it)."""
    global _db
    with _lock:
        _db = None
