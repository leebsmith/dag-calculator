"""Authentication dependencies.

Verifies Firebase ID tokens via the Admin SDK. In local dev the auth emulator
is used automatically (the Admin SDK honors ``FIREBASE_AUTH_EMULATOR_HOST``);
in production, Application Default Credentials are resolved lazily.

``get_current_user`` proves identity. ``require_allowed_user`` additionally
enforces the build-time email allowlist and fails closed when it is unset.

Verified tokens are cached in-process for a short window (keyed by a SHA-256
digest of the token, never the token itself), so an editing session does not
perform a revocation lookup on every autosave. Revocation is therefore eventual
within ``TOKEN_CACHE_TTL_SECONDS``; a cache miss always re-verifies with
``check_revoked=True``.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from firebase_admin import auth

from app.database.firebase import get_app

TOKEN_CACHE_TTL_SECONDS = 300

_token_cache: dict[str, tuple[dict, float]] = {}
_token_cache_lock = threading.Lock()


def parse_allowed_emails(value: str | None) -> frozenset[str]:
    """Parse a comma/space-separated allowlist into lowercase addresses."""
    if not value:
        return frozenset()
    for separator in (",", ";", "\n", "\t", " "):
        value = value.replace(separator, ",")
    return frozenset(address.strip().lower() for address in value.split(",") if address.strip())


ALLOWED_EMAILS = parse_allowed_emails(os.environ.get("ALLOWED_EMAILS"))


def _cache_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _prune_token_cache_locked(now: float) -> None:
    expired = [key for key, (_, expires_at) in _token_cache.items() if expires_at <= now]
    for key in expired:
        del _token_cache[key]


def clear_token_cache() -> None:
    """Drop all cached token claims (test isolation; the next call re-verifies)."""
    with _token_cache_lock:
        _token_cache.clear()


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Return the authenticated user identity from the bearer token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()

    now = time.time()
    key = _cache_key(token)
    with _token_cache_lock:
        cached = _token_cache.get(key)
        if cached is not None and cached[1] > now:
            return cached[0]

    try:
        decoded = auth.verify_id_token(token, app=get_app(), check_revoked=True)
    except Exception as exc:  # noqa: BLE001 — normalize any token failure to 401
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    claims = {
        "uid": decoded.get("uid", ""),
        "email": decoded.get("email", ""),
        "email_verified": bool(decoded.get("email_verified", False)),
        "token": token,
    }
    expires_at = min(decoded.get("exp", now + TOKEN_CACHE_TTL_SECONDS), now + TOKEN_CACHE_TTL_SECONDS)
    with _token_cache_lock:
        _prune_token_cache_locked(now)
        _token_cache[key] = (claims, expires_at)
    return claims


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
