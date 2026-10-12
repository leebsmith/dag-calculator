"""Firestore client (emulator-aware via ``FIRESTORE_EMULATOR_HOST``)."""

from __future__ import annotations

from firebase_admin import firestore

from app.database.firebase import get_app


def get_db() -> firestore.Client:
    """Return a Firestore client bound to the shared Firebase Admin app."""
    return firestore.client(app=get_app())
