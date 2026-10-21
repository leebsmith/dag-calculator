"""Best-effort per-uid rate limiting (instance-scoped).

This is NOT a security boundary. Cloud Run instances are ephemeral and the
bucket is in-process, so the limit resets per instance and does not stop a
distributed flood; Cloud Armor (or an API gateway) is the real perimeter. This
merely smooths accidental burst load from a single authenticated client.
"""

from __future__ import annotations

import threading
import time
from typing import Annotated

from fastapi import Depends, HTTPException

from app.auth.deps import AllowedUser

CAPACITY = 60  # burst allowance (≈ one minute at the refill rate)
RATE_PER_SECOND = 10.0


class TokenBucket:
    """A lock-guarded token bucket keyed by uid."""

    def __init__(self, capacity: int = CAPACITY, rate: float = RATE_PER_SECOND) -> None:
        self._capacity = float(capacity)
        self._rate = float(rate)
        self._state: dict[str, tuple[float, float]] = {}  # uid -> (tokens, last_ts)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            tokens, last = self._state.get(key, (self._capacity, now))
            tokens = min(self._capacity, tokens + (now - last) * self._rate)
            if tokens >= 1.0:
                self._state[key] = (tokens - 1.0, now)
                return True
            self._state[key] = (tokens, now)
            return False

    def clear(self) -> None:
        with self._lock:
            self._state.clear()


rate_limiter = TokenBucket()


class RateLimitedError(HTTPException):
    def __init__(self) -> None:
        super().__init__(status_code=429, detail="Rate limit exceeded")


def check_rate_limit(uid: str) -> None:
    if not rate_limiter.allow(uid):
        raise RateLimitedError()


def require_rate(user: AllowedUser) -> dict:
    """Dependency: enforce the per-uid token bucket for authenticated callers."""
    check_rate_limit(user["uid"])
    return user


RateLimitedUser = Annotated[dict, Depends(require_rate)]
