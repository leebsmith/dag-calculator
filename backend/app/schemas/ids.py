"""Shared document-id validation for Firestore path parameters.

Firestore treats a ``/`` inside a document id as a collection path separator, so
an unvalidated id could address a nested subcollection instead of the intended
document. Every batch/item route parameter must pass through ``validate_doc_id``
before reaching a repository.
"""

from __future__ import annotations

import re

from fastapi import HTTPException

DOC_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def validate_doc_id(doc_id: str) -> str:
    """Return ``doc_id`` if it is a safe document id, else raise ``404``.

    Rejects path-shaped ids (``a/b``), traversal (``..``, ``../``), empty ids,
    and ids longer than 64 characters, so a malformed parameter is a clean
    "Not Found" rather than a repository exception or a nested-path write.
    """
    if not DOC_ID_PATTERN.fullmatch(doc_id):
        raise HTTPException(status_code=404, detail="Not found")
    return doc_id
