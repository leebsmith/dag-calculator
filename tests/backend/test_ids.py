"""Unit tests for the shared document-id guard."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.schemas.ids import validate_doc_id


def test_validate_doc_id_accepts_clean_ids():
    assert validate_doc_id("b1") == "b1"
    assert validate_doc_id("abc-123_XYZ") == "abc-123_XYZ"
    assert validate_doc_id("a" * 64) == "a" * 64


def test_validate_doc_id_rejects_malformed_ids():
    for bad in ["../", "..", "a/b", "", "a" * 65, "a b", "a.b", "a#b"]:
        with pytest.raises(HTTPException) as exc:
            validate_doc_id(bad)
        assert exc.value.status_code == 404
