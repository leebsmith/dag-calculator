"""Authentication dependencies.

Firebase Admin SDK token verification is deferred (see ``tech-stack.md`` §3);
this module exposes a permissive stub so the JSON seam is testable offline via
``dependency_overrides``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Return the authenticated user identity.

    TODO: replace with Firebase Admin ``verify_id_token``; currently returns a
    fixed local uid (the bearer token, if any, is ignored).
    """
    return {"uid": "local-user", "token": authorization}


CurrentUser = Annotated[dict, Depends(get_current_user)]
