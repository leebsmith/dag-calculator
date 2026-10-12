"""Authentication dependencies.

Verifies Firebase ID tokens via the Admin SDK. In local dev the auth emulator
is used automatically (the Admin SDK honors ``FIREBASE_AUTH_EMULATOR_HOST``);
in production, Application Default Credentials are resolved lazily.

The bearer token on ``POST /solve/*`` is enforced by ``CurrentUser``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException
from firebase_admin import auth

from app.database.firebase import get_app


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Return the authenticated user identity from the bearer token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        decoded = auth.verify_id_token(token, app=get_app())
    except Exception as exc:  # noqa: BLE001 — normalize any token failure to 401
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
    return {"uid": decoded.get("uid", ""), "token": token}


CurrentUser = Annotated[dict, Depends(get_current_user)]
