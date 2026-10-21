"""Authentication dependencies.

Verifies Firebase ID tokens via the Admin SDK. In local dev the auth emulator
is used automatically (the Admin SDK honors ``FIREBASE_AUTH_EMULATOR_HOST``);
in production, Application Default Credentials are resolved lazily.

``get_current_user`` proves identity. ``require_allowed_user`` additionally
enforces the build-time email allowlist and fails closed when it is unset.
"""

from __future__ import annotations

import os
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from firebase_admin import auth

from app.database.firebase import get_app


def parse_allowed_emails(value: str | None) -> frozenset[str]:
    """Parse a comma/space-separated allowlist into lowercase addresses."""
    if not value:
        return frozenset()
    for separator in (",", ";", "\n", "\t", " "):
        value = value.replace(separator, ",")
    return frozenset(address.strip().lower() for address in value.split(",") if address.strip())


ALLOWED_EMAILS = parse_allowed_emails(os.environ.get("ALLOWED_EMAILS"))


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Return the authenticated user identity from the bearer token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        decoded = auth.verify_id_token(token, app=get_app(), check_revoked=True)
    except Exception as exc:  # noqa: BLE001 — normalize any token failure to 401
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
    return {
        "uid": decoded.get("uid", ""),
        "email": decoded.get("email", ""),
        "email_verified": bool(decoded.get("email_verified", False)),
        "token": token,
    }


def is_allowed(user: dict) -> bool:
    email = str(user.get("email") or "").strip().lower()
    return bool(email) and bool(user.get("email_verified")) and email in ALLOWED_EMAILS


def require_allowed_user(user: Annotated[dict, Depends(get_current_user)]) -> dict:
    """Require a verified email present in the build-time allowlist (fail closed)."""
    if not is_allowed(user):
        raise HTTPException(status_code=403, detail="Email is not on the allowlist")
    return user


def session_payload(user: dict) -> dict:
    return {
        "uid": user.get("uid", ""),
        "email": user.get("email", ""),
        "allowed": is_allowed(user),
    }


CurrentUser = Annotated[dict, Depends(get_current_user)]
AllowedUser = Annotated[dict, Depends(require_allowed_user)]
