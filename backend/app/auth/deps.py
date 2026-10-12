"""Authentication dependencies.

Verifies Firebase ID tokens via the Admin SDK. In local dev the auth emulator
is used automatically (the Admin SDK honors ``FIREBASE_AUTH_EMULATOR_HOST``);
in production, Application Default Credentials are resolved lazily.

The bearer token on ``POST /solve/*`` is enforced by ``CurrentUser``.
"""

from __future__ import annotations

import os
from typing import Annotated

import firebase_admin
from fastapi import Depends, Header, HTTPException
from firebase_admin import auth

_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "dag-calculator")

_app = None


def _get_app() -> firebase_admin.App:
    """Return the (lazily initialized) default Firebase Admin app."""
    global _app
    if _app is None:
        try:
            _app = firebase_admin.get_app()
        except ValueError:
            _app = firebase_admin.initialize_app(options={"projectId": _PROJECT_ID})
    return _app


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Return the authenticated user identity from the bearer token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        decoded = auth.verify_id_token(token, app=_get_app())
    except Exception as exc:  # noqa: BLE001 — normalize any token failure to 401
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
    return {"uid": decoded.get("uid", ""), "token": token}


CurrentUser = Annotated[dict, Depends(get_current_user)]
